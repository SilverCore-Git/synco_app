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



export async function encryptForPeer (text: string, peerPublicKeyJWK: string, myPublicKeyJWK?: string | object) 
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

    let selfEncryptedAesKey = undefined;
    if (myPublicKeyJWK) {
        selfEncryptedAesKey = await encryptAesKeyWithRsa(exportedAesKey, myPublicKeyJWK);
    }

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        encryptedAesKey: btoa(String.fromCharCode(...new Uint8Array(encryptedAesKey))),
        iv: btoa(String.fromCharCode(...iv)),
        selfEncryptedAesKey
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


// For thread E2EE

export async function decryptThreadKeyWithRsa(
    encryptedThreadKeyBase64: string,
    myPrivateKey: CryptoKey
): Promise<CryptoKey> 
{

    const encryptedKeyBuffer = Uint8Array.from(atob(encryptedThreadKeyBase64), c => c.charCodeAt(0));

    const decryptedRawAesKey = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        myPrivateKey,
        encryptedKeyBuffer
    );

    return await crypto.subtle.importKey(
        "raw",
        decryptedRawAesKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

}

export async function encryptMessageWithContentKey(text: string, threadKey: CryptoKey) 
{

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        threadKey,
        encoder.encode(text)
    );

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        iv: btoa(String.fromCharCode(...iv))
    };

}


export async function decryptMessageWithContentKey(
    ciphertextBase64: string, 
    ivBase64: string, 
    threadKey: CryptoKey
): Promise<string> 
{

    try {

        const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            threadKey,
            ciphertext
        );

        return new TextDecoder().decode(decryptedBuffer);

    } catch (e) {
        console.error("[E2EE] Échec du déchiffrement du message", e);
        return "[⚠️ Impossible de déchiffrer ce message.]";
    }

}

export async function generateThreadKey(): Promise<CryptoKey> 
{
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encryptThreadKeyForMember(
    threadKey: CryptoKey, 
    memberPublicKeyJWK: string | object
): Promise<string> 
{
    
    const pubKey = await crypto.subtle.importKey(
        "jwk", 
        typeof memberPublicKeyJWK === 'string' ? JSON.parse(memberPublicKeyJWK) : memberPublicKeyJWK, 
        { name: "RSA-OAEP", hash: "SHA-256" }, 
        false, 
        ["encrypt"]
    );

    const rawThreadKey = await crypto.subtle.exportKey("raw", threadKey);

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" }, 
        pubKey, 
        rawThreadKey
    );

    return btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));

}


// For Files E2EE (Workspaces & Orgs)

export async function generateSpaceKey(): Promise<CryptoKey> 
{
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encryptSpaceKeyForMember(
    spaceKey: CryptoKey, 
    memberPublicKeyJWK: string | object
): Promise<string> 
{
    const pubKey = await crypto.subtle.importKey(
        "jwk", 
        typeof memberPublicKeyJWK === 'string' ? JSON.parse(memberPublicKeyJWK) : memberPublicKeyJWK, 
        { name: "RSA-OAEP", hash: "SHA-256" }, 
        false, 
        ["encrypt"]
    );

    const rawKey = await crypto.subtle.exportKey("raw", spaceKey);

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" }, 
        pubKey, 
        rawKey
    );

    return btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
}

export async function decryptSpaceKeyWithRsa(
    encryptedSpaceKeyBase64: string,
    myPrivateKey: CryptoKey
): Promise<CryptoKey> 
{
    const encryptedKeyBuffer = Uint8Array.from(atob(encryptedSpaceKeyBase64), c => c.charCodeAt(0));

    const decryptedRawAesKey = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        myPrivateKey,
        encryptedKeyBuffer
    );

    return await crypto.subtle.importKey(
        "raw",
        decryptedRawAesKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encryptFileLocal(
    fileBuffer: ArrayBuffer,
    spaceKey: CryptoKey
): Promise<{ encryptedBlob: Blob, encryptedFileKey: string, iv: string }> 
{
    // 1. Generate a unique FileKey (DEK)
    const fileKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt"]
    );

    // 2. Encrypt the file using the FileKey
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        fileKey,
        fileBuffer
    );
    const encryptedBlob = new Blob([ciphertext]);

    // 3. Encrypt the FileKey with the SpaceKey (KEK)
    const rawFileKey = await crypto.subtle.exportKey("raw", fileKey);
    const encryptedFileKeyBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, // We reuse the same IV for the KEK encryption or generate a new one, let's reuse for simplicity as it's safe if keys are different, but wait, AES-GCM needs unique IVs. Actually, using the same IV is fine because the keys are different (fileKey vs spaceKey). But to be strictly correct:
        spaceKey,
        rawFileKey
    );
    
    // Better: Generate a specific IV for the KEK encryption, or just use the same since it's a completely different key.
    // To keep it simple and safe, let's just generate a second IV or append it.
    // Actually, we can use the same `iv` because `spaceKey` encrypts `fileKey`, and `fileKey` encrypts `fileBuffer`. Two different keys. It is mathematically safe.
    
    return {
        encryptedBlob,
        encryptedFileKey: btoa(String.fromCharCode(...new Uint8Array(encryptedFileKeyBuffer))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

export async function decryptFileLocal(
    encryptedBuffer: ArrayBuffer,
    encryptedFileKeyBase64: string,
    ivBase64: string,
    spaceKey: CryptoKey
): Promise<ArrayBuffer> 
{
    const encryptedFileKey = Uint8Array.from(atob(encryptedFileKeyBase64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

    // 1. Decrypt the FileKey using the SpaceKey
    const rawFileKey = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        spaceKey,
        encryptedFileKey
    );

    const fileKey = await crypto.subtle.importKey(
        "raw",
        rawFileKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );

    // 2. Decrypt the file
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        fileKey,
        encryptedBuffer
    );

    return decryptedBuffer;
}



// Set up

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
    
    const nonExtractablePrivateKey = await crypto.subtle.importKey(
        "pkcs8",
        exportedPriv,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["decrypt"]
    );
    privateKey.value = nonExtractablePrivateKey;

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