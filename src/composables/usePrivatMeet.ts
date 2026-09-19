import { ref } from 'vue';
import Peer, { type DataConnection } from 'peerjs';
import { encryptForPeer, decryptFromPeer, encryptBufferForPeer, decryptBufferFromPeer } from '@/assets/utils/crypto';
import { PEER_CONFIG } from '@/assets/utils/peerConfig';
import useWSocket from './useWSocket';
import useNotifications from './useNotifications';
import { useToast } from './useToast';
import type { OrgMember } from '@/types/types';
import router from '@/router';
import { openedOrg } from '@/assets/var';

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

export interface MeetMessage {
    kind: 'text' | 'file';
    sender: 'Vous' | 'Correspondant.e';
    text?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    fileUrl?: string;
    timestamp: number;
}

const peer = ref<Peer | null>(null);
const myPeerId = ref<string>('');
const connection = ref<DataConnection | null>(null);
const isConnected = ref<boolean>(false);
const sessionPrivateKey = ref<CryptoKey | null>(null);
const sessionPublicKeyJWK = ref<string>('');
const peerPublicKeyJWK = ref<string | null>(null);
const messages = ref<MeetMessage[]>([]);

// OrgMember.id du correspondant de la session en cours (ou en cours
// d'établissement), et son User.id — seule source de vérité pour "y a-t-il
// une session active, avec qui". null = aucune session.
const activeMeetPeerId = ref<string | null>(null);
const activeMeetPeerUserId = ref<string | null>(null);
const isMeetConnecting = ref<boolean>(false);
const meetLoadingStatus = ref<string>('');

let myOrgMemberId = '';
let pendingCallTimeout: ReturnType<typeof setTimeout> | null = null;

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

        peer.value = myOrgMemberId ? new Peer(myOrgMemberId, peerOptions) : new Peer(peerOptions);

        peer.value.on('open', (id) => {
            myPeerId.value = id;
        });

        peer.value.on('connection', (conn) => {
            console.log('Nouvelle discussion entrante de:', conn.peer);
            setupDataConnection(conn);
        });

        peer.value.on('error', (err) => console.error('Erreur PeerJS:', err));

        // Écouté ici une fois pour toute la session org (pas dans
        // PrivateMeetView.vue) : un refus doit être visible même si on a
        // navigué ailleurs en attendant la réponse, et enregistré une seule
        // fois évite d'empiler un handler à chaque remontage de la vue.
        const socket = await useWSocket();
        socket.value?.off('privateMeet:declined');
        socket.value?.on('privateMeet:declined', () => {
            const { show } = useToast();
            show('La conversation a été refusée.', 'error');
            endMeet();
        });

    } catch (error) {
        console.error("Erreur lors de l'initialisation:", error);
    }

};

