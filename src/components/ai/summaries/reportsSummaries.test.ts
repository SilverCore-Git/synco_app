import { describe, expect, test } from 'bun:test';
import { summarizeTool, noSummaryContext } from './summaryRegistry';
import * as reports from './reportsSummaries';

const modules = { './reportsSummaries.ts': reports };
const sum = (tool: string, args: Record<string, unknown>) => summarizeTool(tool, args, noSummaryContext, modules);

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
        expect(s).toContain('name, sections');
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
        expect(s).toContain('salon de destination modifié');
        expect(s).toContain('chiffrement de bout en bout désactivé');
    });

    test('suppression et test : résumé non vide', () => {
        for (const t of ['delete_email_report', 'send_test_email_report', 'delete_webhook', 'test_webhook']) expect(sum(t, {})).not.toBe('');
    });

    test('texte de tiers nettoyé : pas de saut de ligne dans le nom', () => {
        expect(sum('create_webhook', { name: 'a\nb‮c' })).not.toMatch(/[\n‮]/);
    });
});
