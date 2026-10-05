import { computed, ref } from 'vue';
import Peer, { type DataConnection } from 'peerjs';
import { encryptForPeer, decryptFromPeer, encryptBufferForPeer, decryptBufferFromPeer } from '@/assets/utils/crypto';
import { PEER_CONFIG } from '@/assets/utils/peerConfig';
import useWSocket from './useWSocket';
import useNotifications from './useNotifications';
import { useToast } from './useToast';
import type { OrgMember } from '@/types/types';
import router from '@/router';
import { openedOrg } from '@/assets/var';
import waitFor from '@/assets/utils/waitfor';
import { debugLog } from '@/assets/utils/debugLog';
import { createPeerReconnector } from '@/assets/utils/peerReconnect';

// ============================================================================
// État partagé — niveau module, comme useSecurePeer.ts (pas par instance de
// composant). Une session éphémère doit survivre à la navigation entre
// routes/workspaces : elle ne doit se terminer que sur une action explicite
// (bouton raccrocher, refus, ou l'autre partie qui ferme), jamais parce que
// le composant qui l'affichait a été démonté.
// ============================================================================

export const isMeeting = ref<boolean>(false);

// Taille max côté client pour un fichier partagé — tout transite et reste en
// mémoire (chiffrement + buffer complet des deux côtés), pas de streaming.
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 Mo

// Un fichier chiffré est découpé nous-mêmes en morceaux de cette taille
// (plutôt qu'un seul connection.send() sur tout le ciphertext) pour pouvoir
// afficher une vraie progression des deux côtés — PeerJS chunke déjà en
// interne les gros payloads, mais ne remonte aucun événement de progression
// exploitable : côté récepteur, un fichier volumineux restait invisible
// jusqu'à l'arrivée du tout dernier octet, plusieurs dizaines de secondes
// sans aucun signe que quoi que ce soit était en cours.
const FILE_CHUNK_SIZE = 64 * 1024; // 64 Ko

export interface MeetMessage {
    kind: 'text' | 'file';
    sender: 'Vous' | 'Correspondant.e';
    text?: string;
    fileId?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    fileUrl?: string;
    status?: 'sending' | 'receiving' | 'done';
    progress?: number;
    // Vrai une fois que LE CORRESPONDANT a confirmé avoir reçu et déchiffré
    // le fichier avec succès (FILE_RECEIVED) — distinct de status 'done',
    // qui côté expéditeur signifie seulement "j'ai fini d'envoyer tous les
    // morceaux", pas "l'autre les a bien tous reçus et déchiffrés".
    confirmedReceived?: boolean;
    timestamp: number;
}

interface IncomingFileTransfer {
    chunks: ArrayBuffer[];
    receivedChunks: number;
    totalChunks: number;
    encryptedAesKey: ArrayBuffer;
    iv: ArrayBuffer;
}

// Suivi interne des fichiers en cours de réception (pas exposé, pas
// réactif — seul messages.value pilote l'affichage).
const incomingFileTransfers = new Map<string, IncomingFileTransfer>();

// Même son que les appels DM (useSecurePeer.ts) — une instance séparée pour
// ne pas se marcher dessus si un appel classique sonne en même temps qu'une
// invitation à une session éphémère. Avant ça, une invitation entrante ou
// un appel en cours de sonnerie ne jouait que le petit "ding" générique de
// Notifications.vue (playNotificationSound), une seule fois — pas le vrai
// son d'appel en boucle.
const ringtone = new Audio('/sounds/call_incoming.mp3');
ringtone.loop = true;

const startRingtone = () => {
    ringtone.play().catch(() => {});
};

const stopRingtone = () => {
    ringtone.pause();
    ringtone.currentTime = 0;
};

const peer = ref<Peer | null>(null);
const peerReconnector = createPeerReconnector(() => peer.value);
const myPeerId = ref<string>('');
const connection = ref<DataConnection | null>(null);
const isConnected = ref<boolean>(false);
const sessionPrivateKey = ref<CryptoKey | null>(null);
const sessionPublicKeyJWK = ref<string>('');
const peerPublicKeyJWK = ref<string | null>(null);
const messages = ref<MeetMessage[]>([]);

// Vrai tant qu'un fichier est en cours d'envoi/réception, OU qu'on l'a fini
// d'envoyer mais que le correspondant n'a pas encore confirmé l'avoir reçu
// et déchiffré — utilisé pour empêcher/confirmer la fermeture de la session
// pendant qu'un transfert n'est pas réellement terminé des deux côtés.
const hasPendingFileTransfer = computed(() =>
    messages.value.some(m =>
        m.kind === 'file' && (
            m.status === 'sending' ||
            m.status === 'receiving' ||
            (m.sender === 'Vous' && m.status === 'done' && !m.confirmedReceived)
        )
    )
);

