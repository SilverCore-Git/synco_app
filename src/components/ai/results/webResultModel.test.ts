import { describe, expect, test } from 'bun:test';
import { buildWebView, pageText, webAddress } from './webResultModel';
import { domainFromResultPath } from './resultRegistry';

describe('rendu des résultats web (texte seulement, aucun lien)', () => {
    test('WebResult.vue est le rendu du domaine web', () => {
        expect(domainFromResultPath('./WebResult.vue')).toBe('web');
    });

    test('web_search : lignes nettoyées, adresses en texte, au plus 10, schémas non http écartés', () => {
        const results = [
            { title: 'Gestion\u202e de projet', url: 'https://fr.wikipedia.org/wiki/Gestion_de_projet?x=1', snippet: '<b>gras</b>\nsuite', age: '2 jours' },
            { title: 'piège', url: 'javascript:alert(1)' },
            { title: 'data', url: 'data:text/html,<script>alert(1)</script>' },
            ...Array.from({ length: 12 }, (_, i) => ({ title: `r${i}`, url: `https://ex${i}.example/` })),
        ];
        const v = buildWebView('web_search', { query: 'gestion de projet', results });
        if (v.kind !== 'search') throw new Error(v.kind);
        expect(v.query).toBe('gestion de projet');
        expect(v.rows[0]).toMatchObject({ title: 'Gestion de projet', host: 'fr.wikipedia.org', address: 'fr.wikipedia.org/wiki/Gestion_de_projet?x=1', snippet: '<b>gras</b> suite', age: '2 jours' });
        expect(v.rows.some(r => r.title === 'piège' || r.title === 'data')).toBe(false);
        expect(v.rows.length).toBeLessThanOrEqual(10);
    });

    test('web_search sans résultat lisible : message', () => {
        expect(buildWebView('web_search', { query: 'rien', results: [] })).toEqual({ kind: 'message', text: 'Aucun résultat pour « rien ».' });
    });

    test('web_fetch : titre, adresse, type, extrait et texte borné', () => {
        const v = buildWebView('web_fetch', {
            url: 'https://ex.example/a/b', source: 'web:ex.example', contentType: 'text/html', title: 'Titre',
            text: `Ligne 1\n\n\n\nLigne 2\u200b\n${'x'.repeat(30_000)}`, truncated: true,
        });
        if (v.kind !== 'page') throw new Error(v.kind);
        expect(v).toMatchObject({ title: 'Titre', host: 'ex.example', address: 'ex.example/a/b', type: 'Page HTML', truncated: true });
        expect(v.text.startsWith('Ligne 1\n\nLigne 2')).toBe(true);
        expect(v.text.length).toBeLessThanOrEqual(20_000);
        expect(v.excerpt.length).toBeLessThanOrEqual(400);
        expect(v.chars).toBeGreaterThan(30_000);
    });

    test('hôte homographe en punycode ; adresse illisible ou non http : rien d’affiché comme adresse', () => {
        expect(webAddress('https://g\u043e\u043egle.com/')?.host).toContain('xn--');
        expect(webAddress('file:///etc/passwd')).toBeNull();
        expect(buildWebView('web_fetch', { url: 'javascript:alert(1)', text: 'x' })).toEqual({ kind: 'message', text: 'Page lue, adresse illisible.' });
        expect(buildWebView('web_fetch', null).kind).toBe('message');
    });

    test('pageText : contrôles et marques bidi retirés ligne par ligne', () => {
        expect(pageText('a\u202eb\r\nc\u0007d')).toBe('a b\nc d');
    });
});

describe('domaine des outils web (absents du manifeste de l’appareil)', () => {
    test('web_search et web_fetch rendus par WebResult ; un autre nom inconnu reste générique', async () => {
        const { toolDomainOf } = await import('./toolDomains');
        expect(toolDomainOf('web_search')).toBe('web');
        expect(toolDomainOf('web_fetch')).toBe('web');
        expect(toolDomainOf('constructor')).toBeUndefined();
    });
});
