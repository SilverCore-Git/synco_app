import { describe, expect, test } from 'bun:test';
import { buildReportsView } from './reportsResultModel';
import { buildResultRegistry } from './resultRegistry';

describe('rendu du domaine Rapports et webhooks', () => {
    test('ReportsResult.vue s’enregistre sous le domaine reports', () => {
        expect(Object.keys(buildResultRegistry({ './ReportsResult.vue': async () => ({ default: {} }) }))).toEqual(['reports']);
    });

    test('list_email_reports : une carte par rapport, suspendu signalé', () => {
        const v = buildReportsView('list_email_reports', [
            { id: 'r1', name: 'Matin', enabled: true, rhythm: 'DAILY', space: { id: 's', name: 'Équipe' }, nextRunAt: '2026-12-01T08:00:00.000Z' },
            { id: 'r2', name: 'Soir', enabled: false, rhythm: 'WEEKLY', space: null },
        ]);
        expect(v.kind).toBe('cards');
        if (v.kind !== 'cards') return;
        expect(v.cards[0]!.subtitle).toContain('Chaque jour · Équipe · prochain envoi');
        expect(v.cards[1]).toMatchObject({ icon: 'bi-pause-circle', subtitle: 'Chaque semaine · Toute l’organisation · suspendu' });
    });

    test('liste vide et résultat inattendu : messages, jamais d’exception', () => {
        expect(buildReportsView('list_email_reports', [])).toEqual({ kind: 'message', text: 'Aucun rapport e-mail.' });
        expect(buildReportsView('get_email_report', null)).toEqual({ kind: 'message', text: 'Rapport introuvable.' });
        expect(buildReportsView('get_webhook', 'x')).toEqual({ kind: 'message', text: 'Webhook introuvable.' });
    });

    test('aperçu : objet et texte, indication de troncature', () => {
        expect(buildReportsView('preview_email_report', { subject: 'Point', text: 'a\nb', truncated: true })).toEqual({ kind: 'preview', subject: 'Point', text: 'a\nb', truncated: true });
    });

    test('webhooks : signature absente et débit limité signalés, aucun secret ni URL rendu', () => {
        const v = buildReportsView('list_webhooks', {
            webhooks: [{ id: 'w', name: 'CI', isActive: true, requireSignature: false, isRateLimited: true, usageCount: 3, token: 'SECRET', url: 'https://x/hook/SECRET' }],
            truncated: true,
        });
        expect(v.kind).toBe('cards');
        if (v.kind !== 'cards') return;
        expect(v.truncated).toBe(true);
        expect(v.cards[0]!.subtitle).toBe('actif · sans signature · limité en débit · 3 appels');
        expect(JSON.stringify(v)).not.toContain('SECRET');
    });

    test('get_webhook : statistiques ajoutées à la carte', () => {
        const v = buildReportsView('get_webhook', { webhook: { id: 'w', name: 'CI', isActive: true }, stats: { totalCalls: 5, successCount: 4, errorCount: 1 } });
        expect(v.kind === 'cards' && v.cards[0]!.subtitle).toBe('actif · 4 succès, 1 erreur');
    });

    test('messages propres à chaque geste', () => {
        expect(buildReportsView('delete_webhook', { deleted: true }).kind).toBe('message');
        expect(buildReportsView('set_email_report_enabled', { enabled: false })).toEqual({ kind: 'message', text: 'Rapport suspendu.' });
        expect(buildReportsView('test_webhook', { sent: true })).toEqual({ kind: 'message', text: 'Message de test posté dans le salon du webhook.' });
    });
});
