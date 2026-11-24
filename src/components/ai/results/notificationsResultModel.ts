/**
 * Modèle d'affichage des résultats d'outils du domaine Notifications et statut (L15e). Pur et testable : la vue
 * `NotificationsResult.vue` ne fait que le rendre. Titres et corps de notifications viennent d'autres membres ;
 * rien n'est rendu en HTML.
 */

export interface NotificationRow {
    id: string;
    title: string;
    body?: string;
    isRead: boolean;
    icon: string;
}

export type NotificationsResultView =
    | { kind: 'list'; rows: NotificationRow[]; unreadCount?: number; total?: number }
    | { kind: 'message'; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

export const isTruncated = (result: unknown): boolean => isRecord(result) && result.truncated === true;

export function notificationRow(raw: unknown): NotificationRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const isRead = raw.isRead === true;
    return { id, title: str(raw.title) ?? 'Notification', body: str(raw.body), isRead, icon: isRead ? 'bi-bell' : 'bi-bell-fill' };
}

/** Libellé du statut tel que le renvoie l'outil (statut de la plateforme : `idle` = absent, `offline` = invisible). */
export function statusLabel(status: unknown): string {
    switch (status) {
        case 'online': return 'en ligne';
        case 'idle': return 'absent';
        case 'dnd': return 'ne pas déranger';
        case 'offline': return 'invisible ou hors ligne';
        default: return 'mis à jour';
    }
}

export function buildNotificationsView(toolName: string, result: unknown): NotificationsResultView {
    const r = isRecord(result) ? result : {};
    switch (toolName) {
        case 'list_notifications': {
            const rows = (Array.isArray(r.notifications) ? r.notifications : []).map(notificationRow).filter((x): x is NotificationRow => x !== null);
            return rows.length
                ? { kind: 'list', rows, unreadCount: num(r.unreadCount), total: num(r.total) }
                : { kind: 'message', text: 'Aucune notification.' };
        }
        case 'mark_notifications_read': {
            const n = num(r.count) ?? 0;
            return { kind: 'message', text: n === 0 ? 'Aucune notification à marquer comme lue.' : `${plural(n, 'notification marquée comme lue', 'notifications marquées comme lues')}.` };
        }
        case 'dismiss_notification':
            return { kind: 'message', text: 'Notification supprimée.' };
        case 'set_mutes': {
            const m = num(r.muted) ?? 0;
            const u = num(r.unmuted) ?? 0;
            const parts: string[] = [];
            if (m) parts.push(`${plural(m, 'élément mis', 'éléments mis')} en sourdine`);
            if (u) parts.push(`${plural(u, 'élément réactivé', 'éléments réactivés')}`);
            return { kind: 'message', text: parts.length ? `${parts.join(', ')}.` : 'Aucun changement de sourdine.' };
        }
        case 'notify_me':
            return { kind: 'message', text: 'Rappel ajouté à vos notifications.' };
        case 'set_my_status':
            return { kind: 'message', text: `Statut : ${statusLabel(r.status)}.` };
        case 'set_my_status_message': {
            const message = str(r.message);
            return { kind: 'message', text: message ? `Message de statut : « ${message} ».` : 'Message de statut effacé.' };
        }
        default:
            return { kind: 'message', text: 'Terminé.' };
    }
}
