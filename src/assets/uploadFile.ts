import { enqueueTransfer } from "@/services/transfers/transferManager";
import { runChunkedUpload, type UploadContext } from "@/services/transfers/chunkedUpload";
import type { FileKeyContext } from "@/assets/utils/fileKeys";

export type { UploadContext };

/**
 * Envoie un fichier via le gestionnaire de transferts : il est mis en file,
 * chiffré de bout en bout par morceaux, envoyé au CDN et apparaît dans le
 * panneau des transferts. Résout avec les métadonnées du fichier stocké.
 *
 * Le contexte doit fournir une clé (espace, DM ou salon), sinon l'envoi
 * échoue (NoFileKeyError) : aucun fichier n'est stocké en clair.
 */
export default function uploadFile(
    file: File,
    context: UploadContext,
    onProgress?: (percent: number) => void
): Promise<any>
{
    return enqueueTransfer('upload', file.name, file.size, (handle) =>
        runChunkedUpload(file, file.name, { kind: 'create', context }, {
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
 * autres. La progression totale est pondérée par la taille des fichiers ;
 * `onFileProgress` reçoit celle de chaque fichier (index dans `files`).
 */
export async function uploadFiles(
    files: File[],
    context: UploadContext,
    onTotalProgress?: (percent: number) => void,
    onFileProgress?: (index: number, percent: number) => void
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
            onFileProgress?.(index, percent);
            report();
        })
    ));
}


/**
 * Remplace le contenu d'un fichier existant (éditeur texte) : nouvelle DEK,
 * envoi au CDN, puis l'API bascule le fichier sur le nouveau contenu sans
 * changer son identifiant. Résout avec les métadonnées à jour.
 */
export function replaceFileContent(
    fileId: string,
    content: Blob,
    name: string,
    keyContext: FileKeyContext
): Promise<any>
{
    return enqueueTransfer('upload', name, content.size, (handle) =>
        runChunkedUpload(content, name, { kind: 'replace', fileId, keyContext }, handle)
    ).promise;
}
