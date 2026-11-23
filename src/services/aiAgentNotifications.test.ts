import { describe, expect, test } from 'bun:test';
import { nudgeAllowed, readAgentNotifPrefs, AGENT_NOTIF_CASES } from './aiAgentNotifications';
import { expiryText, parsePlansSummary } from './aiPlansSummary';

describe('préférences de notification de l\'agent', () => {
    test('absentes ou en ancien format : tout est actif', () => {
        for (const raw of [undefined, null, {}, { push: false }, '{"push":true}', 'pas du json']) {
            const p = readAgentNotifPrefs(raw);
            expect(Object.values(p).every(v => v === true)).toBe(true);
        }
    });
    test('un cas coupé ne coupe que sa bulle ; la catégorie coupée les coupe toutes', () => {
        const p = readAgentNotifPrefs({ agent: { plan: false } });
        expect(nudgeAllowed(p, 'confirmation')).toBe(false);
        expect(nudgeAllowed(p, 'question')).toBe(true);
        expect(nudgeAllowed(p, 'key')).toBe(true);
        const off = readAgentNotifPrefs(JSON.stringify({ agent: { enabled: false } }));
        for (const w of ['confirmation', 'question', 'upload', 'key'] as const) expect(nudgeAllowed(off, w)).toBe(false);
    });
    test('les cinq cas de l\'aperçu ne contiennent aucun contenu de conversation', () => {
        expect(AGENT_NOTIF_CASES.length).toBe(5);
        for (const c of AGENT_NOTIF_CASES) expect(c.sample.startsWith('Synco AI') || c.sample.startsWith('Ouvrez Synco')).toBe(true);
    });
});

describe('résumé des plans', () => {
    test('lecture défensive', () => {
        expect(parsePlansSummary(null)).toEqual({ toValidate: 0, inProgress: 0, pending: [] });
        const s = parsePlansSummary({ toValidate: 2, inProgress: 1, pending: [{ id: 'p', conversationId: 'c', expiresAt: '2026-11-24T10:00:00.000Z', actionCount: 3 }, { id: 'x' }, { id: 'q', conversationId: 'c', expiresAt: 'nope' }] });
        expect(s.pending.length).toBe(1);
        expect(s.pending[0]!.actionCount).toBe(3);
        expect(s.toValidate).toBe(2);
    });
    test('expiration lisible', () => {
        const now = new Date('2026-11-23T10:00:00Z');
        expect(expiryText(new Date('2026-11-23T09:00:00Z'), now)).toBe('expiré');
        expect(expiryText(new Date('2026-11-23T10:20:00Z'), now)).toBe('dans 20 min');
        expect(expiryText(new Date('2026-11-23T15:00:00Z'), now)).toBe('dans 5 h');
        expect(expiryText(new Date('2026-11-26T10:00:00Z'), now)).toBe('dans 3 jours');
    });
});
