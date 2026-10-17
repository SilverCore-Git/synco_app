import { user } from '@/assets/var';
import useWSocket from '@/composables/useWSocket';
import {
    decryptThreadKeyWithRsa, encryptMessageWithContentKey, encryptForPeer,
    privateKey, E2EEUnloked,
} from '@/assets/utils/crypto';
import { pinOrCheckKey, KeyChangedError } from '@/assets/utils/keyPinning';
import { getCachedThreadKey, setCachedThreadKey } from '@/assets/utils/threadKeyCache';
import { requireTrustedKey } from '@/assets/utils/keyTrust';
import { encryptThreadMessageV2 } from '@/assets/utils/messageAuth';
import { buildReferenceToken, extractReferenceTokens, type ReferenceKind } from '@/composables/useReferences';

/**
 * Envoyer une référence <file:id>/<folder:id> dans un salon ou une DM
 * quelconque, depuis n'importe où dans l'app (ex. ShareToTargetModal lancé
 * depuis le file manager) — sans que la conversation cible soit déjà
 * ouverte/montée.
 *
 * Réutilise exactement les mêmes primitives que ChatTimeline.vue (send de
 * salon) et ChatView.vue (send de DM) : la clé socket/privateKey/E2EEUnloked
 * sont des singletons module-level (useWSocket, assets/utils/crypto), donc
 * rien n'empêche de rejouer ici le même chiffrement sans monter la vue de
 * chat correspondante.
 */

export type ShareTarget =
    | { kind: 'thread'; threadId: string; spaceId?: string }
    | { kind: 'dm'; recipientId: string; recipientPublicKey: string };

export interface ShareReferenceResult {
    ok: boolean;
    error?: string;
}

/**
 * Pointeur de provenance pour un message transféré — pure métadonnée de
 * navigation ("Voir l'original"), jamais une source de contenu : le serveur
 * la revalide par EXPÉDITEUR à l'envoi (messageTransferService) et par
 * LECTEUR à la résolution (GET /api/messages/transfer-origin), voir
 * forwardMessage ci-dessous.
 */
export interface TransferOrigin {
    kind: 'thread' | 'dm';
    id: string;
}

const buildContent = (refKind: ReferenceKind, refId: string, note?: string): string => {
    const token = buildReferenceToken(refKind, refId);
    return note?.trim() ? `${note.trim()}\n${token}` : token;
};

async function sendToThread(threadId: string, spaceId: string | undefined, content: string, transferOrigin?: TransferOrigin): Promise<ShareReferenceResult> {
    const socketRef = await useWSocket();
    const socket = socketRef.value;
    if (!socket) return { ok: false, error: 'Non connecté au serveur.' };

    const access: { encryptedKey?: string; error?: string } = await new Promise((resolve) => {
        socket.timeout(10000).emit('get-thread-access', { threadId }, (err: Error | null, res: any) => {
            resolve(err ? { error: "Le serveur n'a pas répondu." } : res);
        });
    });
    if (access.error || !access.encryptedKey) return { ok: false, error: access.error || 'Accès au salon refusé.' };

    const cached = getCachedThreadKey(threadId);
    let key = cached && cached.encryptedKey === access.encryptedKey ? cached.key : null;

    if (!key) {
        if (!privateKey.value) return { ok: false, error: 'Déverrouillez le chiffrement (code PIN) pour partager ce fichier.' };
        try {
            key = await decryptThreadKeyWithRsa(access.encryptedKey, privateKey.value);
            await pinOrCheckKey(key, `thread:${threadId}`, 1);
            setCachedThreadKey(threadId, access.encryptedKey, key);
        } catch (e) {
            if (e instanceof KeyChangedError) {
                return { ok: false, error: 'La clé de sécurité de ce salon a changé — ouvrez-le pour vérifier avant de partager.' };
            }
            console.error('[useShareReference] thread key error:', e);
            return { ok: false, error: 'Échec du déchiffrement de la clé du salon.' };
        }
    }

    const { ciphertext, iv } = user.value?.id
        ? await encryptThreadMessageV2(content, key, { threadId, senderId: user.value.id })
        : await encryptMessageWithContentKey(content, key);
    const references = extractReferenceTokens(content);

    const response: any = await new Promise((resolve) => {
        socket.emit('send-message', {
            threadId,
            content: ciphertext,
            iv,
            nonce: `n_${Date.now()}`,
            context: spaceId ? 'workspace' : 'home',
            references,
            transferOrigin,
        }, (res: any) => resolve(res));
    });

    if (response?.error) return { ok: false, error: response.error };
    return { ok: true };
}

async function sendToDM(recipientId: string, recipientPublicKey: string, content: string, transferOrigin?: TransferOrigin): Promise<ShareReferenceResult> {
    const socketRef = await useWSocket();
    const socket = socketRef.value;
    if (!socket) return { ok: false, error: 'Non connecté au serveur.' };
    if (!E2EEUnloked.value) return { ok: false, error: 'Déverrouillez le chiffrement (code PIN) pour partager ce fichier.' };

    try {
        await requireTrustedKey(recipientId, recipientPublicKey);
    } catch {
        return { ok: false, error: 'La clé de sécurité de ce contact a changé — ouvrez la conversation pour vérifier avant de partager.' };
    }

    let encrypted;
    try {
        encrypted = await encryptForPeer(content, recipientPublicKey, user.value?.publicKey || undefined);
    } catch (e) {
        console.error('[useShareReference] DM encryption failed:', e);
        return { ok: false, error: 'Erreur lors du chiffrement.' };
    }

    const references = extractReferenceTokens(content);
    const payload = {
        recipientId,
        content: encrypted.ciphertext,
        encryptedAesKey: encrypted.encryptedAesKey,
        selfEncryptedAesKey: encrypted.selfEncryptedAesKey || null,
        nonce: encrypted.iv,
        isE2EE: true,
        references,
        transferOrigin,
    };

    const response: any = await new Promise((resolve) => {
        socket.timeout(10000).emit('dm:send-message', payload, (err: Error | null, res: any) => {
            resolve(err ? { error: "Le serveur n'a pas répondu." } : res);
        });
    });

    if (response?.error) return { ok: false, error: response.error };
    return { ok: true };
}

/** Partage une référence fichier/dossier vers un salon ou une DM, avec une note optionnelle. */
export async function shareReference(
    target: ShareTarget,
    ref: { kind: 'file' | 'folder'; id: string },
    note?: string
): Promise<ShareReferenceResult> {
    const content = buildContent(ref.kind, ref.id, note);
    return target.kind === 'thread'
        ? sendToThread(target.threadId, target.spaceId, content)
        : sendToDM(target.recipientId, target.recipientPublicKey, content);
}

/**
 * Transfère un message déjà déchiffré (son contenu en mémoire, puisqu'il est
 * affiché) vers un autre salon ou une DM — contrairement à shareReference,
 * `content` n'est PAS une référence `<kind:id>` mais le texte déjà prêt à
 * chiffrer pour la destination (attribution + citation, voir
 * ChatMessage.vue/ThreadMessage.vue). `origin` ne voyage que comme métadonnée
 * de navigation (voir TransferOrigin) : le serveur la revalide par
 * expéditeur avant de la persister, jamais utilisée pour reconstruire le
 * contenu lui-même.
 */
export async function forwardMessage(
    target: ShareTarget,
    content: string,
    origin: TransferOrigin
): Promise<ShareReferenceResult> {
    return target.kind === 'thread'
        ? sendToThread(target.threadId, target.spaceId, content, origin)
        : sendToDM(target.recipientId, target.recipientPublicKey, content, origin);
}
