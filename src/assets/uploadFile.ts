import { enqueueTransfer } from "@/services/transfers/transferManager";
import { runChunkedUpload, type UploadContext } from "@/services/transfers/chunkedUpload";

export type { UploadContext };

/**
 * Envoie un fichier via le gestionnaire de transferts : il est mis en file,
 * envoyé par morceaux (chiffrés de bout en bout quand un espace ou un DM
 * est fourni) et apparaît dans le panneau des transferts. Résout avec les
 * métadonnées du fichier stocké.
 */
export default function uploadFile(
    file: File,
    context: UploadContext,
    onProgress?: (percent: number) => void
): Promise<any>
{
    return enqueueTransfer('upload', file.name, file.size, (handle) =>
        runChunkedUpload(file, context, {
            ...handle,
            setLoaded(loaded) {
                handle.setLoaded(loaded);
                if (onProgress) onProgress(file.size ? Math.round((loaded / file.size) * 100) : 100);
            },
        })
    ).promise;
}


/**
 * Envoie plusieurs fichiers. Ils sont tous mis en file d'un coup : le
 * gestionnaire en envoie quelques-uns en parallèle et fait attendre les
 * autres. La progression totale est pondérée par la taille des fichiers.
 */
export async function uploadFiles(
    files: File[],
    context: UploadContext,
    onTotalProgress?: (percent: number) => void
): Promise<any[]>
{
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const loadedPerFile = new Array(files.length).fill(0);

    const report = () => {
        if (!onTotalProgress) return;
        const loaded = loadedPerFile.reduce((a, b) => a + b, 0);
        onTotalProgress(totalBytes ? Math.round((loaded / totalBytes) * 100) : 100);
    };

    return Promise.all(files.map((file, index) =>
        uploadFile(file, context, (percent) => {
            loadedPerFile[index] = (percent / 100) * file.size;
            report();
        })
    ));
}
