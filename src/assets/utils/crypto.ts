import { computed, ref } from "vue";

export const privateKey = ref<CryptoKey | null>(null);
export const E2EEUnloked = computed(() => {
    return privateKey.value !== null && typeof privateKey.value === 'object';
});

// Existing accounts were provisioned with a 4-digit PIN and this iteration
// count — bumping it globally would change the derived master key for
// every account and permanently lock everyone out of their stored private
// key. New setups/resets (App.vue now requires >=8 digits there) get the
// higher count via a versioned salt (SALT_V2_PREFIX) instead, so legacy
// accounts keep deriving under their original parameters.
const PIN_ITERATIONS_LEGACY = 100000;
const PIN_ITERATIONS_V2 = 600000; // OWASP 2023 recommendation for PBKDF2-SHA256
export const SALT_V2_PREFIX = "v2:";

// v3: back to a 4-digit PIN (UX), but the private key is no longer wrapped
// by PBKDF2(pin, salt) alone. A second, high-entropy secret (`wrapSecret`)
// lives only server-side and is released through POST /me/pin/unlock, which
// enforces a per-account lockout with exponential backoff after wrong
// guesses. A stolen client-side blob (encryptedPrivateKey+iv+pinSalt) alone
// is therefore cryptographically insufficient to brute-force offline — the
// attacker is missing wrapSecret and must go through the throttled endpoint
// for every one of the 10,000 possible PINs. See synco_api's
// pinSecurityService.ts for the lockout curve.
export const SALT_V3_PREFIX = "v3:";
// Deliberately lower than PIN_ITERATIONS_V2 (600k): v3's brute-force barrier
// is the server-side lockout, not local KDF cost, so this only needs to be
// "not instant" without adding perceptible UI lag on low-end/mobile devices
// on every unlock. The OWASP 600k floor assumes the KDF is the SOLE
// defense — that assumption no longer holds for v3, so this isn't a regression.
const PIN_ITERATIONS_V3 = 210000;

export async function deriveMasterKey (pin: string, salt: string): Promise<CryptoKey>
{

    const isV2 = salt.startsWith(SALT_V2_PREFIX);
    const rawSalt = isV2 ? salt.slice(SALT_V2_PREFIX.length) : salt;
    const iterations = isV2 ? PIN_ITERATIONS_V2 : PIN_ITERATIONS_LEGACY;

    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw", encoder.encode(pin), "PBKDF2", false, ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode(rawSalt),
            iterations,
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


// Mêmes fonctions que encryptForPeer/decryptFromPeer, mais sur un ArrayBuffer
// brut plutôt qu'une chaîne — pour le partage de fichiers en session
// éphémère (usePrivatMeet.ts). Pas de base64 ici : les objets envoyés par
// PeerJS DataConnection utilisent sa sérialisation binaire native (le même
// mécanisme qui découpe déjà les gros payloads en chunks), donc encoder en
// base64 n'apporterait que ~33% de taille en plus pour rien.
export async function encryptBufferForPeer (buffer: ArrayBuffer, peerPublicKeyJWK: string, myPublicKeyJWK?: string | object)
{

    const publicKey = await crypto.subtle.importKey(
        "jwk",
        JSON.parse(peerPublicKeyJWK),
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );

    const fileKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        fileKey,
        buffer
    );

    const exportedAesKey = await crypto.subtle.exportKey("raw", fileKey);
    const encryptedAesKey = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        exportedAesKey
    );

    let selfEncryptedAesKey: ArrayBuffer | undefined = undefined;
    if (myPublicKeyJWK) {
        const myPubKey = await crypto.subtle.importKey(
            "jwk",
            typeof myPublicKeyJWK === 'string' ? JSON.parse(myPublicKeyJWK) : myPublicKeyJWK,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["encrypt"]
        );
        selfEncryptedAesKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, myPubKey, exportedAesKey);
    }

    return {
        ciphertext,
        encryptedAesKey,
        iv: iv.buffer,
        selfEncryptedAesKey
    };

}

