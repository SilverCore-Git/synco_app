import keycloak from "./keycloak";
import { openedOrg } from "./var";

export interface UploadContext {
    workspaceId: string;
    messageId?: string;
    dmMessageId?: string;
}

export default async function uploadFile(
    file: File,
    context: UploadContext,
    onProgress?: (percent: number) => void
): Promise<any> 
{

    return new Promise((resolve, reject) => {

        const formData = new FormData();
        
        formData.append('file', file);

        formData.append('orgId', openedOrg.value!.id);
        formData.append('workspaceId', context.workspaceId);
        if (context.messageId) formData.append('messageId', context.messageId);
        if (context.dmMessageId) formData.append('dmMessageId', context.dmMessageId);

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

        xhr.open('POST', `${import.meta.env.VITE_API_URL}/api/upload`, true);

        xhr.setRequestHeader('Authorization', `Bearer ${keycloak.token}`);

        xhr.send(formData);

    });

}


export async function uploadFiles(
    files: File[],
    context: UploadContext,
    onTotalProgress?: (percent: number) => void
): Promise<any[]> {
    
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
