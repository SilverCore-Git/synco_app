import { ref, shallowRef } from 'vue';
import { Peer, type MediaConnection } from 'peerjs';
import type { User } from '@/types/types';
import { openedOrg } from '@/assets/var';
import useNotifications from './useNotifications';
import { keycloak } from '@/assets/keycloak';
import { generateCallId } from '@/assets/utils/webhookCrypto';
import { getVoicePrefs } from '@/assets/utils/voicePrefs';

// ============================================================================
// Configuration
// ============================================================================

const PEER_CONFIG = {
    sdpSemantics: 'unified-plan' as const,
    encodedInsertableStreams: true,
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
    keyExchangeTimeout: any | null;
}

interface KeyExchangeMessage {
    type: 'KEY_EXCHANGE_REQUEST' | 'KEY_EXCHANGE_RESPONSE' | 'KEY_CONFIRMATION';
    publicKeyJWK?: string;
    timestamp?: number;
    callId?: string;
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

// Deafen simple (mute de l'élément média distant) : à 2 personnes, le
// GainNode par-participant à volume réglable des vocal threads (useLiveKit.ts)
// serait de la sur-ingénierie — cf. plan.
const isDeafened = ref<boolean>(false);

// "Le correspondant parle" par peerId — équivalent P2P de ce que LiveKit
// fournit nativement (ActiveSpeakersChanged) pour les vocal threads.
const remoteSpeaking = ref<Map<string, boolean>>(new Map());

// Éléments <video>/<audio> du flux distant réellement montés, enregistrés par
// CallOverlay.vue via :ref — nécessaire pour appliquer setSinkId (changement
// d'enceinte) sur l'élément qui joue vraiment le son, pas sur le MediaStream
// lui-même (qui n'a pas cette API).
const remoteMediaEls = new Map<string, HTMLMediaElement>();

// Session keys for E2EE
const sessionPrivateKey = ref<CryptoKey | null>(null);
const sessionPublicKeyJWK = ref<string>('');
// ref() et non shallowRef() : partout dans ce fichier, la mise à jour de ces
// Maps se fait en récupérant `.value`, en appelant `.set()` dessus, puis en
// réassignant `.value` à cette MÊME référence — un shallowRef ne déclenche
// rien dans ce cas (Object.is voit la même référence, donc "pas de
// changement"), ce qui laissait `securityStatus` figé sur "Chiffrement..."
// dans CallOverlay.vue même une fois la négociation réellement terminée
// (le chiffrement media lui-même n'est pas affecté, il lit session.e2eeKey
// directement — seul l'affichage restait figé).
const callEncryptionKeys = ref<Map<string, CryptoKey>>(new Map());

// Security status
const callSecurityStatus = ref<Map<string, SecurityStatus>>(new Map());

const ringtone = new Audio('/callSound.wav');
ringtone.loop = true;

// ============================================================================
// Key Agreement Protocol (ECDH + HKDF)
// ============================================================================

// Key exchange timeout (10 seconds)
const KEY_EXCHANGE_TIMEOUT = 10000;

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
 * Derive a per-call HKDF salt from the session's callId (itself a
 * crypto.getRandomValues-backed identifier, cf. generateCallId()).
 * Both peers already validate they share the same callId before this
 * point, so hashing it gives a salt that's unique per call and known
 * to both sides without an extra round trip on the wire.
 */
async function deriveSessionSalt(callId: string): Promise<ArrayBuffer> {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(callId));
}

/**
 * Derive a shared secret using ECDH
 */