export async function decryptBufferFromPeer (
    ciphertext: ArrayBuffer,
    encryptedAesKey: ArrayBuffer,
    iv: ArrayBuffer,
    myPrivateKey: CryptoKey
): Promise<ArrayBuffer>
{

    const aesKeyRaw = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        myPrivateKey,
        encryptedAesKey
    );

    const aesKey = await crypto.subtle.importKey(
        "raw", aesKeyRaw, "AES-GCM", false, ["decrypt"]
    );

    return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        ciphertext
    );

}


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


/**
 * Wraps a raw FileKey (DEK) with the SpaceKey / DM key (KEK), using its own
 * IV. Never reuse an IV across two AES-GCM operations, even under different
 * keys — a dedicated random IV per operation removes any risk tied to a
 * future key-reuse bug. It's prepended to the ciphertext so no extra wire
 * field / backend column is needed for it. Used by the chunked file format
 * (v2, chunkedCrypto.ts).
 */
export async function wrapFileKey(rawFileKey: ArrayBuffer, kek: CryptoKey): Promise<string>
{
    const keyIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedFileKeyBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: keyIv },
        kek,
        rawFileKey
    );

    const combinedFileKey = new Uint8Array(keyIv.length + encryptedFileKeyBuffer.byteLength);
    combinedFileKey.set(keyIv, 0);
    combinedFileKey.set(new Uint8Array(encryptedFileKeyBuffer), keyIv.length);

    return btoa(String.fromCharCode(...combinedFileKey));
}

/** Inverse of wrapFileKey() (current layout: key-wrap IV prepended). */
export async function unwrapFileKey(encryptedFileKeyBase64: string, kek: CryptoKey): Promise<ArrayBuffer>
{
    const encryptedFileKeyBytes = Uint8Array.from(atob(encryptedFileKeyBase64), c => c.charCodeAt(0));
    return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: encryptedFileKeyBytes.slice(0, 12) },
        kek,
        encryptedFileKeyBytes.slice(12)
    );
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

// ---------------------------------------------------------------------------
// v3 PIN scheme (4 digits, server-assisted). See SALT_V3_PREFIX above.
// ---------------------------------------------------------------------------

function generateSaltV3Raw(): string {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
}

// Local, PIN-derived intermediate key. Never used directly to wrap the
// private key (see deriveMasterKeyV3) — it's combined with the server-held
// wrapSecret first, and is also the input to deriveVerifierV3.
async function deriveUnlockKeyV3(pin: string, rawSalt: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]
    );
    return await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: encoder.encode(rawSalt), iterations: PIN_ITERATIONS_V3, hash: "SHA-256" },
        baseKey,
        256
    );
}

