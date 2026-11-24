import { describe, expect, mock, test } from 'bun:test';
import pk from '../../../../scripts/e2ee-vectors/plan-kinds.json';
import type { JsonObject } from '@/assets/utils/aiActionPlan';

mock.module('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }));

const { isPlanKindExecutor } = await import('./registry');
const mods = {
    'message.send': await import('./message.send'),
    'message.edit': await import('./message.edit'),
    'dm.send': await import('./dm.send'),
    'dm.edit': await import('./dm.edit'),
};

const reference = (pk.validationCases[0] as unknown as { plan: { actions: JsonObject[] } }).plan.actions;
const resolve = (k: 'thread' | 'user', id: string) => (k === 'thread' && id === 'cm3threadexample000000001' ? 'général' : k === 'user' ? 'Bob' : null);

describe('exécutants des kinds de message (registre planKinds, L15f)', () => {
    for (const [kind, m] of Object.entries(mods)) {
        test(`${kind} : exécutant, schéma, exports, risque, outil client`, () => {
            expect(isPlanKindExecutor(m.default)).toBe(true);
            expect(m.default.kind).toBe(kind);
            const action = reference.find(a => a.kind === kind)!;
            expect(m.schema(action)).toBe(true);
            expect(m.schema({ ...action, args: { ...(action.args as JsonObject), inconnu: 1 } })).toBe(false);
            expect(m.exports[0]).toBe('id');
            expect(typeof m.label(action.args as JsonObject, resolve)).toBe('string');
            expect(m.clientTool.name).toMatch(/^(send|edit)_(message|dm)$/);
        });
    }
    test('intitulés lus dans l’annuaire local, texte cité borné', () => {
        expect(mods['message.send'].label({ threadId: 'cm3threadexample000000001', text: 'x'.repeat(200) }, resolve)).toBe(`Écrire dans #général : « ${'x'.repeat(80)}… »`);
        expect(mods['dm.send'].label({ peerId: 'u2', text: 'Salut' }, resolve)).toBe('Message privé à Bob : « Salut »');
        expect(mods['message.send'].clientTools.map(t => t.name)).toEqual(['send_message', 'forward_message']);
    });
    test('risques fixes de 12 §4.2 (plan-kinds.json kindRisk)', () => {
        for (const r of pk.kindRisk.filter(k => k.kind in mods)) expect(mods[r.kind as keyof typeof mods].risk).toBe(r.risk as 'R1' | 'R2');
    });
});
