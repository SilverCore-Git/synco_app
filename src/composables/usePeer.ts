import { ref } from 'vue';
import { Peer, type MediaConnection } from 'peerjs';
import type { User, OrgMember } from '@/types/types';
import { openedOrg } from '@/assets/var';


const peer = ref<Peer | null>(null);
const remoteStream = ref<MediaStream | null>(null);
const localStream = ref<MediaStream | null>(null);
const isCalling = ref<boolean>(false);
const currentCall = ref<MediaConnection | null>(null);
const isSpeaking = ref<boolean>(false);
const remoteIsSpeaking = ref<boolean>(false);
const ringtone = new Audio('/callSound.wav');
ringtone.loop = true;


const initPeer = () => {

    if (peer.value && !peer.value.destroyed) 
    {
        if (peer.value.disconnected) 
        {
            peer.value.reconnect();
        }
        return;
    }
    
    const myClerkId = (window as any).Clerk?.user?.id;
    const myUser = openedOrg.value?.members?.find((m: OrgMember) => m.user?.clerkId === myClerkId)?.user;
    const myId = myUser?.id;

    if (!myId) 
    {
        return console.error("[PEER] Impossible de trouver l'ID utilisateur local.");
    }

    peer.value = new Peer(myId, {
        host: 'localhost',
        port: 9001,
        path: '/webrtc',
        key: import.meta.env.VITE_PEER_PUBLISHABLE_KEY
    });

    peer.value.on('open', (id) => {
        console.log('[PEER] Connecté avec l\'ID :', id);
    });

    peer.value.on('call', async (call) => {

        if (confirm("Appel entrant... Répondre ?")) 
        {

            try {

                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localStream.value = stream;
                isCalling.value = true;
                currentCall.value = call;

                call.answer(stream);

                monitorAudio(localStream.value, (val) => isSpeaking.value = val);
                
                call.on('stream', (incomingStream) => {
                    remoteStream.value = incomingStream;
                    monitorAudio(incomingStream, (val) => remoteIsSpeaking.value = val);
                });

                call.on('close', cleanupCall);

            } 
            catch (err) 
            {
                console.error("[PEER] Erreur accès média :", err);
            }

        }

    });

    peer.value.on('error', (err) => {
        console.error("[PEER] Erreur PeerJS :", err.type, err);
    });

};


const monitorAudio = (stream: MediaStream, callback: (speaking: boolean) => void) => {

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    
    analyzer.fftSize = 512;
    source.connect(analyzer);

    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    
    const checkVolume = () => {

        analyzer.getByteFrequencyData(dataArray);
        
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) 
        {
            sum += dataArray[i]!;
        }

        const average = sum / dataArray.length;

        const speaking = average > 30;
        callback(speaking);

        if (stream.active) 
        {
            requestAnimationFrame(checkVolume);
        }
        else 
        {
            audioContext.close();
        }
    };

    checkVolume();

};



const startCall = async (recipient: User) => {

    if (!recipient?.id || !peer.value) return;
    
    try {

        isCalling.value = true;
        ringtone.currentTime = 0;
        ringtone.play().catch(e => console.warn("L'auto-play a bloqué le son :", e));

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.value = stream;

        const call = peer.value.call(recipient.id, stream);
        currentCall.value = call;
        
        call?.on('stream', (incomingStream) => {
            ringtone.pause();
            remoteStream.value = incomingStream;
        });

        call?.on('close', cleanupCall);

    } 
    catch (err) 
    {
        console.error("[PEER] Erreur lancement appel :", err);
        cleanupCall();
    }

};


const endCall = () => {
    if (currentCall.value) 
    {
        currentCall.value.close();
        ringtone.pause();
    }
    cleanupCall();
};


const cleanupCall = () => {
    
    ringtone.pause();
    localStream.value?.getTracks().forEach(track => track.stop());
    
    localStream.value = null;
    remoteStream.value = null;
    isCalling.value = false;
    currentCall.value = null;

};


export default function usePeer() 
{
    return {
        initPeer,
        startCall,
        endCall,
        remoteStream,
        localStream,
        isCalling,
        isSpeaking,
        remoteIsSpeaking,
        peer
    };
}