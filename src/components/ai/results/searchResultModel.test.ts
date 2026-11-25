import { describe, expect, test } from 'bun:test';
import { buildSearchView, hitRow, kindOfRef, shortDate } from './searchResultModel';
import { buildResultRegistry, domainFromResultPath } from './resultRegistry';

describe('rendu du domaine Recherche', () => {
    test('SearchResult.vue s’enregistre sous le domaine search', () => {
        expect(domainFromResultPath('./SearchResult.vue')).toBe('search');
        const loader = async () => ({ default: {} });
        expect(Object.keys(buildResultRegistry({ './SearchResult.vue': loader }))).toEqual(['search']);
    });

    test('search_everything : une ligne par résultat, module et date lisibles, extrait borné', () => {
        const v = buildSearchView('search_everything', {
            hits: [
                { ref: 'task:t1', module: 'tasks', title: 'Préparer la réunion', snippet: 'x'.repeat(500), updatedAt: '2026-12-03T10:00:00.000Z' },
                { ref: 'file:f1', module: 'files', title: 'plan.pdf', snippet: 'application/pdf', updatedAt: null },
            ],
            truncated: true, skipped: [{ module: 'events', reason: 'module_disabled' }], messages: { delegated: true, tool: 'search_messages', note: 'n' },
        });
        expect(v.kind).toBe('hits');
        if (v.kind !== 'hits') return;
        expect(v.rows.map(r => [r.ref, r.icon, r.module])).toEqual([['task:t1', 'bi-check2-square', 'Tâches'], ['file:f1', 'bi-file-earmark', 'Fichiers']]);
        expect(v.rows[0]!.snippet.length).toBe(300);
        expect(v.rows[0]!.date).not.toBe('');
        expect(v.rows[1]!.date).toBe('');
        expect(v.truncated).toBe(true);
        expect(v.notes).toEqual(['Messages : recherche lancée à part (contenu chiffré).', 'Agenda ignoré : module désactivé.']);
    });

    test('résultats vides, malformés ou de type inconnu : message ou ligne ignorée, jamais d’exception', () => {
        expect(buildSearchView('search_everything', null)).toEqual({ kind: 'message', text: 'Aucun résultat.' });
        expect(buildSearchView('search_everything', { hits: [], truncated: false, skipped: [] })).toEqual({ kind: 'message', text: 'Aucun résultat.' });
        expect(buildSearchView('search_everything', { hits: [42, { ref: 'secret:1', title: 'x' }, { title: 'sans ref' }] })).toEqual({ kind: 'message', text: 'Aucun résultat.' });
        expect(hitRow({ ref: 'message:m1', title: 'x' })).toBeNull();
        expect(kindOfRef('nocolon')).toBe('');
        expect(shortDate('pas une date')).toBe('');
    });

    test('un titre piégé reste du texte (aucun HTML interprété par le modèle de vue)', () => {
        const v = buildSearchView('search_everything', { hits: [{ ref: 'thread:t', module: 'threads', title: '<img src=x onerror=alert(1)>', snippet: '' }] });
        expect(v.kind === 'hits' && v.rows[0]!.title).toBe('<img src=x onerror=alert(1)>');
    });

    test('resolve_mentions : correspondances avec leur type', () => {
        const v = buildSearchView('resolve_mentions', { matches: [{ ref: 'member:u1', kind: 'member', label: 'Alice' }], truncated: false });
        expect(v.kind === 'hits' && v.rows.map(r => [r.title, r.icon, r.module])).toEqual([['Alice', 'bi-person', 'Membres']]);
        expect(buildSearchView('resolve_mentions', { matches: [], truncated: false })).toEqual({ kind: 'message', text: 'Aucune correspondance.' });
    });

    test('get_context_item : fiche avec effectifs et accès restreint, sans identifiants techniques', () => {
        const v = buildSearchView('get_context_item', { ref: 'file:f1', kind: 'file', id: 'f1', name: 'plan.pdf', mimeType: 'application/pdf', restricted: true, spaceId: 's1' });
        expect(v).toEqual({ kind: 'item', icon: 'bi-file-earmark', title: 'plan.pdf', module: 'Fichiers', lines: [{ label: 'Format', value: 'application/pdf' }, { label: 'Accès', value: 'restreint' }] });
        const task = buildSearchView('get_context_item', { kind: 'task', title: 'T', description: 'd', status: 'TODO', attachmentCount: 2 });
        expect(task.kind === 'item' && task.lines.map(l => l.label)).toEqual(['Description', 'Statut', 'Pièces jointes']);
        expect(buildSearchView('get_context_item', { error: 'x' })).toEqual({ kind: 'message', text: 'Élément introuvable.' });
    });
});
