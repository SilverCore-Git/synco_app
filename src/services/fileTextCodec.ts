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
    readonly code: 'file_changed' | 'not_text' | 'not_space_file' | 'too_large' | 'invalid_args';
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

