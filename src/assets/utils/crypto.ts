const DB_NAME: string = 'scrypto_store';
const DB_VERSION: number = 1;
const STORE_NAME: string = 'scrypto_keys';
const KEY_ID: string = 'scrypto_keypear';


const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const saveKeyPair = async (keyPair: CryptoKeyPair): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(keyPair, KEY_ID);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const loadKeyPair = async (): Promise<CryptoKeyPair | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(KEY_ID);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
};


export const loadOrGenerateKeyPair = async (): Promise<CryptoKeyPair> => {

    const existing = await loadKeyPair();
    if (existing) return existing;

    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        false, //  extractable
        ['deriveKey']
    );

    await saveKeyPair(keyPair);
    return keyPair;

};

export const exportPublicKey = async (key: CryptoKey): Promise<string> => {
    
    const exported = await crypto.subtle.exportKey("raw", key);
    
    const uint8Array = new Uint8Array(exported);
    
    let binaryString = '';
    
    for (const byte of uint8Array) {
        binaryString += String.fromCharCode(byte);
    }
    
    return btoa(binaryString);

};


export const importPublicKey = async (base64Key: string): Promise<CryptoKey> => {
    
    let cleanedKey = base64Key
        .trim()
        .replace(/ /g, '+')
        .replace(/[^A-Za-z0-9+/=]/g, '');

    if (cleanedKey.length !== 88) 
    {
        throw new Error(`Longueur invalide: ${cleanedKey.length}`);
    }

    const binaryString = atob(cleanedKey);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return await crypto.subtle.importKey(
        "raw",
        bytes.buffer,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
    );

};



export const getSharedKey = async (privateKey: CryptoKey, peerPublicKey: CryptoKey): Promise<CryptoKey> => {

    return await crypto.subtle.deriveKey(
        { name: "ECDH", public: peerPublicKey },
        privateKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

};


export const encryptMessage = async (text: string, key: CryptoKey) => {

    const encoder = new TextEncoder();
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = encoder.encode(text);

    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        encodedText
    );

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        nonce: btoa(String.fromCharCode(...nonce)),
    };

};


export const decryptMessage = async (ciphertextBase64: string, nonceBase64: string, key: CryptoKey) => {

    const decoder = new TextDecoder();
    const ciphertext = new Uint8Array(atob(ciphertextBase64).split("").map(c => c.charCodeAt(0)));
    const nonce = new Uint8Array(atob(nonceBase64).split("").map(c => c.charCodeAt(0)));

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        ciphertext
    );

    return decoder.decode(decrypted);
    
};