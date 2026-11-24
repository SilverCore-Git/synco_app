/**
 * Modèle d'affichage des résultats d'outils du domaine Tâches (L15a). Pur et testable : la vue
 * `TasksResult.vue` ne fait que le rendre. Tout texte vient d'autres membres ; il n'est jamais rendu en HTML.
 */

export interface TaskRow {
    id: string;
    title: string;
    subtitle?: string;
    status?: string;
    /** Tâche brute, transmise telle quelle à `open-task`. */
    task: Record<string, unknown>;
}

export interface TaskGroup { id: string | null; title: string; rows: TaskRow[] }
export interface TagChip { id: string; name: string; color: string }

export type TasksResultView =
    | { kind: 'groups'; groups: TaskGroup[] }
    | { kind: 'tasks'; rows: TaskRow[] }
    | { kind: 'list'; id: string; title: string; subtitle?: string }
    | { kind: 'tags'; tags: TagChip[] }
    | { kind: 'file'; name: string }
    | { kind: 'message'; text: string };

const DEFAULT_TAG_COLOR = '#6366f1';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** Couleur d'étiquette sûre pour un style en ligne : un `#rrggbb` ou la couleur par défaut. */
export function safeTagColor(color: unknown): string {
    return typeof color === 'string' && HEX_COLOR.test(color) ? color : DEFAULT_TAG_COLOR;
}

export function taskRow(raw: unknown): TaskRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    return { id, title: str(raw.title) ?? 'Sans titre', subtitle: str(raw.description), status: str(raw.status), task: raw };
}

const rowsOf = (items: unknown): TaskRow[] =>
    Array.isArray(items) ? items.map(taskRow).filter((r): r is TaskRow => r !== null) : [];

export function statusIconOf(status?: string): string {
    if (status === 'DONE') return 'bi-check-circle-fill';
    if (status === 'IN_PROGRESS') return 'bi-arrow-repeat';
    return 'bi-circle';
}

const DONE_LABELS: Record<string, string> = {
    delete_task: 'Tâche supprimée.',
    delete_task_list: 'Liste supprimée.',
    delete_task_tag: 'Étiquette supprimée.',
    detach_file_from_task: 'Fichier détaché de la tâche.',
    reorder_my_tasks: 'Ordre de vos tâches mis à jour.',
};

export function buildTasksView(toolName: string, result: unknown): TasksResultView {
    switch (toolName) {
        case 'list_task_lists': {
            if (!isRecord(result)) return { kind: 'message', text: 'Aucune liste.' };
            const groups: TaskGroup[] = [];
            const unlisted = rowsOf(result.unlistedTasks);
            if (unlisted.length) groups.push({ id: null, title: 'Sans liste', rows: unlisted });
            for (const l of Array.isArray(result.lists) ? result.lists : []) {
                if (!isRecord(l)) continue;
                groups.push({ id: str(l.id) ?? null, title: str(l.title) ?? 'Sans titre', rows: rowsOf(l.tasks) });
            }
            return groups.length ? { kind: 'groups', groups } : { kind: 'message', text: 'Aucune liste.' };
        }
        case 'list_archived_tasks': {
            const rows = isRecord(result) ? rowsOf(result.archivedTasks) : [];
            return rows.length ? { kind: 'tasks', rows } : { kind: 'message', text: 'Aucune tâche archivée.' };
        }
        case 'update_task':
        case 'complete_task': {
            const row = taskRow(result);
            return row ? { kind: 'tasks', rows: [row] } : { kind: 'message', text: 'Tâche mise à jour.' };
        }
        case 'create_task_list':
        case 'update_task_list': {
            const id = isRecord(result) ? str(result.id) : undefined;
            if (!isRecord(result) || !id) return { kind: 'message', text: 'Liste enregistrée.' };
            return { kind: 'list', id, title: str(result.title) ?? 'Sans titre', subtitle: str(result.description) };
        }
        case 'list_task_tags':
        case 'create_task_tag':
        case 'update_task_tag': {
            const items = Array.isArray(result) ? result : [result];
            const tags = items.filter(isRecord).flatMap(t => {
                const id = str(t.id);
                return id ? [{ id, name: str(t.name) ?? '?', color: safeTagColor(t.color) }] : [];
            });
            return tags.length ? { kind: 'tags', tags } : { kind: 'message', text: 'Aucune étiquette.' };
        }
        case 'attach_file_to_task': {
            const file = isRecord(result) && isRecord(result.file) ? str(result.file.originalName) : undefined;
            return file ? { kind: 'file', name: file } : { kind: 'message', text: 'Fichier joint à la tâche.' };
        }
        default:
            return { kind: 'message', text: DONE_LABELS[toolName] ?? 'Terminé.' };
    }
}
