import { describe, expect, test } from 'bun:test';
import { summarizeTool, noSummaryContext, type SummaryContext } from './summaryRegistry';
import * as reports from './reportsSummaries';

const modules = { './reportsSummaries.ts': reports };
const named = { ...noSummaryContext, spaceName: (id: string) => (id === 's1' ? 'Équipe' : null), threadName: (id: string) => (id === 't1' ? 'général' : null) } as SummaryContext;
const sum = (tool: string, args: Record<string, unknown>, ctx: SummaryContext = noSummaryContext) => summarizeTool(tool, args, ctx, modules);

describe('résumés de confirmation : rapports et webhooks', () => {
    test('create_email_report : rythme, portée, sections et destinataire (le compte)', () => {
        const s = sum('create_email_report', { name: 'Point', rhythm: 'DAILY', sections: [{}, {}] });
        expect(s).toContain('chaque jour');
        expect(s).toContain('toute l’organisation');
        expect(s).toContain('2 sections');
        expect(s).toContain('adresse e-mail de mon compte');
    });

    test('update_email_report : champs modifiés et remplacement des sections', () => {
        const s = sum('update_email_report', { reportId: 'r', name: 'x', sections: [{}] });
        expect(s).toContain('champs : name, sections');
        expect(s).toContain('remplace toutes les sections');
    });

    test('create_webhook : la signature désactivée est affichée en toutes lettres', () => {
        expect(sum('create_webhook', { name: 'CI', requireSignature: false })).toContain('SIGNATURE DÉSACTIVÉE');
        expect(sum('create_webhook', { name: 'CI', permissions: ['send_messages', 'manage_webhook'] }))
            .toContain('droits : envoyer des messages, gérer le webhook');
        expect(sum('create_webhook', { name: 'CI' })).toContain('signature exigée');
    });

    test('update_webhook : désactivation, salon et chiffrement', () => {
        const s = sum('update_webhook', { webhookId: 'w', isActive: false, targetChannelId: 't', e2eeEnabled: false });
        expect(s).toContain('désactivé');
        expect(s).toContain('ne publie que dans un salon');
        expect(s).toContain('chiffrement de bout en bout désactivé');
    });

    test('create_webhook : espace et salon nommés, droits et chiffrement par défaut, jamais d’identifiant', () => {
        const s = sum('create_webhook', { name: 'CI', spaceId: 's1', targetChannelId: 't1' }, named);
        expect(s).toContain('l’espace « Équipe »');
        expect(s).toContain('le salon « général »');
        expect(s).toContain('droits : envoyer des messages');
        expect(s).toContain('chiffrement de bout en bout désactivé');
        const unknown = sum('create_webhook', { name: 'CI', spaceId: 'SECRETID', targetChannelId: 'TID' });
        expect(unknown).not.toContain('SECRETID');
        expect(unknown).not.toContain('TID');
        expect(unknown).toContain('nom indisponible');
    });

    test('update_email_report : nouvelle portée et nouveau rythme', () => {
        const s = sum('update_email_report', { reportId: 'r', spaceId: 's1', rhythm: 'WEEKLY' }, named);
        expect(s).toContain('nouveau rythme : chaque semaine');
        expect(s).toContain('nouvelle portée : l’espace « Équipe »');
        expect(sum('update_email_report', { reportId: 'r', spaceId: null })).toContain('nouvelle portée : toute l’organisation');
    });

    test('suppression et test : résumé non vide', () => {
        for (const t of ['delete_email_report', 'send_test_email_report', 'delete_webhook', 'test_webhook']) expect(sum(t, {})).not.toBe('');
    });

    test('texte de tiers nettoyé : pas de saut de ligne dans le nom', () => {
        expect(sum('create_webhook', { name: 'a\nb‮c' })).not.toMatch(/[\n‮]/);
    });
});
