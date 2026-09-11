import { get, set } from 'idb-keyval';

const STORE_PREFIX = 'trusted-pubkey:';

/**
 * SHA-256 fingerprint of a public key, formatted for out-of-band comparison
 * (same shape as the call SAS fingerprint in useSecurePeer.ts).
 */
export async function computeKeyFingerprint(publicKeyJWK: string): Promise<string> {
    const data = new TextEncoder().encode(publicKeyJWK);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 16)
        .toUpperCase();
}

export type KeyTrustResult = 'new' | 'match' | 'changed';

/**
 * Trust-On-First-Use check for a peer's public key. The server is not
 * treated as an authoritative source of key identity: the first key ever
 * seen for a userId is cached locally (IndexedDB, per-device), and any
 * later mismatch is surfaced instead of silently trusted — a
 * compromised/malicious backend can no longer swap in an attacker key
 * transparently (cf. audit finding #3).
 */
export async function checkKeyTrust(userId: string, currentPublicKeyJWK: string): Promise<KeyTrustResult> {
    const trusted = await get<string>(STORE_PREFIX + userId);

    if (!trusted) {
        await set(STORE_PREFIX + userId, currentPublicKeyJWK);
        return 'new';
    }

    return trusted === currentPublicKeyJWK ? 'match' : 'changed';
}

/** Explicitly (re-)trust a key, after the user has confirmed a change out-of-band. */
export async function trustKey(userId: string, publicKeyJWK: string): Promise<void> {
    await set(STORE_PREFIX + userId, publicKeyJWK);
}
