// Actions du gestionnaire de fichiers partagées entre l'UI (SpaceFiles.vue) et
// les outils de Synco AI (OrgAI.vue) : une seule implémentation, donc les mêmes
// routes, les mêmes permissions serveur et le même chiffrement E2EE.

import sfetch from '@/assets/utils/sfetch';
import { replaceFileContent, uploadFiles } from '@/assets/uploadFile';
import { fetchDecryptedFile, fetchFileMetadata, plainSizeOf } from '@/assets/utils/downloadFile';
import type { Folder, StoredFile } from '@/types/types';
import { buildFileName, extensionOf, findTextFormat, SUPPORTED_EXTENSIONS_LABEL } from '@/assets/utils/textFileFormats';
import { assertReadableByAgent, assertWritableByAgent, decodeUtf8Clipped, fileVersion, isTextFile, MAX_READ_SOURCE_BYTES, MAX_TEXT_BYTES, TextFileError } from './fileTextCodec';


export const createFolderRequest = async (
    spaceId: string,
    orgId: string,
    name: string,
    parentId?: string | null,
    /** `X-Synco-Plan: <planId>/<n>` quand un plan d'action crée le dossier (12 §8.5) ; sans effet sur les droits. */
    planHeader?: string
): Promise<Folder> => {

    const res = await sfetch(`/api/spaces/${spaceId}/folders`, {
        method: 'POST',
        ...(planHeader ? { headers: { 'X-Synco-Plan': planHeader } } : {}),
        body: JSON.stringify({
            orgId,
            name,
            parentId: !parentId || parentId === 'root' ? null : parentId
        })
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // `status` : un plan d'action distingue un refus de l'API (4xx/5xx) d'une erreur de transport.
        throw Object.assign(new Error(data.error || "Impossible de créer le dossier"), { status: res.status });
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
    /** `X-Synco-Plan: <planId>/<n>` quand un plan d'action crée le fichier (12 §8.5). */
    planHeader?: string;
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
            planHeader: options.planHeader,
        },
        options.onProgress
    );

    const stored = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (!stored?.id) throw new Error("Le fichier n'a pas pu être enregistré");

    return stored as StoredFile;

};


// ---------------------------------------------------------------------------
// Lecture et remplacement du contenu d'un fichier texte (outils `read_file`, `update_text_file`)
// ---------------------------------------------------------------------------

export interface ReadTextFileResult { id: string; name: string; spaceId?: string; version: string; content: string; truncated: boolean }

/** Métadonnées avant tout envoi : une erreur réseau ou un refus ici ne laisse rien d'écrit. */
async function metadataOf(fileId: string) {
    try {
        return await fetchFileMetadata(fileId);
    } catch {
        throw new TextFileError('metadata_unavailable');
    }
}

/**
 * Lit un fichier texte de l'org `orgId` : téléchargé et déchiffré sur l'appareil, le serveur ne voit jamais le
 * clair. `version` (empreinte opaque, jamais le blobId) est à repasser comme `baseVersion` à `updateTextFile`.
 */
export async function readTextFile(fileId: string, orgId: string, maxBytes = MAX_TEXT_BYTES): Promise<ReadTextFileResult> {
    const meta = await metadataOf(fileId);
    assertReadableByAgent(meta, orgId);
    if (!isTextFile(meta.originalName, meta.mimeType)) throw new TextFileError('not_text');
    if (plainSizeOf(meta) > MAX_READ_SOURCE_BYTES) throw new TextFileError('too_large');
    const { buffer, metadata } = await fetchDecryptedFile(fileId);
    // Le fichier a pu être remplacé pendant la lecture : on re-contrôle ce qui a été réellement lu.
    assertReadableByAgent(metadata, orgId);
    const { text, truncated } = decodeUtf8Clipped(new Uint8Array(buffer), Math.max(1, Math.min(maxBytes, MAX_TEXT_BYTES)));
    return {
        id: metadata.id, name: metadata.originalName, ...(metadata.workspaceId ? { spaceId: metadata.workspaceId } : {}),
        version: await fileVersion(metadata.id, metadata.blobId), content: text, truncated,
    };
}

/**
 * Remplace le contenu d'un fichier texte d'espace de l'org `orgId`, avec les mêmes droits et le même
 * chiffrement que l'éditeur (`replaceFileContent`). Refuse (`file_changed`) si le contenu stocké n'est plus
 * celui lu, au contrôle local ET côté API à la finalisation (`expectedBlobId`) : rien n'est écrit.
 * Rend `{ id, spaceId }`.
 */
export async function updateTextFile(
    fileId: string, orgId: string, content: string, baseVersion: string, planHeader?: string,
): Promise<{ id: string; spaceId: string }> {
    if (!baseVersion || new TextEncoder().encode(content).length > MAX_TEXT_BYTES) throw new TextFileError('invalid_args');
    const meta = await metadataOf(fileId);
    assertWritableByAgent(meta, orgId);
    if (!isTextFile(meta.originalName, meta.mimeType)) throw new TextFileError('not_text');
    if ((await fileVersion(fileId, meta.blobId)) !== baseVersion) throw new TextFileError('file_changed');
    try {
        await replaceFileContent(
            fileId,
            new Blob([content], { type: meta.mimeType }),
            meta.originalName,
            { workspaceId: meta.workspaceId!, dmPeerId: meta.dmPeerId, threadId: meta.threadId },
            { planHeader, expectedBlobId: meta.blobId },
        );
    } catch (e) {
        // 409 `file_changed` de l'API : le fichier a changé depuis la lecture, rien n'a été écrit.
        if ((e as { code?: unknown } | null)?.code === 'file_changed') throw new TextFileError('file_changed');
        throw e;
    }
    return { id: fileId, spaceId: meta.workspaceId! };
}
