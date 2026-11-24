import { describe, expect, test } from 'bun:test';
import { buildSummaryRegistry, summarizeTool, type SummaryContext } from './summaryRegistry';
import * as agenda from './agendaSummaries';

const modules = { './agendaSummaries.ts': agenda, './autre.ts': { summaries: { x: () => 'non' } } };
const ctx: SummaryContext = {
    userName: id => (id === 'u1' ? 'Léa Martin' : null),
    grant: id => (id === 'g1' ? { who: 'Bob', level: 'modification', direction: 'owner' } : id === 'g2' ? { who: 'Zoé', level: 'lecture seule', direction: 'grantee' } : null),
};

describe('registre des résumés', () => {
    test('ne charge que les fichiers <domaine>Summaries.ts', () => {
        const reg = buildSummaryRegistry(modules);
        expect(Object.keys(reg)).toContain('share_my_calendar');
        expect(Object.keys(reg)).not.toContain('x');
    });

    test('outil sans résumé : chaîne vide (repli générique)', () => {
        expect(summarizeTool('create_task', { title: 'a' }, ctx, modules)).toBe('');
    });

    test('add_ics_calendar : URL entière, requête comprise', () => {
        const url = 'https://exemple.org/cal/feed.ics?token=abc123&x=1#frag';
        const s = summarizeTool('add_ics_calendar', { url, name: 'Perso' }, ctx, modules);
        expect(s).toContain(url);
        expect(s).toContain('Perso');
    });

    test('update_ics_calendar_url : URL entière', () => {
        const url = 'https://exemple.org:8443/a/b.ics?k=v';
        expect(summarizeTool('update_ics_calendar_url', { connectionId: 'c', url }, ctx, modules)).toContain(url);
    });

    test('partage : nom du membre (jamais l’identifiant) et niveau', () => {
        const s = summarizeTool('share_my_calendar', { userId: 'u1', level: 'WRITE' }, ctx, modules);
        expect(s).toBe('Partager mon agenda avec Léa Martin, en modification');
        expect(s).not.toContain('u1');
        expect(summarizeTool('request_calendar_access', { userId: 'u1', level: 'READ' }, ctx, modules)).toBe('Demander l’accès à l’agenda de Léa Martin, en lecture seule');
        expect(summarizeTool('share_my_calendar', { userId: 'zz', level: 'READ' }, ctx, modules)).toContain('membre inconnu');
    });

    test('respond_calendar_access : demandeur et niveau du grant', () => {
        expect(summarizeTool('respond_calendar_access', { grantId: 'g1', accept: true }, ctx, modules)).toBe('Accepter la demande de Bob d’accéder à mon agenda (modification)');
        expect(summarizeTool('respond_calendar_access', { grantId: 'g2', accept: false }, ctx, modules)).toContain('Refuser l’invitation de Zoé');
        expect(summarizeTool('respond_calendar_access', { grantId: 'inconnu', accept: true }, ctx, modules)).toContain('demandeur inconnu');
    });

    test('texte nettoyé : contrôles et marques bidi retirés', () => {
        const s = summarizeTool('add_ics_calendar', { url: 'https://a.fr/‮x.ics\n' }, ctx, modules);
        expect(s).not.toMatch(/[‮\n]/);
    });
});
