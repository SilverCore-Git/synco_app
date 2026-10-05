import { ref, reactive, shallowRef } from 'vue';
import {
    Room,
    RoomEvent,
    RemoteTrack,
    Track,
    Participant,
    ExternalE2EEKeyProvider,
    VideoPresets,
    ScreenSharePresets,
    type VideoCaptureOptions,
    type ScreenShareCaptureOptions
} from 'livekit-client';
import { openedOrg } from '@/assets/var';
import { decryptThreadKeyWithRsa, privateKey } from '@/assets/utils/crypto';
import { pinOrCheckKey } from '@/assets/utils/keyPinning';
import E2EEWorker from '../../node_modules/livekit-client/dist/livekit-client.e2ee.worker.js?worker&url';
import useWSocket from './useWSocket';
import { useToast } from './useToast';
import sfetch from '@/assets/utils/sfetch';
import type { OrgMember } from '@/types/types';


const room = shallowRef<Room | null>(null);
const isConnected = ref<boolean>(false);
const allParticipants = shallowRef<Participant[]>([]);
const audioTracks = ref<Map<string, RemoteTrack>>(new Map());
const videoTracks = ref<Map<string, RemoteTrack>>(new Map());

const isMicEnabled = ref<boolean>(false);
const isCameraEnabled = ref<boolean>(false);
const isScreenShareEnabled = ref<boolean>(false);
const isDeafened = ref<boolean>(false);
const keyProvider = new ExternalE2EEKeyProvider();
let intentionalDisconnect = false;

/**
 * État réel du chiffrement de bout en bout de l'appel en cours, lu sur la
 * Room après connexion — jamais supposé (audit FC3).
 */
const isCallE2EE = ref<boolean>(false);

/** Salon sans clé E2EE : rejoindre en clair exige un choix explicite. */
export class CallNotEncryptedError extends Error {
    constructor() {
        super("Ce salon vocal n'est pas chiffré de bout en bout.");
        this.name = 'CallNotEncryptedError';
    }
}

/** Le salon est chiffré mais le chiffrement n'a pas pu être mis en place : on ne rejoint pas. */
export class CallEncryptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CallEncryptionError';
    }
}

export interface ConnectOptions {
    /** Le serveur indique que le salon est chiffré (au moins un membre a une ThreadKey). */
    e2eeRequired?: boolean;
    /** L'utilisateur a accepté explicitement de rejoindre un salon non chiffré. */
    allowUnencrypted?: boolean;
}

// ── Volume local par participant (0-200%) ───────────────────────────────
// Un <audio> natif plafonne à 100% (el.volume max = 1) : pour permettre un
// boost au-delà, chaque flux audio distant est routé à travers un GainNode
// Web Audio plutôt que de compter sur el.volume.
const VOLUMES_STORAGE_KEY = 'synco:voiceVolumes';
let audioCtx: AudioContext | null = null;
const gainNodes = new Map<string, GainNode>();
const participantVolumes = reactive<Map<string, number>>(new Map());

