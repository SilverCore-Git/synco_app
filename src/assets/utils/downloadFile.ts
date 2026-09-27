import { keycloak } from "../keycloak";
import sfetch from "./sfetch";
import { getWorkspaceKey } from "./workspaceCrypto";
import { getDMConversationKey } from "./dmCrypto";
import { decryptFileLocal } from "./crypto";
import { useToast } from "@/composables/useToast";

// GET /api/cdn/meta/:id resolves `dmPeerId` server-side (the other DM
// participant) when the file is attached to a DMMessage, so callers never
// need to know/pass it themselves — see cdnRoutes.ts's /meta/:id handler.
const resolveFileKey = async (metadata: { workspaceId?: string; dmPeerId?: string }) => {
    if (metadata.workspaceId) return getWorkspaceKey(metadata.workspaceId);
    if (metadata.dmPeerId) return getDMConversationKey(metadata.dmPeerId);
    throw new Error("Cannot decrypt E2EE file: no workspace or DM conversation associated");
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
    const metaRes = await sfetch(`/api/cdn/meta/${fileId}`, { method: 'GET' });
    if (!metaRes.ok) throw new Error("Failed to fetch file metadata");
    const metadata = await metaRes.json();

    if (!metadata.isE2EE) {
        return {
            url: `${import.meta.env.VITE_API_URL}/api/cdn/download/${fileId}?token=Bearer ${keycloak.token}&inline=true`,
            isBlob: false
        };
    }

    const fileRes = await sfetch(`/api/cdn/download/${fileId}`, { method: 'GET' });
    if (!fileRes.ok) throw new Error("Failed to fetch encrypted file");
    const encryptedBuffer = await fileRes.arrayBuffer();

    const { key: kek } = await resolveFileKey(metadata);

    if (!metadata.encryptedFileKey || !metadata.iv) {
        throw new Error("Missing E2EE metadata (key or iv) for file decryption");
    }

    const decryptedBuffer = await decryptFileLocal(
        encryptedBuffer,
        metadata.encryptedFileKey,
        metadata.iv,
        kek
    );

    const blob = new Blob([decryptedBuffer], { type: metadata.mimeType });
    return { url: URL.createObjectURL(blob), isBlob: true };
};

export interface DecryptedFile {
    blob: Blob;
    name: string;
    mimeType: string;
}

// Récupère le contenu en clair d'un fichier stocké, déchiffrement E2EE compris.
// Utilisé par downloadFile() ci-dessous et par la construction d'archives ZIP
// (téléchargement de dossier), qui a besoin des octets et pas d'un lien.
export const fetchDecryptedFile = async (fileId: string): Promise<DecryptedFile> => {

    const metaRes = await sfetch(`/api/cdn/meta/${fileId}`, { method: 'GET' });
    if (!metaRes.ok) throw new Error("Failed to fetch file metadata");
    const metadata = await metaRes.json();

    const fileRes = await sfetch(`/api/cdn/download/${fileId}`, { method: 'GET' });
    if (!fileRes.ok) throw new Error("Failed to fetch file");

    const buffer = await fileRes.arrayBuffer();

    if (!metadata.isE2EE) {
        return {
            blob: new Blob([buffer], { type: metadata.mimeType }),
            name: metadata.originalName,
            mimeType: metadata.mimeType
        };
    }

    const { key: kek } = await resolveFileKey(metadata);

    if (!metadata.encryptedFileKey || !metadata.iv) {
        throw new Error("Missing E2EE metadata (key or iv) for file decryption");
    }

    const decryptedBuffer = await decryptFileLocal(
        buffer,
        metadata.encryptedFileKey,
        metadata.iv,
        kek
    );

    return {
        blob: new Blob([decryptedBuffer], { type: metadata.mimeType }),
        name: metadata.originalName,
        mimeType: metadata.mimeType
    };

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

export const downloadFile = async (fileId: string) => {
    
    try {
        // 1. Fetch metadata to check if it's E2EE
        const metaRes = await sfetch(`/api/cdn/meta/${fileId}`, { method: 'GET' });
        if (!metaRes.ok) throw new Error("Failed to fetch file metadata");
        
        const metadata = await metaRes.json();
        
        if (!metadata.isE2EE) {
            // Legacy / SSE download
            const link = document.createElement('a');
            link.href = `${import.meta.env.VITE_API_URL}/api/cdn/download/${fileId}?token=Bearer ${keycloak.token}`;
            link.target = '_blank'; 
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }

        // E2EE Download Flow

        // 2. Fetch the raw encrypted file content
        const fileRes = await sfetch(`/api/cdn/download/${fileId}`, { method: 'GET' });
        if (!fileRes.ok) throw new Error("Failed to fetch encrypted file");

        const encryptedBuffer = await fileRes.arrayBuffer();

        // 3. Fetch the KEK (workspace key or DM conversation key)
        const { key: kek } = await resolveFileKey(metadata);

        // 4. Decrypt the file
        if (!metadata.encryptedFileKey || !metadata.iv) {
            throw new Error("Missing E2EE metadata (key or iv) for file decryption");
        }

        const decryptedBuffer = await decryptFileLocal(
            encryptedBuffer,
            metadata.encryptedFileKey,
            metadata.iv,
            kek
        );

        // 5. Trigger download of decrypted file
        saveBlob(new Blob([decryptedBuffer], { type: metadata.mimeType }), metadata.originalName);

    } catch (e) {
        console.error("Download Error:", e);
        useToast().show("Erreur lors du téléchargement du fichier.", "error");
    }

};
