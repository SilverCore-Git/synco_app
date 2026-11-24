/**
 * Parties pures de la lecture et du remplacement d'un fichier texte par l'agent (`fileActions.ts`) : bornes,
 * découpe UTF-8, refus avant envoi. Séparées pour être testables sans navigateur.
 */
import { extensionOf, findTextFormat } from '@/assets/utils/textFileFormats';

/** Au-delà, le fichier n'est même pas téléchargé : l'agent lit au plus 256 Kio (09 §4). */
export const MAX_TEXT_BYTES = 262144;
/** Un fichier plus gros que cela (en clair) n'est pas lu en mémoire pour en rendre un extrait. */
export const MAX_READ_SOURCE_BYTES = 8 * 1024 * 1024;

/** Refus avant tout envoi (rien n'a été écrit) : `code` suit les codes d'échec du plan (12 §4.2). */
export class TextFileError extends Error {
    readonly code: 'file_changed' | 'not_text' | 'not_space_file' | 'not_in_org' | 'not_readable' | 'too_large' | 'invalid_args' | 'metadata_unavailable';
    constructor(code: TextFileError['code']) {
        super(code);
        this.code = code;
        this.name = 'TextFileError';
    }
}

export const isTextFile = (name: string, mimeType: string): boolean =>
    !!findTextFormat(extensionOf(name)) || mimeType.startsWith('text/');

/** Coupe des octets UTF-8 à `maxBytes` sans laisser de caractère coupé en deux. */
export function decodeUtf8Clipped(bytes: Uint8Array, maxBytes: number): { text: string; truncated: boolean } {
    if (bytes.length <= maxBytes) return { text: new TextDecoder().decode(bytes), truncated: false };
    let end = maxBytes;
    // Un octet de continuation (10xxxxxx) appartient au caractère précédent : on recule jusqu'à son début.
    while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
    return { text: new TextDecoder().decode(bytes.subarray(0, end)), truncated: true };
}


/** Rattachements d'un fichier tels que `GET /api/cdn/meta/:id` les rend. */
export interface FileScope {
    orgId?: string | null;
    workspaceId?: string | null;
    messageId?: string | null;
    dmMessageId?: string | null;
    taskId?: string | null;
    supportTicketId?: string | null;
    supportMessageId?: string | null;
}

/**
 * Lecture : seulement un fichier de l'org de la conversation, jamais une pièce jointe de message privé ni de
 * support (EX-13 : ces contenus ne passent pas par l'agent). L'org est comparée à celle de la conversation :
 * l'identifiant vient du modèle.
 */
export function assertReadableByAgent(meta: FileScope, orgId: string): void {
    if (!meta.orgId || meta.orgId !== orgId) throw new TextFileError('not_in_org');
    if (meta.dmMessageId || meta.supportTicketId || meta.supportMessageId) throw new TextFileError('not_readable');
}

/** Écriture : seulement un fichier d'espace, sans rattachement à un message, une tâche ou un MP. */
export function assertWritableByAgent(meta: FileScope, orgId: string): void {
    assertReadableByAgent(meta, orgId);
    if (meta.messageId || meta.taskId || meta.dmMessageId) throw new TextFileError('not_space_file');
    if (!meta.workspaceId) throw new TextFileError('not_space_file');
}

/**
 * `version` rendue au modèle : empreinte opaque de (fichier, contenu). L'identifiant de blob lui-même n'est
 * jamais exposé ; l'app la recalcule pour comparer à `baseVersion`.
 */
export async function fileVersion(fileId: string, blobId: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${fileId}\u001f${blobId}`)));
    return [...digest.subarray(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('');
}