function loadStoredVolumes(): Record<string, number> {
    try {
        const raw = localStorage.getItem(VOLUMES_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function persistVolumes() {
    try {
        const obj: Record<string, number> = {};
        participantVolumes.forEach((v, k) => { obj[k] = v; });
        localStorage.setItem(VOLUMES_STORAGE_KEY, JSON.stringify(obj));
    } catch {
        // localStorage indisponible (navigation privée, quota) : préférence non persistée, sans impact fonctionnel
    }
}

function getStoredVolume(identity: string): number {
    if (participantVolumes.has(identity)) return participantVolumes.get(identity)!;
    const stored = loadStoredVolumes()[identity];
    const vol = typeof stored === 'number' ? stored : 100;
    participantVolumes.set(identity, vol);
    return vol;
}

function getAudioContext(): AudioContext {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}


/**
 * Unwraps the room's E2EE media key from the RSA-OAEP-encrypted blob the
 * backend returns alongside the LiveKit token. That blob is the thread's
 * existing ThreadKey — the same AES key already used for this thread's
 * text messages, already securely distributed per-member (cf.
 * encryptThreadKeyForMember). The backend only ever handles/stores the
 * ciphertext; it's meaningless without the recipient's RSA private key.
 *
 * Returns null when there's nothing to decrypt (thread has no E2EE key,
 * e.g. a guest joining via invite link, or a non-E2EE thread) — callers
 * treat that as "this call isn't E2EE", not an error.
 */
/**
 * Clé média dédiée, dérivée de la ThreadKey et liée au salon : la clé de
 * messages n'est jamais réutilisée telle quelle par un second protocole
 * (audit FC3 §4). Déterministe : tous les membres obtiennent la même.
 */
async function deriveMediaKey(threadKeyRaw: ArrayBuffer, threadId: string): Promise<ArrayBuffer> {
    const ikm = await crypto.subtle.importKey('raw', threadKeyRaw, 'HKDF', false, ['deriveBits']);
    return crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new Uint8Array(32),
            info: new TextEncoder().encode(`synco-livekit-media-v1:${threadId}`),
        },
        ikm,
        256,
    );
}

async function unwrapRoomKey(encryptedThreadKey: string | null | undefined, threadId: string): Promise<ArrayBuffer | null> {
    if (!encryptedThreadKey || !privateKey.value) return null;
    try {
        const threadKey = await decryptThreadKeyWithRsa(encryptedThreadKey, privateKey.value);
        // Même épinglage que les messages du salon (audit FC4).
        await pinOrCheckKey(threadKey, `thread:${threadId}`, 1);
        return await crypto.subtle.exportKey('raw', threadKey);
    } catch (e) {
        console.error('[LiveKit E2EE] Impossible de déchiffrer la clé du salon:', e);
        return null;
    }
}


function useLiveKit() 
{
    
    const getWSData = (r: Room) => {

        const list = [r.localParticipant, ...Array.from(r.remoteParticipants.values())];

        return list.map(p => ({
            identity: p.identity,
            isSpeaking: p.isSpeaking,
            isMicrophoneEnabled: p.isMicrophoneEnabled,
            isCameraEnabled: p.isCameraEnabled,
            isScreenShareEnabled: p.isScreenShareEnabled,
            metadata: JSON.stringify(openedOrg.value?.members?.find((m: OrgMember) => m.userId === p.identity)?.user),
        }));

    };

    const broadcastUpdate = async (threadId: string, spaceId: string, customList?: any[]) => {

        const socket = (await useWSocket()).value;
        if (!socket) return;

        socket.emit('voc:update', { 
            participants: customList || (room.value ? getWSData(room.value) : []), 
            threadId, 
            orgId: openedOrg.value?.id, 
            spaceId 
        });

    };

    const syncLocalState = () => {

        if (!room.value) return;
        const lp = room.value.localParticipant;
        isMicEnabled.value = lp.isMicrophoneEnabled;
        isCameraEnabled.value = lp.isCameraEnabled;
        isScreenShareEnabled.value = lp.isScreenShareEnabled;
        
    };

    const connectToRoom = async (
        url: string,
        token: string,
        threadId: string,
        spaceId: string,
        encryptedRoomKey?: string | null,
        opts: ConnectOptions = {},
    ) => {

        // Échec fermé (audit FC3) : un salon chiffré ne se rejoint jamais en
        // clair, que la clé manque, soit indéchiffrable ou que l'activation
        // échoue ; un salon sans clé ne se rejoint en clair qu'après un choix
        // explicite de l'utilisateur.
        const threadKeyRaw = await unwrapRoomKey(encryptedRoomKey, threadId);
        if (!threadKeyRaw && (encryptedRoomKey || opts.e2eeRequired)) {
            throw new CallEncryptionError(encryptedRoomKey
                ? "La clé de chiffrement du salon n'a pas pu être déchiffrée (code PIN verrouillé ?)."
                : "Ce salon est chiffré de bout en bout mais vous n'en avez pas encore la clé.");
        }
        if (!threadKeyRaw && !opts.allowUnencrypted) {
            throw new CallNotEncryptedError();
        }

        if (room.value)
        {
            await leaveRoom(room.value.name, spaceId);
        }

        let e2eeOptions = undefined;
        if (threadKeyRaw)
        {
            const mediaKey = await deriveMediaKey(threadKeyRaw, threadId);
            new Uint8Array(threadKeyRaw).fill(0);
            await keyProvider.setKey(mediaKey);
            new Uint8Array(mediaKey).fill(0);
            e2eeOptions = {
                keyProvider,
                worker: new Worker(E2EEWorker, { type: 'module' }),
            };
        }

        const newRoom = new Room({
            adaptiveStream: true,
            dynacast: true,
            e2ee: e2eeOptions,
            // Simulcast : publie plusieurs couches de qualité (caméra ET partage
            // d'écran) — le SFU ne transmet à chaque spectateur que la couche
            // adaptée à sa bande passante réelle (combiné à adaptiveStream/dynacast
            // ci-dessus), ce qui évite les lags dus à une connexion faible chez un
            // participant sans dégrader tout le monde.
            publishDefaults: {
                simulcast: true,
                videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
                screenShareSimulcastLayers: [ScreenSharePresets.h360fps15, ScreenSharePresets.h720fps15],
            }
        });

        if (e2eeOptions)
        {
            // L'option `e2ee` du constructeur installe le worker sans activer
            // le chiffrement : sans cet appel, encryptionType reste NONE et
            // le média part en clair vers le SFU (audit FC3). Avant connect()
            // pour que la première piste micro soit déjà publiée chiffrée.
            await newRoom.setE2EEEnabled(true);
        }

        newRoom.on(RoomEvent.ParticipantEncryptionStatusChanged, (encrypted, participant) => {
            if (!participant || participant.identity === newRoom.localParticipant.identity) {
                isCallE2EE.value = encrypted;
            } else if (e2eeOptions && !encrypted) {
                useToast().show(`${participant.name || 'Un participant'} n'est pas chiffré de bout en bout`, 'error');
            }
        });
        newRoom.on(RoomEvent.EncryptionError, (err) => {
            console.error('[LiveKit E2EE]', err);
            useToast().show("Erreur de chiffrement de l'appel", 'error');
        });

        const handleSync = () => {
            // Un mute forcé côté serveur (modération) ne déclenche que TrackMuted,
            // pas LocalTrackPublished/Unpublished : sans ce resync ici, le bouton
            // micro local resterait affiché "actif" après un mute distant.
            syncLocalState();
            allParticipants.value = [newRoom.localParticipant, ...Array.from(newRoom.remoteParticipants.values())];
            broadcastUpdate(threadId, spaceId);
        };

        // ActiveSpeakersChanged/ConnectionQualityChanged peuvent arriver en
        // rafale (plusieurs personnes qui parlent en même temps) ; on groupe
        // ces re-rendus sur une frame plutôt que d'en déclencher un par event.
        let syncScheduled = false;
        const scheduleSync = () => {
            if (syncScheduled) return;
            syncScheduled = true;
            requestAnimationFrame(() => {
                syncScheduled = false;
                handleSync();
            });
        };

        newRoom.on(RoomEvent.ParticipantConnected, handleSync);
        newRoom.on(RoomEvent.ParticipantDisconnected, handleSync);
        newRoom.on(RoomEvent.TrackMuted, handleSync);
        newRoom.on(RoomEvent.TrackUnmuted, handleSync);
        newRoom.on(RoomEvent.ParticipantMetadataChanged, handleSync);
        newRoom.on(RoomEvent.ActiveSpeakersChanged, scheduleSync);
        newRoom.on(RoomEvent.ConnectionQualityChanged, scheduleSync);

        // Le stop natif du "partage d'écran" via la barre du navigateur (ou une
        // caméra coupée hors de nos boutons) dépublie la track sans passer par
        // toggleCamera/toggleScreenShare : sans ça, isCameraEnabled/
        // isScreenShareEnabled restent bloqués sur leur dernière valeur connue.
        const resyncLocal = () => { syncLocalState(); handleSync(); };
        newRoom.on(RoomEvent.LocalTrackPublished, resyncLocal);
        newRoom.on(RoomEvent.LocalTrackUnpublished, resyncLocal);

        newRoom.on(RoomEvent.Disconnected, () => {
            // Événement tardif d'une room déjà remplacée par un connectToRoom
            // plus récent : ne pas écraser son état avec le nôtre.
            if (room.value !== newRoom) return;

            room.value = null;
            isConnected.value = false;
            isCallE2EE.value = false;
            allParticipants.value = [];
            audioTracks.value.clear();
            videoTracks.value.clear();
            gainNodes.forEach(g => g.disconnect());
            gainNodes.clear();

            if (!intentionalDisconnect) {
                useToast().show("Connexion au salon vocal perdue", "error");
            }
            intentionalDisconnect = false;
        });

        newRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {

            if (track.kind === Track.Kind.Audio)
            {
                const el = track.attach();
                // Routage via un GainNode Web Audio (cf. déclarations en tête de fichier) :
                // permet un volume par-participant jusqu'à 200%, ce qu'un <audio>
                // natif (max 100%) ne permet pas. Le gain porte aussi l'assourdissement
                // (deafen) — plus fiable que el.muted une fois l'élément capturé par
                // createMediaElementSource sur certains navigateurs.
                try {
                    const ctx = getAudioContext();
                    const source = ctx.createMediaElementSource(el);
                    const gain = ctx.createGain();
                    const vol = getStoredVolume(participant.identity);
                    gain.gain.value = isDeafened.value ? 0 : vol / 100;
                    source.connect(gain);
                    gain.connect(ctx.destination);
                    gainNodes.set(participant.identity, gain);
                } catch (e) {
                    console.error('[LiveKit Audio] Impossible de router le flux via Web Audio:', e);
                    el.muted = isDeafened.value;
                }
                audioTracks.value.set(participant.identity, track);
            }
            else
            {
                videoTracks.value.set(`${participant.identity}-${pub.source}`, track);
            }

            handleSync();

        });

        newRoom.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
            track.detach();
            if (track.kind === Track.Kind.Audio) {
                audioTracks.value.delete(participant.identity);
                gainNodes.get(participant.identity)?.disconnect();
                gainNodes.delete(participant.identity);
            }
            else videoTracks.value.delete(`${participant.identity}-${pub.source}`);
            handleSync();
        });

        try {
            await newRoom.connect(url, token);

            // L'état réel doit correspondre à l'intention : sinon on coupe.
            if (e2eeOptions && !newRoom.isE2EEEnabled) {
                intentionalDisconnect = true;
                await newRoom.disconnect();
                throw new CallEncryptionError("Le chiffrement de bout en bout de l'appel n'a pas pu être activé.");
            }
            isCallE2EE.value = newRoom.isE2EEEnabled;

            room.value = newRoom;
            isConnected.value = true;

            const { getVoicePrefs } = await import('@/assets/utils/voicePrefs');
            const prefs = getVoicePrefs();
            await newRoom.localParticipant.setMicrophoneEnabled(true, prefs.micDeviceId ? { deviceId: prefs.micDeviceId } : undefined);

            // Périphérique de sortie audio choisi dans les réglages, appliqué dès la
            // connexion — échoue silencieusement si le device a disparu depuis
            // (débranché) : on reste alors sur le device par défaut du navigateur.
            if (prefs.speakerDeviceId) {
                try { await newRoom.switchActiveDevice('audiooutput', prefs.speakerDeviceId); } catch { /* device indisponible */ }
            }

            // Broadcast decrypted profile info to guests/others via LiveKit metadata
            const { user, member } = await import('@/assets/var');
            
            const pName = member.value?.user?.name || user.value?.name || '';
            const pAvatar = member.value?.user?.avatarUrl || user.value?.avatarUrl || '';
            
            if (pName || pAvatar) {
                await newRoom.localParticipant.setMetadata(JSON.stringify({
                    name: pName,
                    avatarUrl: pAvatar
                }));
            }

            syncLocalState();
            handleSync();
        } 
        catch (error) 
        {
            console.error("Erreur LiveKit:", error);
            if (error instanceof CallEncryptionError) throw error;
        }
    };

    const leaveRoom = async (threadId: string, spaceId: string) => {

        if (room.value)
        {

            intentionalDisconnect = true;
            await room.value.disconnect();
            
            await broadcastUpdate(threadId, spaceId, []);

            room.value = null;
            isConnected.value = false;
            isCallE2EE.value = false;
            allParticipants.value = [];
            audioTracks.value.clear();
            videoTracks.value.clear();
            gainNodes.forEach(g => g.disconnect());
            gainNodes.clear();

        }

    };

    return {
        room,
        isConnected,
        allParticipants,
        videoTracks,
        isCameraEnabled,
        isMicEnabled,
        isScreenShareEnabled,
        isDeafened,
        participantVolumes,
        getWSData,
        connectToRoom,
        isCallE2EE,
        leaveRoom,
        toggleCamera: async (en: boolean, captureOptions?: VideoCaptureOptions) => {
            if (!room.value) return;
            await room.value.localParticipant.setCameraEnabled(en, captureOptions);
            isCameraEnabled.value = en;
        },
        toggleMicrophone: async (en: boolean) => {
            if (!room.value) return;
            await room.value.localParticipant.setMicrophoneEnabled(en);
            isMicEnabled.value = en;
        },
        toggleScreenShare: async (en: boolean, captureOptions?: ScreenShareCaptureOptions) => {
            if (!room.value) return;
            await room.value.localParticipant.setScreenShareEnabled(en, captureOptions);
            isScreenShareEnabled.value = en;
        },
        toggleDeafen: (en: boolean) => {
            isDeafened.value = en;
            gainNodes.forEach((gain, identity) => {
                gain.gain.value = en ? 0 : getStoredVolume(identity) / 100;
            });
        },

        /** Volume local (0-200%) appliqué au flux d'un participant distant — jamais envoyé au serveur. */
        setParticipantVolume: (identity: string, pct: number) => {
            const clamped = Math.min(200, Math.max(0, Math.round(pct)));
            participantVolumes.set(identity, clamped);
            persistVolumes();
            const gain = gainNodes.get(identity);
            if (gain && !isDeafened.value) gain.gain.value = clamped / 100;
        },

        /** Change le périphérique micro/caméra/enceinte actif sans republier (API native LiveKit). */
        switchDevice: async (kind: MediaDeviceKind, deviceId: string) => {
            if (!room.value) return;
            await room.value.switchActiveDevice(kind, deviceId);
        },

        /** Applique une nouvelle résolution/framerate à une track vidéo locale déjà publiée, sans republier. */
        applyVideoQuality: async (source: Track.Source.Camera | Track.Source.ScreenShare, options: VideoCaptureOptions) => {
            if (!room.value) return;
            const pub = room.value.localParticipant.getTrackPublication(source);
            await pub?.videoTrack?.restartTrack(options);
        },

        /** Force la coupure/réactivation du micro d'un autre participant (nécessite VOICE_MUTE_OTHERS). */
        muteParticipant: async (threadId: string, identity: string, muted: boolean) => {
            return sfetch(`/api/livekit/rooms/${threadId}/participants/${identity}/mute`, {
                method: 'POST',
                body: JSON.stringify({ muted }),
            });
        },

        /** Expulse un participant du salon vocal (nécessite VOICE_DISCONNECT). */
        disconnectParticipant: async (threadId: string, identity: string) => {
            return sfetch(`/api/livekit/rooms/${threadId}/participants/${identity}`, {
                method: 'DELETE',
            });
        }
    };

}

export default useLiveKit;