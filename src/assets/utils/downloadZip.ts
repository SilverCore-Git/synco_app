import { fetchDecryptedFile, saveBlob } from './downloadFile';
import { createZipBlob, ZIP_MAX_BYTES, type ZipEntry } from './zip';

export interface ZipItem {
    // Chemin voulu dans l'archive, sans slash de fin (ex: "Rapports/bilan.pdf").
    path: string;
    // Absent pour un dossier (entrée de répertoire, utile pour garder les dossiers vides).
    fileId?: string;
    // Taille connue côté métadonnées, sert au garde-fou de taille et à la progression.
    size?: number;
}

// Déjà compressés : les repasser au deflate coûte du CPU pour ~0 gain.
const ALREADY_COMPRESSED = /^(image\/(?!svg)|video\/|audio\/)|zip|compressed|x-rar|x-7z|gzip/i;

// Deux fichiers peuvent porter le même nom dans un même dossier : un zip qui
// contient deux fois le même chemin est ambigu à l'extraction.
const dedupePath = (path: string, used: Set<string>): string => {

    if (!used.has(path)) {
        used.add(path);
        return path;
    }

    const dot = path.lastIndexOf('.');
    const base = dot > 0 ? path.slice(0, dot) : path;
    const ext = dot > 0 ? path.slice(dot) : '';

    let index = 2;
    let candidate = `${base} (${index})${ext}`;
    while (used.has(candidate)) {
        index++;
        candidate = `${base} (${index})${ext}`;
    }

    used.add(candidate);
    return candidate;

};

export interface ZipDownloadResult {
    // Fichiers qui n'ont pas pu être récupérés/déchiffrés : l'archive est
    // produite quand même, sans eux.
    failed: string[];
}

// Construit une archive des items demandés et déclenche son enregistrement.
// onProgress reçoit une progression 0-100 basée sur le nombre de fichiers traités.
export const downloadItemsAsZip = async (
    items: ZipItem[],
    zipName: string,
    onProgress?: (percent: number) => void
): Promise<ZipDownloadResult> => {

    const files = items.filter(item => item.fileId);

    const totalSize = files.reduce((total, item) => total + (item.size || 0), 0);
    if (totalSize > ZIP_MAX_BYTES) {
        throw new Error("ARCHIVE_TOO_LARGE");
    }

    const used = new Set<string>();
    const entries: ZipEntry[] = [];
    const failed: string[] = [];

    // Dossiers d'abord : garde les dossiers vides dans l'archive.
    for (const item of items) {
        if (!item.fileId) entries.push({ path: item.path.replace(/\/*$/, '') + '/' });
    }

    let done = 0;
    if (files.length === 0) onProgress?.(95);

    for (const item of files)
    {
        try {
            const { blob, mimeType } = await fetchDecryptedFile(item.fileId!);
            entries.push({
                path: dedupePath(item.path, used),
                data: blob,
                compress: !ALREADY_COMPRESSED.test(mimeType || '')
            });
        } catch (e) {
            console.error(`Zip: échec de récupération du fichier ${item.path}`, e);
            failed.push(item.path);
        }

        done++;
        // 95% pour les téléchargements, les 5% restants pour l'assemblage.
        onProgress?.(Math.round((done / files.length) * 95));

    }

    const blob = await createZipBlob(entries);
    onProgress?.(100);

    saveBlob(blob, zipName.toLowerCase().endsWith('.zip') ? zipName : `${zipName}.zip`);

    return { failed };

};

// Caractères refusés par Windows/macOS dans un nom de fichier.
export const sanitizeZipName = (name: string): string => {
    return (name.replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'archive');
};
