import { nextTick, ref, shallowRef } from 'vue';
import { 
    Room, 
    RoomEvent, 
    RemoteParticipant, 
    RemoteTrack,
    Track,
    ConnectionState,
    ExternalE2EEKeyProvider
} from 'livekit-client';
import { openedOrg } from '@/assets/var';
import E2EEWorker from '../../node_modules/livekit-client/dist/livekit-client.e2ee.worker.js?worker&url';
import useWSocket from './useWSocket';


const room = shallowRef<Room | null>(null);
const isConnected = ref<boolean>(false);
const participants = ref<RemoteParticipant[]>([]);
const allParticipants = ref<any[]>([]);
const audioTracks = ref<Map<string, RemoteTrack>>(new Map());
const videoTracks = ref<Map<string, RemoteTrack>>(new Map());

const isMicEnabled = ref<boolean>(false);
const isCameraEnabled = ref<boolean>(false);
const isScreenShareEnabled = ref<boolean>(false);
const keyProvider = new ExternalE2EEKeyProvider();

async function getE2EEKey(threadId: string): Promise<string> 
{

    const input = `${import.meta.env.VITE_LIVEKIT_E2EE_KEY}_${openedOrg.value?.id}_${threadId}`;

    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

}


function useLiveKit()
{

    const syncLocalState = () => {
        if (!room.value) return;
        const lp = room.value.localParticipant;
        isMicEnabled.value = lp.isMicrophoneEnabled;
        isCameraEnabled.value = lp.isCameraEnabled;
        isScreenShareEnabled.value = lp.isScreenShareEnabled;
        isConnected.value = true;
    };

    const connectToRoom = async (url: string, token: string, threadId: string, spaceId: string) => {
        
        if (room.value?.state === ConnectionState.Connected) return;

        let e2eeOptions = undefined;
        const e2eeKey = await getE2EEKey(threadId);

        if (e2eeKey) 
        {
            
            await keyProvider.setKey(e2eeKey);
            e2eeOptions = {
                keyProvider,
                worker: new Worker(E2EEWorker, { type: 'module' }),
            };

        }

        const newRoom = new Room({
            adaptiveStream: true,
            dynacast: true,
            publishDefaults: {
                audioPreset: { maxBitrate: 32000 }, 
            },
            e2ee: e2eeOptions
        });

        const syncParticipants = () => {

            if (!room.value) return;
            participants.value = Array.from(room.value.remoteParticipants.values());
            
            allParticipants.value = [
                ...participants.value,
                room.value.localParticipant
            ].map(p => ({
                identity: p.identity,
                isSpeaking: p.isSpeaking,
                isMicrophoneEnabled: p.isMicrophoneEnabled,
                metadata: p.metadata,
            }));

        };

        newRoom.on(RoomEvent.ParticipantConnected, syncParticipants);
        newRoom.on(RoomEvent.ParticipantDisconnected, syncParticipants);
        newRoom.on(RoomEvent.TrackMuted, syncParticipants);
        newRoom.on(RoomEvent.TrackUnmuted, syncParticipants);
        
        // Track Management
        newRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
            
            syncParticipants();

            if (track.kind === Track.Kind.Audio) 
            {
                track.attach(); 
                audioTracks.value.set(participant.identity, track);
            }
            else 
            {
                videoTracks.value.set(`${participant.identity}-${pub.source}`, track);
            }

        });

        newRoom.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {

            syncParticipants();

            track.detach();
            if (track.kind === Track.Kind.Audio) 
            {
                audioTracks.value.delete(participant.identity);
            } 
            else 
            {
                videoTracks.value.delete(`${participant.identity}-${pub.source}`);
            }

        });

        try {

            await newRoom.connect(url, token);
            room.value = newRoom;
            isConnected.value = true;

            await newRoom.localParticipant.setMicrophoneEnabled(true);
            syncLocalState();

            await nextTick();
            (await useWSocket()).value?.emit('voc:update', ({ participants: allParticipants, threadId, orgId: openedOrg.value?.id, spaceId }))

        } 
        catch (error) 
        {
            console.error("Erreur de connexion E2EE:", error);
        }

    };

    const leaveRoom = async (threadId: string, spaceId: string) => {
        if (room.value) 
        {

            const socket = (await useWSocket()).value;
            socket?.emit('voc:update', { 
                participants: participants, 
                threadId, 
                orgId: openedOrg.value?.id, 
                spaceId 
            });

            await room.value.disconnect();
            room.value = null;
            isConnected.value = false;
            participants.value = [];
            audioTracks.value.clear();
            videoTracks.value.clear();
        }
    };

    const isParticipantSpeaking = (participant: RemoteParticipant) => {
        return participant.isSpeaking;
    };

    return {
        room,
        isConnected,
        participants,
        allParticipants,
        videoTracks,
        isCameraEnabled,
        isMicEnabled,
        isScreenShareEnabled,
        connectToRoom,
        leaveRoom,
        isParticipantSpeaking,
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
    };

}

export default useLiveKit;