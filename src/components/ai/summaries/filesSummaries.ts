import { cleanText } from '@/services/aiRuntime/plan/planLabels';
import type { Summarizer } from './summaryRegistry';

const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;
const id = (v: unknown): string => cleanText(v, 64) || 'identifiant absent';
/** Destination d'un déplacement : null = racine de l'espace ; sinon l'identifiant, l'app n'a pas l'arbre sous la main. */
const destination = (v: unknown): string => (v === null || v === undefined ? 'la racine de l’espace' : `le dossier ${id(v)}`);

export const summaries: Record<string, Summarizer> = {
    delete_file: a => `Supprimer définitivement le fichier ${id(a.fileId)} (irréversible)`,
    delete_folder: a => `Supprimer définitivement le dossier ${id(a.folderId)}, ses sous-dossiers et tous les fichiers qu’ils contiennent (irréversible)`,
    move_files: a => `Déplacer ${plural(count(a.fileIds), 'fichier', 'fichiers')} vers ${destination(a.toFolderId)}`,
    move_folders: a => `Déplacer ${plural(count(a.folderIds), 'dossier', 'dossiers')}, avec leur contenu, vers ${destination(a.toFolderId)}`,
    rename_folder: a => `Renommer le dossier ${id(a.folderId)} en « ${cleanText(a.name, 120)} »`,
    update_text_file: a => `Remplacer entièrement le contenu du fichier ${id(a.fileId)} (${typeof a.content === 'string' ? plural(a.content.length, 'caractère', 'caractères') : 'contenu absent'})`,
};