async function deriveSharedSecret(
    privKey: CryptoKey,
    peerPublicKeyJWK: string,
    callId: string
): Promise<CryptoKey> {
    const peerPublicKey = await crypto.subtle.importKey(
        'jwk',
        JSON.parse(peerPublicKeyJWK),
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
    );

    const salt = await deriveSessionSalt(callId);

    // deriveKey() ne peut pas enchaîner ECDH -> HKDF en un seul appel : son
    // 3e paramètre (derivedKeyAlgorithm) décrit l'algorithme de la clé FINALE
    // désirée, pas une seconde étape de dérivation — passer {name:'HKDF',...}
    // là ne produit pas une clé AES-GCM utilisable et échoue (DOMException
    // "An invalid or illegal string was specified"). Le chaînage ECDH -> HKDF
    // -> AES-GCM demande 3 étapes explicites :

    // 1. Bits bruts du secret partagé ECDH.
    const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: peerPublicKey },
        privKey,
        256
    );

    // 2. Ces bits importés comme clé de base HKDF (non extractible, ne sert
    //    qu'à dériver — jamais utilisée directement pour chiffrer).
    const hkdfBaseKey = await crypto.subtle.importKey(
        'raw',
        sharedBits,
        'HKDF',
        false,
        ['deriveKey']
    );

    // 3. Clé AES-GCM finale, dérivée via HKDF (salt + info) depuis la base.
    const sharedSecret = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            info: new TextEncoder().encode('SilverTeams-Call-E2EE-Key'),
            salt
        },
        hkdfBaseKey,
        { name: 'AES-GCM', length: 256 },
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
        // Cleanup existing peer if destroyed or disconnected
        if (peer.value) {
            if (peer.value.destroyed) {
                cleanupPeer();
            } else if (peer.value.disconnected) {
                try {
                    await peer.value.reconnect();
                    return;
                } catch (e) {
                    console.error('[SECURE-PEER] Reconnect failed, recreating peer:', e);
                    cleanupPeer();
                }
            } else {
                // Peer is already connected
                return;
            }
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
            port: Number(import.meta.env.VITE_PEER_PORT || 9001),
            path: import.meta.env.VITE_PEER_PATH || '/webrtc',
            secure: import.meta.env.VITE_PEER_SECURE === 'true' || false,
            key: import.meta.env.VITE_PEER_PUBLISHABLE_KEY || 'peerjs',
            config: PEER_CONFIG,
            debug: 1
        });

        peer.value.on('call', (call) => {
            handleIncomingCall(call);
        });

        peer.value.on('error', (err) => {
            console.error('[SECURE-PEER] Error:', err);
            // Don't automatically reconnect on all errors - let the caller handle it
        });

        peer.value.on('disconnected', () => {
            console.warn('[SECURE-PEER] Peer disconnected from server');
        });

        peer.value.on('close', () => {
            console.warn('[SECURE-PEER] Peer connection closed');
        });
    };

    const cleanupPeer = () => {
        if (peer.value) {
            try {
                peer.value.off('call');
                peer.value.off('error');
                peer.value.off('disconnected');
                peer.value.off('close');
                if (!peer.value.destroyed) {
                    peer.value.destroy();
                }
            } catch (e) {
                console.error('[SECURE-PEER] Error cleaning up peer:', e);
            }
            peer.value = null;
        }
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

        // Le correspondant peut raccrocher avant qu'on ait répondu (appel annulé) :
        // avant l'acceptation, aucun listener 'close' n'était posé sur cet appel,
        // donc enteringCall/callNotif/la sonnerie restaient bloqués indéfiniment
        // côté appelé, avec un bouton "Répondre" mort pointant vers un appel fermé.
        call.on('close', () => {
            if (enteringCall.value !== call) return;
            enteringCall.value = null;
            callNotif.value = callNotif.value.filter(m => m.user?.id !== call.peer);
            ringtone.pause();
            ringtone.currentTime = 0;
        });

        enteringCall.value = call;
        callNotif.value.push(member);
        ringtone.play().catch(() => {});
    };

    /**
     * Set up secure data channel for encrypted signaling
     */
    const setupSecureDataChannel = (channel: RTCDataChannel, peerId: string) => {
        const session = activeCalls.value.get(peerId);
        if (!session) return;

        channel.onopen = async () => {
            console.log('[SECURE-PEER] Data channel open with:', peerId);
            
            // Set timeout for key exchange
            session.keyExchangeTimeout = setTimeout(() => {
                console.warn('[SECURE-PEER] Key exchange timeout for:', peerId);
                const calls = activeCalls.value;
                const currentSession = calls.get(peerId);
                if (currentSession && !currentSession.keyAgreementComplete) {
                    currentSession.keyAgreementComplete = false;
                    currentSession.authenticated = false;
                    const status = callSecurityStatus.value;
                    status.set(peerId, {
                        encrypted: false,
                        authenticated: false,
                        fingerprint: 'TIMEOUT'
                    });
                    callSecurityStatus.value = status;
                }
            }, KEY_EXCHANGE_TIMEOUT);
            
            // Send our public key for key agreement
            const handshake: KeyExchangeMessage = {
                type: 'KEY_EXCHANGE_REQUEST',
                publicKeyJWK: sessionPublicKeyJWK.value,
                timestamp: Date.now(),
                callId: session.callId
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

        channel.onclose = () => {
            console.log('[SECURE-PEER] Data channel closed for:', peerId);
            // Clear timeout on channel close
            if (session.keyExchangeTimeout) {
                clearTimeout(session.keyExchangeTimeout);
                session.keyExchangeTimeout = null;
            }
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
        if (!session) {
            console.warn('[SECURE-PEER] Received key exchange for unknown peer:', peerId);
            return;
        }

        // Validate timestamp (prevent replay attacks - accept messages within last 30 seconds)
        // Both fields are required: a message missing either one is rejected outright,
        // rather than skipping the check it would otherwise have failed.
        if (!message.timestamp || Math.abs(Date.now() - message.timestamp) > 30000) {
            console.warn('[SECURE-PEER] Rejecting key exchange message with missing/expired timestamp (possible replay attack)');
            return;
        }

        // Validate callId matches current session (prevent session confusion)
        if (!message.callId || message.callId !== session.callId) {
            console.warn('[SECURE-PEER] Rejecting key exchange message with missing/mismatched callId (possible session hijacking attempt)');
            return;
        }

        try {
            switch (message.type) {
                case 'KEY_EXCHANGE_REQUEST':
                    if (message.publicKeyJWK && sessionPrivateKey.value) {
                        // Clear timeout as we have activity
                        if (session.keyExchangeTimeout) {
                            clearTimeout(session.keyExchangeTimeout);
                        }
                        
                        // Derive shared secret
                        const sharedKey = await deriveSharedSecret(
                            sessionPrivateKey.value,
                            message.publicKeyJWK,
                            session.callId
                        );
                        
                        const keys = callEncryptionKeys.value;
                        keys.set(peerId, sharedKey);
                        callEncryptionKeys.value = keys;
                        
                        session.e2eeKey = sharedKey;
                        session.keyAgreementComplete = true;

                        // Send confirmation with callId
                        const response: KeyExchangeMessage = {
                            type: 'KEY_EXCHANGE_RESPONSE',
                            publicKeyJWK: sessionPublicKeyJWK.value,
                            timestamp: Date.now(),
                            callId: session.callId
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
                        
                        console.log('[SECURE-PEER] Key exchange completed for:', peerId);
                    }
                    break;

                case 'KEY_EXCHANGE_RESPONSE':
                    if (message.publicKeyJWK && sessionPrivateKey.value) {
                        // Clear timeout
                        if (session.keyExchangeTimeout) {
                            clearTimeout(session.keyExchangeTimeout);
                            session.keyExchangeTimeout = null;
                        }
                        
                        // Derive shared secret
                        const sharedKey = await deriveSharedSecret(
                            sessionPrivateKey.value,
                            message.publicKeyJWK,
                            session.callId
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
                        
                        console.log('[SECURE-PEER] Key exchange completed and authenticated for:', peerId);
                    }
                    break;
            }
        } catch (error) {
            console.error('[SECURE-PEER] Key exchange error:', error);
            // On error, mark as failed but keep connection alive
            const status = callSecurityStatus.value;
            status.set(peerId, {
                encrypted: false,
                authenticated: false,
                fingerprint: 'ERROR'
            });
            callSecurityStatus.value = status;
        }
    };

    /**
     * Handle call events with E2EE setup
     */
    const handleCallEvents = (call: MediaConnection, isCaller: boolean) => {
        const peerId = call.peer;

        // Le callId DOIT être partagé entre les deux côtés : handleKeyExchangeMessage
        // rejette tout message dont le callId ne correspond pas exactement à
        // session.callId (protection anti session-hijacking). En générer un
        // localement ici, indépendamment de chaque côté, produisait deux valeurs
        // différentes qui ne pouvaient jamais correspondre — chaque échange de
        // clé était donc rejeté, sur CHAQUE appel. L'appelant le génère et le
        // transmet via call.metadata (cf. startCall) ; l'appelé le relit depuis
        // ce même metadata au lieu d'en fabriquer un autre.
        const callId = (call.metadata as { callId?: string } | undefined)?.callId
            || `${peerId}-${generateCallId()}`;

        // Create secure session
        const session: SecureCallSession = {
            call,
            callId,
            peerId,
            e2eeKey: null,
            e2eeKeyId: Date.now(),
            keyAgreementComplete: false,
            authenticated: false,
            keyExchangeTimeout: null
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

            monitorAudio(incomingStream, (val) => {
                const speaking = new Map(remoteSpeaking.value);
                speaking.set(peerId, val);
                remoteSpeaking.value = speaking;
            });
        });

        call.on('close', () => removePeerFromCall(peerId));
        call.on('error', (err) => {
            console.error('[SECURE-PEER] Call error:', err);
            removePeerFromCall(peerId);
        });

        // Set up data channel for E2EE signaling
        if (isCaller) {
            const dataChannel = call.peerConnection.createDataChannel('secure-control');
            setupSecureDataChannel(dataChannel, peerId);
        } else {
            call.peerConnection.ondatachannel = (event) => {
                if (event.channel.label === 'secure-control') {
                    setupSecureDataChannel(event.channel, peerId);
                }
            };
        }
        
        setupMediaEncryption(peerId);
    };

    /**
     * Setup E2EE Media Frame Encryption using Insertable Streams
     */
    const setupMediaEncryption = (peerId: string) => {
        const session = activeCalls.value.get(peerId);
        if (!session) return;
        
        const pc = session.call.peerConnection;
        if (!('createEncodedStreams' in RTCRtpSender.prototype)) {
            console.warn('[SECURE-PEER] Insertable Streams API non supportée. Le flux média ne sera pas doublement chiffré.');
            return;
        }

        try {
            // Senders (Encrypt)
            pc.getSenders().forEach(sender => {
                if (!sender.track || (sender as any)._e2eeSetup) return;
                (sender as any)._e2eeSetup = true;

                const streams = (sender as any).createEncodedStreams();
                const transform = new TransformStream({
                    async transform(chunk, controller) {
                        if (!session.e2eeKey) return; // Drop frame if key is not ready
                        
                        const data = new Uint8Array(chunk.data);
                        const iv = crypto.getRandomValues(new Uint8Array(12));
                        
                        try {
                            const ciphertext = await crypto.subtle.encrypt(
                                { name: 'AES-GCM', iv },
                                session.e2eeKey,
                                data
                            );
                            const payload = new Uint8Array(iv.length + ciphertext.byteLength);
                            payload.set(iv, 0);
                            payload.set(new Uint8Array(ciphertext), iv.length);
                            chunk.data = payload.buffer;
                            controller.enqueue(chunk);
                        } catch (e) {
                            // Ignorer
                        }
                    }
                });
                streams.readable.pipeThrough(transform).pipeTo(streams.writable);
            });

            // Receivers (Decrypt)
            pc.getReceivers().forEach(receiver => {
                if (!receiver.track || (receiver as any)._e2eeSetup) return;
                (receiver as any)._e2eeSetup = true;

                const streams = (receiver as any).createEncodedStreams();
                const transform = new TransformStream({
                    async transform(chunk, controller) {
                        if (!session.e2eeKey) return;
                        
                        const payload = new Uint8Array(chunk.data);
                        if (payload.byteLength > 12) {
                            const iv = payload.slice(0, 12);
                            const ciphertext = payload.slice(12);
                            try {
                                const plaintext = await crypto.subtle.decrypt(
                                    { name: 'AES-GCM', iv },
                                    session.e2eeKey,
                                    ciphertext
                                );
                                chunk.data = plaintext;
                                controller.enqueue(chunk);
                            } catch (e) {
                                // Decryption failed
                            }
                        }
                    }
                });
                streams.readable.pipeThrough(transform).pipeTo(streams.writable);
            });
        } catch(e) {
            console.error('[SECURE-PEER] Erreur setup E2EE:', e);
        }
    };

    /**
     * Enregistre/désenregistre l'élément <video>/<audio> qui joue réellement
     * le flux distant d'un peer — appelé via :ref depuis CallOverlay.vue.
     * Applique tout de suite l'enceinte déjà choisie (voicePrefs), pour que
     * changer de tuile focus/PiP (donc de <video> monté) ne perde pas le
     * choix précédent.
     */
    const registerRemoteMediaElement = (peerId: string, el: HTMLMediaElement | null) => {
        if (el) {
            remoteMediaEls.set(peerId, el);
            const speakerId = getVoicePrefs().speakerDeviceId;
            if (speakerId && 'setSinkId' in el) {
                (el as any).setSinkId(speakerId).catch(() => {});
            }
        }
        // Pas de suppression ici sur démontage (el === null) : le plein écran
        // et la fenêtre réduite ont chacun leur propre <video>, et pendant la
        // transition entre les deux, le nouveau peut se monter (et s'enregistrer)
        // avant que l'ancien ne se démonte — un `delete` ici effacerait alors le
        // bon élément qui vient d'être enregistré. cleanupCall()/removePeerFromCall()
        // nettoient déjà la map à la fin de l'appel ou du peer concerné.
    };

    /**
     * Change de périphérique micro/caméra/enceinte en cours d'appel, comme
     * switchDevice() dans useLiveKit.ts pour les vocal threads.
     */
    const switchDevice = async (kind: MediaDeviceKind, deviceId: string) => {
        if (kind === 'audiooutput') {
            for (const el of remoteMediaEls.values()) {
                if ('setSinkId' in el) {
                    await (el as any).setSinkId(deviceId).catch((e: unknown) =>
                        console.error('[SECURE-PEER] setSinkId a échoué:', e));
                }
            }
            return;
        }

        try {
            const newStream = kind === 'audioinput'
                ? await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })
                : await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });

            const newTrack = kind === 'audioinput' ? newStream.getAudioTracks()[0] : newStream.getVideoTracks()[0];
            if (!newTrack || !localStream.value) return;

            // videoinput : rien à remplacer si la caméra n'est pas active — le
            // device choisi sera repris à la prochaine activation via voicePrefs.
            if (kind === 'videoinput' && !isCamOn.value) {
                newTrack.stop();
                return;
            }

            const trackKind = kind === 'audioinput' ? 'audio' : 'video';
            const oldTrack = localStream.value.getTracks().find(t => t.kind === trackKind);
            if (oldTrack) {
                oldTrack.stop();
                localStream.value.removeTrack(oldTrack);
            }
            localStream.value.addTrack(newTrack);

            if (kind === 'audioinput') newTrack.enabled = isMicOn.value;

            activeCalls.value.forEach(session => {
                const sender = session.call.peerConnection.getSenders().find(s => s.track?.kind === trackKind);
                if (sender) sender.replaceTrack(newTrack);
                else if (kind === 'videoinput') session.call.peerConnection.addTrack(newTrack, localStream.value!);
            });
        } catch (err) {
            console.error('[SECURE-PEER] switchDevice a échoué:', err);
        }
    };

    /**
     * Applique une nouvelle résolution/framerate à la track vidéo active
     * (caméra ou partage d'écran) sans la republier, comme applyVideoQuality()
     * dans useLiveKit.ts.
     */
    const applyVideoQuality = async (
        source: 'camera' | 'screenshare',
        options: { resolution: { width: number; height: number }; frameRate: number }
    ) => {
        const track = source === 'camera'
            ? localStream.value?.getVideoTracks()[0]
            : screenStream.value?.getVideoTracks()[0];
        if (!track) return;

        try {
            await track.applyConstraints({
                width: options.resolution.width,
                height: options.resolution.height,
                frameRate: options.frameRate
            });
        } catch (err) {
            console.error('[SECURE-PEER] applyVideoQuality a échoué:', err);
        }
    };

    /**
     * Coupe/réactive le son du correspondant — mute simple de l'élément média
     * (cf. plan : pas de GainNode/volume par-participant, sur-ingénierie à 2).
     */
    const toggleDeafen = () => {
        isDeafened.value = !isDeafened.value;
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
     * Toggle camera. `captureOptions` (device/résolution/framerate) est
     * construit par la vue depuis voicePrefs à l'activation — même split de
     * responsabilité que toggleCamera() dans useLiveKit.ts.
     */
    const toggleCam = async (captureOptions?: { deviceId?: string; resolution?: { width: number; height: number }; frameRate?: number }) => {
        try {
            if (!isCamOn.value) {
                const videoStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: captureOptions?.deviceId ? { exact: captureOptions.deviceId } : undefined,
                        width: captureOptions?.resolution?.width,
                        height: captureOptions?.resolution?.height,
                        frameRate: captureOptions?.frameRate
                    }
                });
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
     * Toggle screen sharing. Même logique de `captureOptions` que toggleCam.
     */
    const toggleScreenShare = async (captureOptions?: { resolution?: { width: number; height: number; frameRate?: number } }) => {
        try {
            if (!isScreenSharing.value) {
                screenStream.value = await navigator.mediaDevices.getDisplayMedia({
                    video: captureOptions?.resolution ? { ...captureOptions.resolution } : true
                });
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
            const micDeviceId = getVoicePrefs().micDeviceId;
            localStream.value = await navigator.mediaDevices.getUserMedia({
                audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
                video: false
            });
            isCamOn.value = false;

            monitorAudio(localStream.value, (val) => isSpeaking.value = val);
            enteringCall.value.answer(localStream.value);
            handleCallEvents(enteringCall.value, false);

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
            console.log('[SECURE-PEER] Initialisation de l\'instance Peer...');
            await initPeer();
            // Wait a bit for peer to be ready
            await new Promise(resolve => setTimeout(resolve, 500));
            if (!peer.value || peer.value.destroyed) {
                return console.error("[SECURE-PEER] Impossible d'initialiser Peer.");
            }
        }

        if (peer.value.disconnected) {
            try {
                console.log('[SECURE-PEER] Tentative de reconnexion...');
                await peer.value.reconnect();
                // Wait for reconnection
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (peer.value.disconnected) {
                    console.error('[SECURE-PEER] Échec de la reconnexion');
                    cleanupCall();
                    return;
                }
            } catch (e) {
                console.error('[SECURE-PEER] Erreur de reconnexion:', e);
                cleanupCall();
                return;
            }
        }

        // Prevent duplicate calls
        if (isCalling.value || enteringCall.value || activeCalls.value.size > 0) {
            console.warn('[SECURE-PEER] Un appel est déjà en cours');
            return;
        }

        try {
            const micDeviceId = getVoicePrefs().micDeviceId;
            localStream.value = await navigator.mediaDevices.getUserMedia({
                audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
                video: false
            });
            isCamOn.value = false;

            monitorAudio(localStream.value, (val) => isSpeaking.value = val);
            isCalling.value = true;
            ringtone.play().catch(() => {});

            // Create call with E2EE metadata — callId généré ici et transmis dans
            // les metadata pour que handleCallEvents (côté appelé) le relise au
            // lieu d'en générer un différent (cf. commentaire dans handleCallEvents).
            const call = peer.value.call(recipient.id, localStream.value, {
                metadata: {
                    e2ee: true,
                    version: '1.0',
                    publicKeyJWK: sessionPublicKeyJWK.value,
                    callId: `${recipient.id}-${generateCallId()}`
                }
            });

            if (!call) {
                throw new Error(`L'appel n'a pas pu être établi avec l'ID : ${recipient.id}`);
            }

            handleCallEvents(call, true);

        } catch (err) {
            console.error("[SECURE-PEER] Erreur startCall:", err);
            cleanupCall();
        }
    };

    /**
     * Remove peer from call
     */
    const removePeerFromCall = (peerId: string) => {
        const session = activeCalls.value.get(peerId);
        
        // Clear any pending timeouts
        if (session?.keyExchangeTimeout) {
            clearTimeout(session.keyExchangeTimeout);
        }
        
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

        const speaking = new Map(remoteSpeaking.value);
        speaking.delete(peerId);
        remoteSpeaking.value = speaking;
        remoteMediaEls.delete(peerId);

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
        
        // Clear all timeouts for active calls
        activeCalls.value.forEach(session => {
            if (session.keyExchangeTimeout) {
                clearTimeout(session.keyExchangeTimeout);
            }
        });
        
        remoteStreams.value = new Map();
        activeCalls.value = new Map();
        callEncryptionKeys.value = new Map();
        callSecurityStatus.value = new Map();
        remoteSpeaking.value = new Map();
        remoteMediaEls.clear();
        enteringCall.value = null;
        isCalling.value = false;
        isCamOn.value = false;
        isScreenSharing.value = false;
        // Don't cleanup peer here - let the caller decide if they want to keep it
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

    return {
        initPeer,
        startCall,
        endCall,
        acceptCall,
        cleanupPeer,
        rejectCall: () => {
            if (!enteringCall.value) return;
            enteringCall.value.close();
            callNotif.value = callNotif.value.filter(m => m.user?.id !== enteringCall.value?.peer);
            enteringCall.value = null;
            ringtone.pause();
            ringtone.currentTime = 0;
        },
        toggleMic,
        toggleCam,
        toggleScreenShare,
        toggleDeafen,
        switchDevice,
        applyVideoQuality,
        registerRemoteMediaElement,
        remoteStreams,
        remoteSpeaking,
        localStream,
        isCalling,
        isSpeaking,
        isMicOn,
        isCamOn,
        isScreenSharing,
        isDeafened,
        enteringCall,
        activeCalls,
        // Security features
        getCallSecurityStatus,
        verifySecurityFingerprint,
        callSecurityStatus
    };
}