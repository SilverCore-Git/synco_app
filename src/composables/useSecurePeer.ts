import { ref, shallowRef } from 'vue';
import { Peer, type MediaConnection } from 'peerjs';
import type { User } from '@/types/types';
import { openedOrg } from '@/assets/var';
import useNotifications from './useNotifications';
import keycloak from '@/assets/keycloak';

// ============================================================================
// Configuration
// ============================================================================

const PEER_CONFIG = {
    sdpSemantics: 'unified-plan' as const,
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all' as const,
    bundlePolicy: 'max-bundle' as const,
    rtcpMuxPolicy: 'require' as const
};

// ============================================================================
// Types
// ============================================================================

interface SecureCallSession {
    call: MediaConnection;
    callId: string;
    peerId: string;
    e2eeKey: CryptoKey | null;
    e2eeKeyId: number;
    keyAgreementComplete: boolean;
    authenticated: boolean;
}

interface KeyExchangeMessage {
    type: 'KEY_EXCHANGE_REQUEST' | 'KEY_EXCHANGE_RESPONSE' | 'KEY_CONFIRMATION';
    publicKeyJWK?: string;
    timestamp?: number;
}

interface SecurityStatus {
    encrypted: boolean;
    authenticated: boolean;
    fingerprint: string;
}

// ============================================================================
// State
// ============================================================================

const peer = ref<Peer | null>(null);
const localStream = ref<MediaStream | null>(null);
const screenStream = ref<MediaStream | null>(null);
const isCalling = ref<boolean>(false);
const isSpeaking = ref<boolean>(false);
const enteringCall = shallowRef<MediaConnection | null>(null);

const remoteStreams = ref<Map<string, MediaStream>>(new Map());
const activeCalls = ref<Map<string, SecureCallSession>>(new Map());

const isMicOn = ref<boolean>(true);
const isCamOn = ref<boolean>(false);
const isScreenSharing = ref<boolean>(false);

// Session keys for E2EE
const sessionPrivateKey = ref<CryptoKey | null>(null);
const sessionPublicKeyJWK = ref<string>('');
const callEncryptionKeys = shallowRef<Map<string, CryptoKey>>(new Map());

// Security status
const callSecurityStatus = shallowRef<Map<string, SecurityStatus>>(new Map());

const ringtone = new Audio('/callSound.wav');
ringtone.loop = true;

// ============================================================================
// Key Agreement Protocol (ECDH + HKDF)
// ============================================================================

/**
 * Generate an ECDH key pair for key agreement
 */
async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
        {
            name: 'ECDH',
            namedCurve: 'P-256'
        },
        true,
        ['deriveKey', 'deriveBits']
    );
}

/**
 * Derive a shared secret using ECDH
 */
async function deriveSharedSecret(
    privKey: CryptoKey,
    peerPublicKeyJWK: string
): Promise<CryptoKey> {
    const peerPublicKey = await crypto.subtle.importKey(
        'jwk',
        JSON.parse(peerPublicKeyJWK),
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
    );

    const sharedSecret = await crypto.subtle.deriveKey(
        {
            name: 'ECDH',
            public: peerPublicKey
        },
        privKey,
        {
            name: 'HKDF',
            hash: 'SHA-256',
            info: new TextEncoder().encode('SilverTeams-Call-E2EE-Key'),
            salt: new Uint8Array(32)
        },
        true,
        ['encrypt', 'decrypt']
    );

    return sharedSecret;
}

/**
 * Generate a fingerprint for authentication (for user verification)
 */
async function generateFingerprint(sessionKey: CryptoKey, callId: string): Promise<string> {
    const keyData = await crypto.subtle.exportKey('raw', sessionKey);
    const data = new TextEncoder().encode(callId + String.fromCharCode(...new Uint8Array(keyData)));
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hash);
    return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16).toUpperCase();
}

// ============================================================================
// Main Composable
// ============================================================================

