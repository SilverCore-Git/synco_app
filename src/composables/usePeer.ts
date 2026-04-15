import { ref } from 'vue';
import { Peer, type MediaConnection } from 'peerjs';
import type { User, OrgMember } from '@/types/types';
import { openedOrg } from '@/assets/var';
import useNotifications from './useNotifications';
import keycloak from '@/assets/keycloak';


const peer = ref<Peer | null>(null);
const localStream = ref<MediaStream | null>(null);
const isCalling = ref<boolean>(false);
const { callNotif } = useNotifications();
const isSpeaking = ref<boolean>(false);
const enteringCall = ref<any>(null);

const remoteStreams = ref<Map<string, MediaStream>>(new Map());
const activeCalls = ref<Map<string, MediaConnection>>(new Map());

const isMicOn = ref<boolean>(true);
const isCamOn = ref<boolean>(true);

const ringtone = new Audio('/callSound.wav');
ringtone.loop = true;

const initPeer = async () => {

    if (peer.value && !peer.value.destroyed) 
    {
        if (peer.value.disconnected) peer.value.reconnect();
        return;
    }

    const myKCId = (await keycloak.loadUserInfo()).sub;
    const myUser = openedOrg.value?.members?.find((m: OrgMember) => m.user?.id === myKCId)?.user;
    const myId = myUser?.id;

    if (!myId) return console.error("[PEER] ID local introuvable.");

    peer.value = new Peer(myId, {
        host: 'localhost',
        port: 9001,
        path: '/webrtc',
        key: import.meta.env.VITE_PEER_PUBLISHABLE_KEY
    });

    peer.value.on('call', async (call) => {

        const user = openedOrg.value?.members?.find(user => user.user?.id == call.peer);
        if (!user) return;

        isCalling.value = true;
        callNotif.value.push(user);
        enteringCall.value = call;

        console.log('call entering : ', call)
        
    });

};

const acceptCall = async () => {
    
    try {

        if (!enteringCall) return;

        if (!localStream.value) 
        {
            localStream.value = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            monitorAudio(localStream.value, (val) => isSpeaking.value = val);
        }
                    
        isCalling.value = true;
        enteringCall.value.answer(localStream.value);
        handleCallEvents(enteringCall.value);

        const user = openedOrg.value?.members?.find(user => user.user?.id == enteringCall.value.peer);
        if (!user) return;
        const userId = user.id;

        enteringCall.value = null;
        callNotif.value.filter(user => user.id !== userId);

    } 
    catch (err) 
    {
        console.error("[PEER] Erreur média entrant:", err);
    }
}

const rejectCall = () => {
    
    enteringCall.value.close();
    endCall();

    const user = openedOrg.value?.members?.find(user => user.user?.id == enteringCall.value.peer);
    if (!user) return;
    const userId = user.id;

    enteringCall.value = null;
    callNotif.value.filter(user => user.id !== userId);

}

const handleCallEvents = (call: MediaConnection) => {

    activeCalls.value.set(call.peer, call);

    call.on('stream', (incomingStream) => {
        ringtone.pause();
        remoteStreams.value.set(call.peer, incomingStream);
        remoteStreams.value = new Map(remoteStreams.value);
    });

    call.on('close', () => {
        remoteStreams.value.delete(call.peer);
        remoteStreams.value = new Map(remoteStreams.value);
        activeCalls.value.delete(call.peer);
        if (remoteStreams.value.size === 0) cleanupCall();
    });

};

const startCall = async (recipient: User) => {

    if (!recipient?.id || !peer.value) return;

    try {

        isCalling.value = true;
        if (remoteStreams.value.size === 0) ringtone.play().catch(() => {});

        if (!localStream.value) 
        {
            localStream.value = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            monitorAudio(localStream.value, (val) => isSpeaking.value = val);
        }

        const call = peer.value.call(recipient.id, localStream.value);
        handleCallEvents(call);

    } 
    catch (err) 
    {
        console.error("[PEER] Erreur startCall:", err);
        cleanupCall();
    }

};



const toggleMic = () => {

    if (localStream.value) 
    {

        const audioTrack = localStream.value.getAudioTracks()[0];
        if (audioTrack) 
        {
            audioTrack.enabled = !audioTrack.enabled;
            isMicOn.value = audioTrack.enabled;
        }

    }

};

const toggleCam = () => {

    if (localStream.value) 
    {

        const videoTrack = localStream.value.getVideoTracks()[0];
        if (videoTrack) 
        {
            videoTrack.enabled = !videoTrack.enabled;
            isCamOn.value = videoTrack.enabled;
        }

    }

};


const endCall = () => {
    activeCalls.value.forEach(call => call.close());
    cleanupCall();
};


const cleanupCall = () => {
    ringtone.pause();
    localStream.value?.getTracks().forEach(track => track.stop());
    localStream.value = null;
    remoteStreams.value.clear();
    activeCalls.value.clear();
    isCalling.value = false;
    isMicOn.value = true;
    isCamOn.value = true;
};


const monitorAudio = (stream: MediaStream, callback: (speaking: boolean) => void) => {

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 512;
    source.connect(analyzer);
    const dataArray = new Uint8Array(analyzer.frequencyBinCount);

    const checkVolume = () => {
        if (!stream.active) return audioContext.close();
        analyzer.getByteFrequencyData(dataArray);
        let sum = dataArray.reduce((a, b) => a + b, 0);
        callback((sum / dataArray.length) > 30);
        requestAnimationFrame(checkVolume);
    };

    checkVolume();

};

export default function usePeer() 
{
    return {
        initPeer,
        startCall,
        endCall,
        toggleMic,
        toggleCam,
        acceptCall,
        rejectCall,
        remoteStreams,
        localStream,
        isCalling,
        isSpeaking,
        isMicOn,
        isCamOn,
        peer
    };
}