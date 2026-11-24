import { describe, expect, test } from 'bun:test';
import { buildSpacesView } from './spacesResultModel';
import { buildThreadsView, threadCard } from './threadsResultModel';
import { buildResultRegistry } from './resultRegistry';

describe('rendu des domaines Espaces et Salons', () => {
    test('SpacesResult.vue et ThreadsResult.vue s’enregistrent sous leur domaine', () => {
        const loader = async () => ({ default: {} });
        expect(Object.keys(buildResultRegistry({ './SpacesResult.vue': loader, './ThreadsResult.vue': loader })).sort()).toEqual(['spaces', 'threads']);
    });

    test('get_space : une carte d’espace puis une par salon, sans liste de membres', () => {
        const v = buildSpacesView('get_space', {
            id: 's1', name: 'Équipe', memberCount: 12, categories: [{ id: 'c' }],
            threads: [{ id: 't1', name: 'général', type: 'text', isPrivate: false }, { id: 't2', name: 'appel', type: 'vocal', isPrivate: true }],
        });
        expect(v.kind).toBe('cards');
        if (v.kind !== 'cards') return;
        expect(v.cards[0]).toMatchObject({ title: 'Équipe', subtitle: '12 membres · 1 catégorie · 2 salons' });
        expect(v.cards.slice(1).map(c => [c.icon, c.subtitle])).toEqual([['bi-hash', undefined], ['bi-volume-up-fill', 'Salon privé']]);
    });

    test('get_stats : indicateurs numériques seulement', () => {
        const v = buildSpacesView('get_stats', { kpis: { total: 10, done: 4, leadTime: { medianHours: 2 }, junk: 'x' } });
        expect(v).toEqual({ kind: 'stats', rows: [{ label: 'Total', value: '10' }, { label: 'Terminées', value: '4' }] });
    });

    test('messages de confirmation propres à chaque outil', () => {
        expect(buildSpacesView('delete_space', { deleted: true })).toEqual({ kind: 'message', text: 'Espace supprimé.' });
        expect(buildThreadsView('delete_category', null)).toEqual({ kind: 'message', text: 'Catégorie supprimée avec ses salons.' });
    });

    test('invitations : le code complet n’apparaît qu’à la création', () => {
        const list = buildThreadsView('list_thread_invites', { invites: [{ id: 'i', codePrefix: 'ab12…', uses: 1, maxUses: 3, expiresAt: '2026-12-01T10:00:00.000Z' }] });
        expect(list.kind === 'cards' && list.cards[0]!.title).toBe('Code ab12…');
        const created = buildThreadsView('create_thread_invite', { id: 'i', codePrefix: 'ab12…', code: 'ab12cd34ef56gh78', uses: 0, maxUses: null });
        expect(created.kind === 'cards' && created.cards[0]!.title).toBe('Code ab12cd34ef56gh78');
    });

    test('get_item_access : effectifs par niveau', () => {
        const v = buildThreadsView('get_item_access', { counts: { none: 2, read: 5, write: 1 } });
        expect(v).toEqual({ kind: 'stats', rows: [{ label: 'Lecture et modification', value: '1' }, { label: 'Lecture seule', value: '5' }, { label: 'Aucun accès', value: '2' }] });
    });

    test('un nom piégé reste du texte, un résultat mal formé donne un message, jamais d’exception', () => {
        expect(threadCard({ id: 't', name: '<img src=x onerror=1>', type: 'text' })?.title).toBe('<img src=x onerror=1>');
        for (const name of ['list_categories', 'get_thread', 'list_thread_invites', 'create_thread_invite', 'get_item_access', 'update_thread']) {
            for (const bad of [null, undefined, 42, 'x', [], {}]) expect(['message', 'cards', 'stats']).toContain(buildThreadsView(name, bad).kind);
        }
        for (const name of ['get_space', 'get_stats']) for (const bad of [null, undefined, 42, [], {}]) expect(['message', 'cards', 'stats']).toContain(buildSpacesView(name, bad).kind);
    });
});
