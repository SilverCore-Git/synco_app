import { ref, onUnmounted } from 'vue';
import Peer, { type DataConnection } from 'peerjs';
import {
    loadOrGenerateKeyPair,
    exportPublicKey,
    importPublicKey,
    getSharedKey,
    encryptMessage,
    decryptMessage
} from '@/assets/utils/crypto';


export default function usePrivateMeet() 
{
    
    const peer = ref<Peer | null>(null);
    const myPeerId = ref<string>('');
    const connection = ref<DataConnection | null>(null);
    const isConnected = ref<boolean>(false);

    const myKeyPair = ref<CryptoKeyPair | null>(null);
    const sharedKey = ref<CryptoKey | null>(null);
    const messages = ref<{ sender: 'me' | 'peer', text: string, timestamp: number }[]>([]);


    const initPeer = async (userId?: string) => {

        try {
            
            myKeyPair.value = await loadOrGenerateKeyPair();
            
            peer.value = userId ? new Peer(userId) : new Peer();

            peer.value.on('open', (id) => {
                myPeerId.value = id;
                console.log('Connecté au peer. PeerID : ', id);
            });

            peer.value.on('connection', (conn) => {
                console.log('Nouvelle discussion entrante de:', conn.peer);
                setupDataConnection(conn);
            });

            peer.value.on('error', (err) => console.error('Erreur PeerJS:', err));

        } 
        catch (error) 
        {
            console.error("Erreur lors de l'initialisation:", error);
        }

    };

    const connectToPeer = (targetPeerId: string) => {

        if (!peer.value) throw new Error("PeerJS n'est pas initialisé");

        const conn = peer.value.connect(targetPeerId);
        setupDataConnection(conn);

    };

    const setupDataConnection = (conn: DataConnection) => {

        connection.value = conn;

        conn.on('open', async () => {

            isConnected.value = true;
            console.log('Text P2P canal open');

            if (myKeyPair.value) 
            {
                const publicKeyStr = await exportPublicKey(myKeyPair.value.publicKey);
                conn.send({ type: 'E2EE_HANDSHAKE', publicKey: publicKeyStr });
            }

        });

        conn.on('data', async (data: any) => {
            
            if (data.type === 'E2EE_HANDSHAKE' && myKeyPair.value) 
            {

                try {
                    const peerPublicKey = await importPublicKey(data.publicKey);
                    sharedKey.value = await getSharedKey(myKeyPair.value.privateKey, peerPublicKey);
                } catch (e) {
                    console.error('Erreur Handshake E2EE:', e);
                }

            } 
            
            else if (data.type === 'ENCRYPTED_MESSAGE' && sharedKey.value) 
            {

                try {

                    const decryptedText = await decryptMessage(data.ciphertext, data.nonce, sharedKey.value);
                    messages.value.push({
                        sender: 'peer',
                        text: decryptedText,
                        timestamp: Date.now()
                    });

                } catch (e) {
                    console.error('Erreur de déchiffrement:', e);
                }

            }

        });

        conn.on('close', () => {
            isConnected.value = false;
            sharedKey.value = null;
            console.log('Meet closed');
        });

    };

    const sendEncryptedMessage = async (text: string) => {

        if (!connection.value || !sharedKey.value) 
        {
            console.error("Impossible d'envoyer : Non connecté ou clés non prêtes");
            return;
        }

        try {

            const { ciphertext, nonce } = await encryptMessage(text, sharedKey.value);
            
            connection.value.send({
                type: 'ENCRYPTED_MESSAGE',
                ciphertext,
                nonce
            });

            messages.value.push({
                sender: 'me',
                text,
                timestamp: Date.now()
            });

        } catch (e) {
            console.error("Erreur de chiffrement:", e);
        }

    };

    const destroyChat = () => {
        connection.value?.close();
        peer.value?.destroy();
    };

    onUnmounted(() => {
        destroyChat();
    });

    return {

        myPeerId,
        isConnected,
        messages,
        isE2EEReady: () => sharedKey.value !== null,
        
        initPeer,
        connectToPeer,
        sendEncryptedMessage,
        destroyChat

    };

}