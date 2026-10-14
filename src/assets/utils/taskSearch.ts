import type { Task } from '@/types/types';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type TaskMatcher = (task: Task) => boolean;

/** Texte indexé d'une tâche : titre, description, tags, assignés, espace. */
const haystack = (task: Task): string[] => [
    task.title,
    task.description ?? '',
    ...(task.tags?.map(t => t.name) ?? []),
    ...(task.assignees?.map(a => a.name ?? '') ?? []),
    task.space?.name ?? '',
];

/**
 * Construit le prédicat de recherche du Kanban. Requête vide → null (pas de
 * filtre). Mode texte : insensible à la casse et aux accents, tous les mots
 * doivent être présents. Mode regex : insensible à la casse ; une regex
 * invalide renvoie `invalid: true` et aucun filtre (on garde le tableau
 * entier plutôt que de le vider pendant la saisie).
 */
export function buildTaskMatcher(query: string, useRegex: boolean): { matcher: TaskMatcher | null; invalid: boolean } {
    const q = query.trim();
    if (!q) return { matcher: null, invalid: false };

    if (useRegex) {
        let re: RegExp;
        try {
            re = new RegExp(q, 'i');
        } catch {
            return { matcher: null, invalid: true };
        }
        return { matcher: task => haystack(task).some(s => re.test(s)), invalid: false };
    }

    const words = normalize(q).split(/\s+/).filter(Boolean);
    return {
        matcher: task => {
            const text = normalize(haystack(task).join('\n'));
            return words.every(w => text.includes(w));
        },
        invalid: false,
    };
}
