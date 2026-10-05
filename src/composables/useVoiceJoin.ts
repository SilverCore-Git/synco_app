import { shallowRef } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import useLiveKit, { CallEncryptionError, CallNotEncryptedError } from './useLiveKit';
import { useToast } from './useToast';

/**
 * Rejoindre un salon vocal d'une org (VoiceThreadView, VoiceThreadBtn).
 *
 * Un salon chiffré ne se rejoint jamais en clair ; un salon sans clé E2EE ne
 * se rejoint qu'après un choix explicite de l'utilisateur, dans une modale
 * maison (UnencryptedCallConfirm.vue, montée une fois dans OrgLayout) —
 * jamais en silence (audit FC3).
 */

const pendingConfirm = shallowRef<{ resolve: (accepted: boolean) => void } | null>(null);

function askUnencryptedConsent(): Promise<boolean> {
    pendingConfirm.value?.resolve(false);
    return new Promise((resolve) => {
        pendingConfirm.value = {
            resolve: (accepted) => {
                pendingConfirm.value = null;
                resolve(accepted);
            },
        };
    });
}

export function useUnencryptedCallPrompt() {
    return {
        pendingConfirm,
        accept: () => pendingConfirm.value?.resolve(true),
        decline: () => pendingConfirm.value?.resolve(false),
    };
}

/** Renvoie true si l'appel a été rejoint. */
export async function joinVoiceThread(threadId: string, spaceId: string): Promise<boolean> {
    const toast = useToast();
    const { connectToRoom } = useLiveKit();

    const res = await sfetch('/api/livekit/token', {
        method: 'POST',
        body: JSON.stringify({ threadId }),
    });
    if (!res.ok) {
        toast.show('Impossible de se connecter au salon', 'error');
        return false;
    }
    const data = await res.json();

    try {
        await connectToRoom(data.url, data.token, threadId, spaceId, data.e2eeKey, { e2eeRequired: !!data.e2eeRequired });
        return true;
    } catch (e) {
        if (e instanceof CallNotEncryptedError) {
            if (!(await askUnencryptedConsent())) return false;
            await connectToRoom(data.url, data.token, threadId, spaceId, null, { allowUnencrypted: true });
            return true;
        }
        if (e instanceof CallEncryptionError) {
            toast.show(e.message, 'error');
            return false;
        }
        throw e;
    }
}
