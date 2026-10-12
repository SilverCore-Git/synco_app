import { SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES, type SupportTicketPriority, type SupportTicketStatus } from '@/types/support';
import type { SupportSelectOption } from '@/components/support/SupportSearchSelect.vue';

/**
 * Libellés et couleurs partagés par tous les écrans du SAV (liste client,
 * panel équipe, en-têtes de ticket) : évite de redéfinir la même table à
 * chaque endroit.
 */

export const STATUS_LABELS: Record<SupportTicketStatus, string> = {
    PENDING: 'En attente',
    IN_PROGRESS: 'En cours',
    WAITING_CUSTOMER: 'En attente du client',
    RESOLVED: 'Résolu',
    CLOSED: 'Fermé',
};

export const STATUS_COLORS: Record<SupportTicketStatus, string> = {
    PENDING: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    IN_PROGRESS: 'text-(--primary) bg-(--primary)/10 border-(--primary)/20',
    WAITING_CUSTOMER: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    RESOLVED: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    CLOSED: 'text-(--text2) bg-(--text)/5 border-(--border-color)',
};

export const PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
    LOW: 'Basse',
    NORMAL: 'Normale',
    HIGH: 'Haute',
    URGENT: 'Urgente',
};

export const PRIORITY_COLORS: Record<SupportTicketPriority, string> = {
    LOW: 'text-(--text2) bg-(--text)/5 border-(--border-color)',
    NORMAL: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    HIGH: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    URGENT: 'text-red-500 bg-red-500/10 border-red-500/20',
};

export const statusLabel = (s: SupportTicketStatus | null | undefined) => (s ? STATUS_LABELS[s] : '—');
export const priorityLabel = (p: SupportTicketPriority | null | undefined) => (p ? PRIORITY_LABELS[p] : 'Non définie');

/** Options typées pour SupportSearchSelect<SupportTicketStatus|Priority> : évite un cast à chaque site d'appel. */
export const STATUS_OPTIONS: SupportSelectOption<SupportTicketStatus>[] =
    SUPPORT_TICKET_STATUSES.map((id) => ({ id, label: STATUS_LABELS[id] }));
export const PRIORITY_OPTIONS: SupportSelectOption<SupportTicketPriority>[] =
    SUPPORT_TICKET_PRIORITIES.map((id) => ({ id, label: PRIORITY_LABELS[id] }));
