import { keycloak } from "../keycloak";
import { sfetch } from "./sfetch";
import { getWorkspaceKey } from "./workspaceCrypto";
import { decryptFileLocal } from "./crypto";

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
        if (!metadata.workspaceId) {
            throw new Error("Cannot decrypt E2EE file without a Workspace ID");
        }

        // 2. Fetch the raw encrypted file content
        const fileRes = await sfetch(`/api/cdn/download/${fileId}`, { method: 'GET' });
        if (!fileRes.ok) throw new Error("Failed to fetch encrypted file");
        
        const encryptedBuffer = await fileRes.arrayBuffer();

        // 3. Fetch the WorkspaceKey
        const { key: spaceKey } = await getWorkspaceKey(metadata.workspaceId);

        // 4. Decrypt the file
        if (!metadata.encryptedFileKey || !metadata.iv) {
            throw new Error("Missing E2EE metadata (key or iv) for file decryption");
        }

        const decryptedBuffer = await decryptFileLocal(
            encryptedBuffer, 
            metadata.encryptedFileKey, 
            metadata.iv, 
            spaceKey
        );

        // 5. Trigger download of decrypted file
        const blob = new Blob([decryptedBuffer], { type: metadata.mimeType });
        const objectUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = metadata.originalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up memory
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

    } catch (e) {
        console.error("Download Error:", e);
        alert("Erreur lors du téléchargement du fichier.");
    }

};
