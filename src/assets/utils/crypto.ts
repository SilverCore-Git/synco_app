import { computed, ref } from "vue";

export const privateKey = ref<CryptoKey | null>(null);
export const E2EEUnloked = computed(() => {
    return privateKey.value !== null && typeof privateKey.value === 'object';
});

const PIN_ITERATIONS = 100000;

export async function deriveMasterKey (pin: string, salt: string): Promise<CryptoKey> 
{

    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw", encoder.encode(pin), "PBKDF2", false, ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations: PIN_ITERATIONS,
            hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

};


export async function decryptUserPrivateKey (
    encryptedPrivKeyBase64: string,
    ivBase64: string,
    masterKey: CryptoKey
): Promise<CryptoKey> 
{

    const encryptedData = Uint8Array.from(atob(encryptedPrivKeyBase64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

    const decryptedRaw = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        masterKey,
        encryptedData
    );

    return await crypto.subtle.importKey(
        "pkcs8",
        decryptedRaw,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["decrypt"]
    );
};



export async function encryptForPeer (text: string, peerPublicKeyJWK: string) 
{

    const encoder = new TextEncoder();
    
    const publicKey = await crypto.subtle.importKey(
        "jwk",
        JSON.parse(peerPublicKeyJWK),
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );

    const messageKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        messageKey,
        encoder.encode(text)
    );

    const exportedAesKey = await crypto.subtle.exportKey("raw", messageKey);
    const encryptedAesKey = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        exportedAesKey
    );

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        encryptedAesKey: btoa(String.fromCharCode(...new Uint8Array(encryptedAesKey))),
        iv: btoa(String.fromCharCode(...iv)),
        rawKey: exportedAesKey
    };

};


export async function encryptAesKeyWithRsa(rawAesKey: ArrayBuffer, pubKeyJWK: any) 
{
    
    const pubKey = await crypto.subtle.importKey(
        "jwk", 
        typeof pubKeyJWK === 'string' ? JSON.parse(pubKeyJWK) : pubKeyJWK, 
        { name: "RSA-OAEP", hash: "SHA-256" }, 
        false, 
        ["encrypt"]
    );

    const encrypted = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" }, 
        pubKey, 
        rawAesKey
    );

    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));

}


export async function decryptFromPeer (
    ciphertextBase64: string,
    encryptedAesKeyBase64: string,
    ivBase64: string,
    myPrivateKey: CryptoKey
) 
{

    const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
    const encryptedAesKey = Uint8Array.from(atob(encryptedAesKeyBase64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

    const aesKeyRaw = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        myPrivateKey,
        encryptedAesKey
    );

    const aesKey = await crypto.subtle.importKey(
        "raw", aesKeyRaw, "AES-GCM", false, ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);

};


export async function setupFirstTimeSecurity (pin: string) 
{

    const salt = generateSalt();
    
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

    const masterKey = await deriveMasterKey(pin, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const exportedPriv = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    
    const encryptedPriv = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        masterKey,
        exportedPriv
    );

    const publicKeyJWK = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    privateKey.value = keyPair.privateKey;

    return {
        publicKey: JSON.stringify(publicKeyJWK),
        encryptedPrivateKey: btoa(String.fromCharCode(...new Uint8Array(encryptedPriv))),
        iv: btoa(String.fromCharCode(...iv)),
        pinSalt: salt
    };

};

export async function unlockSecurity(pin: string, salt: string, encryptedKey: string, iv: string) 
{
    try {
        const masterKey = await deriveMasterKey(pin, salt);
        privateKey.value = await decryptUserPrivateKey(encryptedKey, iv, masterKey);
        return true;
    } catch (e) {
        console.error("PIN invalide ou données corrompues");
        return false;
    }
}

export function lockSecurity() 
{
    privateKey.value = null;
}


export const generateSalt = (): string => {
    const array = new Uint8Array(16);
    
    window.crypto.getRandomValues(array);
    
    return btoa(String.fromCharCode(...array));
};