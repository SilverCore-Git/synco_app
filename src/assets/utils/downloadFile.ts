import { keycloak } from "../keycloak";
import sfetch from "./sfetch";
import { getWorkspaceKey } from "./workspaceCrypto";
import { getDMConversationKey } from "./dmCrypto";
import { decryptStoredFile } from "./chunkedCrypto";
import { isChunkedIv } from "./chunkedCryptoCore";
import { useToast } from "@/composables/useToast";
import { enqueueTransfer, isAbortError } from "@/services/transfers/transferManager";
import { fetchWholeFile } from "@/services/transfers/http";
import {
    BlobSink,
    MemorySink,
    chunkedPlainSize,
    pickFileSystemSink,
    runChunkedDownload,
    type DownloadSink,
} from "@/services/transfers/chunkedDownload";

// Subset of GET /api/cdn/meta/:id this module relies on.
export interface FileMetadata {
    originalName: string;
    mimeType: string;
    size: number;
    isE2EE?: boolean;
    encryptedFileKey?: string | null;
    iv?: string | null;
    workspaceId?: string;
    dmPeerId?: string;
}

// Au-delà, un fichier E2EE v2 est écrit directement sur le disque (si le
// navigateur le permet) plutôt qu'assemblé en mémoire.
const STREAM_TO_DISK_THRESHOLD = 256 * 1024 * 1024;

// GET /api/cdn/meta/:id resolves `dmPeerId` server-side (the other DM
// participant) when the file is attached to a DMMessage, so callers never
// need to know/pass it themselves — see cdnRoutes.ts's /meta/:id handler.
const resolveFileKey = async (metadata: FileMetadata) => {
    if (metadata.workspaceId) return getWorkspaceKey(metadata.workspaceId);
    if (metadata.dmPeerId) return getDMConversationKey(metadata.dmPeerId);
    throw new Error("Cannot decrypt E2EE file: no workspace or DM conversation associated");
};

const e2eeFields = (metadata: FileMetadata) => {
    if (!metadata.encryptedFileKey || !metadata.iv) {
        throw new Error("Missing E2EE metadata (key or iv) for file decryption");
    }
    return { encryptedFileKey: metadata.encryptedFileKey, iv: metadata.iv };
};

const fetchMetadata = async (fileId: string): Promise<FileMetadata> => {
    const metaRes = await sfetch(`/api/cdn/meta/${fileId}`, { method: 'GET' });
    if (!metaRes.ok) throw new Error("Failed to fetch file metadata");
    return metaRes.json();
};

const fetchRawFile = async (fileId: string): Promise<ArrayBuffer> => {
    const fileRes = await sfetch(`/api/cdn/download/${fileId}`, { method: 'GET' });
    if (!fileRes.ok) throw new Error("Failed to fetch file");
    return fileRes.arrayBuffer();
};

// Plaintext bytes of a stored file, decrypted client-side when E2EE. Always
// goes through the Authorization header, never a ?token= URL — used by
// in-chat media previews (bytes end up in a blob: URL anyway) and folder ZIP
// archives, which need the bytes rather than a link. E2EE v2 files are
// fetched in parallel ranged chunks.
export const fetchDecryptedFile = async (fileId: string, signal?: AbortSignal): Promise<{ buffer: ArrayBuffer; metadata: FileMetadata }> => {
    const metadata = await fetchMetadata(fileId);

    if (!metadata.isE2EE) {
        return { buffer: await fetchRawFile(fileId), metadata };
    }

    const fields = e2eeFields(metadata);
    const { key: kek } = await resolveFileKey(metadata);

    if (isChunkedIv(fields.iv)) {
        const sink = new MemorySink(chunkedPlainSize({ size: metadata.size, iv: fields.iv }));
        await runChunkedDownload(fileId, { size: metadata.size, ...fields }, kek, sink, signal ?? new AbortController().signal);
        return { buffer: sink.bytes.buffer as ArrayBuffer, metadata };
    }

    return { buffer: await decryptStoredFile(await fetchRawFile(fileId), fields, kek), metadata };
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
    // true when `url` is a blob: URL the caller must URL.revokeObjectURL() when done with it
    isBlob: boolean;
}

// Resolves a displayable URL for a stored file (e.g. an <img> src), handling
// E2EE decryption the same way downloadFile() does below — reused wherever a
// file needs to be *shown* rather than saved to disk (task attachment
// thumbnails, linked-file previews).
export const getFilePreviewUrl = async (fileId: string): Promise<FilePreview> => {
    const metadata = await fetchMetadata(fileId);

    if (!metadata.isE2EE) {
        return {
            url: `${import.meta.env.VITE_API_URL}/api/cdn/download/${fileId}?token=Bearer ${keycloak.token}&inline=true`,
            isBlob: false
        };
    }

    const { buffer } = await fetchDecryptedFile(fileId);
    const blob = new Blob([buffer], { type: metadata.mimeType });
    return { url: URL.createObjectURL(blob), isBlob: true };
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
        const metadata = await fetchMetadata(fileId);

        if (!metadata.isE2EE) {
            // Chiffrement serveur : le navigateur télécharge directement le
            // flux déchiffré par l'API (gestionnaire de téléchargements natif).
            const link = document.createElement('a');
            link.href = `${import.meta.env.VITE_API_URL}/api/cdn/download/${fileId}?token=Bearer ${keycloak.token}`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }

        const fields = e2eeFields(metadata);
        const chunked = isChunkedIv(fields.iv);
        const plainSize = chunked ? chunkedPlainSize({ size: metadata.size, iv: fields.iv }) : Number(metadata.size);

        // Choix de la destination tout de suite : la boîte « Enregistrer
        // sous » exige un geste utilisateur récent (le clic), qui expire
        // pendant un long téléchargement.
        let fsSink: DownloadSink | null = null;
        if (chunked && plainSize >= STREAM_TO_DISK_THRESHOLD) {
            const picked = await pickFileSystemSink(metadata.originalName);
            if (picked === 'cancelled') return;
            fsSink = picked;
        }

        const { promise } = enqueueTransfer('download', metadata.originalName, plainSize, async (handle) => {
            const { key: kek } = await resolveFileKey(metadata);

            if (!chunked) {
                // Format v1 : un seul bloc chiffré, déchiffré en mémoire.
                const raw = await fetchWholeFile(fileId, handle.signal, (received) => handle.setLoaded(Math.min(received, plainSize)));
                handle.setFinalizing();
                const plain = await decryptStoredFile(raw, fields, kek);
                saveBlob(new Blob([plain], { type: metadata.mimeType }), metadata.originalName);
                return;
            }

            const sink = fsSink ?? new BlobSink();
            try {
                await runChunkedDownload(fileId, { size: metadata.size, ...fields }, kek, sink, handle.signal, (loaded) => handle.setLoaded(loaded));
                handle.setFinalizing();
                await sink.close();
            } catch (error) {
                await sink.abort();
                throw error;
            }

            if (sink instanceof BlobSink) {
                saveBlob(sink.toBlob(metadata.mimeType), metadata.originalName);
            }
        });

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
