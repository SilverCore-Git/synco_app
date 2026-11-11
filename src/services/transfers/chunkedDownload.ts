import { openChunkedFileKey } from '@/assets/utils/chunkedCrypto';
import { FileSubstitutedError } from '@/assets/utils/fileKeyV3';
import { parseFileIv, plainSizeForEncrypted } from '@/assets/utils/chunkedCryptoCore';
import { CdnDownload, type DownloadTicket } from './cdn';
import { downloadChunks } from './chunkedDownloadCore';

export { BlobSink, FileSystemSink, MemorySink, pickFileSystemSink, type DownloadSink } from './chunkedDownloadCore';
import type { DownloadSink } from './chunkedDownloadCore';

/**
 * Téléchargement d'un fichier de l'app depuis synco_cdn, avec le ticket de
 * GET /api/cdn/meta/:id et la KEK de son contexte. Le moteur (plages,
 * déchiffrement, écriture) est dans chunkedDownloadCore.ts.
 */

/** Champs de GET /api/cdn/meta/:id utilisés pour télécharger. */
export interface ChunkedFileMeta {
    id: string;
    blobId: string;
    size: number;
    iv: string;
    encryptedFileKey: string;
    /** Nom de l'enregistrement : doit correspondre au manifeste authentifié du contenu (FC11). */
    originalName?: string;
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
    const { fileKey, fileUid, manifest } = await openChunkedFileKey(meta.encryptedFileKey, kek, meta.originalName);
    const encryptedSize = Number(meta.size);
    // Taille du clair déclarée dans le manifeste authentifié (FC11) : un contenu de taille différente est un autre fichier.
    if (manifest && manifest.size !== plainSizeForEncrypted(encryptedSize, format.chunkSize)) throw new FileSubstitutedError(meta.originalName, manifest.name);

    await downloadChunks({ cdn, fileKey, fileUid, format, encryptedSize, sink, signal, onProgress });
}
