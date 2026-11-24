import { describe, expect, test } from 'bun:test';
import { buildAgendaView, groupByDay, grantRow, eventRow } from './agendaResultModel';
import { buildResultRegistry } from './resultRegistry';

const TZ = 'UTC';

describe('rendu du domaine Agenda', () => {
    test('AgendaResult.vue s’enregistre sous le domaine agenda', () => {
        const loader = async () => ({ default: {} });
        expect(Object.keys(buildResultRegistry({ './AgendaResult.vue': loader }))).toEqual(['agenda']);
    });

    test('list_events : occurrences regroupées par jour, troncature signalée', () => {
        const v = buildAgendaView('list_events', {
            occurrences: [
                { id: 'e1', title: 'Matin', startAt: '2030-01-01T09:00:00.000Z', endAt: '2030-01-01T10:00:00.000Z', allDay: false, location: 'Salle A' },
                { id: 'e1', title: 'Soir', startAt: '2030-01-01T18:00:00.000Z', endAt: '2030-01-01T19:00:00.000Z' },
                { id: 'e2', title: 'Lendemain', startAt: '2030-01-02T00:00:00.000Z', endAt: '2030-01-03T00:00:00.000Z', allDay: true },
                { title: 'sans id' },
            ],
            total: 450, truncated: true,
        }, TZ);
        expect(v.kind).toBe('events');
        if (v.kind !== 'events') return;
        expect(v.days.map(d => d.rows.length)).toEqual([2, 1]);
        expect(v.days[0]!.rows[0]!.when).toBe('09:00 – 10:00');
        expect(v.days[0]!.rows[0]!.place).toBe('Salle A');
        expect(v.days[1]!.rows[0]!.when).toBe('Toute la journée');
        expect(v.total).toBe(450);
        expect(v.truncated).toBe(true);
    });

    test('un titre HTML reste du texte brut', () => {
        const days = groupByDay([{ id: 'x', title: '<img src=x onerror=alert(1)>', startAt: '2030-01-01T09:00:00.000Z' }], TZ);
        expect(days[0]!.rows[0]!.title).toBe('<img src=x onerror=alert(1)>');
    });

    test('partages : sens, niveau et état en français', () => {
        expect(grantRow({ id: 'g', level: 'WRITE', status: 'PENDING', grantee: { name: 'Léa' } }, 'owner')).toEqual({ id: 'g', direction: 'owner', who: 'Léa', level: 'Modification', status: 'En attente' });
        expect(grantRow({ id: 'g', level: 'READ', status: 'ACCEPTED', owner: { pseudo: 'bob' } }, 'grantee')?.who).toBe('bob');
        const v = buildAgendaView('list_calendar_access', { asOwner: [{ id: 'a', grantee: { name: 'A' } }], asGrantee: [{ id: 'b', owner: { name: 'B' } }], truncated: false });
        expect(v.kind === 'grants' && v.rows.map(r => r.direction)).toEqual(['owner', 'grantee']);
    });

    test('agendas externes et rappels', () => {
        const c = buildAgendaView('list_external_calendars', { connections: [{ id: 'c', provider: 'ICS_URL', status: 'ERROR', lastError: 'boom' }], total: 1, truncated: false });
        expect(c.kind === 'connections' && c.rows[0]!.provider).toBe('Lien ICS');
        const r = buildAgendaView('list_my_reminders', { reminders: [{ id: 'r', minutesBefore: 15, event: { title: 'T', startAt: '2030-01-01T09:00:00.000Z' } }], total: 1 }, TZ);
        expect(r.kind === 'reminders' && r.rows[0]!.before).toBe('15 min avant');
    });

    test('évènement seul et gestes sans données', () => {
        expect(eventRow({ title: 'Réunion', startAt: '2030-01-01T09:00:00.000Z', endAt: '2030-01-01T10:00:00.000Z' }, TZ)).toBeNull();
        const v = buildAgendaView('create_event', { id: 'e', title: 'Réunion', startAt: '2030-01-01T09:00:00.000Z', endAt: '2030-01-01T10:00:00.000Z' }, TZ);
        expect(v.kind === 'event' && v.row.title).toBe('Réunion');
        expect(buildAgendaView('delete_event', { success: true })).toEqual({ kind: 'message', text: 'Évènement supprimé.' });
        expect(buildAgendaView('delete_event', null)).toEqual({ kind: 'message', text: 'Évènement supprimé.' });
    });
});