// OrgMember.id du correspondant de la session en cours (ou en cours
// d'établissement), et son User.id — seule source de vérité pour "y a-t-il
// une session active, avec qui". null = aucune session.
const activeMeetPeerId = ref<string | null>(null);
const activeMeetPeerUserId = ref<string | null>(null);
const isMeetConnecting = ref<boolean>(false);
const meetLoadingStatus = ref<string>('');

let myOrgMemberId = '';
let pendingCallTimeout: ReturnType<typeof setTimeout> | null = null;

// useSecurePeer.ts (les appels) enregistre lui aussi un Peer sur le MÊME
// serveur de signalisation avec le MÊME OrgMember.id comme identifiant (les
// deux composables sont initialisés côte à côte dans OrgLayout.vue). Deux
// objets Peer distincts revendiquant le même id sur le même serveur PeerJS
// entrent en conflit — c'était la cause exacte de la boucle "Établissement
// du canal sécurisé" / connexion qui s'ouvre puis se ferme sans fin : le
// serveur ne peut faire vivre qu'une seule connexion par id à la fois. Un
// suffixe distinct isole complètement l'espace de nommage des deux features.
const MEET_PEER_SUFFIX = '-meet';
const toMeetPeerId = (orgMemberId: string) => `${orgMemberId}${MEET_PEER_SUFFIX}`;

// ── Authentification du pair (audit FC6) ─────────────────────────────────
// Une invitation acceptée fixe le seul pair admis et un secret de session,
// transmis par Socket.IO (authentifié) au seul destinataire. Le handshake P2P
// est authentifié par HMAC avec ce secret : un autre membre de l'org qui
// tente peer.connect('<id>-meet') n'est ni admis ni capable de substituer sa
// clé. Le secret transite par le serveur : contre l'opérateur, c'est le code
// de vérification (meetSasCode) qui protège.
let expectedPeer: { peerId: string; secret: Uint8Array } | null = null;
const incomingMeetSecrets = new Map<string, string>();
let handshakeDone = false;
export const meetSasCode = ref<string>('');

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const bytesToB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

/** Appelé par OrgLayout.vue à la réception de privateMeet:incomingCall. */
export const registerIncomingMeetSecret = (callerUserId: string, meetSecret?: string) => {
    if (meetSecret) incomingMeetSecrets.set(callerUserId, meetSecret);
};

async function handshakeMac(secret: Uint8Array, publicKeyJWK: string): Promise<string> {
    const k = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`synco-meet-handshake-v1|${publicKeyJWK}`));
    return bytesToB64(new Uint8Array(sig));
}

async function verifyHandshakeMac(secret: Uint8Array, publicKeyJWK: string, mac: unknown): Promise<boolean> {
    if (typeof mac !== 'string') return false;
    const k = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    try {
        return await crypto.subtle.verify('HMAC', k, b64ToBytes(mac), new TextEncoder().encode(`synco-meet-handshake-v1|${publicKeyJWK}`));
    } catch {
        return false;
    }
}

/** Code de vérification de la session : indépendant du rôle (clés triées). */
export async function computeMeetSas(myJwk: string, peerJwk: string): Promise<string> {
    const [a, b] = [myJwk, peerJwk].sort();
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`synco-meet-sas-v1|${a}|${b}`)));
    return Array.from(h.slice(0, 5)).map(x => x.toString().padStart(3, '0')).join(' ');
}

const clearPendingCallTimeout = () => {
    if (pendingCallTimeout) {
        clearTimeout(pendingCallTimeout);
        pendingCallTimeout = null;
    }
};

/**
 * Initialise le Peer PeerJS pour toute la durée de la session (appelé une
 * fois depuis OrgLayout.vue, pas depuis PrivateMeetView.vue) — sinon la
 * session éphémère mourait à chaque changement de route, faute de survivre
 * au démontage du composant qui la possédait auparavant.
 */
