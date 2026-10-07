import sfetch from '@/assets/utils/sfetch';
import useLiveKit, { CallEncryptionError } from './useLiveKit';
import useWSocket from './useWSocket';
import { useToast } from './useToast';
import { generateThreadKey, encryptThreadKeyForMember, E2EEUnloked, privateKey } from '@/assets/utils/crypto';
import { resolveRecipientKey } from '@/assets/utils/keyTrust';
import { openedOrg, user } from '@/assets/var';
import type { Thread } from '@/types/types';

const KEY_RECOVERY_TIMEOUT_MS = 8000;

/**
 * Rejoindre un salon vocal d'une org (VoiceThreadView, VoiceThreadBtn).
 *
 * Aucune action demandée à l'utilisateur : un salon chiffré se rejoint
 * chiffré (et jamais en clair si la clé manque — audit FC3), un salon sans
 * clé E2EE (ancien salon) se rejoint directement, son état étant indiqué par
 * le badge de l'appel (CallE2EEBadge).
 */

/**
 * Comble rétroactivement l'absence de ThreadKey sur un salon vocal créé
 * avant que la génération de clé ne couvre aussi les salons vocaux (bug du
 * 2026-10-07, cf. CreateNewThread.vue) : génère une clé et la distribue à
 * tous les membres actuels du salon via bootstrap-e2ee.
 *
 * Best-effort et silencieux : une erreur ici ne doit jamais empêcher de
 * rejoindre l'appel. Contrairement à FC3 (échec fermé), on ne fait ici que
 * tenter d'améliorer un salon déjà en clair — jamais dégrader un salon déjà
 * chiffré, d'où la vérification côté serveur (count=0) avant insertion.
 */
async function bootstrapVocalThreadE2EE(thread: Thread): Promise<void> {
    if (!E2EEUnloked.value || !privateKey.value) return;

    const currentUser = user.value;
    if (!currentUser?.publicKey || typeof currentUser.publicKey !== 'string' || !currentUser.publicKey.trim().startsWith('{')) return;

    const members = (openedOrg.value?.members || [])
        .filter(m => m.user && thread.membersId.includes(m.userId))
        .map(m => m.user!);
    if (!members.some(m => m.id === currentUser.id)) {
        members.push(currentUser);
    }

    const newThreadKey = await generateThreadKey();
    const keys: Array<{ userId: string; encryptedKey: string }> = [];

    for (const member of members) {
        if (!member.publicKey || typeof member.publicKey !== 'string' || !member.publicKey.trim().startsWith('{')) continue;
        let trustedKey: string;
        try { trustedKey = await resolveRecipientKey(member.id, member.publicKey); }
        catch { continue; }
        const encryptedKey = await encryptThreadKeyForMember(newThreadKey, trustedKey);
        keys.push({ userId: member.id, encryptedKey });
    }

    if (keys.length === 0) return;

    await sfetch(`/api/threads/${thread.id}/bootstrap-e2ee`, {
        method: 'POST',
        body: JSON.stringify({ keys }),
    });
}

/**
 * Salon déjà chiffré (d'autres membres ont une clé) mais sans copie pour
 * nous — typiquement après un reset E2EE, ou un membre resté hors d'un
 * bootstrap partiel. Sans ce repli, ce membre ne pourrait plus jamais
 * rejoindre l'appel : contrairement à ThreadView.vue (messages), aucune UI
 * vocale ne déclenchait jusqu'ici la récupération needsReadd. Réutilise le
 * mécanisme existant (request-thread-keys / distribute-thread-keys) plutôt
 * que d'en refaire un : true si une clé a été reçue pendant l'attente.
 */
async function waitForKeyRedistribution(threadId: string, timeoutMs: number): Promise<boolean> {
    const socket = (await useWSocket()).value;
    if (!socket) return false;

    return new Promise<boolean>((resolve) => {
        let settled = false;
        const onDistributed = ({ threadId: tid }: { threadId: string }) => {
            if (tid !== threadId || settled) return;
            settled = true;
            clearTimeout(timer);
            socket.off('keys-distributed', onDistributed);
            resolve(true);
        };
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            socket.off('keys-distributed', onDistributed);
            resolve(false);
        }, timeoutMs);

        socket.on('keys-distributed', onDistributed);
        socket.emit('request-thread-keys', { threadId, publicKey: user.value?.publicKey });
    });
}

/** Renvoie true si l'appel a été rejoint. */
export async function joinVoiceThread(thread: Thread, spaceId: string): Promise<boolean> {
    const toast = useToast();
    const { connectToRoom } = useLiveKit();

    const fetchToken = () => sfetch('/api/livekit/token', {
        method: 'POST',
        body: JSON.stringify({ threadId: thread.id }),
    });

    const res = await fetchToken();
    if (!res.ok) {
        toast.show('Impossible de se connecter au salon', 'error');
        return false;
    }
    let data = await res.json();

    if (thread.type === 'vocal' && !data.e2eeRequired) {
        try {
            await bootstrapVocalThreadE2EE(thread);
            const retry = await fetchToken();
            if (retry.ok) data = await retry.json();
        } catch (e) {
            console.error('[E2EE] Bootstrap du salon vocal échoué, jointure en clair:', e);
        }
    } else if (data.e2eeRequired && !data.e2eeKey) {
        try {
            const repaired = await waitForKeyRedistribution(thread.id, KEY_RECOVERY_TIMEOUT_MS);
            if (repaired) {
                const retry = await fetchToken();
                if (retry.ok) data = await retry.json();
            }
        } catch (e) {
            console.error('[E2EE] Récupération de la clé du salon vocal échouée:', e);
        }
    }

    try {
        await connectToRoom(data.url, data.token, thread.id, spaceId, data.e2eeKey, {
            e2eeRequired: !!data.e2eeRequired,
            allowUnencrypted: true,
            // FC4 §2
            creatorId: data.creatorId,
            commitment: data.commitment,
            signature: data.signature,
        });
        return true;
    } catch (e) {
        if (e instanceof CallEncryptionError) {
            toast.show(e.message, 'error');
            return false;
        }
        throw e;
    }
}
