import { describe, expect, test } from 'bun:test';
import { summaries } from './notificationsSummaries';
import { noSummaryContext } from './summaryRegistry';

describe('résumés du domaine notifications', () => {
    test('le message de statut est montré tel quel, nettoyé', () => {
        const s = summaries.set_my_status_message!({ message: 'En\nréunion‮' }, noSummaryContext);
        expect(s).toContain('« En réunion »');
        expect(s).toContain('tous les membres');
    });
    test('effacement et message absent', () => {
        expect(summaries.set_my_status_message!({ clear: true }, noSummaryContext)).toBe('Effacer mon message de statut');
        expect(summaries.set_my_status_message!({}, noSummaryContext)).toContain('message absent');
    });
    test('échéance affichée', () => {
        expect(summaries.set_my_status_message!({ message: 'x', until: '2026-12-01T10:00:00Z' }, noSummaryContext)).toContain('jusqu’au');
    });
});
