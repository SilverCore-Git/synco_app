/**
 * Modèle d'affichage des résultats d'outils du domaine Fichiers et dossiers (L15g). Pur et testable : la vue
 * `FilesResult.vue` ne fait que le rendre. Noms de fichiers et de dossiers viennent d'autres membres : texte
 * brut seulement, jamais de HTML. Le contenu lu par `read_file` n'est montré qu'en extrait.
 */

export interface FileRow { id: string; name: string; detail: string; icon: string }
export interface FolderRow { id: string; name: string }

export type FilesResultView =
    | { kind: 'files'; rows: FileRow[]; total?: number; truncated: boolean }
    | { kind: 'folders'; rows: FolderRow[]; truncated: boolean }
    | { kind: 'references'; file: string; threads: Array<{ id: string; name: string }>; messageCount: number; directMessageCount: number; truncated: boolean }
    | { kind: 'content'; name: string; excerpt: string; length: number; truncated: boolean }
    | { kind: 'message'; text: string };

const EXCERPT_CHARS = 400;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** Taille lisible, en octets binaires (Kio, Mio…). */
export function formatFileSize(size: unknown): string {
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return '';
    const units = ['o', 'Kio', 'Mio', 'Gio', 'Tio'];
    let n = size;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0).replace('.', ',')} ${units[i]}`;
}

export function fileIcon(mimeType: unknown, name: string): string {
    const mime = typeof mimeType === 'string' ? mimeType : '';
    if (mime.startsWith('image/')) return 'bi-file-earmark-image';
    if (mime.startsWith('video/')) return 'bi-file-earmark-play';
    if (mime.startsWith('audio/')) return 'bi-file-earmark-music';
    if (mime === 'application/pdf') return 'bi-file-earmark-pdf';
    if (mime.startsWith('text/') || /\.(txt|md|json|csv|log|xml|ya?ml)$/i.test(name)) return 'bi-file-earmark-text';
    return 'bi-file-earmark';
}

export function fileRow(raw: unknown): FileRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const name = str(raw.name) ?? 'Fichier privé';
    const size = formatFileSize(raw.size);
    const restricted = raw.restricted === true ? 'accès restreint' : '';
    return { id, name, detail: [size, restricted].filter(Boolean).join(' · '), icon: fileIcon(raw.mimeType, name) };
}

const DONE_LABELS: Record<string, string> = {
    update_text_file: 'Fichier mis à jour.',
    rename_folder: 'Dossier renommé.',
    delete_file: 'Fichier supprimé.',
    delete_folder: 'Dossier supprimé.',
};

export const isTruncated = (result: unknown): boolean => isRecord(result) && result.truncated === true;

export function buildFilesView(toolName: string, result: unknown): FilesResultView {
    const truncated = isTruncated(result);
    switch (toolName) {
        case 'list_files':
        case 'list_org_files': {
            const rows = isRecord(result) && Array.isArray(result.files) ? result.files.map(fileRow).filter((r): r is FileRow => r !== null) : [];
            if (!rows.length) return { kind: 'message', text: 'Aucun fichier.' };
            const total = isRecord(result) && typeof result.total === 'number' ? result.total : undefined;
            return { kind: 'files', rows, total, truncated };
        }
        case 'list_folders': {
            const rows = isRecord(result) && Array.isArray(result.folders)
                ? result.folders.flatMap((f): FolderRow[] => (isRecord(f) && str(f.id) ? [{ id: str(f.id)!, name: str(f.name) ?? 'Sans nom' }] : []))
                : [];
            return rows.length ? { kind: 'folders', rows, truncated } : { kind: 'message', text: 'Aucun dossier.' };
        }
        case 'list_file_references': {
            if (!isRecord(result)) return { kind: 'message', text: 'Aucune référence.' };
            const messages = Array.isArray(result.messages) ? result.messages.filter(isRecord) : [];
            const seen = new Map<string, string>();
            for (const m of messages) {
                const id = str(m.threadId);
                if (id && !seen.has(id)) seen.set(id, str(m.threadName) ?? 'Salon');
            }
            const directMessageCount = typeof result.directMessageCount === 'number' ? result.directMessageCount : 0;
            const file = isRecord(result.file) ? str(result.file.name) ?? 'Fichier' : 'Fichier';
            return {
                kind: 'references', file, messageCount: messages.length, directMessageCount, truncated,
                threads: [...seen].map(([id, name]) => ({ id, name })),
            };
        }
        case 'read_file': {
            if (!isRecord(result) || typeof result.content !== 'string') return { kind: 'message', text: 'Fichier lu.' };
            const content = result.content;
            return {
                kind: 'content', name: str(result.name) ?? 'Fichier', length: content.length, truncated,
                excerpt: content.length > EXCERPT_CHARS ? `${content.slice(0, EXCERPT_CHARS)}…` : content,
            };
        }
        case 'move_files':
        case 'move_folders': {
            const moved = isRecord(result) && typeof result.moved === 'number' ? result.moved : 0;
            const noun = toolName === 'move_files' ? ['fichier déplacé', 'fichiers déplacés'] : ['dossier déplacé', 'dossiers déplacés'];
            return { kind: 'message', text: `${moved} ${moved > 1 ? noun[1] : noun[0]}.` };
        }
        default:
            return { kind: 'message', text: DONE_LABELS[toolName] ?? 'Terminé.' };
    }
}
