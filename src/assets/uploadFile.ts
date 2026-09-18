import { keycloak } from "./keycloak";
import { openedOrg } from "./var";
import { encryptFileLocal } from "./utils/crypto";
import { getWorkspaceKey } from "./utils/workspaceCrypto";

export interface UploadContext {
    workspaceId?: string;
    messageId?: string;
    folderId?: string;
    dmMessageId?: string;
    taskId?: string;
}

export default async function uploadFile(
    file: File,
    context: UploadContext,
    onProgress?: (percent: number) => void
): Promise<any> 
{

    try {
        await keycloak.updateToken(60);
    } catch (e) {
        console.warn("Failed to refresh token before upload", e);
    }

    return new Promise(async (resolve, reject) => {

        const formData = new FormData();

        // Le File.type que renvoie le navigateur pour un .md n'est pas fiable
        // (souvent vide selon l'OS) — on force un mimetype cohérent par
        // extension plutôt que de dépendre de la détection du navigateur.
        const ext = file.name.split('.').pop()?.toLowerCase();
        const mimeOverride = (ext === 'md' || ext === 'markdown') ? 'text/markdown' : undefined;

        let finalFile = mimeOverride && file.type !== mimeOverride
            ? new File([file], file.name, { type: mimeOverride })
            : file;
        let isE2EE = false;
        let encryptedFileKeyBase64 = "";
        let ivBase64 = "";
        let keyVersion = 1;

        if (context.workspaceId) {
            try {
                // 1. Get the WorkspaceKey
                const { key: spaceKey, version } = await getWorkspaceKey(context.workspaceId);

                // 2. Encrypt the file locally
                const arrayBuffer = await file.arrayBuffer();
                const { encryptedBlob, encryptedFileKey, iv } = await encryptFileLocal(arrayBuffer, spaceKey);

                // 3. Prepare E2EE parameters
                finalFile = new File([encryptedBlob], file.name, { type: mimeOverride || file.type });
                isE2EE = true;
                encryptedFileKeyBase64 = encryptedFileKey;
                ivBase64 = iv;
                keyVersion = version;
            } catch (e) {
                console.error("Failed to encrypt file for upload:", e);
                // On pourrait décider de fallback sur du SSE, mais c'est mieux de fail si E2EE est requis
                // Fallback SSE for now if key generation fails
            }
        }

        formData.append('file', finalFile);

        formData.append('orgId', openedOrg.value!.id);
        if (context.workspaceId) formData.append('workspaceId', context.workspaceId);
        if (context.messageId) formData.append('messageId', context.messageId);
        if (context.folderId) formData.append('folderId', context.folderId);
        if (context.dmMessageId) formData.append('dmMessageId', context.dmMessageId);
        if (context.taskId) formData.append('taskId', context.taskId);

        if (isE2EE) {
            formData.append('isE2EE', 'true');
            formData.append('encryptedFileKey', encryptedFileKeyBase64);
            formData.append('keyVersion', String(keyVersion));
            formData.append('iv', ivBase64);
        }

        const xhr = new XMLHttpRequest();

        if (onProgress)
        {
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    onProgress(Math.round(percentComplete));
                }
            });
        }

        xhr.onload = () => {

            if (xhr.status >= 200 && xhr.status < 300) 
            {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch (e) {
                    resolve(xhr.responseText);
                }
            } 
            else 
            {
                reject(new Error(`Erreur serveur: ${xhr.status} ${xhr.statusText}`));
            }

        };

        xhr.onerror = () => reject(new Error("Erreur réseau ou connexion interrompue."));

        xhr.open('POST', `${import.meta.env.VITE_API_URL}/api/cdn/upload`, true);

        xhr.setRequestHeader('Authorization', `Bearer ${keycloak.token}`);

        xhr.send(formData);

    });

}


export async function uploadFiles(
    files: File[],
    context: UploadContext,
    onTotalProgress?: (percent: number) => void
): Promise<any[]> 
{
    
    const progressMap = new Array(files.length).fill(0);

    const uploadPromises = files.map((file, index) => {
        return uploadFile(
            file, 
            context, 
            (percent) => {
                progressMap[index] = percent;
                
                if (onTotalProgress) 
                {
                    const totalProgress = progressMap.reduce((a, b) => a + b, 0) / files.length;
                    onTotalProgress(Math.round(totalProgress));
                }
            }
        );
    });

    return Promise.all(uploadPromises);
    
}