const initPeer = async (userId?: string): Promise<void> => {

    if (peer.value && !peer.value.destroyed) return;

    try {

        myOrgMemberId = userId || myOrgMemberId;

        const keyPair = await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 4096,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true,
            ["encrypt", "decrypt"]
        );

        sessionPrivateKey.value = keyPair.privateKey;
        const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
        sessionPublicKeyJWK.value = JSON.stringify(jwk);

        const peerOptions = {
            host: import.meta.env.VITE_PEER_HOST || 'localhost',
            port: Number(import.meta.env.VITE_PEER_PORT || 9001),
            path: import.meta.env.VITE_PEER_PATH || '/webrtc',
            secure: import.meta.env.VITE_PEER_SECURE === 'true' || false,
            key: import.meta.env.VITE_PEER_PUBLISHABLE_KEY || 'peerjs',
            config: PEER_CONFIG,
            debug: 1
        };

        peer.value = myOrgMemberId ? new Peer(toMeetPeerId(myOrgMemberId), peerOptions) : new Peer(peerOptions);

        peer.value.on('open', (id) => {
            myPeerId.value = id;
            peerReconnector.reset();
        });

        peer.value.on('connection', (conn) => {
            debugLog('Nouvelle discussion entrante de:', conn.peer);
            // Seul le pair d'une invitation en cours est admis, et une session
            // ouverte n'est jamais remplacée (audit FC6).
            if (!expectedPeer || conn.peer !== expectedPeer.peerId || connection.value?.open) {
                conn.close();
                return;
            }
            setupDataConnection(conn);
        });

        peer.value.on('error', (err) => console.error('Erreur PeerJS:', err));

        peer.value.on('disconnected', () => {
            console.warn('[PRIVATE-MEET] Peer disconnected from server');
            // Comme pour useSecurePeer.ts (les appels) : PeerJS ne se
            // reconnecte jamais tout seul — sans cet appel, une session
            // éphémère devenait injoignable après le moindre blip réseau,
            // jusqu'au rechargement complet de la page.
            peerReconnector.schedule();
        });

        // Écouté ici une fois pour toute la session org (pas dans
        // PrivateMeetView.vue) : un refus doit être visible même si on a
        // navigué ailleurs en attendant la réponse, et enregistré une seule
        // fois évite d'empiler un handler à chaque remontage de la vue.
        const socket = await useWSocket();
        socket.value?.off('privateMeet:declined');
        socket.value?.on('privateMeet:declined', () => {
            const { show } = useToast();
            show('La conversation a été refusée.', 'error');
            // cleanupMeetState() (pas endMeet()) : on réagit déjà à un signal
            // distant, pas la peine de renvoyer privateMeet:cancel à
            // quelqu'un qui vient justement de nous répondre.
            cleanupMeetState();
        });

        // Symétrique de privateMeet:declined, côté appelé cette fois : reçu
        // quand l'appelant raccroche/abandonne avant qu'on ait répondu (ou
        // pendant que la connexion P2P s'établissait). OrgLayout.vue gère en
        // plus le retrait de la carte "invitation entrante" et le "manqué"
        // qui doit rester derrière — ce composable ne s'occupe ici que de
        // nettoyer son propre état (sonnerie, éventuelle connexion en cours).
        socket.value?.off('privateMeet:cancelled');
        socket.value?.on('privateMeet:cancelled', () => {
            cleanupMeetState();
        });

    } catch (error) {
        console.error("Erreur lors de l'initialisation:", error);
    }

};

const connectToPeer = (targetPeerId: string) => {

    const myId = String(myPeerId.value);
    const targetId = toMeetPeerId(String(targetPeerId));

    if (!peer.value || !myId) return;

    if (connection.value?.peer === targetId && isConnected.value) return;

    // Un seul côté doit composer activement (sinon deux connexions
    // concurrentes se disputent) — celui dont l'id est lexicalement
    // inférieur appelle, l'autre attend passivement via peer.on('connection').
    if (myId > targetId) return;

    const conn = peer.value.connect(targetId, { reliable: true });
    setupDataConnection(conn);

};

