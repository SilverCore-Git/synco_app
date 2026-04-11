import { ref, shallowRef } from 'vue';
import { 
    Room, 
    RoomEvent, 
    RemoteParticipant, 
    RemoteTrack,
    Track,
    ConnectionState
} from 'livekit-client';


const room = shallowRef<Room | null>(null);
const isConnected = ref<boolean>(false);
const participants = ref<RemoteParticipant[]>([]);
const audioTracks = ref<Map<string, RemoteTrack>>(new Map());
const videoTracks = ref<Map<string, RemoteTrack>>(new Map());


export function useLiveKit()
{

    const connectToRoom = async (url: string, token: string) => {
        
        if (room.value?.state === ConnectionState.Connected) return;

        const newRoom = new Room({
            adaptiveStream: true,
            dynacast: true,
            publishDefaults: {
                audioPreset: { maxBitrate: 32000 }, 
            }
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
            syncParticipants(); // Sync initial
            
            await newRoom.localParticipant.setMicrophoneEnabled(true);
            
        } 
        catch (error) 
        {
            console.error("LiveKit connection error:", error);
            throw error;
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