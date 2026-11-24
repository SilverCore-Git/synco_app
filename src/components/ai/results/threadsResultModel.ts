import type { ResultCard, StatRow } from './spacesResultModel';

/**
 * Modèle d'affichage des résultats d'outils du domaine Salons (L15c) : catégories, salons, invitations,
 * accès. Pur et testable ; `ThreadsResult.vue` ne fait que le rendre. Tout nom vient d'autres membres, jamais
 * rendu en HTML. Le code complet d'une invitation n'apparaît qu'à sa création (la liste ne l'a jamais).
 */

export type ThreadsResultView =
    | { kind: 'cards'; cards: ResultCard[] }
    | { kind: 'stats'; rows: StatRow[] }
    | { kind: 'message'; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const MESSAGES: Record<string, string> = {
    update_category: 'Catégorie mise à jour.',
    delete_category: 'Catégorie supprimée avec ses salons.',
    delete_thread: 'Salon supprimé.',
    revoke_thread_invite: 'Lien d\'invitation révoqué.',
    set_item_access: 'Accès mis à jour.',
};

export function threadCard(raw: unknown): ResultCard | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const vocal = raw.type === 'vocal';
    const parts = [vocal ? 'Salon vocal' : 'Salon textuel'];
    if (raw.isPrivate === true) parts.push('privé');
    const members = num(raw.memberCount);
    if (members !== undefined) parts.push(`${members} ${members > 1 ? 'membres' : 'membre'}`);
    return { id, icon: vocal ? 'bi-volume-up-fill' : 'bi-hash', title: str(raw.name) ?? 'Sans nom', subtitle: parts.join(' · ') };
}

function inviteCard(raw: unknown): ResultCard | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const code = str(raw.code) ?? (str(raw.codePrefix) ? `${str(raw.codePrefix)}` : undefined);
    const uses = num(raw.uses) ?? 0;
    const max = num(raw.maxUses);
    const expires = str(raw.expiresAt);
    const parts = [`${uses}${max ? ` / ${max}` : ''} utilisation${uses > 1 ? 's' : ''}`];
    if (expires) parts.push(`expire le ${new Date(expires).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`);
    return { id, icon: 'bi-link-45deg', title: code ? `Code ${code}` : 'Lien d\'invitation', subtitle: parts.join(' · ') };
}

export function buildThreadsView(toolName: string, result: unknown): ThreadsResultView {
    switch (toolName) {
        case 'delete_category': {
            const n = isRecord(result) ? num(result.threadsDeleted) : undefined;
            return { kind: 'message', text: n === undefined ? MESSAGES.delete_category! : `Catégorie supprimée avec ${n} ${n > 1 ? 'salons' : 'salon'}.` };
        }
        case 'list_categories': {
            const cards = (Array.isArray(result) ? result : []).flatMap((c): ResultCard[] => {
                const id = isRecord(c) ? str(c.id) : undefined;
                return id && isRecord(c) ? [{ id, icon: 'bi-folder2', title: str(c.name) ?? 'Sans nom' }] : [];
            });
            return cards.length ? { kind: 'cards', cards } : { kind: 'message', text: 'Aucune catégorie.' };
        }
        case 'get_thread':
        case 'update_thread':
        case 'remove_thread_members': {
            const card = threadCard(result);
            return card ? { kind: 'cards', cards: [card] } : { kind: 'message', text: 'Salon mis à jour.' };
        }
        case 'list_thread_invites':
        case 'create_thread_invite': {
            const items = toolName === 'create_thread_invite' ? [result] : (isRecord(result) && Array.isArray(result.invites) ? result.invites : []);
            const cards = items.flatMap((i): ResultCard[] => { const c = inviteCard(i); return c ? [c] : []; });
            return cards.length ? { kind: 'cards', cards } : { kind: 'message', text: 'Aucun lien d\'invitation actif.' };
        }
        case 'get_item_access': {
            const counts = isRecord(result) && isRecord(result.counts) ? result.counts : null;
            if (!counts) return { kind: 'message', text: 'Accès inconnu.' };
            const rows: StatRow[] = [['write', 'Lecture et modification'], ['read', 'Lecture seule'], ['none', 'Aucun accès']]
                .flatMap(([k, label]) => { const v = num(counts[k!]); return v === undefined ? [] : [{ label: label!, value: String(v) }]; });
            return { kind: 'stats', rows };
        }
        default:
            return { kind: 'message', text: MESSAGES[toolName] ?? 'Terminé.' };
    }
}
