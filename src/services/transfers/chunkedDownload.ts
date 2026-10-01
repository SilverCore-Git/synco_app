import { openChunkedFileKey } from '@/assets/utils/chunkedCrypto';
import {
    chunkCountForEncrypted,
    encryptedChunkRange,
    parseFileIv,
    plainChunkRange,
    plainSizeForEncrypted,
} from '@/assets/utils/chunkedCryptoCore';
import { decryptChunkInPool } from '@/assets/utils/cryptoPool';
import { CdnDownload, type DownloadTicket } from './cdn';
import { linkedAbortController, partSlots, runPool, withRetry } from './transferManager';

/**
 * Téléchargement d'un fichier depuis synco_cdn : les morceaux chiffrés
 * (format v2) sont récupérés en parallèle (requêtes Range, avec le ticket de
 * GET /api/cdn/meta/:id), déchiffrés dans le pool de workers et écrits à
 * leur position dans une destination (`DownloadSink`). Aucune étape ne
 * manipule le fichier entier.
 */

/** Morceaux d'un même fichier téléchargés en parallèle (dans la limite globale de partSlots). */
const PARTS_PER_FILE = 4;

export interface DownloadSink {
    /** Écrit le clair du morceau `index` à la position `position` (ordre quelconque). */
    write(position: number, data: ArrayBuffer, index: number): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
}

/** Tout en mémoire, pour les usages qui ont besoin des octets (aperçus, ZIP). */
export class MemorySink implements DownloadSink {
    readonly bytes: Uint8Array;
    constructor(size: number) { this.bytes = new Uint8Array(size); }
    async write(position: number, data: ArrayBuffer) { this.bytes.set(new Uint8Array(data), position); }
    async close() {}
    async abort() {}
}

/**
 * Un Blob par morceau, assemblés à la fin sans recopie : le navigateur peut
 * garder les gros Blobs sur disque plutôt qu'en mémoire.
 */
export class BlobSink implements DownloadSink {
    private parts: Blob[] = [];
    async write(_position: number, data: ArrayBuffer, index: number) { this.parts[index] = new Blob([data]); }
    async close() {}
    async abort() { this.parts = []; }
    toBlob(type: string): Blob { return new Blob(this.parts, { type }); }
}

// API File System Access (Chromium) : absente des types DOM standard.
interface WritableFileStream {
    write(params: { type: 'write'; position: number; data: ArrayBuffer }): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
}

/** Écriture directe dans le fichier choisi par l'utilisateur : rien ne reste en mémoire. */
export class FileSystemSink implements DownloadSink {
    private writable: WritableFileStream;
    constructor(writable: WritableFileStream) { this.writable = writable; }
    write(position: number, data: ArrayBuffer) { return this.writable.write({ type: 'write', position, data }); }
    close() { return this.writable.close(); }
    abort() { return this.writable.abort().catch(() => {}); }
}

/**
 * Demande où enregistrer le fichier (API File System Access). À appeler
 * au plus tôt après le clic : le navigateur exige un geste utilisateur
 * récent. Renvoie null si l'API est indisponible ou refusée (repli sur
 * BlobSink), 'cancelled' si l'utilisateur a fermé la boîte de dialogue.
 */
export async function pickFileSystemSink(suggestedName: string): Promise<FileSystemSink | null | 'cancelled'> {
    const picker = (window as any).showSaveFilePicker;
    if (typeof picker !== 'function') return null;
    try {
        const handle = await picker.call(window, { suggestedName });
        return new FileSystemSink(await handle.createWritable());
    } catch (error) {
        if ((error as any)?.name === 'AbortError') return 'cancelled';
        console.warn('[transfers] Enregistrement direct indisponible, repli en mémoire', error);
        return null;
    }
}

/** Champs de GET /api/cdn/meta/:id utilisés pour télécharger. */
export interface ChunkedFileMeta {
    id: string;
    blobId: string;
    size: number;
    iv: string;
    encryptedFileKey: string;
    /** Absent si le contenu est introuvable sur le serveur. */
    download?: DownloadTicket;
}

/** Taille en clair d'un fichier E2EE v2 à partir de sa taille stockée. */
export function chunkedPlainSize(meta: Pick<ChunkedFileMeta, 'size' | 'iv'>): number {
    const format = parseFileIv(meta.iv);
    if (!format) throw new Error('Not an E2EE v2 file');
    return plainSizeForEncrypted(Number(meta.size), format.chunkSize);
}

export async function runChunkedDownload(
    meta: ChunkedFileMeta,
    kek: CryptoKey,
    sink: DownloadSink,
    signal: AbortSignal,
    onProgress?: (loaded: number) => void
): Promise<void> {
    const format = parseFileIv(meta.iv);
    if (!format) throw new Error('Not an E2EE v2 file');

    if (!meta.download) throw new Error('Contenu du fichier introuvable sur le serveur');
    const cdn = new CdnDownload(meta.id, meta.download, meta.blobId);
    const fileKey = await openChunkedFileKey(meta.encryptedFileKey, kek);
    const encryptedSize = Number(meta.size);
    const count = chunkCountForEncrypted(encryptedSize, format.chunkSize);
    const plainSize = plainSizeForEncrypted(encryptedSize, format.chunkSize);

    const parts = linkedAbortController(signal);
    let loaded = 0;

    try {
        await runPool(count, PARTS_PER_FILE, async (index) => {
            const release = await partSlots.acquire(parts.signal);
            try {
                const { start, end } = encryptedChunkRange(index, encryptedSize, format.chunkSize);
                const encrypted = await withRetry(() => cdn.fetchRange(start, end, parts.signal), parts.signal);

                let plain: ArrayBuffer;
                try {
                    plain = await decryptChunkInPool(fileKey, format.noncePrefix, index, index === count - 1, encrypted);
                } catch {
                    throw new Error('Fichier corrompu ou clé de déchiffrement invalide');
                }

                await sink.write(plainChunkRange(index, plainSize, format.chunkSize).start, plain, index);
                loaded += plain.byteLength;
                onProgress?.(loaded);
            } finally {
                release();
            }
        });
    } catch (error) {
        parts.abort();
        throw error;
    }
}
