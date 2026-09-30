import { decryptFileLocal, unwrapFileKey, wrapFileKey } from './crypto';
import {
    E2EE_V2_CHUNK_SIZE,
    NONCE_PREFIX_LENGTH,
    type ChunkedFormat,
    chunkCountForEncrypted,
    encryptedChunkRange,
    formatFileIv,
    parseFileIv,
    plainChunkRange,
    plainSizeForEncrypted,
} from './chunkedCryptoCore';
import { decryptChunkInPool } from './cryptoPool';

/**
 * Gestion des clés du format E2EE v2 (cf. chunkedCryptoCore.ts) et
 * déchiffrement en mémoire d'un fichier stocké, quel que soit son format.
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

/**
 * Déchiffre en mémoire le contenu complet d'un fichier E2EE, v1 ou v2.
 * Pour les usages qui ont besoin des octets entiers (aperçus, éditeur
 * texte, filigrane, archive ZIP) ; les téléchargements vers le disque
 * passent par transfers.ts, qui ne garde que quelques morceaux en mémoire.
 */
export async function decryptStoredFile(
    encrypted: ArrayBuffer,
    meta: { encryptedFileKey: string; iv: string },
    kek: CryptoKey
): Promise<ArrayBuffer> {
    const format = parseFileIv(meta.iv);
    if (!format) {
        return decryptFileLocal(encrypted, meta.encryptedFileKey, meta.iv, kek);
    }

    const fileKey = await openChunkedFileKey(meta.encryptedFileKey, kek);
    const count = chunkCountForEncrypted(encrypted.byteLength, format.chunkSize);
    const plainSize = plainSizeForEncrypted(encrypted.byteLength, format.chunkSize);
    const out = new Uint8Array(plainSize);

    // Quelques morceaux à la fois, répartis sur le pool de workers.
    const CONCURRENCY = 4;
    let next = 0;
    const worker = async () => {
        while (next < count) {
            const index = next++;
            const { start, end } = encryptedChunkRange(index, encrypted.byteLength, format.chunkSize);
            const plain = await decryptChunkInPool(fileKey, format.noncePrefix, index, index === count - 1, encrypted.slice(start, end));
            out.set(new Uint8Array(plain), plainChunkRange(index, plainSize, format.chunkSize).start);
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, count) }, worker));

    return out.buffer;
}
