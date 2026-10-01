import { unwrapFileKey, wrapFileKey } from './crypto';
import { E2EE_V2_CHUNK_SIZE, NONCE_PREFIX_LENGTH, type ChunkedFormat, formatFileIv } from './chunkedCryptoCore';

/**
 * Gestion des clés du format E2EE v2 (cf. chunkedCryptoCore.ts). Le
 * contenu est (dé)chiffré morceau par morceau par les transferts
 * (services/transfers/), dans le pool de workers.
 */

export interface ChunkedFileKey extends ChunkedFormat {
    /** DEK non extractible, utilisable pour chiffrer et déchiffrer. */
    fileKey: CryptoKey;
    /** DEK emballée par la clé d'espace / de DM (champ encryptedFileKey). */
    encryptedFileKey: string;
    /** Champ `iv` des métadonnées, décrivant le format v2. */
    iv: string;
}

/** Nouvelle DEK pour un fichier v2, emballée par `kek`. */
export async function createChunkedFileKey(kek: CryptoKey, chunkSize = E2EE_V2_CHUNK_SIZE): Promise<ChunkedFileKey> {
    const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const raw = await crypto.subtle.exportKey('raw', extractable);
    const encryptedFileKey = await wrapFileKey(raw, kek);
    const fileKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    new Uint8Array(raw).fill(0);

    const format: ChunkedFormat = { chunkSize, noncePrefix: crypto.getRandomValues(new Uint8Array(NONCE_PREFIX_LENGTH)) };
    return { ...format, fileKey, encryptedFileKey, iv: formatFileIv(format) };
}

/** Désemballe la DEK d'un fichier v2. */
export async function openChunkedFileKey(encryptedFileKey: string, kek: CryptoKey): Promise<CryptoKey> {
    const raw = await unwrapFileKey(encryptedFileKey, kek);
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    new Uint8Array(raw).fill(0);
    return key;
}
