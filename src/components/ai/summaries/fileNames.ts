/**
 * Mémoire des noms de fichiers et de dossiers vus dans la conversation (résultats de `list_files`,
 * `list_folders`, `read_file`…), pour que les cartes de confirmation montrent un nom et non un identifiant.
 * Texte seulement ; borné (une org compte des milliers de fichiers) ; l'identifiant reste le repli.
 */
const MAX_NAMES = 2000;
const files = new Map<string, string>();
const folders = new Map<string, string>();

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function put(map: Map<string, string>, id: unknown, name: unknown): void {
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name) return;
    map.delete(id);
    map.set(id, name);
    if (map.size > MAX_NAMES) map.delete(map.keys().next().value as string);
}

/** Retient les noms d'un résultat d'outil du domaine fichiers (les autres résultats sont ignorés). */
export function rememberFileNames(tool: string, result: unknown): void {
    if (!isRecord(result)) return;
    if (tool === 'read_file') put(files, result.id, result.name);
    if ((tool === 'list_files' || tool === 'list_org_files') && Array.isArray(result.files)) {
        for (const f of result.files) if (isRecord(f)) put(files, f.id, f.name);
    }
    if (tool === 'list_folders' && Array.isArray(result.folders)) {
        for (const f of result.folders) if (isRecord(f)) put(folders, f.id, f.name);
    }
    if (tool === 'rename_folder') put(folders, result.id, result.name);
}

export const knownFileName = (id: unknown): string | null => (typeof id === 'string' ? files.get(id) ?? null : null);
export const knownFolderName = (id: unknown): string | null => (typeof id === 'string' ? folders.get(id) ?? null : null);
export const forgetFileNames = (): void => { files.clear(); folders.clear(); };
