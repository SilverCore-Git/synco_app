import sfetch from '@/assets/utils/sfetch';
import { openedOrg } from '@/assets/var';
import { getWorkspaceKey } from '@/assets/utils/workspaceCrypto';
import { getDMConversationKey } from '@/assets/utils/dmCrypto';
import { createChunkedFileKey, type ChunkedFileKey } from '@/assets/utils/chunkedCrypto';
import { E2EE_V2_CHUNK_SIZE, GCM_TAG_LENGTH, chunkCountForPlain, encryptedSizeForPlain, plainChunkRange } from '@/assets/utils/chunkedCryptoCore';
import { encryptChunkInPool } from '@/assets/utils/cryptoPool';
import { putUploadPart } from './http';
import { TransferCancelledError, linkedAbortController, partSlots, runPool, withRetry, type TransferHandle } from './transferManager';

/**
 * Envoi d'un fichier par morceaux (POST /api/cdn/uploads, cf. synco_api
 * src/cdn/uploadSessionRoutes.ts) :
 *
 * 1. ouverture de session (le serveur vérifie droits et quota) ;
 * 2. chaque morceau est lu (File.slice, sans charger le fichier), chiffré
 *    dans le pool de workers si E2EE, puis envoyé — plusieurs à la fois,
 *    un morceau en échec est renvoyé seul ;
 * 3. finalisation, qui renvoie les métadonnées du fichier stocké.
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
}

/** Taille des parts d'un envoi non E2EE (chiffré côté serveur). */
const PLAIN_PART_SIZE = 4 * 1024 * 1024;
/** Morceaux d'un même fichier envoyés en parallèle (dans la limite globale de partSlots). */
const PARTS_PER_FILE = 4;

// Le File.type que renvoie le navigateur pour un .md n'est pas fiable
// (souvent vide selon l'OS) — on force un mimetype cohérent par
// extension plutôt que de dépendre de la détection du navigateur.
export function uploadMimeType(file: File): string {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown') return 'text/markdown';
    return file.type || 'application/octet-stream';
}

async function prepareE2EE(context: UploadContext): Promise<{ key: ChunkedFileKey; keyVersion: number } | null> {
    if (!context.workspaceId && !context.dmPeerId) return null;
    try {
        // Clé d'espace (partagée par tous les membres) ou de conversation
        // DM (partagée par exactement les 2 participants).
        const { key: kek, version } = context.workspaceId
            ? await getWorkspaceKey(context.workspaceId)
            : await getDMConversationKey(context.dmPeerId!);
        return { key: await createChunkedFileKey(kek), keyVersion: version };
    } catch (e) {
        // Comportement historique conservé : sans clé disponible (code PIN
        // non déverrouillé, clé d'espace introuvable…), l'envoi se fait en
        // chiffrement serveur plutôt que d'échouer.
        console.error("Failed to prepare E2EE for upload, falling back to server-side encryption:", e);
        return null;
    }
}

async function jsonOrThrow(res: Response, fallback: string): Promise<any> {
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `${fallback} (${res.status})`);
    return body;
}

export async function runChunkedUpload(file: File, context: UploadContext, handle: TransferHandle): Promise<any> {

    const { signal } = handle;
    const e2ee = await prepareE2EE(context);

    const chunkSize = e2ee ? E2EE_V2_CHUNK_SIZE : PLAIN_PART_SIZE;
    const partSize = e2ee ? chunkSize + GCM_TAG_LENGTH : chunkSize;
    const storedSize = e2ee ? encryptedSizeForPlain(file.size, chunkSize) : file.size;
    const partCount = chunkCountForPlain(file.size, chunkSize);

    const init = await jsonOrThrow(await sfetch('/api/cdn/uploads', {
        method: 'POST',
        body: JSON.stringify({
            orgId: openedOrg.value!.id,
            workspaceId: context.workspaceId,
            messageId: context.messageId,
            folderId: context.folderId,
            dmMessageId: context.dmMessageId,
            taskId: context.taskId,
            fileName: file.name,
            mimeType: uploadMimeType(file),
            size: storedSize,
            partSize,
            isE2EE: !!e2ee,
            ...(e2ee ? {
                encryptedFileKey: e2ee.key.encryptedFileKey,
                keyVersion: e2ee.keyVersion,
                iv: e2ee.key.iv,
            } : {}),
        }),
        signal,
    }), "Impossible de démarrer l'envoi");

    const uploadId: string = init.uploadId;
    if (init.partCount !== partCount) {
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
                const { start, end } = plainChunkRange(index, file.size, chunkSize);
                const slice = file.slice(start, end);
                const body = e2ee
                    ? new Blob([await encryptChunkInPool(e2ee.key.fileKey, e2ee.key.noncePrefix, index, index === partCount - 1, slice)])
                    : slice;
                if (parts.signal.aborted) throw new TransferCancelledError();
                const plainLength = end - start;

                await withRetry(() => putUploadPart(uploadId, index, body, parts.signal, (sent) => {
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
        return await jsonOrThrow(await sfetch(`/api/cdn/uploads/${uploadId}/complete`, { method: 'POST', signal }), "Échec de la finalisation de l'envoi");

    } catch (error) {
        parts.abort();
        // Session abandonnée côté serveur : fichier partiel supprimé, quota libéré.
        sfetch(`/api/cdn/uploads/${uploadId}`, { method: 'DELETE' }).catch(() => {});
        throw error;
    }
}
