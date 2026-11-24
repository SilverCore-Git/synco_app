import { cleanText } from '@/services/aiRuntime/plan/planLabels';
import type { Summarizer } from './summaryRegistry';
import { knownFileName, knownFolderName } from './fileNames';

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const idText = (v: unknown): string => cleanText(v, 64) || 'identifiant absent';

/** « nom » quand l'app l'a vu dans la conversation, sinon l'identifiant en repli. */
const fileLabel = (id: unknown): string => { const n = knownFileName(id); return n ? `« ${cleanText(n, 80)} »` : `(identifiant ${idText(id)})`; };
const folderLabel = (id: unknown): string => { const n = knownFolderName(id); return n ? `« ${cleanText(n, 80)} »` : `(identifiant ${idText(id)})`; };
/** Liste de noms : les 5 premiers, puis le nombre restant. */
const listOf = (items: string[], label: (id: string) => string): string => {
    const shown = items.slice(0, 5).map(label).join(', ');
    return items.length > 5 ? `${shown} et ${items.length - 5} autre${items.length - 5 > 1 ? 's' : ''}` : shown;
};
const destination = (v: unknown): string => (v === null || v === undefined ? 'la racine de l’espace' : `le dossier ${folderLabel(v)}`);

export const summaries: Record<string, Summarizer> = {
    delete_file: a => `Supprimer définitivement le fichier ${fileLabel(a.fileId)} (irréversible)`,
    delete_folder: a => `Supprimer définitivement le dossier ${folderLabel(a.folderId)}, ses sous-dossiers et tous les fichiers qu’ils contiennent (irréversible)`,
    move_files: a => `Déplacer ${plural(ids(a.fileIds).length, 'fichier', 'fichiers')} (${listOf(ids(a.fileIds), fileLabel)}) vers ${destination(a.toFolderId)}`,
    move_folders: a => `Déplacer ${plural(ids(a.folderIds).length, 'dossier', 'dossiers')} (${listOf(ids(a.folderIds), folderLabel)}), avec leur contenu, vers ${destination(a.toFolderId)}`,
    rename_folder: a => `Renommer le dossier ${folderLabel(a.folderId)} en « ${cleanText(a.name, 120)} »`,
    update_text_file: a => `Remplacer entièrement le contenu du fichier ${fileLabel(a.fileId)} (${typeof a.content === 'string' ? plural(a.content.length, 'caractère', 'caractères') : 'contenu absent'})`,
};
