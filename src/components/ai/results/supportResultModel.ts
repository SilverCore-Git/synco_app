/**
 * Modèle d'affichage des résultats d'outils du domaine Support, côté demandeur (L15j) : mes demandes, une demande et
 * ses échanges publics, état après fermeture ou réouverture, envois. Pur et testable ; `SupportResult.vue` ne fait que
 * le rendre, en texte seulement (jamais de HTML : le titre et les réponses viennent de l'équipe ou du modèle).
 */

export interface SupportTicketRow {
    id: string;
    number: number | null;
    status: string;
    statusTone: 'open' | 'wait' | 'done';
    who: string | null;
    when: string;
}
export interface SupportMessageRow {
    id: string;
    from: 'me' | 'team';
    who: string;
    when: string;
    text: string;
}

export type SupportResultView =
    | { kind: 'tickets'; rows: SupportTicketRow[]; truncated: boolean }
    | { kind: 'ticket'; head: SupportTicketRow & { title: string | null }; rows: SupportMessageRow[]; truncated: boolean; hasMore: boolean }
    | { kind: 'message'; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const when = (v: unknown): string => {
    const d = typeof v === 'string' ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
};

const STATUS: Record<string, { label: string; tone: SupportTicketRow['statusTone'] }> = {
    PENDING: { label: 'En attente de prise en charge', tone: 'wait' },
    IN_PROGRESS: { label: 'En cours', tone: 'open' },
    WAITING_CUSTOMER: { label: 'En attente de votre réponse', tone: 'wait' },
    RESOLVED: { label: 'Résolue', tone: 'done' },
    CLOSED: { label: 'Fermée', tone: 'done' },
};

const DONE: Record<string, string> = {
    create_support_ticket: 'Demande envoyée à l’équipe de Synco.',
    reply_support_ticket: 'Réponse envoyée à l’équipe de Synco.',
    close_support_ticket: 'Demande fermée.',
    reopen_support_ticket: 'Demande rouverte.',
};

function ticketRow(raw: unknown): SupportTicketRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const status = STATUS[str(raw.status) ?? ''] ?? { label: 'État inconnu', tone: 'open' as const };
    const assignee = isRecord(raw.assignee) ? str(raw.assignee.name) : undefined;
    return { id, number: num(raw.number) ?? null, status: status.label, statusTone: status.tone, who: assignee ?? null, when: when(raw.lastMessageAt ?? raw.createdAt) };
}

function messageRow(raw: unknown): SupportMessageRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const from = raw.from === 'me' ? 'me' : 'team';
    return {
        id,
        from,
        who: from === 'me' ? 'Vous' : (str(raw.senderName) ?? 'Équipe Synco'),
        when: when(raw.createdAt),
        text: (typeof raw.text === 'string' ? raw.text : '') + (raw.cut === true ? ' […]' : ''),
    };
}

export function buildSupportView(name: string, result: unknown): SupportResultView {
    const r = isRecord(result) && isRecord(result.data) ? result.data : result;
    if (isRecord(r) && typeof r.error === 'string') return { kind: 'message', text: r.error };
    if (name === 'list_support_tickets' && isRecord(r)) {
        const rows = (Array.isArray(r.tickets) ? r.tickets : []).map(ticketRow).filter((x): x is SupportTicketRow => x !== null);
        return rows.length ? { kind: 'tickets', rows, truncated: r.truncated === true } : { kind: 'message', text: 'Aucune demande au support.' };
    }
    if (name === 'read_support_ticket' && isRecord(r)) {
        const head = ticketRow(r.ticket);
        if (!head) return { kind: 'message', text: 'Demande introuvable.' };
        const title = isRecord(r.ticket) ? (str(r.ticket.title) ?? null) : null;
        const rows = (Array.isArray(r.messages) ? r.messages : []).map(messageRow).filter((x): x is SupportMessageRow => x !== null);
        return { kind: 'ticket', head: { ...head, title }, rows, truncated: r.truncated === true, hasMore: r.hasMore === true };
    }
    if ((name === 'close_support_ticket' || name === 'reopen_support_ticket') && isRecord(r) && str(r.status)) {
        const s = STATUS[str(r.status)!];
        return { kind: 'message', text: `${DONE[name]} État : ${s?.label ?? 'inconnu'}.` };
    }
    return { kind: 'message', text: DONE[name] ?? 'Terminé.' };
}
