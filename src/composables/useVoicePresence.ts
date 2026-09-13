import { ref } from 'vue';
import useWSocket from './useWSocket';
import { openedOrg } from '@/assets/var';
import type { Org } from '@/types/types';

interface VoiceParticipant {
    identity: string;
    isSpeaking?: boolean;
    isMicrophoneEnabled?: boolean;
}

// Snapshot socket ('voc:update'), pas LiveKit : reflète la présence vocale de
// TOUT le monde dans TOUS les salons vocaux auxquels ce socket est abonné
// (le serveur nous joint automatiquement à la room `space:<id>` de chaque
// workspace accessible — cf. ws.ts), pas seulement le workspace ouvert.
const voiceByThread = ref<Map<string, VoiceParticipant[]>>(new Map());
let listening = false;

const onVocUpdate = ({ participants, threadId }: { participants: VoiceParticipant[]; threadId: string }) => {
    const next = new Map(voiceByThread.value);
    if (!participants || participants.length === 0) next.delete(threadId);
    else next.set(threadId, participants);
    voiceByThread.value = next;
};

const ensureListening = async () => {
    if (listening) return;
    listening = true;
    const socketRef = await useWSocket();
    socketRef.value?.on('voc:update', onVocUpdate);
};

export function useVoicePresence() {

    ensureListening();

    // Demande un instantané pour chaque salon vocal du workspace ouvert : le
    // serveur répond avec l'état en cache s'il y a déjà du monde dedans.
    const refreshForOrg = (org: Org | null = openedOrg.value) => {
        if (!org) return;
        useWSocket().then(socketRef => {
            const socket = socketRef.value;
            if (!socket) return;
            for (const space of org.spaces || []) {
                for (const thread of space.threads || []) {
                    if (thread.type === 'vocal') {
                        socket.emit('voc:get-update', { threadId: thread.id, orgId: org.id, spaceId: space.id });
                    }
                }
            }
        });
    };

    const participantsForThread = (threadId: string) => voiceByThread.value.get(threadId) || [];

    const spaceHasVoiceActivity = (spaceId: string) => {
        const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
        if (!space) return false;
        return (space.threads || []).some(
            t => t.type === 'vocal' && (voiceByThread.value.get(t.id)?.length || 0) > 0
        );
    };

    return { voiceByThread, refreshForOrg, participantsForThread, spaceHasVoiceActivity };
}

export default useVoicePresence;
