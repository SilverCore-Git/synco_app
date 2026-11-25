/**
 * Modèle d'affichage des résultats d'outils du domaine Messages (L15f) : messages lus (salon, MP), réactions, MP
 * récents, envois. Pur et testable ; `MessagesResult.vue` ne fait que le rendre, en texte seulement (jamais de HTML :
 * le contenu vient d'autres membres). Un message autonome dont le texte n'est pas confirmé garde son avertissement.
 */

export interface MessageRow {
    id: string;
    who: string;
    when: string;
    text: string;
    agent: 'ai' | 'autonomous' | null;
    warning: string | null;
}
export interface ReactionChip { emoji: string; count: number; names: string }
export interface DmRow { id: string; who: string; when: string }

export type MessagesResultView =
    | { kind: 'messages'; rows: MessageRow[]; truncated: boolean }
    | { kind: 'reactions'; chips: ReactionChip[]; note: string | null }
    | { kind: 'dms'; rows: DmRow[]; truncated: boolean }
    | { kind: 'message'; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const when = (v: unknown): string => {
    const d = typeof v === 'string' ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
};

const DONE: Record<string, string> = {
    send_message: 'Message envoyé (avec Synco AI).',
    forward_message: 'Message transféré.',
    edit_message: 'Message modifié (avec Synco AI).',
    delete_message: 'Message supprimé.',
    send_dm: 'Message privé envoyé (avec Synco AI).',
    edit_dm: 'Message privé modifié (avec Synco AI).',
    delete_dm: 'Message privé supprimé.',
};

function messageRow(raw: unknown): MessageRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const agent = raw.agent === 'ai' ? 'ai' : raw.agent === 'autonomous' ? 'autonomous' : null;
    const who = str(raw.senderName) ?? 'Membre';
    return {
        id,
        who,
        when: when(raw.createdAt),
        text: (typeof raw.text === 'string' ? raw.text : '') + (raw.cut === true ? ' […]' : ''),
        agent,
        warning: raw.textUnconfirmed === true ? `Texte non confirmé par ${who}` : null,
    };
}

function chips(raw: unknown): ReactionChip[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap(r => {
        if (!isRecord(r) || !str(r.emoji)) return [];
        const users = Array.isArray(r.users) ? r.users.flatMap(u => (isRecord(u) && str(u.name) ? [str(u.name)!] : [])) : [];
        return [{ emoji: str(r.emoji)!, count: num(r.count) ?? users.length, names: users.join(', ') + (r.truncated === true ? '…' : '') }];
    });
}

export function buildMessagesView(name: string, result: unknown): MessagesResultView {
    const r = isRecord(result) && isRecord(result.data) ? result.data : result;
    if (isRecord(r) && typeof r.error === 'string') return { kind: 'message', text: r.error };
    if ((name === 'read_thread_messages' || name === 'read_dm') && isRecord(r)) {
        const rows = (Array.isArray(r.messages) ? r.messages : []).map(messageRow).filter((x): x is MessageRow => x !== null);
        return rows.length ? { kind: 'messages', rows, truncated: r.truncated === true } : { kind: 'message', text: 'Aucun message.' };
    }
    if (name === 'get_message' && isRecord(r)) {
        const rows = [r.message, ...(Array.isArray(r.replies) ? r.replies : [])].map(messageRow).filter((x): x is MessageRow => x !== null);
        return rows.length ? { kind: 'messages', rows, truncated: false } : { kind: 'message', text: 'Message introuvable.' };
    }
    if ((name === 'list_reactions' || name === 'add_reaction' || name === 'remove_reaction') && isRecord(r)) {
        const note = r.action === 'unchanged' ? 'Réaction déjà présente.' : r.action === 'added' ? 'Réaction ajoutée.' : r.action === 'removed' ? 'Réaction retirée.' : null;
        const c = chips(r.reactions);
        return c.length || note ? { kind: 'reactions', chips: c, note } : { kind: 'message', text: 'Aucune réaction.' };
    }
    if (name === 'list_recent_dms' && isRecord(r)) {
        const rows = (Array.isArray(r.dms) ? r.dms : []).flatMap(d => (isRecord(d) && str(d.userId) ? [{ id: str(d.userId)!, who: str(d.name) ?? 'Membre', when: when(d.lastInteraction) }] : []));
        return rows.length ? { kind: 'dms', rows, truncated: r.truncated === true } : { kind: 'message', text: 'Aucune conversation privée récente.' };
    }
    return { kind: 'message', text: DONE[name] ?? 'Terminé.' };
}
