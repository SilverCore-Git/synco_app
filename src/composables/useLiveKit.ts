import { ref, shallowRef } from 'vue';
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
import waitFor from '@/assets/utils/waitfor';


const room = shallowRef<Room | null>(null);
const isConnected = ref<boolean>(false);
const participants = ref<RemoteParticipant[]>([]);
const audioTracks = ref<Map<string, RemoteTrack>>(new Map());
const videoTracks = ref<Map<string, RemoteTrack>>(new Map());

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

    const connectToRoom = async (url: string, token: string, threadId: string) => {
        
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
            participants.value = Array.from(newRoom.remoteParticipants.values());
        };

        newRoom.on(RoomEvent.ParticipantConnected, syncParticipants);
        newRoom.on(RoomEvent.ParticipantDisconnected, syncParticipants);
        
        // Track Management
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

        });

        newRoom.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {

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

        } 
        catch (error) 
        {
            console.error("Erreur de connexion E2EE:", error);
        }

    };

    const leaveRoom = async () => {
        if (room.value) 
        {
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
        videoTracks,
        connectToRoom,
        leaveRoom,
        isParticipantSpeaking,
        toggleCamera: (en: boolean) => room.value?.localParticipant.setCameraEnabled(en),
        toggleMicrophone: (en: boolean) => room.value?.localParticipant.setMicrophoneEnabled(en),
        toggleScreenShare: (en: boolean) => room.value?.localParticipant.setScreenShareEnabled(en),
    };

}

export default useLiveKit;