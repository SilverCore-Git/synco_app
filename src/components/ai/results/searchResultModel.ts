/**
 * Modèle d'affichage des résultats d'outils du domaine Recherche (L15-search) : `search_everything`,
 * `get_context_item`, `resolve_mentions`. Pur et testable : `SearchResult.vue` ne fait que le rendre.
 * Titres, noms et extraits viennent d'autres membres : texte brut seulement, jamais de HTML.
 */

export interface SearchRow { ref: string; icon: string; title: string; snippet: string; module: string; date: string }
export interface DetailLine { label: string; value: string }

export type SearchResultView =
    | { kind: 'hits'; rows: SearchRow[]; truncated: boolean; notes: string[] }
    | { kind: 'item'; icon: string; title: string; module: string; lines: DetailLine[] }
    | { kind: 'message'; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const SNIPPET_VIEW_MAX = 300;

export const MODULE_LABELS: Record<string, string> = {
    messages: 'Messages', files: 'Fichiers', tasks: 'Tâches', events: 'Agenda', threads: 'Salons',
    spaces: 'Espaces', members: 'Membres', reports: 'Rapports',
};

const KIND_MODULE: Record<string, string> = {
    task: 'tasks', event: 'events', thread: 'threads', space: 'spaces', member: 'members', file: 'files', folder: 'files', report: 'reports',
};

const KIND_ICONS: Record<string, string> = {
    task: 'bi-check2-square', event: 'bi-calendar-event', thread: 'bi-hash', space: 'bi-folder', member: 'bi-person',
    file: 'bi-file-earmark', folder: 'bi-folder2', report: 'bi-envelope-paper',
};

/** `task:abc` → `task` ; tout ce qui n'est pas de la forme `type:id` → ''. */
export const kindOfRef = (ref: string): string => {
    const at = ref.indexOf(':');
    return at > 0 ? ref.slice(0, at) : '';
};

export const iconForKind = (kind: string): string => KIND_ICONS[kind] ?? 'bi-search';

/** Jour lisible (« 3 déc. 2026 ») d'une date ISO ; vide si elle est absente ou invalide. */
export function shortDate(value: unknown): string {
    const s = str(value);
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function hitRow(raw: unknown): SearchRow | null {
    if (!isRecord(raw)) return null;
    const ref = str(raw.ref);
    if (!ref) return null;
    const kind = kindOfRef(ref);
    if (!KIND_MODULE[kind]) return null;
    const module = MODULE_LABELS[str(raw.module) ?? KIND_MODULE[kind]!] ?? '';
    const snippet = (str(raw.snippet) ?? '').slice(0, SNIPPET_VIEW_MAX);
    return { ref, icon: iconForKind(kind), title: str(raw.title) ?? str(raw.label) ?? 'Sans titre', snippet, module, date: shortDate(raw.updatedAt) };
}

const SKIP_NOTES: Record<string, string> = {
    module_disabled: 'module désactivé',
    no_access: 'accès refusé',
    not_space_scoped: 'hors espace',
    error: 'erreur',
};

function notesOf(result: Record<string, unknown>): string[] {
    const notes: string[] = [];
    if (isRecord(result.messages) && result.messages.delegated === true) notes.push('Messages : recherche lancée à part (contenu chiffré).');
    if (Array.isArray(result.skipped)) {
        for (const s of result.skipped) {
            if (!isRecord(s)) continue;
            const module = MODULE_LABELS[str(s.module) ?? ''];
            const reason = SKIP_NOTES[str(s.reason) ?? ''];
            if (module && reason) notes.push(`${module} ignoré : ${reason}.`);
        }
    }
    return notes;
}

const LINE_LABELS: Array<[key: string, label: string]> = [
    ['status', 'Statut'], ['dueDate', 'Échéance'], ['location', 'Lieu'], ['startAt', 'Début'], ['endAt', 'Fin'], ['type', 'Type'],
    ['mimeType', 'Format'], ['job', 'Poste'], ['rhythm', 'Rythme'], ['nextRunAt', 'Prochain envoi'],
];

function itemView(result: Record<string, unknown>): SearchResultView {
    const kind = str(result.kind) ?? kindOfRef(str(result.ref) ?? '');
    const title = str(result.title) ?? str(result.name) ?? str(result.pseudo);
    if (!title) return { kind: 'message', text: 'Élément introuvable.' };
    const lines: DetailLine[] = [];
    const description = str(result.description);
    if (description) lines.push({ label: 'Description', value: description.slice(0, SNIPPET_VIEW_MAX) });
    for (const [key, label] of LINE_LABELS) {
        const v = result[key];
        const text = key.endsWith('At') || key === 'dueDate' ? shortDate(v) || str(v) : str(v);
        if (text) lines.push({ label, value: text });
    }
    for (const [key, label] of [['memberCount', 'Membres'], ['attendeeCount', 'Invités'], ['attachmentCount', 'Pièces jointes']] as const) {
        const n = num(result[key]);
        if (n !== undefined) lines.push({ label, value: String(n) });
    }
    if (result.restricted === true) lines.push({ label: 'Accès', value: 'restreint' });
    return { kind: 'item', icon: iconForKind(kind), title, module: MODULE_LABELS[KIND_MODULE[kind] ?? ''] ?? '', lines };
}

export function buildSearchView(toolName: string, result: unknown): SearchResultView {
    if (!isRecord(result)) return { kind: 'message', text: toolName === 'get_context_item' ? 'Élément introuvable.' : 'Aucun résultat.' };
    switch (toolName) {
        case 'get_context_item':
            return itemView(result);
        case 'resolve_mentions': {
            const rows = Array.isArray(result.matches) ? result.matches.map(hitRow).filter((r): r is SearchRow => r !== null) : [];
            return rows.length ? { kind: 'hits', rows, truncated: result.truncated === true, notes: [] } : { kind: 'message', text: 'Aucune correspondance.' };
        }
        case 'search_everything': {
            const rows = Array.isArray(result.hits) ? result.hits.map(hitRow).filter((r): r is SearchRow => r !== null) : [];
            const notes = notesOf(result);
            if (!rows.length) return { kind: 'message', text: ['Aucun résultat.', ...notes].join(' ') };
            return { kind: 'hits', rows, truncated: result.truncated === true, notes };
        }
        default:
            return { kind: 'message', text: 'Résultat de recherche.' };
    }
}
