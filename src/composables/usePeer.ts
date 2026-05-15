import { ref, shallowRef } from 'vue';
import { Peer, type MediaConnection } from 'peerjs';
import type { User } from '@/types/types';
import { openedOrg } from '@/assets/var';
import useNotifications from './useNotifications';
import keycloak from '@/assets/keycloak';

const peer = ref<Peer | null>(null);
const localStream = ref<MediaStream | null>(null);
const screenStream = ref<MediaStream | null>(null);
const isCalling = ref<boolean>(false);
const isSpeaking = ref<boolean>(false);
const enteringCall = shallowRef<MediaConnection | null>(null);

const remoteStreams = ref<Map<string, MediaStream>>(new Map());
const activeCalls = ref<Map<string, MediaConnection>>(new Map());

const isMicOn = ref<boolean>(true);
const isCamOn = ref<boolean>(false);
const isScreenSharing = ref<boolean>(false);

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
        const myId = userInfo.sub;

        if (!myId) return console.error("[PEER] ID local introuvable.");

        peer.value = new Peer(myId, {
            host: import.meta.env.VITE_PEER_HOST || 'localhost',
            port: import.meta.env.VITE_PEER_PORT || 9001,
            path: import.meta.env.VITE_PEER_PATH || '/webrtc',
            secure: false // Passer à true en production
        });

        peer.value.on('call', (call) => {

            const member = openedOrg.value?.members?.find(m => m.user?.id === call.peer);
            if (!member) return;

            if (activeCalls.value.size > 0 || enteringCall.value) 
            {
                call.close();
                return;
            }

            enteringCall.value = call;
            callNotif.value.push(member);
            ringtone.play().catch(() => {});

        });

    };

    const handleCallEvents = (call: MediaConnection) => {

        activeCalls.value.set(call.peer, call);

        call.on('stream', (incomingStream) => {
            ringtone.pause();
            ringtone.currentTime = 0;
            remoteStreams.value.set(call.peer, incomingStream);
            remoteStreams.value = new Map(remoteStreams.value);
        });

        call.on('close', () => removePeerFromCall(call.peer));
        call.on('error', () => removePeerFromCall(call.peer));

    };

    const toggleMic = () => {
        const audioTrack = localStream.value?.getAudioTracks()[0];
        if (audioTrack) 
        {
            audioTrack.enabled = !audioTrack.enabled;
            isMicOn.value = audioTrack.enabled;
        }
    };

    const toggleCam = async () => {
        
        try {

            if (!isCamOn.value)
            {
                
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                const videoTrack = videoStream.getVideoTracks()[0];
                
                if (localStream.value) 
                {

                    if (!videoTrack) return console.error('vidéoTrack is undéfined');

                    localStream.value.addTrack(videoTrack);

                    activeCalls.value.forEach(call => {
                        const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) sender.replaceTrack(videoTrack);
                        else call.peerConnection.addTrack(videoTrack, localStream.value!);
                    });

                }

                isCamOn.value = true;

            } 
            else 
            {

                const videoTrack = localStream.value?.getVideoTracks()[0];
                if (videoTrack)
                {
                    videoTrack.stop();
                    localStream.value?.removeTrack(videoTrack);
                    isCamOn.value = false;
                }

            }
            
        } catch (err) {
            console.error("Erreur Cam : ", err);
        }

    };

    const toggleScreenShare = async () => {

        try {

            if (!isScreenSharing.value) 
            {

                screenStream.value = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.value.getVideoTracks()[0];

                if (!screenTrack) return console.error('screenTrack is undéfined');

                activeCalls.value.forEach(call => {
                    const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                    sender?.replaceTrack(screenTrack);
                });

                screenTrack.onended = () => stopScreenShare();
                isScreenSharing.value = true;

            } 
            else 
            {
                await stopScreenShare();
            }

        } catch (err) {
            console.error("Erreur ScreenShare:", err);
        }

    };

    const stopScreenShare = async () => {

        screenStream.value?.getTracks().forEach(t => t.stop());
        isScreenSharing.value = false;
        
        if (isCamOn.value) 
        {
            const videoTrack = localStream.value?.getVideoTracks()[0];
            activeCalls.value.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (videoTrack) sender?.replaceTrack(videoTrack);
            });
        }

    };

    const acceptCall = async () => {

        if (!enteringCall.value) return;

        try {
            
            localStream.value = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            isCamOn.value = false;
            
            monitorAudio(localStream.value, (val) => isSpeaking.value = val);
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

    const startCall = async (recipient: User) => {
        
        if (!recipient?.id) {
            return console.error("[PEER] ID du destinataire manquant.");
        }

        if (!peer.value || peer.value.destroyed) {
            return console.error("[PEER] L'instance Peer n'est pas initialisée.");
        }

        if (peer.value.disconnected) {
            peer.value.reconnect();
        }

        try {

            localStream.value = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            isCamOn.value = false;
            
            monitorAudio(localStream.value, (val) => isSpeaking.value = val);
            isCalling.value = true;
            ringtone.play().catch(() => {});

            const call = peer.value.call(recipient.id, localStream.value);

            if (!call) {
                throw new Error(`L'appel n'a pas pu être établi avec l'ID : ${recipient.id}`);
            }

            handleCallEvents(call);

        } catch (err) {
            console.error("[PEER] Erreur startCall:", err);
            cleanupCall();
        }
        
    };

    const removePeerFromCall = (peerId: string) => {
        remoteStreams.value.delete(peerId);
        remoteStreams.value = new Map(remoteStreams.value);
        activeCalls.value.delete(peerId);
        if (activeCalls.value.size === 0) cleanupCall();
    };

    const cleanupCall = () => {
        ringtone.pause();
        ringtone.currentTime = 0;
        localStream.value?.getTracks().forEach(track => track.stop());
        screenStream.value?.getTracks().forEach(track => track.stop());
        localStream.value = null;
        screenStream.value = null;
        remoteStreams.value.clear();
        activeCalls.value.clear();
        enteringCall.value = null;
        isCalling.value = false;
        isCamOn.value = false;
        isScreenSharing.value = false;
    };

    const endCall = () => {
        activeCalls.value.forEach(call => call.close());
        cleanupCall();
    };

    const monitorAudio = (stream: MediaStream, callback: (speaking: boolean) => void) => {

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 256;
        source.connect(analyzer);
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);

        const checkVolume = () => {

            if (!stream.active || !isCalling.value) 
            {
                audioContext.close();
                return;
            }

            analyzer.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            callback(average > 35);
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
        toggleScreenShare,
        acceptCall,
        rejectCall: () => {
            if (!enteringCall.value) return;
            enteringCall.value.close();
            callNotif.value = callNotif.value.filter(m => m.user?.id !== enteringCall.value?.peer);
            enteringCall.value = null;
            ringtone.pause();
        },
        remoteStreams,
        localStream,
        isCalling,
        isSpeaking,
        isMicOn,
        isCamOn,
        isScreenSharing,
        enteringCall
    };

}