// Deterministic, PIN-derived proof the server can check without ever
// learning the PIN (HMAC is one-way — the server cannot recover unlockKey,
// let alone the PIN, from a stored verifier).
async function deriveVerifierV3(unlockKeyBytes: ArrayBuffer): Promise<string> {
    const hmacKey = await crypto.subtle.importKey(
        "raw", unlockKeyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode("synco-pin-verifier-v3"));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Combines the local unlockKey with the server-released wrapSecret via HKDF
// into the actual AES-GCM key that wraps the RSA private key. wrapSecret is
// passed as HKDF's "salt" — both inputs are secret here (unlike typical HKDF
// usage), but either position is cryptographically valid for combining two
// secrets; kept this way so the call site reads clearly on which input came
// from the PIN and which from the server.
async function deriveMasterKeyV3(unlockKeyBytes: ArrayBuffer, wrapSecretBytes: ArrayBuffer): Promise<CryptoKey> {
    const ikm = await crypto.subtle.importKey("raw", unlockKeyBytes, "HKDF", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: wrapSecretBytes,
            info: new TextEncoder().encode("synco-pin-masterkey-v3"),
        },
        ikm,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

// v3 equivalent of setupFirstTimeSecurity: same RSA keygen + AES-GCM wrap,
// but masterKey comes from HKDF(unlockKey, wrapSecret) instead of directly
// from PBKDF2(pin, salt). Returns the extended payload initE2EE/resetE2EE
// expect for a v3 pinSalt (verifier + wrapSecret added).
export async function setupFirstTimeSecurityV3(pin: string) {

    const rawSalt = generateSaltV3Raw();
    const salt = SALT_V3_PREFIX + rawSalt;

    const unlockKeyBytes = await deriveUnlockKeyV3(pin, rawSalt);
    const verifier = await deriveVerifierV3(unlockKeyBytes);

    const wrapSecretBytes = crypto.getRandomValues(new Uint8Array(32));
    const wrapSecret = btoa(String.fromCharCode(...wrapSecretBytes));

    const masterKey = await deriveMasterKeyV3(unlockKeyBytes, wrapSecretBytes.buffer);

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
        pinSalt: salt,
        verifier,
        wrapSecret,
    };

}

// v3 equivalent of unlockSecurity. `doFetch` performs the network round-trip
// to POST /me/pin/unlock (App.vue supplies it via sfetch) — crypto.ts stays
// free of HTTP concerns, matching its existing pure-crypto style. Throws
// (rather than returning false) so the caller can distinguish "wrong PIN"
// from "locked out" via whatever doFetch's rejection carries.
export async function unlockSecurityV3(
    pin: string,
    salt: string,
    encryptedKey: string,
    iv: string,
    doFetch: (verifier: string) => Promise<{ wrapSecret: string }>
): Promise<boolean> {
    const rawSalt = salt.slice(SALT_V3_PREFIX.length);
    const unlockKeyBytes = await deriveUnlockKeyV3(pin, rawSalt);
    const verifier = await deriveVerifierV3(unlockKeyBytes);

    const { wrapSecret } = await doFetch(verifier);
    const wrapSecretBytes = Uint8Array.from(atob(wrapSecret), c => c.charCodeAt(0));
    const masterKey = await deriveMasterKeyV3(unlockKeyBytes, wrapSecretBytes.buffer);

    privateKey.value = await decryptUserPrivateKey(encryptedKey, iv, masterKey);
    return true;
}


// For AI session E2EE (provider 'gateway' — clé de session partagée par organisation)

export async function generateAiSessionKey(): Promise<CryptoKey>
{
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function wrapAiSessionKeyForMember(
    rawKeyBytes: ArrayBuffer,
    recipientPublicKeyJWK: string | object
): Promise<string>
{

    const pubKey = await crypto.subtle.importKey(
        "jwk",
        typeof recipientPublicKeyJWK === 'string' ? JSON.parse(recipientPublicKeyJWK) : recipientPublicKeyJWK,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
    );

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        pubKey,
        rawKeyBytes
    );

    return btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));

}

export async function unwrapAiSessionKey(
    encryptedKeyBase64: string,
    myPrivateKey: CryptoKey
): Promise<ArrayBuffer>
{

    const encryptedKeyBuffer = Uint8Array.from(atob(encryptedKeyBase64), c => c.charCodeAt(0));

    return await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        myPrivateKey,
        encryptedKeyBuffer
    );

}

/**
 * Wire format partagé avec `Synco_AI_Gateway` et `synco_api` (cf. E2EE_PLAN.md §2) :
 * "gcm1:" + base64standard(nonce(12) || ciphertext||tag(16)), AAD = "{sessionId}:{messageId}:{fieldName}".
 */
export async function encryptAiField(
    key: CryptoKey,
    sessionId: string,
    messageId: string,
    fieldName: string,
    plaintext: string
): Promise<string>
{

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = encoder.encode(`${sessionId}:${messageId}:${fieldName}`);

    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
        key,
        encoder.encode(plaintext)
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return "gcm1:" + btoa(String.fromCharCode(...combined));

}

export async function decryptAiField(
    key: CryptoKey,
    sessionId: string,
    messageId: string,
    fieldName: string,
    wireValue: string
): Promise<string>
{

    if (!wireValue.startsWith("gcm1:")) {
        throw new Error("Format de champ IA chiffré inconnu.");
    }

    const encoder = new TextEncoder();
    const raw = Uint8Array.from(atob(wireValue.slice(5)), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const aad = encoder.encode(`${sessionId}:${messageId}:${fieldName}`);

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
        key,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);

}


// Prefixed so deriveMasterKey can tell this salt apart from one generated
// before the PIN_ITERATIONS_V2 bump and use the right iteration count.
export const generateSalt = (): string => {
    const array = new Uint8Array(16);

    window.crypto.getRandomValues(array);

    return SALT_V2_PREFIX + btoa(String.fromCharCode(...array));
};