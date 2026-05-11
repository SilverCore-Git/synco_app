import { ref, onUnmounted } from 'vue';
import Peer, { type DataConnection } from 'peerjs';
import { encryptForPeer, decryptFromPeer } from '@/assets/utils/crypto';

export default function usePrivateMeet() 
{
    
    const peer = ref<Peer | null>(null);
    const myPeerId = ref<string>('');
    const connection = ref<DataConnection | null>(null);
    const isConnected = ref<boolean>(false);

    const sessionPrivateKey = ref<CryptoKey | null>(null);
    const sessionPublicKeyJWK = ref<string>('');
    const peerPublicKeyJWK = ref<string | null>(null);
    
    const messages = ref<{ sender: 'Moi' | 'Correspondant.e', text: string, timestamp: number }[]>([]);

    const initPeer = async (userId?: string) => {

        try {
            
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

            peer.value = userId ? new Peer(userId) : new Peer();

            peer.value.on('open', (id) => {
                myPeerId.value = id;
                isConnected.value = true;
            });

            peer.value.on('connection', (conn) => {
                console.log('Nouvelle discussion entrante de:', conn.peer);
                setupDataConnection(conn);
            });

            peer.value.on('error', (err) => console.error('Erreur PeerJS:', err));

        } catch (error) {
            console.error("Erreur lors de l'initialisation:", error);
        }

    };

    const connectToPeer = (targetPeerId: string) => {
        
        const myId = String(myPeerId.value);
        const targetId = String(targetPeerId);

        if (!peer.value || !myId) return;

        if (connection.value?.peer === targetId && isConnected.value) return;

        if (myId > targetId) 
        {
            return;
        }

        const conn = peer.value.connect(targetId);
        setupDataConnection(conn);

    };

    const setupDataConnection = (conn: DataConnection) => {

        if (connection.value && connection.value.peer !== conn.peer)
        {
            connection.value.close();
        }

        connection.value = conn;
        isConnected.value = false;

        conn.on('open', async () => {

            isConnected.value = true;
            console.log('Text P2P canal open');

            if (sessionPublicKeyJWK.value) {
                conn.send({ type: 'E2EE_HANDSHAKE', publicKeyJWK: sessionPublicKeyJWK.value });
            }

        });

        conn.on('data', async (data: any) => {
            
            if (data.type === 'E2EE_HANDSHAKE' && data.publicKeyJWK) 
            {
                peerPublicKeyJWK.value = data.publicKeyJWK;
                console.log('Handshake E2EE terminé.');
            } 
            
            else if (data.type === 'ENCRYPTED_MESSAGE' && sessionPrivateKey.value) 
            {

                try {
                    
                    const decryptedText = await decryptFromPeer(
                        data.ciphertext, 
                        data.encryptedAesKey, 
                        data.iv, 
                        sessionPrivateKey.value
                    );
                    
                    messages.value.push({
                        sender: 'Correspondant.e',
                        text: decryptedText,
                        timestamp: Date.now()
                    });

                } catch (e) {
                    console.error('Erreur de déchiffrement P2P:', e);
                }

            }

        });

        conn.on('close', () => {
            isConnected.value = false;
            peerPublicKeyJWK.value = null;
            console.log('Meet closed');
        });

    };

    const sendEncryptedMessage = async (text: string) => {

        if (!connection.value || !peerPublicKeyJWK.value) 
        {
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
                sender: 'Moi',
                text,
                timestamp: Date.now()
            });

        } catch (e) {
            console.error("Erreur de chiffrement P2P:", e);
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
        isE2EEReady: () => peerPublicKeyJWK.value !== null,
        
        initPeer,
        connectToPeer,
        sendEncryptedMessage,
        destroyChat
    };

}