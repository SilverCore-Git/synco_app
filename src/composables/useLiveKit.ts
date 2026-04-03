import { ref, shallowRef, onBeforeUnmount } from 'vue';
import { 
    Room, 
    RoomEvent, 
    RemoteParticipant, 
    RemoteTrack, 
    RemoteTrackPublication,
    Track
} from 'livekit-client';




function useLiveKit()
{

    const room = shallowRef<Room | null>(null);
    const isConnected = ref<boolean>(false);
    const participants = ref<RemoteParticipant[]>([]);
    const audioTracks = ref<Map<string, RemoteTrack>>(new Map());
    const videoTracks = ref<Map<string, RemoteTrack>>(new Map());


    const connectToRoom = async (url: string, token: string) => {

        const newRoom = new Room({
            adaptiveStream: true, // Optimise la bande passante (qualité selon la taille d'affichage)
            dynacast: true,       // Coupe les flux vidéos non visibles
        });


        // on a client connected
        newRoom.on(RoomEvent.ParticipantConnected, () => {
            participants.value = [...newRoom.remoteParticipants.values()];
        });

        // on a client disconnected
        newRoom.on(RoomEvent.ParticipantDisconnected, () => {
            participants.value = [...newRoom.remoteParticipants.values()];
        });

        // on track subscribed
        newRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {

            if (track.kind === Track.Kind.Audio) 
            {
                track.attach(); // auto play
                audioTracks.value.set(participant.identity, track);
            } 
            else if (track.kind === Track.Kind.Video) 
            {
                videoTracks.value.set(`${participant.identity}-${pub.source}`, track);
            }

        });

        // on track unsubscribed
        newRoom.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {

            if (track.kind === Track.Kind.Video) 
            {
                videoTracks.value.delete(`${participant.identity}-${pub.source}`);
            }

            track.detach();

        });

        try {

            await newRoom.connect(url, token);
            room.value = newRoom;
            isConnected.value = true;
            participants.value = [...newRoom.remoteParticipants.values()];

        } catch (error) {
            console.error("LiveKit connexion error :", error);
        }

    };


    const toggleCamera = async (enabled: boolean) => {
        await room.value?.localParticipant.setCameraEnabled(enabled);
    };

    const toggleMicrophone = async (enabled: boolean) => {
        await room.value?.localParticipant.setMicrophoneEnabled(enabled);
    };

    const toggleScreenShare = async (enabled: boolean) => {
        await room.value?.localParticipant.setScreenShareEnabled(enabled);
    };

    const leaveRoom = async () => {
        await room.value?.disconnect();
        isConnected.value = false;
        room.value = null;
    };


    onBeforeUnmount(() => leaveRoom());


    return {
        room,
        isConnected,
        participants,
        videoTracks,
        connectToRoom,
        toggleCamera,
        toggleMicrophone,
        toggleScreenShare,
        leaveRoom
    };


}

export default useLiveKit;