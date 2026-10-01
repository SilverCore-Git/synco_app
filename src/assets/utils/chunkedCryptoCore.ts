/**
 * Format de fichier E2EE v2 : chiffrement par morceaux indépendants.
 *
 * Seul format de fichier de Synco (l'ancien v1, chiffré d'un seul bloc,
 * imposait de tout tenir en mémoire et ne se parallélisait pas). Le clair
 * est découpé en morceaux de `chunkSize` octets
 * (4 Mio), chacun chiffré séparément avec la même clé de fichier (DEK) :
 *
 *   chiffré = C_0 || C_1 || … || C_{n-1},   C_i = AES-GCM(DEK, nonce_i, M_i, aad_i)
 *   nonce_i = préfixe aléatoire (8 octets) || i (uint32 big-endian)
 *   aad_i   = "synco-e2ee-v2" || i (uint32 BE) || dernier ? 1 : 0
 *
 * Chaque C_i fait chunkSize + 16 octets (tag GCM), sauf le dernier : sa
 * position dans le fichier se calcule directement, ce qui permet d'envoyer
 * et de télécharger les morceaux en parallèle (Range HTTP) et de ne jamais
 * garder plus de quelques morceaux en mémoire. L'index dans le nonce empêche
 * de réordonner les morceaux ; le drapeau « dernier » dans l'AAD empêche de
 * tronquer le fichier à une frontière de morceau sans que ça se voie. Un
 * fichier vide est un unique morceau de 0 octet (16 octets de tag).
 *
 * Le champ `iv` des métadonnées (opaque pour le serveur) décrit le format :
 * "v2:<chunkSize>:<préfixe de nonce en base64>". Un iv sans ce préfixe est
 * refusé (ancien format v1, plus pris en charge).
 *
 * Ce module n'a aucune dépendance : il est importé par le Web Worker de
 * chiffrement (workers/crypto.worker.ts) comme par le thread principal.
 */

export const E2EE_V2_CHUNK_SIZE = 4 * 1024 * 1024;
export const GCM_TAG_LENGTH = 16;
export const NONCE_PREFIX_LENGTH = 8;
const MAX_CHUNK_SIZE = 64 * 1024 * 1024;
const IV_PREFIX = 'v2:';
const AAD_LABEL = new TextEncoder().encode('synco-e2ee-v2');

export interface ChunkedFormat {
    chunkSize: number;
    noncePrefix: Uint8Array;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export function formatFileIv(format: ChunkedFormat): string {
    return `${IV_PREFIX}${format.chunkSize}:${toBase64(format.noncePrefix)}`;
}

/** Format v2 décrit par `iv`, ou null pour un fichier v1. */
export function parseFileIv(iv: string | null | undefined): ChunkedFormat | null {
    if (!iv || !iv.startsWith(IV_PREFIX)) return null;
    const [chunkSizeStr, prefixB64] = iv.slice(IV_PREFIX.length).split(':');
    const chunkSize = Number(chunkSizeStr);
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize > MAX_CHUNK_SIZE || !prefixB64) {
        throw new Error('Invalid E2EE v2 file header');
    }
    const noncePrefix = fromBase64(prefixB64);
    if (noncePrefix.length !== NONCE_PREFIX_LENGTH) {
        throw new Error('Invalid E2EE v2 nonce prefix');
    }
    return { chunkSize, noncePrefix };
}

export function isChunkedIv(iv: string | null | undefined): boolean {
    return !!iv && iv.startsWith(IV_PREFIX);
}

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

export function chunkCountForPlain(plainSize: number, chunkSize: number): number {
    return Math.max(1, Math.ceil(plainSize / chunkSize));
}

export function encryptedSizeForPlain(plainSize: number, chunkSize: number): number {
    return plainSize + chunkCountForPlain(plainSize, chunkSize) * GCM_TAG_LENGTH;
}

export function chunkCountForEncrypted(encryptedSize: number, chunkSize: number): number {
    const count = Math.max(1, Math.ceil(encryptedSize / (chunkSize + GCM_TAG_LENGTH)));
    if (encryptedSize < count * GCM_TAG_LENGTH) {
        throw new Error('Invalid E2EE v2 file size');
    }
    return count;
}

export function plainSizeForEncrypted(encryptedSize: number, chunkSize: number): number {
    return encryptedSize - chunkCountForEncrypted(encryptedSize, chunkSize) * GCM_TAG_LENGTH;
}

/** Plage [start, end) du morceau `index` dans le clair. */
export function plainChunkRange(index: number, plainSize: number, chunkSize: number): { start: number; end: number } {
    const start = index * chunkSize;
    return { start, end: Math.min(plainSize, start + chunkSize) };
}

/** Plage [start, end) du morceau chiffré `index` dans le fichier stocké. */
export function encryptedChunkRange(index: number, encryptedSize: number, chunkSize: number): { start: number; end: number } {
    const start = index * (chunkSize + GCM_TAG_LENGTH);
    return { start, end: Math.min(encryptedSize, start + chunkSize + GCM_TAG_LENGTH) };
}

// ---------------------------------------------------------------------------
// Chiffrement d'un morceau
// ---------------------------------------------------------------------------

function chunkParams(noncePrefix: Uint8Array, index: number, isLast: boolean): AesGcmParams {
    if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) {
        throw new Error('Invalid chunk index');
    }
    const iv = new Uint8Array(12);
    iv.set(noncePrefix, 0);
    new DataView(iv.buffer).setUint32(NONCE_PREFIX_LENGTH, index);

    const aad = new Uint8Array(AAD_LABEL.length + 5);
    aad.set(AAD_LABEL, 0);
    new DataView(aad.buffer).setUint32(AAD_LABEL.length, index);
    aad[AAD_LABEL.length + 4] = isLast ? 1 : 0;

    return { name: 'AES-GCM', iv, additionalData: aad };
}

export function encryptChunk(
    fileKey: CryptoKey,
    noncePrefix: Uint8Array,
    index: number,
    isLast: boolean,
    plain: BufferSource
): Promise<ArrayBuffer> {
    return crypto.subtle.encrypt(chunkParams(noncePrefix, index, isLast), fileKey, plain);
}

export function decryptChunk(
    fileKey: CryptoKey,
    noncePrefix: Uint8Array,
    index: number,
    isLast: boolean,
    cipher: BufferSource
): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt(chunkParams(noncePrefix, index, isLast), fileKey, cipher);
}
