import { describe, expect, mock, test } from 'bun:test';

mock.module('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }));
const { toReadView, boundReadViews, READ_TEXT_MAX, READ_RESULT_MAX_BYTES } = await import('./agentMessaging');

const msg = (i: number, content = `m${i}`) => ({ id: `id${i}`, senderId: 'u1', createdAt: new Date(1_700_000_000_000 + i * 1000), replyToId: null, content });

describe('lecture bornée des messages pour le modèle', () => {
    test('vue sans chiffré ni clé ; texte coupé ; nom pris dans l’annuaire', () => {
        const v = toReadView({ ...msg(1, 'é'.repeat(READ_TEXT_MAX + 5)), iv: 'm2.secret' } as never, () => 'Alice');
        expect(Array.from(v.text)).toHaveLength(READ_TEXT_MAX);
        expect(v.cut).toBe(true);
        expect(v.senderName).toBe('Alice');
        expect(JSON.stringify(v)).not.toContain('secret');
    });
    test('message de l’agent : mention ; texte non confirmé signalé au modèle', () => {
        expect(toReadView({ ...msg(1), agentMark: { author: 'ai' } }, () => null).agent).toBe('ai');
        const v = toReadView({ ...msg(1), agentMark: { author: 'rt1', delegationId: 'd', text: 'text_unverified' } }, () => null);
        expect([v.agent, v.textUnconfirmed]).toEqual(['autonomous', true]);
    });
    test('64 Kio au plus, les plus récents gardés', () => {
        const views = Array.from({ length: 40 }, (_, i) => toReadView(msg(i, 'x'.repeat(3000)), () => null));
        const out = boundReadViews(views);
        expect(out.truncated).toBe(true);
        expect(out.messages.at(-1)!.id).toBe('id39');
        expect(new TextEncoder().encode(JSON.stringify(out.messages)).length).toBeLessThanOrEqual(READ_RESULT_MAX_BYTES);
        expect(boundReadViews(views.slice(0, 3)).truncated).toBe(false);
    });
});
