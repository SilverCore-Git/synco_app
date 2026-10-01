import { openedOrg } from '@/assets/var';
import { createChunkedFileKey } from '@/assets/utils/chunkedCrypto';
import { E2EE_V2_CHUNK_SIZE, GCM_TAG_LENGTH, chunkCountForPlain, encryptedSizeForPlain, plainChunkRange } from '@/assets/utils/chunkedCryptoCore';
import { encryptChunkInPool } from '@/assets/utils/cryptoPool';
import { resolveFileKek, type FileKeyContext } from '@/assets/utils/fileKeys';
import { CdnUpload } from './cdn';
import { TransferCancelledError, linkedAbortController, partSlots, runPool, withRetry, type TransferHandle } from './transferManager';

/**
 * Envoi d'un fichier vers synco_cdn, toujours chiffré de bout en bout
 * (format v2, cf. chunkedCryptoCore.ts) :
 *
 * 1. ouverture auprès de l'API (droits, quota) → ticket du CDN ;
 * 2. chaque morceau est lu (Blob.slice, sans charger le fichier), chiffré
 *    dans le pool de workers puis envoyé au CDN — plusieurs à la fois, un
 *    morceau en échec est renvoyé seul ;
 * 3. finalisation au CDN, qui fait enregistrer le fichier par l'API et
 *    renvoie ses métadonnées.
 *
 * La mémoire utilisée est bornée par le nombre de morceaux en vol
 * (partSlots), quelle que soit la taille du fichier.
 */

export interface UploadContext {
    workspaceId?: string;
    messageId?: string;
    folderId?: string;
    dmMessageId?: string;
    taskId?: string;
    // L'autre participant de la conversation DM — permet de chiffrer la
    // pièce jointe de bout en bout avant même que le DMMessage existe
    // (le fichier est uploadé avant le message, puis lié après coup).
    dmPeerId?: string;
    // Salon d'organisation (hors espace) : sa clé chiffre ses pièces jointes.
    // Local au client, jamais envoyé à l'API (le lien passe par le message).
    threadId?: string;
}

/** Ce qu'on envoie : un nouveau fichier, ou le nouveau contenu d'un fichier existant. */
export type UploadTarget =
    | { kind: 'create'; context: UploadContext }
    | { kind: 'replace'; fileId: string; keyContext: FileKeyContext };

/** Morceaux d'un même fichier envoyés en parallèle (dans la limite globale de partSlots). */
const PARTS_PER_FILE = 4;

// Le File.type que renvoie le navigateur pour un .md n'est pas fiable
// (souvent vide selon l'OS) — on force un mimetype cohérent par
// extension plutôt que de dépendre de la détection du navigateur.
export function uploadMimeType(name: string, type: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown') return 'text/markdown';
    return type || 'application/octet-stream';
}

export async function runChunkedUpload(source: Blob, name: string, target: UploadTarget, handle: TransferHandle): Promise<any> {

    const { signal } = handle;
    const keyContext = target.kind === 'create' ? target.context : target.keyContext;
    const { key: kek, version: keyVersion } = await resolveFileKek(keyContext);
    const fileKey = await createChunkedFileKey(kek);

    const chunkSize = E2EE_V2_CHUNK_SIZE;
    const partCount = chunkCountForPlain(source.size, chunkSize);

    const upload = await CdnUpload.open({
        ...(target.kind === 'create'
            ? {
                create: {
                    orgId: openedOrg.value!.id,
                    workspaceId: target.context.workspaceId,
                    messageId: target.context.messageId,
                    dmMessageId: target.context.dmMessageId,
                    folderId: target.context.folderId,
                    taskId: target.context.taskId,
                    fileName: name,
                },
            }
            : { replaceFileId: target.fileId }),
        size: encryptedSizeForPlain(source.size, chunkSize),
        partSize: chunkSize + GCM_TAG_LENGTH,
        mimeType: uploadMimeType(name, source.type),
        encryptedFileKey: fileKey.encryptedFileKey,
        keyVersion,
        iv: fileKey.iv,
    }, signal);

    if (upload.partCount !== partCount) {
        upload.cancel();
        throw new Error("Découpage de l'envoi incohérent avec le serveur");
    }

    const parts = linkedAbortController(signal);

    try {
        // Progression en octets du clair : fraction envoyée de chaque part.
        const sentPerPart = new Float64Array(partCount);
        const report = () => handle.setLoaded(sentPerPart.reduce((a, b) => a + b, 0));

        await runPool(partCount, PARTS_PER_FILE, async (index) => {
            const release = await partSlots.acquire(parts.signal);
            try {
                const { start, end } = plainChunkRange(index, source.size, chunkSize);
                const body = new Blob([await encryptChunkInPool(fileKey.fileKey, fileKey.noncePrefix, index, index === partCount - 1, source.slice(start, end))]);
                if (parts.signal.aborted) throw new TransferCancelledError();
                const plainLength = end - start;

                await withRetry(() => upload.putPart(index, body, parts.signal, (sent) => {
                    sentPerPart[index] = body.size ? (sent / body.size) * plainLength : 0;
                    report();
                }), parts.signal);

                sentPerPart[index] = plainLength;
                report();
            } finally {
                release();
            }
        });

        handle.setFinalizing();
        // 503 tant que l'API n'a pas confirmé l'enregistrement : rejoué.
        return await withRetry(() => upload.complete(signal), signal);

    } catch (error) {
        parts.abort();
        upload.cancel();
        throw error;
    }
}