const setupDataConnection = (conn: DataConnection) => {

    if (connection.value && connection.value.peer !== conn.peer) {
        connection.value.close();
    }

    connection.value = conn;
    isConnected.value = false;
    handshakeDone = false;
    meetSasCode.value = '';

    conn.on('open', async () => {

        isConnected.value = true;
        isMeetConnecting.value = false;
        isMeeting.value = true;
        clearPendingCallTimeout();
        stopRingtone();
        debugLog('Text P2P canal open');

        if (sessionPublicKeyJWK.value && expectedPeer) {
            conn.send({
                type: 'E2EE_HANDSHAKE',
                publicKeyJWK: sessionPublicKeyJWK.value,
                mac: await handshakeMac(expectedPeer.secret, sessionPublicKeyJWK.value),
            });
        }

    });

    conn.on('data', async (data: any) => {

        if (data.type === 'E2EE_HANDSHAKE' && data.publicKeyJWK) {

            // Clé figée pour la session ; handshake prouvé par le secret de
            // l'invitation, sinon la connexion est fermée (audit FC6).
            if (handshakeDone) return;
            if (!expectedPeer || conn.peer !== expectedPeer.peerId
                || !(await verifyHandshakeMac(expectedPeer.secret, data.publicKeyJWK, data.mac))) {
                console.warn('[PRIVATE-MEET] Handshake non authentifié, connexion fermée.');
                conn.close();
                return;
            }
            peerPublicKeyJWK.value = data.publicKeyJWK;
            handshakeDone = true;
            if (sessionPublicKeyJWK.value) {
                meetSasCode.value = await computeMeetSas(sessionPublicKeyJWK.value, data.publicKeyJWK);
            }
            debugLog('Handshake E2EE terminé.');

        }

        // Rien n'est traité avant un handshake authentifié.
        else if (!handshakeDone) {
            return;
        }

        else if (data.type === 'ENCRYPTED_MESSAGE' && sessionPrivateKey.value) {

            try {

                const decryptedText = await decryptFromPeer(
                    data.ciphertext,
                    data.encryptedAesKey,
                    data.iv,
                    sessionPrivateKey.value
                );

                messages.value.push({
                    kind: 'text',
                    sender: 'Correspondant.e',
                    text: decryptedText,
                    timestamp: Date.now()
                });

                notifyIfAway();

            } catch (e) {
                console.error('Erreur de déchiffrement P2P:', e);
            }

        }

        // Un fichier arrive en 3 temps : FILE_META (métadonnées + clé/iv,
        // crée la bulle "réception..." tout de suite), puis une série de
        // FILE_CHUNK (chaque arrivée met à jour la progression affichée),
        // reconstitué et déchiffré une fois le dernier morceau reçu.
        else if (data.type === 'FILE_META') {

            incomingFileTransfers.set(data.fileId, {
                chunks: new Array(data.totalChunks),
                receivedChunks: 0,
                totalChunks: data.totalChunks,
                encryptedAesKey: data.encryptedAesKey,
                iv: data.iv
            });

            messages.value.push({
                kind: 'file',
                sender: 'Correspondant.e',
                fileId: data.fileId,
                fileName: data.fileName,
                fileType: data.fileType,
                fileSize: data.fileSize,
                status: 'receiving',
                progress: 0,
                timestamp: Date.now()
            });

        }

        else if (data.type === 'FILE_CHUNK' && sessionPrivateKey.value) {

            const transfer = incomingFileTransfers.get(data.fileId);
            // Pas de FILE_META connu pour ce fileId (canal rouvert entre-temps,
            // etc.) : on ignore plutôt que de planter sur un tableau absent.
            if (!transfer) return;

            transfer.chunks[data.chunkIndex] = data.data;
            transfer.receivedChunks++;

            updateFileMessage(data.fileId, {
                progress: Math.round((transfer.receivedChunks / transfer.totalChunks) * 100)
            });

            if (transfer.receivedChunks < transfer.totalChunks) return;

            incomingFileTransfers.delete(data.fileId);

            try {

                const totalLength = transfer.chunks.reduce((sum, c) => sum + c.byteLength, 0);
                const fullCiphertext = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of transfer.chunks) {
                    fullCiphertext.set(new Uint8Array(chunk), offset);
                    offset += chunk.byteLength;
                }

                const message = messages.value.find(m => m.fileId === data.fileId);

                const decryptedBuffer = await decryptBufferFromPeer(
                    fullCiphertext.buffer,
                    transfer.encryptedAesKey,
                    transfer.iv,
                    sessionPrivateKey.value
                );

                const blob = new Blob([decryptedBuffer], { type: message?.fileType || 'application/octet-stream' });

                updateFileMessage(data.fileId, { status: 'done', progress: 100, fileUrl: URL.createObjectURL(blob) });

                // Confirme à l'expéditeur que le fichier est bien arrivé ET
                // déchiffré avec succès — sans ça, il n'a aucun moyen de
                // distinguer "j'ai fini d'envoyer tous les morceaux" de
                // "l'autre les a vraiment tous reçus et pu les déchiffrer".
                connection.value?.send({ type: 'FILE_RECEIVED', fileId: data.fileId });

                notifyIfAway();

            } catch (e) {
                console.error('Erreur de déchiffrement de fichier P2P:', e);
                // Débloque quand même l'UI (sort de l'état "réception...") —
                // sans fileUrl, la bulle affichera l'échec plutôt qu'un lien.
                updateFileMessage(data.fileId, { status: 'done' });
            }

        }

        else if (data.type === 'FILE_RECEIVED') {
            updateFileMessage(data.fileId, { confirmedReceived: true });
        }

    });

    conn.on('close', () => {
        isConnected.value = false;
        peerPublicKeyJWK.value = null;
        isMeeting.value = false;
        isMeetConnecting.value = false;
        activeMeetPeerId.value = null;
        activeMeetPeerUserId.value = null;
        clearPendingCallTimeout();
        stopRingtone();
        debugLog('Meet closed');
    });

};