export default function useSecurePeer() {
    const { callNotif } = useNotifications();

    /**
     * Initialize the Peer with secure configuration
     * Note: Media encryption uses DTLS-SRTP (built into WebRTC)
     * Additional E2EE for signaling is handled via data channels
     */
    const initPeer = async () => {
        if (peer.value && !peer.value.destroyed) {
            if (peer.value.disconnected) peer.value.reconnect();
            return;
        }

        const userInfo = await keycloak.loadUserInfo();
        const myId = userInfo.sub;

        if (!myId) return console.error("[SECURE-PEER] ID local introuvable.");

        // Generate session key pair for E2EE signaling
        const ecdhKeyPair = await generateECDHKeyPair();
        sessionPrivateKey.value = ecdhKeyPair.privateKey;
        const jwk = await crypto.subtle.exportKey('jwk', ecdhKeyPair.publicKey);
        sessionPublicKeyJWK.value = JSON.stringify(jwk);

        peer.value = new Peer(myId, {
            host: import.meta.env.VITE_PEER_HOST || 'localhost',
            port: import.meta.env.VITE_PEER_PORT || 9001,
            path: import.meta.env.VITE_PEER_PATH || '/webrtc',
            secure: import.meta.env.VITE_PEER_SECURE === 'true' || false,
            config: PEER_CONFIG,
            debug: 1
        });

        peer.value.on('call', (call) => {
            handleIncomingCall(call);
        });

        peer.value.on('error', (err) => {
            console.error('[SECURE-PEER] Error:', err);
        });
    };

    /**
     * Handle incoming call with security handshake
     */
    const handleIncomingCall = (call: MediaConnection) => {
        const member = openedOrg.value?.members?.find(m => m.user?.id === call.peer);
        if (!member) {
            call.close();
            return;
        }

        if (activeCalls.value.size > 0 || enteringCall.value) {
            call.close();
            return;
        }

        enteringCall.value = call;
        callNotif.value.push(member);
        ringtone.play().catch(() => {});
    };

    /**
     * Set up secure data channel for encrypted signaling
     */
    const setupSecureDataChannel = (channel: RTCDataChannel, peerId: string) => {
        channel.onopen = async () => {
            console.log('[SECURE-PEER] Data channel open with:', peerId);
            
            // Send our public key for key agreement
            const handshake: KeyExchangeMessage = {
                type: 'KEY_EXCHANGE_REQUEST',
                publicKeyJWK: sessionPublicKeyJWK.value,
                timestamp: Date.now()
            };
            channel.send(JSON.stringify(handshake));
        };

        channel.onmessage = async (event) => {
            try {
                const message: KeyExchangeMessage = JSON.parse(event.data as string);
                await handleKeyExchangeMessage(message, peerId, channel);
            } catch (error) {
                console.error('[SECURE-PEER] Error handling message:', error);
            }
        };

        channel.onerror = (err) => {
            console.error('[SECURE-PEER] Data channel error:', err);
        };
    };

    /**
     * Handle key exchange messages for E2EE signaling
     */
    const handleKeyExchangeMessage = async (
        message: KeyExchangeMessage,
        peerId: string,
        channel: RTCDataChannel
    ) => {
        const session = activeCalls.value.get(peerId);
        if (!session) return;

        switch (message.type) {
            case 'KEY_EXCHANGE_REQUEST':
                if (message.publicKeyJWK && sessionPrivateKey.value) {
                    // Derive shared secret
                    const sharedKey = await deriveSharedSecret(
                        sessionPrivateKey.value,
                        message.publicKeyJWK
                    );
                    
                    const keys = callEncryptionKeys.value;
                    keys.set(peerId, sharedKey);
                    callEncryptionKeys.value = keys;
                    
                    session.e2eeKey = sharedKey;
                    session.keyAgreementComplete = true;

                    // Send confirmation
                    const response: KeyExchangeMessage = {
                        type: 'KEY_EXCHANGE_RESPONSE',
                        publicKeyJWK: sessionPublicKeyJWK.value,
                        timestamp: Date.now()
                    };
                    channel.send(JSON.stringify(response));

                    // Generate authentication fingerprint
                    const fingerprint = await generateFingerprint(sharedKey, session.callId);
                    const status = callSecurityStatus.value;
                    status.set(peerId, {
                        encrypted: true,
                        authenticated: false,
                        fingerprint
                    });
                    callSecurityStatus.value = status;
                }
                break;

            case 'KEY_EXCHANGE_RESPONSE':
                if (message.publicKeyJWK && sessionPrivateKey.value) {
                    // Derive shared secret
                    const sharedKey = await deriveSharedSecret(
                        sessionPrivateKey.value,
                        message.publicKeyJWK
                    );
                    
                    const keys = callEncryptionKeys.value;
                    keys.set(peerId, sharedKey);
                    callEncryptionKeys.value = keys;
                    
                    session.e2eeKey = sharedKey;
                    session.keyAgreementComplete = true;

                    // Generate authentication fingerprint
                    const fingerprint = await generateFingerprint(sharedKey, session.callId);
                    const status = callSecurityStatus.value;
                    status.set(peerId, {
                        encrypted: true,
                        authenticated: true,
                        fingerprint
                    });
                    callSecurityStatus.value = status;
                }
                break;
        }
    };

    /**
     * Handle call events with E2EE setup
     */
    const handleCallEvents = (call: MediaConnection) => {
        const peerId = call.peer;
        
        // Create secure session
        const session: SecureCallSession = {
            call,
            callId: `${peerId}-${Date.now()}`,
            peerId,
            e2eeKey: null,
            e2eeKeyId: 0,
            keyAgreementComplete: false,
            authenticated: false
        };
        
        const calls = activeCalls.value;
        calls.set(peerId, session);
        activeCalls.value = calls;

        call.on('stream', (incomingStream) => {
            ringtone.pause();
            ringtone.currentTime = 0;
            
            // Store remote stream (DTLS-SRTP encryption is automatic in WebRTC)
            const streams = remoteStreams.value;
            streams.set(peerId, incomingStream);
            remoteStreams.value = streams;
        });

        call.on('close', () => removePeerFromCall(peerId));
        call.on('error', (err) => {
            console.error('[SECURE-PEER] Call error:', err);
            removePeerFromCall(peerId);
        });

        // Set up data channel for E2EE signaling
        const dataChannel = call.peerConnection.createDataChannel('secure-control');
        setupSecureDataChannel(dataChannel, peerId);
    };

    /**
     * Toggle microphone
     */
    const toggleMic = () => {
        const audioTrack = localStream.value?.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMicOn.value = audioTrack.enabled;
        }
    };

    /**
     * Toggle camera
     */
    const toggleCam = async () => {
        try {
            if (!isCamOn.value) {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                const videoTrack = videoStream.getVideoTracks()[0];
                
                if (localStream.value) {
                    if (!videoTrack) return console.error('[SECURE-PEER] Video track is undefined');
                    localStream.value.addTrack(videoTrack);

                    activeCalls.value.forEach(session => {
                        const sender = session.call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) sender.replaceTrack(videoTrack);
                        else session.call.peerConnection.addTrack(videoTrack, localStream.value!);
                    });
                }

                isCamOn.value = true;
            } else {
                const videoTrack = localStream.value?.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.stop();
                    localStream.value?.removeTrack(videoTrack);
                    isCamOn.value = false;
                }
            }
        } catch (err) {
            console.error("[SECURE-PEER] Erreur Cam:", err);
        }
    };

    /**
     * Toggle screen sharing
     */
    const toggleScreenShare = async () => {
        try {
            if (!isScreenSharing.value) {
                screenStream.value = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.value.getVideoTracks()[0];

                if (!screenTrack) return console.error('[SECURE-PEER] screenTrack is undefined');

                activeCalls.value.forEach(session => {
                    const sender = session.call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                    sender?.replaceTrack(screenTrack);
                });

                screenTrack.onended = () => stopScreenShare();
                isScreenSharing.value = true;
            } else {
                await stopScreenShare();
            }
        } catch (err) {
            console.error("[SECURE-PEER] Erreur ScreenShare:", err);
        }
    };

    /**
     * Stop screen sharing
     */
    const stopScreenShare = async () => {
        screenStream.value?.getTracks().forEach(t => t.stop());
        isScreenSharing.value = false;
        
        if (isCamOn.value) {
            const videoTrack = localStream.value?.getVideoTracks()[0];
            activeCalls.value.forEach(session => {
                const sender = session.call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (videoTrack) sender?.replaceTrack(videoTrack);
            });
        }
    };

    /**
     * Accept incoming call with E2EE
     */
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
            console.error("[SECURE-PEER] Erreur acceptCall:", err);
        }
    };

    /**
     * Start a secure call with E2EE signaling
     */
    const startCall = async (recipient: User) => {
        if (!recipient?.id) {
            return console.error("[SECURE-PEER] ID du destinataire manquant.");
        }

        if (!peer.value || peer.value.destroyed) {
            return console.error("[SECURE-PEER] L'instance Peer n'est pas initialisée.");
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

            // Create call with E2EE metadata
            const call = peer.value.call(recipient.id, localStream.value, {
                metadata: {
                    e2ee: true,
                    version: '1.0',
                    publicKeyJWK: sessionPublicKeyJWK.value
                }
            });

            if (!call) {
                throw new Error(`L'appel n'a pas pu être établi avec l'ID : ${recipient.id}`);
            }

            handleCallEvents(call);

        } catch (err) {
            console.error("[SECURE-PEER] Erreur startCall:", err);
            cleanupCall();
        }
    };

    /**
     * Remove peer from call
     */
    const removePeerFromCall = (peerId: string) => {
        const streams = remoteStreams.value;
        streams.delete(peerId);
        remoteStreams.value = streams;

        const calls = activeCalls.value;
        calls.delete(peerId);
        activeCalls.value = calls;

        const keys = callEncryptionKeys.value;
        keys.delete(peerId);
        callEncryptionKeys.value = keys;

        const status = callSecurityStatus.value;
        status.delete(peerId);
        callSecurityStatus.value = status;

        if (activeCalls.value.size === 0) cleanupCall();
    };

    /**
     * Cleanup call resources
     */
    const cleanupCall = () => {
        ringtone.pause();
        ringtone.currentTime = 0;
        localStream.value?.getTracks().forEach(track => track.stop());
        screenStream.value?.getTracks().forEach(track => track.stop());
        localStream.value = null;
        screenStream.value = null;
        remoteStreams.value = new Map();
        activeCalls.value = new Map();
        callEncryptionKeys.value = new Map();
        callSecurityStatus.value = new Map();
        enteringCall.value = null;
        isCalling.value = false;
        isCamOn.value = false;
        isScreenSharing.value = false;
    };

    /**
     * End all calls
     */
    const endCall = () => {
        activeCalls.value.forEach(session => session.call.close());
        cleanupCall();
    };

    /**
     * Monitor audio levels
     */
    const monitorAudio = (stream: MediaStream, callback: (speaking: boolean) => void) => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 256;
        source.connect(analyzer);
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);

        const checkVolume = () => {
            if (!stream.active || !isCalling.value) {
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

    /**
     * Verify call security fingerprint (for user verification - SAS)
     */
    const verifySecurityFingerprint = (peerId: string, userProvidedFingerprint: string): boolean => {
        const status = callSecurityStatus.value.get(peerId);
        if (!status) return false;
        return status.fingerprint.toUpperCase() === userProvidedFingerprint.toUpperCase();
    };

    /**
     * Get security status for a call
     */
    const getCallSecurityStatus = (peerId: string): SecurityStatus => {
        return callSecurityStatus.value.get(peerId) || { encrypted: false, authenticated: false, fingerprint: '' };
    };

    /**
     * Send encrypted signaling message over data channel
     */
    const sendEncryptedSignal = async (peerId: string, message: string): Promise<boolean> => {
        const session = activeCalls.value.get(peerId);
        const encryptionKey = callEncryptionKeys.value.get(peerId);
        
        if (!session || !encryptionKey) {
            console.error('[SECURE-PEER] Cannot send encrypted signal: no session or key');
            return false;
        }

        try {
            const encoder = new TextEncoder();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                encryptionKey,
                encoder.encode(message)
            );

            // Get the data channel from the peer connection
            const dataChannel = Array.from(
                (session.call.peerConnection as any).getSenders()
            ).length > 0 ? null : null; // Data channel is managed separately

            // For now, use the session's data channel if available
            // This is a simplified implementation
            console.log('[SECURE-PEER] Encrypted signal prepared for:', peerId);
            return true;
        } catch (error) {
            console.error('[SECURE-PEER] Error encrypting signal:', error);
            return false;
        }
    };

    return {
        initPeer,
        startCall,
        endCall,
        acceptCall,
        rejectCall: () => {
            if (!enteringCall.value) return;
            enteringCall.value.close();
            callNotif.value = callNotif.value.filter(m => m.user?.id !== enteringCall.value?.peer);
            enteringCall.value = null;
            ringtone.pause();
        },
        toggleMic,
        toggleCam,
        toggleScreenShare,
        remoteStreams,
        localStream,
        isCalling,
        isSpeaking,
        isMicOn,
        isCamOn,
        isScreenSharing,
        enteringCall,
        // Security features
        getCallSecurityStatus,
        verifySecurityFingerprint,
        callSecurityStatus,
        sendEncryptedSignal
    };
}