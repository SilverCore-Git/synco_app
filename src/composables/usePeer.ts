import { ref, shallowRef } from 'vue';
import { Peer, type MediaConnection } from 'peerjs';
import type { User, OrgMember } from '@/types/types';
import { openedOrg } from '@/assets/var';
import useNotifications from './useNotifications';
import keycloak from '@/assets/keycloak';


const peer = ref<Peer | null>(null);
const localStream = ref<MediaStream | null>(null);
const isCalling = ref<boolean>(false);
const isSpeaking = ref<boolean>(false);
const enteringCall = shallowRef<MediaConnection | null>(null);

const remoteStreams = ref<Map<string, MediaStream>>(new Map());
const activeCalls = ref<Map<string, MediaConnection>>(new Map());

const isMicOn = ref<boolean>(true);
const isCamOn = ref<boolean>(true);

const ringtone = new Audio('/callSound.wav');
ringtone.loop = true;



export default function usePeer() 
{

    const { callNotif } = useNotifications();

    const initPeer = async () => {

        if (peer.value && !peer.value.destroyed) 
        {
            if (peer.value.disconnected) peer.value.reconnect();
            return;
        }

        const userInfo = await keycloak.loadUserInfo();
        const myKCId = userInfo.sub;
        
        const myUser = openedOrg.value?.members?.find((m: OrgMember) => m.user?.clerkId === myKCId || m.userId === myKCId)?.user;
        const myId = myUser?.id;

        if (!myId) return console.error("[PEER] ID local introuvable.");

        peer.value = new Peer(myId, {
            host: '192.168.1.73',
            port: 9001,
            path: '/webrtc',
            secure: true
        });

        peer.value.on('call', (call) => {

            const member = openedOrg.value?.members?.find(m => m.user?.id === call.peer);
            if (!member) return;

            if (activeCalls.value.size > 0 || enteringCall.value) {
                call.close();
                return;
            }

            enteringCall.value = call;
            callNotif.value.push(member);
            ringtone.play().catch(() => {});

        });

        peer.value.on('error', (err) => console.error('[PEER] Erreur:', err));

    };

    const handleCallEvents = (call: MediaConnection) => {

        activeCalls.value.set(call.peer, call);

        call.on('stream', (incomingStream) => {
            ringtone.pause();
            ringtone.currentTime = 0;
            remoteStreams.value.set(call.peer, incomingStream);
            remoteStreams.value = new Map(remoteStreams.value);
        });

        call.on('close', () => {
            removePeerFromCall(call.peer);
        });

        call.on('error', () => {
            removePeerFromCall(call.peer);
        });

    };

    const removePeerFromCall = (peerId: string) => {
        remoteStreams.value.delete(peerId);
        remoteStreams.value = new Map(remoteStreams.value);
        activeCalls.value.delete(peerId);
        if (activeCalls.value.size === 0) cleanupCall();
    };

    const acceptCall = async () => {

        if (!enteringCall.value) return;

        try {

            if (!localStream.value) 
            {
                localStream.value = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                monitorAudio(localStream.value, (val) => isSpeaking.value = val);
            }

            enteringCall.value.answer(localStream.value);
            handleCallEvents(enteringCall.value);

            const peerId = enteringCall.value.peer;
            callNotif.value = callNotif.value.filter(m => m.user?.id !== peerId);
            enteringCall.value = null;
            isCalling.value = true;

        } catch (err) {
            console.error("[PEER] Erreur acceptCall:", err);
        }

    };

    const rejectCall = () => {

        if (!enteringCall.value) return;

        const peerId = enteringCall.value.peer;
        enteringCall.value.close();
        
        callNotif.value = callNotif.value.filter(m => m.user?.id !== peerId);
        enteringCall.value = null;
        ringtone.pause();
        ringtone.currentTime = 0;

    };

    const startCall = async (recipient: User) => {

        if (!recipient?.id || !peer.value) return;


        try {

            if (!localStream.value) {
                localStream.value = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                monitorAudio(localStream.value, (val) => isSpeaking.value = val);
            }

            isCalling.value = true;
            ringtone.play().catch(() => {});

            const call = peer.value.call(recipient.id, localStream.value);
            handleCallEvents(call);

        } catch (err) {
            console.error("[PEER] Erreur startCall:", err);
            cleanupCall();
        }

    };

    const toggleMic = () => {
        const audioTrack = localStream.value?.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMicOn.value = audioTrack.enabled;
        }
    };

    const toggleCam = () => {
        const videoTrack = localStream.value?.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isCamOn.value = videoTrack.enabled;
        }
    };

    const cleanupCall = () => {
        ringtone.pause();
        ringtone.currentTime = 0;
        localStream.value?.getTracks().forEach(track => track.stop());
        localStream.value = null;
        remoteStreams.value.clear();
        activeCalls.value.clear();
        enteringCall.value = null;
        isCalling.value = false;
        isMicOn.value = true;
        isCamOn.value = true;
    };

    const endCall = () => {
        activeCalls.value.forEach(call => call.close());
        cleanupCall();
    };

    const monitorAudio = (stream: MediaStream, callback: (speaking: boolean) => void) => {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 512;
        source.connect(analyzer);
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);

        const checkVolume = () => {
            if (!stream.active || !localStream.value) {
                audioContext.close();
                return;
            };
            analyzer.getByteFrequencyData(dataArray);
            let sum = dataArray.reduce((a, b) => a + b, 0);
            let average = sum / dataArray.length;
            callback(average > 30);
            requestAnimationFrame(checkVolume);
        };

        checkVolume();
    };

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
        peer,
        enteringCall
    };

}