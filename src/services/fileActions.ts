// Actions du gestionnaire de fichiers partagées entre l'UI (SpaceFiles.vue) et
// les outils de Synco AI (OrgAI.vue) : une seule implémentation, donc les mêmes
// routes, les mêmes permissions serveur et le même chiffrement E2EE.

import sfetch from '@/assets/utils/sfetch';
import { uploadFiles } from '@/assets/uploadFile';
import type { Folder, StoredFile } from '@/types/types';
import { buildFileName, extensionOf, findTextFormat, SUPPORTED_EXTENSIONS_LABEL } from '@/assets/utils/textFileFormats';

export const createFolderRequest = async (
    spaceId: string,
    orgId: string,
    name: string,
    parentId?: string | null
): Promise<Folder> => {

    const res = await sfetch(`/api/spaces/${spaceId}/folders`, {
        method: 'POST',
        body: JSON.stringify({
            orgId,
            name,
            parentId: !parentId || parentId === 'root' ? null : parentId
        })
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Impossible de créer le dossier");
    }

    return await res.json();

};

export interface CreateTextFileOptions {
    spaceId: string;
    /** Nom voulu, avec ou sans extension (elle est ajoutée depuis `ext` si absente). */
    name: string;
    /** Extension cible ; déduite du nom quand elle n'est pas fournie. */
    ext?: string;
    content?: string;
    folderId?: string | null;
    onProgress?: (percent: number) => void;
}

// Crée un fichier texte UTF-8 et le pousse par la voie normale d'upload, donc
// chiffré de bout en bout comme n'importe quel fichier déposé à la main.
export const createTextFile = async (options: CreateTextFileOptions): Promise<StoredFile> => {

    const requestedExt = (options.ext || extensionOf(options.name)).replace(/^\./, '').toLowerCase();

    if (!requestedExt) {
        throw new Error(`Extension manquante. Formats supportés : ${SUPPORTED_EXTENSIONS_LABEL}`);
    }

    const format = findTextFormat(requestedExt);

    if (!format) {
        throw new Error(`Format « .${requestedExt} » non supporté. Formats supportés : ${SUPPORTED_EXTENSIONS_LABEL}`);
    }

    const fileName = buildFileName(options.name, format.ext);

    // Le BOM n'est pas ajouté : l'UTF-8 sans BOM est ce qu'attendent Monaco et
    // les outils en ligne de commande.
    const file = new File([options.content ?? ''], fileName, { type: format.mimeType });

    const uploaded = await uploadFiles(
        [file],
        {
            workspaceId: options.spaceId,
            folderId: !options.folderId || options.folderId === 'root' ? undefined : options.folderId,
        },
        options.onProgress
    );

    const stored = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (!stored?.id) throw new Error("Le fichier n'a pas pu être enregistré");

    return stored as StoredFile;

};
