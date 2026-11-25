import { describe, expect, test } from 'bun:test';
import { summarizeTool, noSummaryContext } from './summaryRegistry';
import * as support from './supportSummaries';

const modules = { './supportSummaries.ts': support };
const sum = (tool: string, args: Record<string, unknown>) => summarizeTool(tool, args, noSummaryContext, modules);

describe('résumés de confirmation : support (demandeur)', () => {
    test('create_support_ticket : destinataire hors de l’org, sujet et texte exacts', () => {
        const s = sum('create_support_ticket', { subject: 'Export PDF', text: 'Le PDF échoue depuis hier.' });
        expect(s).toContain('l’équipe de Synco (hors de votre organisation)');
        expect(s).toContain('Sujet : « Export PDF »');
        expect(s).toContain('Texte : « Le PDF échoue depuis hier. »');
    });

    test('reply_support_ticket : destinataire et texte exact', () => {
        const s = sum('reply_support_ticket', { ticketId: 'cm3ticket', text: 'Toujours le même souci.' });
        expect(s).toContain('l’équipe de Synco (hors de votre organisation)');
        expect(s).toContain('« Toujours le même souci. »');
        expect(s).toContain('cm3ticket');
    });

    test('texte long : coupé à l’affichage, longueur totale annoncée ; contrôles et marques bidi neutralisés', () => {
        const s = sum('create_support_ticket', { subject: 'a‮b\nc', text: 'x'.repeat(5000) });
        expect(s).toContain('(affichage coupé : 5000 caractères au total)');
        expect(s).toContain('Sujet : « a b c »');
        expect(s).not.toMatch(/[‮\n]/);
        expect(s.length).toBeLessThanOrEqual(2400);
    });

    test('fermer / rouvrir : identifiant lisible', () => {
        expect(sum('close_support_ticket', { ticketId: 't1' })).toContain('Fermer votre demande');
        expect(sum('reopen_support_ticket', { ticketId: 't1' })).toContain('Rouvrir votre demande');
    });
});
