import { ref, shallowRef } from 'vue';
import {
    Room,
    RoomEvent,
    RemoteTrack,
    Track,
    Participant,
    ExternalE2EEKeyProvider
} from 'livekit-client';
import { openedOrg } from '@/assets/var';
import { decryptThreadKeyWithRsa, privateKey } from '@/assets/utils/crypto';
import E2EEWorker from '../../node_modules/livekit-client/dist/livekit-client.e2ee.worker.js?worker&url';
import useWSocket from './useWSocket';
import type { OrgMember } from '@/types/types';


const room = shallowRef<Room | null>(null);
const isConnected = ref<boolean>(false);
const allParticipants = shallowRef<Participant[]>([]);
const audioTracks = ref<Map<string, RemoteTrack>>(new Map());
const videoTracks = ref<Map<string, RemoteTrack>>(new Map());

const isMicEnabled = ref<boolean>(false);
const isCameraEnabled = ref<boolean>(false);
const isScreenShareEnabled = ref<boolean>(false);
const isDeafened = ref<boolean>(false);
const keyProvider = new ExternalE2EEKeyProvider();


/**
 * Unwraps the room's E2EE media key from the RSA-OAEP-encrypted blob the
 * backend returns alongside the LiveKit token. That blob is the thread's
 * existing ThreadKey — the same AES key already used for this thread's
 * text messages, already securely distributed per-member (cf.
 * encryptThreadKeyForMember). The backend only ever handles/stores the
 * ciphertext; it's meaningless without the recipient's RSA private key.
 *
 * Returns null when there's nothing to decrypt (thread has no E2EE key,
 * e.g. a guest joining via invite link, or a non-E2EE thread) — callers
 * treat that as "this call isn't E2EE", not an error.
 */
async function unwrapRoomKey(encryptedThreadKey: string | null | undefined): Promise<ArrayBuffer | null> {
    if (!encryptedThreadKey || !privateKey.value) return null;
    try {
        const threadKey = await decryptThreadKeyWithRsa(encryptedThreadKey, privateKey.value);
        return await crypto.subtle.exportKey('raw', threadKey);
    } catch (e) {
        console.error('[LiveKit E2EE] Impossible de déchiffrer la clé du salon:', e);
        return null;
    }
}


function useLiveKit() 
{
    
    const getWSData = (r: Room) => {

        const list = [r.localParticipant, ...Array.from(r.remoteParticipants.values())];

        return list.map(p => ({
            identity: p.identity,
            isSpeaking: p.isSpeaking,
            isMicrophoneEnabled: p.isMicrophoneEnabled,
            isCameraEnabled: p.isCameraEnabled,
            isScreenShareEnabled: p.isScreenShareEnabled,
            metadata: JSON.stringify(openedOrg.value?.members?.find((m: OrgMember) => m.userId === p.identity)?.user),
        }));

    };

    const broadcastUpdate = async (threadId: string, spaceId: string, customList?: any[]) => {

        const socket = (await useWSocket()).value;
        if (!socket) return;

        socket.emit('voc:update', { 
            participants: customList || (room.value ? getWSData(room.value) : []), 
            threadId, 
            orgId: openedOrg.value?.id, 
            spaceId 
        });

    };

    const syncLocalState = () => {

        if (!room.value) return;
        const lp = room.value.localParticipant;
        isMicEnabled.value = lp.isMicrophoneEnabled;
        isCameraEnabled.value = lp.isCameraEnabled;
        isScreenShareEnabled.value = lp.isScreenShareEnabled;
        
    };

    const connectToRoom = async (_url: string, token: string, threadId: string, spaceId: string, encryptedRoomKey?: string | null) => {

        if (room.value)
        {
            await leaveRoom(room.value.name, spaceId);
        }

        let e2eeOptions = undefined;
        const roomKey = await unwrapRoomKey(encryptedRoomKey);
        if (roomKey)
        {
            await keyProvider.setKey(roomKey);
            e2eeOptions = {
                keyProvider,
                worker: new Worker(E2EEWorker, { type: 'module' }),
            };
        }

        const newRoom = new Room({
            adaptiveStream: true,
            dynacast: true,
            e2ee: e2eeOptions
        });

        const handleSync = () => {
            allParticipants.value = [newRoom.localParticipant, ...Array.from(newRoom.remoteParticipants.values())];
            broadcastUpdate(threadId, spaceId);
        };

        newRoom.on(RoomEvent.ParticipantConnected, handleSync);
        newRoom.on(RoomEvent.ParticipantDisconnected, handleSync);
        newRoom.on(RoomEvent.TrackMuted, handleSync);
        newRoom.on(RoomEvent.TrackUnmuted, handleSync);
        newRoom.on(RoomEvent.ParticipantMetadataChanged, handleSync);
        
        newRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {

            if (track.kind === Track.Kind.Audio) 
            {
                track.attach(); 
                audioTracks.value.set(participant.identity, track);
            } 
            else 
            {
                videoTracks.value.set(`${participant.identity}-${pub.source}`, track);
            }

            handleSync();

        });

        newRoom.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
            track.detach();
            if (track.kind === Track.Kind.Audio) audioTracks.value.delete(participant.identity);
            else videoTracks.value.delete(`${participant.identity}-${pub.source}`);
            handleSync();
        });

        try {
            await newRoom.connect(import.meta.env.VITE_LIVEKIT_URL, token);
            room.value = newRoom;
            isConnected.value = true;
            await newRoom.localParticipant.setMicrophoneEnabled(true);
            
            // Broadcast decrypted profile info to guests/others via LiveKit metadata
            const { user, member } = await import('@/assets/var');
            
            const pName = member.value?.user?.name || user.value?.name || '';
            const pAvatar = member.value?.user?.avatarUrl || user.value?.avatarUrl || '';
            
            if (pName || pAvatar) {
                await newRoom.localParticipant.setMetadata(JSON.stringify({
                    name: pName,
                    avatarUrl: pAvatar
                }));
            }

            syncLocalState();
            handleSync();
        } 
        catch (error) 
        {
            console.error("Erreur LiveKit:", error);
        }
    };

    const leaveRoom = async (threadId: string, spaceId: string) => {

        if (room.value) 
        {

            await room.value.disconnect();
            
            await broadcastUpdate(threadId, spaceId, []);

            room.value = null;
            isConnected.value = false;
            allParticipants.value = [];
            audioTracks.value.clear();
            videoTracks.value.clear();

        }

    };

    return {
        room,
        isConnected,
        allParticipants,
        videoTracks,
        isCameraEnabled,
        isMicEnabled,
        isScreenShareEnabled,
        isDeafened,
        getWSData,
        connectToRoom,
        leaveRoom,
        toggleCamera: async (en: boolean) => {
            if (!room.value) return;
            await room.value.localParticipant.setCameraEnabled(en);
            isCameraEnabled.value = en;
        },
        toggleMicrophone: async (en: boolean) => {
            if (!room.value) return;
            await room.value.localParticipant.setMicrophoneEnabled(en);
            isMicEnabled.value = en;
        },
        toggleScreenShare: async (en: boolean) => {
            if (!room.value) return;
            await room.value.localParticipant.setScreenShareEnabled(en);
            isScreenShareEnabled.value = en;
        },
        toggleDeafen: (en: boolean) => {
            isDeafened.value = en;
            audioTracks.value.forEach(track => {
                track.attachedElements.forEach(el => {
                    el.muted = en;
                });
            });
        }
    };

}

export default useLiveKit;