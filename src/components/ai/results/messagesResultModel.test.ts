import { describe, expect, test } from 'bun:test';
import { buildMessagesView } from './messagesResultModel';
import { summaries } from '../summaries/messagesSummaries';
import { noSummaryContext } from '../summaries/summaryRegistry';

describe('rendu des résultats du domaine messages', () => {
    test('messages lus : auteur, mention, avertissement d’un texte non confirmé conservé', () => {
        const v = buildMessagesView('read_thread_messages', { messages: [
            { id: 'a', senderName: 'Alice', createdAt: '2026-11-24T10:00:00Z', text: '<b>x</b>' },
            { id: 'b', senderName: 'Bob', createdAt: '2026-11-24T10:01:00Z', text: 'ok', agent: 'autonomous', textUnconfirmed: true, cut: true },
        ], truncated: true });
        expect(v.kind).toBe('messages');
        if (v.kind !== 'messages') return;
        expect(v.rows[0]!.text).toBe('<b>x</b>');
        expect(v.rows[1]).toMatchObject({ agent: 'autonomous', warning: 'Texte non confirmé par Bob', text: 'ok […]' });
        expect(v.truncated).toBe(true);
    });
    test('réactions et MP récents', () => {
        const r = buildMessagesView('add_reaction', { action: 'unchanged', emoji: '👍', reactions: [{ emoji: '👍', count: 30, users: [{ id: 'u', name: 'Alice' }], truncated: true }] });
        expect(r).toEqual({ kind: 'reactions', chips: [{ emoji: '👍', count: 30, names: 'Alice…' }], note: 'Réaction déjà présente.' });
        expect(buildMessagesView('list_recent_dms', { dms: [], truncated: false })).toEqual({ kind: 'message', text: 'Aucune conversation privée récente.' });
    });
    test('erreur et gestes : texte court', () => {
        expect(buildMessagesView('delete_message', { error: 'Forbidden' })).toEqual({ kind: 'message', text: 'Forbidden' });
        expect(buildMessagesView('send_message', { id: 'm' })).toEqual({ kind: 'message', text: 'Message envoyé (avec Synco AI).' });
    });
    test('résumés de confirmation : texte exact, destinataire, suppression irréversible', () => {
        const ctx = { userName: (id: string) => (id === 'u2' ? 'Bob' : null) };
        expect(summaries.send_dm!({ peerId: 'u2', text: 'Salut' }, ctx)).toBe('Envoyer en votre nom à Bob (message privé, avec Synco AI) : « Salut »');
        expect(summaries.send_message!({ threadId: 't', text: 'Bonjour', mentionUserIds: ['u2', 'u3'] }, ctx)).toContain('en mentionnant Bob, membre inconnu');
        expect(summaries.delete_message!({ messageId: 'm1' }, noSummaryContext)).toContain('irréversible');
        expect(summaries.delete_dm!({ dmMessageId: 'd1' }, noSummaryContext)).toContain('irréversible');
    });
});