const connectToPeer = (targetPeerId: string) => {

    const myId = String(myPeerId.value);
    const targetId = String(targetPeerId);

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

    conn.on('open', async () => {

        isConnected.value = true;
        isMeetConnecting.value = false;
        isMeeting.value = true;
        clearPendingCallTimeout();
        console.log('Text P2P canal open');

        if (sessionPublicKeyJWK.value) {
            conn.send({ type: 'E2EE_HANDSHAKE', publicKeyJWK: sessionPublicKeyJWK.value });
        }

    });

    conn.on('data', async (data: any) => {

        if (data.type === 'E2EE_HANDSHAKE' && data.publicKeyJWK) {

            peerPublicKeyJWK.value = data.publicKeyJWK;
            console.log('Handshake E2EE terminé.');

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

                notifyIfAway(conn.peer);

            } catch (e) {
                console.error('Erreur de déchiffrement P2P:', e);
            }

        }

        else if (data.type === 'ENCRYPTED_FILE' && sessionPrivateKey.value) {

            try {

                const decryptedBuffer = await decryptBufferFromPeer(
                    data.ciphertext,
                    data.encryptedAesKey,
                    data.iv,
                    sessionPrivateKey.value
                );

                const blob = new Blob([decryptedBuffer], { type: data.fileType || 'application/octet-stream' });

                messages.value.push({
                    kind: 'file',
                    sender: 'Correspondant.e',
                    fileName: data.fileName,
                    fileType: data.fileType,
                    fileSize: data.fileSize,
                    fileUrl: URL.createObjectURL(blob),
                    timestamp: Date.now()
                });

                notifyIfAway(conn.peer);

            } catch (e) {
                console.error('Erreur de déchiffrement de fichier P2P:', e);
            }

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
        console.log('Meet closed');
    });

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
const notifyIfAway = (peerId: string) => {

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

    try {

        const buffer = await file.arrayBuffer();
        const { ciphertext, encryptedAesKey, iv } = await encryptBufferForPeer(buffer, peerPublicKeyJWK.value);

        connection.value.send({
            type: 'ENCRYPTED_FILE',
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            ciphertext,
            encryptedAesKey,
            iv
        });

        messages.value.push({
            kind: 'file',
            sender: 'Vous',
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileUrl: URL.createObjectURL(file),
            timestamp: Date.now()
        });

        return { error: null };

    } catch (e) {
        console.error("Erreur de chiffrement de fichier P2P:", e);
        return { error: "Échec du chiffrement du fichier." };
    }

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

    await initPeer(myOrgMemberId);

    const socket = await useWSocket();

    connectToPeer(recipient.id);

    socket.value?.emit('privateMeet:call', { recipientId: recipient.userId });
    meetLoadingStatus.value = 'En attente de la réponse...';

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

    activeMeetPeerId.value = caller.id;
    activeMeetPeerUserId.value = caller.userId;
    isMeetConnecting.value = true;
    meetLoadingStatus.value = 'Établissement du canal sécurisé...';

    router.push({ name: 'OrgThreadChatPrivateMeet', params: { userId: caller.id } });

    await initPeer(myOrgMemberId);

    const socket = await useWSocket();

    socket.value?.emit('privateMeet:accept', { callerId: caller.userId });
    connectToPeer(caller.id);

};

const declineIncomingMeet = async (caller: OrgMember) => {
    if (!caller.userId) return;
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

/**
 * Termine la session en cours explicitement (bouton raccrocher). Ce n'est
 * plus déclenché automatiquement au démontage de PrivateMeetView.vue — une
 * session éphémère doit survivre à la navigation, seule une action
 * explicite (ou l'autre partie qui ferme) doit y mettre fin.
 * close({flush:true}) fait circuler un message de fermeture à travers le
 * canal avant de le fermer, pour que le correspondant le sache tout de
 * suite plutôt que de devoir attendre la détection ICE.
 *
 * Ne détruit PAS peer.value : c'est le point d'écoute PeerJS pour TOUTE la
 * session org (initialisé une fois par OrgLayout.vue), pas par conversation
 * — le détruire ici rendrait injoignable pour toute future session
 * éphémère après la première (même choix que cleanupCall() dans
 * useSecurePeer.ts, qui ne détruit jamais son peer non plus).
 */
const endMeet = () => {
    connection.value?.close({ flush: true });
    connection.value = null;
    isConnected.value = false;
    isMeeting.value = false;
    isMeetConnecting.value = false;
    activeMeetPeerId.value = null;
    activeMeetPeerUserId.value = null;
    peerPublicKeyJWK.value = null;
    messages.value = [];
    clearPendingCallTimeout();
};

// Conservé pour compatibilité de nommage avec l'existant (composants qui
// appelaient destroyChat) — alias de endMeet.
const destroyChat = endMeet;

export default function usePrivateMeet() {

    return {
        myPeerId,
        isConnected,
        messages,
        activeMeetPeerId,
        activeMeetPeerUserId,
        isMeetConnecting,
        meetLoadingStatus,
        isE2EEReady: () => peerPublicKeyJWK.value !== null,

        initPeer,
        connectToPeer,
        sendEncryptedMessage,
        sendEncryptedFile,
        startMeet,
        acceptIncomingMeet,
        declineIncomingMeet,
        endMeet,
        destroyChat,
        getConnectionType
    };

}
