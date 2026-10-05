import sfetch from '@/assets/utils/sfetch';
import useLiveKit, { CallEncryptionError } from './useLiveKit';
import { useToast } from './useToast';

/**
 * Rejoindre un salon vocal d'une org (VoiceThreadView, VoiceThreadBtn).
 *
 * Aucune action demandée à l'utilisateur : un salon chiffré se rejoint
 * chiffré (et jamais en clair si la clé manque — audit FC3), un salon sans
 * clé E2EE (ancien salon) se rejoint directement, son état étant indiqué par
 * le badge de l'appel (CallE2EEBadge).
 */

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
        await connectToRoom(data.url, data.token, threadId, spaceId, data.e2eeKey, {
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
