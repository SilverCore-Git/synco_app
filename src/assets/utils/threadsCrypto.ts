const MASTER_KEY = import.meta.env.VITE_THREADS_E2EE_KEY;

async function deriveKey(orgId: string, threadId: string) 
{

    try {

        if (!MASTER_KEY) 
        {
            console.error("E2EE: Master Key absente du .env");
            return null;
        }

        const encoder = new TextEncoder();
        
        const saltContent = (orgId || "global") + threadId;

        const baseKey = await window.crypto.subtle.importKey(
            "raw", 
            encoder.encode(MASTER_KEY), 
            { name: "HKDF" }, 
            false, 
            ["deriveKey"]
        );

        return await window.crypto.subtle.deriveKey(
            { 
                name: "HKDF", 
                salt: encoder.encode(saltContent), 
                info: encoder.encode("chat-msg"), 
                hash: "SHA-256" 
            },
            baseKey, 
            { name: "AES-GCM", length: 256 }, 
            false, 
            ["encrypt", "decrypt"]
        );

    } 
    catch (e) 
    {
        console.error("E2EE: Erreur dérivation clé", e);
        return null;
    }

}

async function encrypt(text: string, key: CryptoKey) 
{

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const cipher = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));

    return JSON.stringify({
        ct: btoa(String.fromCharCode(...new Uint8Array(cipher))),
        iv: btoa(String.fromCharCode(...iv))
    });

}

async function decrypt(encryptedJson: string, key: CryptoKey) 
{

    try {

        const { ct, iv } = JSON.parse(encryptedJson);
        const decipher = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)) },
            key, Uint8Array.from(atob(ct), c => c.charCodeAt(0))
        );

        return new TextDecoder().decode(decipher);

    } 
    catch (e) 
    { 
        return "🔒 [Impossible de déchiffrer le message]"; 
    }
    
}


export {
    deriveKey,
    encrypt,
    decrypt
}