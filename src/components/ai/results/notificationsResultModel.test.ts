import { describe, expect, test } from 'bun:test';
import { buildNotificationsView, isTruncated, notificationRow, statusLabel } from './notificationsResultModel';
import { buildResultRegistry } from './resultRegistry';

describe('rendu du domaine Notifications et statut', () => {
    test('NotificationsResult.vue s’enregistre sous le domaine notifications', () => {
        const loader = async () => ({ default: {} });
        expect(Object.keys(buildResultRegistry({ './NotificationsResult.vue': loader }))).toEqual(['notifications']);
    });

    test('list_notifications : lignes, non lues et icône selon l’état', () => {
        const v = buildNotificationsView('list_notifications', {
            notifications: [{ id: 'n1', title: 'Salut', body: '<b>x</b>', isRead: false }, { id: 'n2', isRead: true }, { title: 'sans id' }],
            unreadCount: 3, total: 9, truncated: true,
        });
        expect(v.kind).toBe('list');
        if (v.kind !== 'list') return;
        expect(v.rows.map(r => [r.id, r.title, r.icon])).toEqual([['n1', 'Salut', 'bi-bell-fill'], ['n2', 'Notification', 'bi-bell']]);
        expect(v.rows[0]!.body).toBe('<b>x</b>');
        expect(v.unreadCount).toBe(3);
    });

    test('liste vide ou résultat inattendu : message', () => {
        expect(buildNotificationsView('list_notifications', { notifications: [] })).toEqual({ kind: 'message', text: 'Aucune notification.' });
        expect(buildNotificationsView('list_notifications', null).kind).toBe('message');
        expect(notificationRow('x')).toBeNull();
    });

    test('marquer lu : accord du pluriel', () => {
        expect(buildNotificationsView('mark_notifications_read', { count: 1 })).toEqual({ kind: 'message', text: '1 notification marquée comme lue.' });
        expect(buildNotificationsView('mark_notifications_read', { count: 4 })).toEqual({ kind: 'message', text: '4 notifications marquées comme lues.' });
        expect(buildNotificationsView('mark_notifications_read', { count: 0 }).kind).toBe('message');
    });

    test('sourdines, suppression, rappel', () => {
        expect(buildNotificationsView('set_mutes', { muted: 2, unmuted: 1 })).toEqual({ kind: 'message', text: '2 éléments mis en sourdine, 1 élément réactivé.' });
        expect(buildNotificationsView('set_mutes', { muted: 0, unmuted: 0 })).toEqual({ kind: 'message', text: 'Aucun changement de sourdine.' });
        expect(buildNotificationsView('dismiss_notification', { deleted: true })).toEqual({ kind: 'message', text: 'Notification supprimée.' });
        expect(buildNotificationsView('notify_me', { id: 'n' })).toEqual({ kind: 'message', text: 'Rappel ajouté à vos notifications.' });
    });

    test('statut : libellé et message', () => {
        expect(statusLabel('idle')).toBe('absent');
        expect(statusLabel('zzz')).toBe('mis à jour');
        expect(buildNotificationsView('set_my_status', { status: 'dnd', message: 'En réunion' })).toEqual({ kind: 'message', text: 'Statut : ne pas déranger — « En réunion ».' });
    });

    test('troncature signalée', () => {
        expect(isTruncated({ truncated: true })).toBe(true);
        expect(isTruncated({})).toBe(false);
    });
});