/**
 * Modifie en place l'entrée de messages.value correspondant à ce fileId
 * (progression, changement de statut, url une fois déchiffré) — la bulle
 * reste la même, seul son contenu affiché change.
 */
const updateFileMessage = (fileId: string, patch: Partial<MeetMessage>) => {
    const message = messages.value.find(m => m.fileId === fileId);
    if (message) Object.assign(message, patch);
};

/**
 * Prévient l'utilisateur d'un nouveau message reçu quand il n'est pas
 * actuellement en train de regarder cette session éphémère précise — sinon,
 * comme la connexion tourne maintenant en arrière-plan indépendamment de la
 * route affichée, un message reçu pendant qu'on est ailleurs disparaissait
 * silencieusement dans messages.value sans que personne ne le sache.
 * Jamais le contenu du message dans la notification (même règle que pour
 * les DM/threads) — juste de quoi savoir qu'il faut y retourner.
 */
const notifyIfAway = () => {

    // Lit activeMeetPeerId (la source de vérité déjà maintenue pour "avec
    // qui suis-je en session") plutôt que conn.peer — depuis le suffixage
    // des ids PeerJS (cf. MEET_PEER_SUFFIX), conn.peer n'est plus directement
    // un OrgMember.id et ne peut plus servir tel quel à retrouver le membre.
    const peerId = activeMeetPeerId.value;
    if (!peerId) return;

    const current = router.currentRoute.value;
    const onThisMeet = current.name === 'OrgThreadChatPrivateMeet' && current.params.userId === peerId;
    if (onThisMeet) return;

    const member = openedOrg.value?.members?.find(m => m.id === peerId);
    if (!member) return;

    const { notify } = useNotifications();
    notify('notif:privateMeetMsg', member, 8000);

};

const sendEncryptedMessage = async (text: string) => {

    if (!connection.value || !peerPublicKeyJWK.value) {
        console.error("Impossible d'envoyer : Non connecté ou clé publique du peer manquante");
        return;
    }

    try {

        const { ciphertext, encryptedAesKey, iv } = await encryptForPeer(text, peerPublicKeyJWK.value);

        connection.value.send({
            type: 'ENCRYPTED_MESSAGE',
            ciphertext,
            encryptedAesKey,
            iv
        });

        messages.value.push({
            kind: 'text',
            sender: 'Vous',
            text,
            timestamp: Date.now()
        });

    } catch (e) {
        console.error("Erreur de chiffrement P2P:", e);
    }

};

