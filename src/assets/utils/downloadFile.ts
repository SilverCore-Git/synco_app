import sfetch from "./sfetch";
import { resolveFileKek } from "./fileKeys";
import { useToast } from "@/composables/useToast";
import { enqueueTransfer, isAbortError } from "@/services/transfers/transferManager";
import { FileChangedError, type DownloadTicket } from "@/services/transfers/cdn";
import {
    BlobSink,
    MemorySink,
    chunkedPlainSize,
    pickFileSystemSink,
    runChunkedDownload,
    type DownloadSink,
} from "@/services/transfers/chunkedDownload";

/**
 * Lecture des fichiers stockés. Tout fichier est chiffré de bout en bout
 * (format v2) et servi par synco_cdn : GET /api/cdn/meta/:id fournit les
 * métadonnées, la clé emballée et un ticket de téléchargement ; le contenu
 * est récupéré par morceaux et déchiffré ici.
 */

// Subset of GET /api/cdn/meta/:id this module relies on.
export interface FileMetadata {
    id: string;
    blobId: string;
    originalName: string;
    mimeType: string;
    /** Taille stockée (chiffrée). */
    size: number;
    encryptedFileKey: string;
    keyVersion: number;
    iv: string;
    workspaceId?: string | null;
    // Résolus par l'API : l'autre participant d'une conversation DM, le
    // salon d'une pièce jointe hors espace (cf. synco_api cdnRoutes.ts).
    dmPeerId?: string;
    threadId?: string;
    download?: DownloadTicket;
}

// Au-delà, un fichier est écrit directement sur le disque (si le navigateur
// le permet) plutôt qu'assemblé en mémoire.
const STREAM_TO_DISK_THRESHOLD = 256 * 1024 * 1024;

export const fetchFileMetadata = async (fileId: string): Promise<FileMetadata> => {
    const metaRes = await sfetch(`/api/cdn/meta/${fileId}`, { method: 'GET' });
    if (!metaRes.ok) throw new Error("Failed to fetch file metadata");
    return metaRes.json();
};

/** Taille en clair, à partir des métadonnées. */
export const plainSizeOf = (metadata: Pick<FileMetadata, 'size' | 'iv'>) => chunkedPlainSize(metadata);

/** KEK du fichier, selon son contexte (espace, DM, salon). */
export const fileKekOf = async (metadata: FileMetadata) =>
    (await resolveFileKek({ workspaceId: metadata.workspaceId, dmPeerId: metadata.dmPeerId, threadId: metadata.threadId })).key;

/**
 * Exécute `run` ; si le fichier a été remplacé pendant la lecture (édition
 * par un autre membre), recommence une fois avec les nouvelles métadonnées.
 */
async function withFreshContent<T>(fileId: string, first: FileMetadata, run: (metadata: FileMetadata) => Promise<T>): Promise<T> {
    try {
        return await run(first);
    } catch (error) {
        if (!(error instanceof FileChangedError)) throw error;
        return run(await fetchFileMetadata(fileId));
    }
}

// Contenu en clair d'un fichier stocké, en mémoire — pour les aperçus (les
// octets finissent dans une URL blob:), l'éditeur texte, le filigrane et les
// archives ZIP. Récupéré par morceaux en parallèle.
export const fetchDecryptedFile = async (fileId: string, signal?: AbortSignal): Promise<{ buffer: ArrayBuffer; metadata: FileMetadata }> => {
    return withFreshContent(fileId, await fetchFileMetadata(fileId), async (metadata) => {
        const sink = new MemorySink(plainSizeOf(metadata));
        await runChunkedDownload(metadata, await fileKekOf(metadata), sink, signal ?? new AbortController().signal);
        return { buffer: sink.bytes.buffer as ArrayBuffer, metadata };
    });
};

// Saves an already-decrypted blob: URL to disk (e.g. a media preview on
// screen) instead of fetching + decrypting the file a second time.
export const saveObjectUrl = (objectUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export interface FilePreview {
    url: string;
    // Toujours une URL blob: (contenu déchiffré localement) : l'appelant doit
    // la libérer par URL.revokeObjectURL() quand il n'en a plus besoin.
    isBlob: true;
}

// URL affichable d'un fichier stocké (src d'une <img>, d'une <iframe>…).
export const getFilePreviewUrl = async (fileId: string): Promise<FilePreview> => {
    const { buffer, metadata } = await fetchDecryptedFile(fileId);
    return { url: URL.createObjectURL(new Blob([buffer], { type: metadata.mimeType })), isBlob: true };
};

// Déclenche l'enregistrement d'un Blob sous un nom donné.
export const saveBlob = (blob: Blob, fileName: string) => {

    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

};

/**
 * Télécharge un fichier sur le disque de l'utilisateur.
 *
 * Rend la main dès que le téléchargement est en file (il apparaît dans le
 * panneau des transferts) : plusieurs fichiers se téléchargent en
 * parallèle. Les erreurs sont signalées par un toast.
 */
export const downloadFile = async (fileId: string) => {

    const toast = useToast();

    try {
        const metadata = await fetchFileMetadata(fileId);
        const plainSize = plainSizeOf(metadata);

        // Choix de la destination tout de suite : la boîte « Enregistrer
        // sous » exige un geste utilisateur récent (le clic), qui expire
        // pendant un long téléchargement.
        let fsSink: DownloadSink | null = null;
        if (plainSize >= STREAM_TO_DISK_THRESHOLD) {
            const picked = await pickFileSystemSink(metadata.originalName);
            if (picked === 'cancelled') return;
            fsSink = picked;
        }

        const { promise } = enqueueTransfer('download', metadata.originalName, plainSize, (handle) =>
            withFreshContent(fileId, metadata, async (current) => {
                // Une nouvelle tentative repart d'une destination neuve.
                const sink = fsSink && current === metadata ? fsSink : new BlobSink();
                try {
                    await runChunkedDownload(current, await fileKekOf(current), sink, handle.signal, (loaded) => handle.setLoaded(loaded));
                    handle.setFinalizing();
                    await sink.close();
                } catch (error) {
                    await sink.abort();
                    throw error;
                }
                if (sink instanceof BlobSink) {
                    saveBlob(sink.toBlob(current.mimeType), current.originalName);
                }
            })
        );

        promise.catch((e) => {
            if (isAbortError(e)) return;
            console.error("Download Error:", e);
            toast.show(`Erreur lors du téléchargement de « ${metadata.originalName} ».`, "error");
        });

    } catch (e) {
        console.error("Download Error:", e);
        toast.show("Erreur lors du téléchargement du fichier.", "error");
    }

};
