import { describe, expect, test } from 'bun:test';
import { buildSupportView } from './supportResultModel';

describe('rendu des résultats support', () => {
    test('liste : numéro, état en français, personne qui traite, bornage signalé', () => {
        const v = buildSupportView('list_support_tickets', {
            tickets: [{ id: 't1', number: 12, status: 'IN_PROGRESS', assignee: { name: 'Camille' }, lastMessageAt: '2026-11-25T10:00:00Z' }, { id: 't2', number: 7, status: 'WAITING_CUSTOMER', assignee: null }],
            truncated: true,
        });
        expect(v.kind).toBe('tickets');
        if (v.kind !== 'tickets') return;
        expect(v.rows[0]).toMatchObject({ id: 't1', number: 12, status: 'En cours', who: 'Camille' });
        expect(v.rows[1]).toMatchObject({ status: 'En attente de votre réponse', who: null, statusTone: 'wait' });
        expect(v.truncated).toBe(true);
        expect(buildSupportView('list_support_tickets', { tickets: [] })).toEqual({ kind: 'message', text: 'Aucune demande au support.' });
    });

    test('demande lue : l’équipe distinguée de moi, texte jamais interprété comme HTML', () => {
        const v = buildSupportView('read_support_ticket', {
            ticket: { id: 't1', number: 3, status: 'RESOLVED', title: 'Export <b>KO</b>', assignee: { name: 'Camille' } },
            messages: [{ id: 'm1', from: 'me', senderName: 'Moi', text: 'bonjour' }, { id: 'm2', from: 'team', senderName: 'Camille', text: '<img src=x onerror=alert(1)>', cut: true }],
            truncated: false, hasMore: true,
        });
        expect(v.kind).toBe('ticket');
        if (v.kind !== 'ticket') return;
        expect(v.head.title).toBe('Export <b>KO</b>');
        expect(v.rows.map(r => [r.from, r.who])).toEqual([['me', 'Vous'], ['team', 'Camille']]);
        expect(v.rows[1]!.text).toBe('<img src=x onerror=alert(1)> […]');
        expect(v.hasMore).toBe(true);
    });

    test('erreur, envois, fermeture et réouverture', () => {
        expect(buildSupportView('read_support_ticket', { error: 'ticket_not_found' })).toEqual({ kind: 'message', text: 'ticket_not_found' });
        expect(buildSupportView('create_support_ticket', { id: 'x' })).toEqual({ kind: 'message', text: 'Demande envoyée à l’équipe de Synco.' });
        expect(buildSupportView('reply_support_ticket', { id: 'x' })).toEqual({ kind: 'message', text: 'Réponse envoyée à l’équipe de Synco.' });
        expect(buildSupportView('close_support_ticket', { data: { id: 't', status: 'CLOSED' } })).toEqual({ kind: 'message', text: 'Demande fermée. État : Fermée.' });
        expect(buildSupportView('reopen_support_ticket', { id: 't', status: 'PENDING' })).toEqual({ kind: 'message', text: 'Demande rouverte. État : En attente de prise en charge.' });
    });
});