const sendEncryptedFile = async (file: File) => {

    if (!connection.value || !peerPublicKeyJWK.value) {
        console.error("Impossible d'envoyer : Non connecté ou clé publique du peer manquante");
        return { error: "Non connecté." };
    }

    if (file.size > MAX_FILE_SIZE) {
        return { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / (1024 * 1024)} Mo).` };
    }

    const fileId = crypto.randomUUID();

    // Bulle affichée tout de suite (chiffrement + envoi) plutôt qu'une fois
    // tout terminé — c'est précisément l'absence de retour visuel pendant
    // cette attente qui rendait un envoi de fichier volumineux déroutant.
    messages.value.push({
        kind: 'file',
        sender: 'Vous',
        fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileUrl: URL.createObjectURL(file),
        status: 'sending',
        progress: 0,
        timestamp: Date.now()
    });

    try {

        const buffer = await file.arrayBuffer();
        const { ciphertext, encryptedAesKey, iv } = await encryptBufferForPeer(buffer, peerPublicKeyJWK.value);

        const totalChunks = Math.max(1, Math.ceil(ciphertext.byteLength / FILE_CHUNK_SIZE));

        connection.value.send({
            type: 'FILE_META',
            fileId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            totalChunks,
            encryptedAesKey,
            iv
        });

        // await sur chaque envoi : DataConnection.send() renvoie une promesse
        // qui se résout une fois le morceau réellement accepté par le canal
        // (backpressure PeerJS gérée en interne) — l'attendre ici cadence
        // naturellement les mises à jour de progression sur le rythme réel
        // de l'envoi plutôt que de les afficher toutes d'un coup.
        for (let i = 0; i < totalChunks; i++) {
            const start = i * FILE_CHUNK_SIZE;
            const chunk = ciphertext.slice(start, start + FILE_CHUNK_SIZE);
            await connection.value.send({
                type: 'FILE_CHUNK',
                fileId,
                chunkIndex: i,
                data: chunk
            });
            updateFileMessage(fileId, { progress: Math.round(((i + 1) / totalChunks) * 100) });
        }

        updateFileMessage(fileId, { status: 'done', progress: 100 });

        return { error: null };

    } catch (e) {
        console.error("Erreur de chiffrement/d'envoi de fichier P2P:", e);
        updateFileMessage(fileId, { status: 'done' });
        return { error: "Échec de l'envoi du fichier." };
    }

};

/**
 * initPeer() peut résoudre avant que le Peer soit réellement prêt : sa garde
 * de départ (peer.value déjà non-null) ne dit rien sur l'événement 'open' —
 * et même sur une toute première init, la fonction ne l'attend pas non plus.
 * myPeerId.value reste alors vide, connectToPeer() s'arrête aussitôt sur son
 * garde-fou `!myId` (silencieusement, sans jamais réessayer), et l'appelant
 * restait bloqué indéfiniment sur "Établissement du canal sécurisé..." —
 * exactement le symptôme "parfois, ça reste bloqué" rapporté, une course
 * dépendant du temps de connexion au serveur de signalisation à ce moment
 * précis. L'ancien code (avant que initPeer() ne soit appelé une fois pour
 * toute la session dans OrgLayout.vue) attendait déjà explicitement ça — la
 * refonte avait fait sauter cette attente par erreur.
 */
const ensurePeerReady = async (): Promise<boolean> => {
    await initPeer(myOrgMemberId);
    return await waitFor(() => myPeerId.value !== '', 8000);
};

/**
 * Initie une nouvelle session (bouton "Session éphémère" dans ChatView.vue).
 * Seul ce chemin émet privateMeet:call — accepter une invitation entrante
 * passe par acceptIncomingMeet(), qui ne ré-émet jamais call. Les deux
 * confondus (l'ancien comportement, où PrivateMeetView.vue émettait call
 * inconditionnellement au montage, que ce soit pour appeler ou pour
 * répondre) est ce qui causait la notification d'appel entrant en double —
 * la personne qui répond ré-appelait sans le vouloir la personne qui
 * l'avait appelée.
 */
const startMeet = async (recipient: OrgMember) => {

    if (!recipient.id || !recipient.userId) return;

    activeMeetPeerId.value = recipient.id;
    activeMeetPeerUserId.value = recipient.userId;
    isMeetConnecting.value = true;
    meetLoadingStatus.value = 'Initialisation de la conversation...';

    router.push({ name: 'OrgThreadChatPrivateMeet', params: { userId: recipient.id } });

    const ready = await ensurePeerReady();
    if (!ready) {
        meetLoadingStatus.value = 'Connexion au serveur impossible.';
        setTimeout(() => {
            if (activeMeetPeerId.value === recipient.id) endMeet();
        }, 2000);
        return;
    }

    const socket = await useWSocket();

    const secret = crypto.getRandomValues(new Uint8Array(32));
    expectedPeer = { peerId: toMeetPeerId(recipient.id), secret };

    connectToPeer(recipient.id);

    socket.value?.emit('privateMeet:call', { recipientId: recipient.userId, meetSecret: bytesToB64(secret) });
    meetLoadingStatus.value = 'En attente de la réponse...';
    startRingtone();

    clearPendingCallTimeout();
    pendingCallTimeout = setTimeout(() => {
        if (isMeetConnecting.value && activeMeetPeerId.value === recipient.id) {
            meetLoadingStatus.value = 'Aucune réponse, fermeture de la session.';
            setTimeout(() => {
                if (activeMeetPeerId.value === recipient.id) endMeet();
            }, 2000);
        }
    }, 10000);

};

/**
 * Accepte une invitation entrante (bouton "Répondre" de la notification
 * notif:privateMeet) — émet privateMeet:accept (jamais fait côté client
 * avant ce fix, alors que le backend le gère déjà) au lieu de ré-émettre
 * call comme le faisait l'ancien PrivateMeetView.vue au montage.
 */
const acceptIncomingMeet = async (caller: OrgMember) => {

    if (!caller.id || !caller.userId) return;

    // La sonnerie de l'invitation entrante (démarrée dans OrgLayout.vue dès
    // la réception de privateMeet:incomingCall) s'arrête dès qu'on répond —
    // pas d'attendre que la connexion P2P s'établisse, comme pour un appel
    // classique (acceptCall() dans useSecurePeer.ts).
    stopRingtone();

    activeMeetPeerId.value = caller.id;
    activeMeetPeerUserId.value = caller.userId;
    isMeetConnecting.value = true;
    meetLoadingStatus.value = 'Établissement du canal sécurisé...';

    router.push({ name: 'OrgThreadChatPrivateMeet', params: { userId: caller.id } });

    const ready = await ensurePeerReady();
    if (!ready) {
        meetLoadingStatus.value = 'Connexion au serveur impossible.';
        setTimeout(() => {
            if (activeMeetPeerId.value === caller.id) endMeet();
        }, 2000);
        return;
    }

    const meetSecret = incomingMeetSecrets.get(caller.userId);
    incomingMeetSecrets.delete(caller.userId);
    if (!meetSecret) {
        // Invitation sans secret (client appelant non à jour) : le pair ne
        // pourrait pas être authentifié (audit FC6).
        meetLoadingStatus.value = "Invitation non sécurisée : votre correspondant doit mettre à jour Synco.";
        setTimeout(() => {
            if (activeMeetPeerId.value === caller.id) endMeet();
        }, 3000);
        return;
    }
    expectedPeer = { peerId: toMeetPeerId(caller.id), secret: b64ToBytes(meetSecret) };

    const socket = await useWSocket();

    socket.value?.emit('privateMeet:accept', { callerId: caller.userId });
    connectToPeer(caller.id);

    // Filet de sécurité : si la connexion P2P elle-même ne s'établit jamais
    // (négociation ICE bloquée, l'appelant a fermé sa page entre-temps,
    // etc.), rien d'autre ne sortait l'utilisateur de "Établissement du
    // canal sécurisé..." — contrairement à startMeet(), qui a déjà son
    // propre délai d'attente côté appelant.
    clearPendingCallTimeout();
    pendingCallTimeout = setTimeout(() => {
        if (isMeetConnecting.value && activeMeetPeerId.value === caller.id) {
            meetLoadingStatus.value = 'Impossible d\'établir la connexion.';
            setTimeout(() => {
                if (activeMeetPeerId.value === caller.id) endMeet();
            }, 2000);
        }
    }, 15000);

};

const declineIncomingMeet = async (caller: OrgMember) => {
    if (!caller.userId) return;
    stopRingtone();
    const socket = await useWSocket();
    socket.value?.emit('privateMeet:decline', { callerId: caller.userId });
};

/**
 * Vérifie, via les stats WebRTC réelles (comme getConnectionType() dans
 * useSecurePeer.ts), si le canal P2P est vraiment direct ou passe par un
 * relais — plutôt que d'afficher un badge "P2P" statique jamais vérifié
 * (ce qu'affichait PrivateMeetView.vue jusqu'ici).
 */
const getConnectionType = async (): Promise<'direct' | 'relay' | 'unknown'> => {
    const pc = connection.value?.peerConnection;
    if (!pc) return 'unknown';

    try {
        const stats = await pc.getStats();
        let pair: RTCIceCandidatePairStats | null = null;

        stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report as any).nominated) {
                pair = report as RTCIceCandidatePairStats;
            }
        });
        if (!pair) {
            stats.forEach((report) => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    pair = report as RTCIceCandidatePairStats;
                }
            });
        }
        if (!pair) return 'unknown';

        const local = stats.get((pair as RTCIceCandidatePairStats).localCandidateId);
        const remote = stats.get((pair as RTCIceCandidatePairStats).remoteCandidateId);
        const isRelay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';

        return isRelay ? 'relay' : 'direct';
    } catch (e) {
        console.error('[PRIVATE-MEET] getConnectionType a échoué:', e);
        return 'unknown';
    }
};

// Émis quand JE mets fin à une session localement (raccrocher pendant que ça
// sonne/se connecte, ou un des timeouts sans réponse) AVANT qu'elle ait
// jamais été établie — sans ce signal, l'autre côté n'avait aucun moyen de
// savoir qu'on avait abandonné : sa carte "invitation entrante" restait
// affichée indéfiniment, et son propre statut de connexion restait bloqué.
// Ne PAS appeler ceci depuis un handler qui réagit déjà à un signal distant
// (privateMeet:declined/cancelled) — ça renverrait le signal à l'infini vers
// quelqu'un qui vient justement de l'émettre.
const notifyMeetCancelledIfUnconnected = () => {
    if (isConnected.value) return;
    const targetUserId = activeMeetPeerUserId.value;
    if (!targetUserId) return;
    useWSocket().then(socket => socket.value?.emit('privateMeet:cancel', { targetUserId }));
};

/**
 * Nettoyage local pur, sans notifier personne — utilisé par endMeet() (après
 * avoir notifié l'autre côté si besoin) ET directement par les handlers qui
 * réagissent à un signal DÉJÀ reçu de l'autre côté (privateMeet:declined,
 * privateMeet:cancelled), où prévenir en retour n'aurait pas de sens.
 *
 * Ne détruit PAS peer.value : c'est le point d'écoute PeerJS pour TOUTE la
 * session org (initialisé une fois par OrgLayout.vue), pas par conversation
 * — le détruire ici rendrait injoignable pour toute future session
 * éphémère après la première (même choix que cleanupCall() dans
 * useSecurePeer.ts, qui ne détruit jamais son peer non plus).
 */
const cleanupMeetState = () => {
    stopRingtone();
    connection.value?.close({ flush: true });
    connection.value = null;
    isConnected.value = false;
    isMeeting.value = false;
    isMeetConnecting.value = false;
    activeMeetPeerId.value = null;
    activeMeetPeerUserId.value = null;
    peerPublicKeyJWK.value = null;
    expectedPeer = null;
    handshakeDone = false;
    meetSasCode.value = '';

    // Vider messages.value ne suffit pas à réellement libérer un fichier de
    // la mémoire : chaque bulle fichier porte un Blob URL (URL.createObjectURL,
    // côté envoyeur ET receveur) qui garde le Blob sous-jacent vivant tant
    // qu'il n'est pas explicitement révoqué — sans ça, le contenu déchiffré
    // resterait accessible en mémoire (via cette URL) bien après la fin de
    // la session éphémère.
    for (const msg of messages.value) {
        if (msg.fileUrl) URL.revokeObjectURL(msg.fileUrl);
    }
    messages.value = [];

    // Purge tout transfert de fichier entrant resté incomplet (session
    // fermée en plein milieu d'une réception) — ses morceaux déjà reçus ne
    // doivent pas non plus traîner en mémoire.
    incomingFileTransfers.clear();

    clearPendingCallTimeout();
};

/**
 * Termine la session en cours explicitement (bouton raccrocher, ou l'un des
 * timeouts sans réponse dans startMeet()/acceptIncomingMeet()). Ce n'est plus
 * déclenché automatiquement au démontage de PrivateMeetView.vue — une
 * session éphémère doit survivre à la navigation, seule une action
 * explicite (ou l'autre partie qui ferme) doit y mettre fin.
 * close({flush:true}) fait circuler un message de fermeture à travers le
 * canal avant de le fermer si la session était déjà connectée ; sinon
 * (encore en sonnerie/en cours d'établissement), notifyMeetCancelledIfUnconnected()
 * prévient l'autre côté par le même canal socket que privateMeet:call.
 */
const endMeet = () => {
    notifyMeetCancelledIfUnconnected();
    cleanupMeetState();
};

// Conservé pour compatibilité de nommage avec l'existant (composants qui
// appelaient destroyChat) — alias de endMeet.
const destroyChat = endMeet;

export default function usePrivateMeet() {

    return {
        myPeerId,
        isConnected,
        messages,
        hasPendingFileTransfer,
        activeMeetPeerId,
        activeMeetPeerUserId,
        isMeetConnecting,
        meetLoadingStatus,
        isE2EEReady: () => peerPublicKeyJWK.value !== null,
        meetSasCode,

        initPeer,
        connectToPeer,
        sendEncryptedMessage,
        sendEncryptedFile,
        startMeet,
        acceptIncomingMeet,
        declineIncomingMeet,
        endMeet,
        destroyChat,
        getConnectionType,
        // Exposée pour OrgLayout.vue : la sonnerie d'une invitation entrante
        // doit démarrer dès la réception de privateMeet:incomingCall (avant
        // même que l'utilisateur clique "Répondre"), qui n'est écouté que là.
        startRingtone
    };

}
