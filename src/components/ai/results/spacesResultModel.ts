/**
 * Modèle d'affichage des résultats d'outils du domaine Espaces (L15c). Pur et testable : `SpacesResult.vue`
 * ne fait que le rendre. Tout nom vient d'autres membres ; il n'est jamais rendu en HTML.
 */

export interface ResultCard { id: string; icon: string; title: string; subtitle?: string }
export interface StatRow { label: string; value: string }

export type SpacesResultView =
    | { kind: 'cards'; cards: ResultCard[] }
    | { kind: 'stats'; rows: StatRow[] }
    | { kind: 'message'; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

const MESSAGES: Record<string, string> = {
    remove_space_members: 'Membres retirés de l\'espace.',
    leave_space: 'Espace quitté.',
    delete_space: 'Espace supprimé.',
};

const KPI_LABELS: Array<[key: string, label: string]> = [
    ['total', 'Total'], ['todo', 'À faire'], ['inProgress', 'En cours'], ['done', 'Terminées'], ['overdue', 'En retard'],
    ['created', 'Créées sur la période'], ['completed', 'Terminées sur la période'], ['files', 'Fichiers'], ['totalBytes', 'Octets'],
];

export function buildSpacesView(toolName: string, result: unknown): SpacesResultView {
    if (toolName === 'get_space') {
        if (!isRecord(result)) return { kind: 'message', text: 'Espace introuvable.' };
        const id = str(result.id);
        if (!id) return { kind: 'message', text: 'Espace introuvable.' };
        const members = num(result.memberCount) ?? 0;
        const categories = Array.isArray(result.categories) ? result.categories.length : 0;
        const threads = Array.isArray(result.threads) ? result.threads.filter(isRecord) : [];
        const cards: ResultCard[] = [{
            id, icon: 'bi-folder',
            title: str(result.name) ?? 'Sans nom',
            subtitle: `${plural(members, 'membre', 'membres')} · ${plural(categories, 'catégorie', 'catégories')} · ${plural(threads.length, 'salon', 'salons')}`,
        }];
        for (const t of threads) {
            const tid = str(t.id);
            if (!tid) continue;
            cards.push({ id: tid, icon: t.type === 'vocal' ? 'bi-volume-up-fill' : 'bi-hash', title: str(t.name) ?? 'Sans nom', subtitle: t.isPrivate === true ? 'Salon privé' : undefined });
        }
        return { kind: 'cards', cards };
    }
    if (toolName === 'get_stats') {
        const kpis = isRecord(result) && isRecord(result.kpis) ? result.kpis : null;
        if (!kpis) return { kind: 'message', text: 'Aucune statistique.' };
        const rows = KPI_LABELS.flatMap(([key, label]) => {
            const v = num(kpis[key]);
            return v === undefined ? [] : [{ label, value: String(v) }];
        });
        return rows.length ? { kind: 'stats', rows } : { kind: 'message', text: 'Aucune statistique.' };
    }
    return { kind: 'message', text: MESSAGES[toolName] ?? 'Terminé.' };
}
