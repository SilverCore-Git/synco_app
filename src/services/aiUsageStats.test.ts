import { describe, expect, test } from 'bun:test';
import { filterUsage, groupUsage, recordRuntimeTool, recordRuntimeUsage, resetUsageStats, summarizeUsage, tokenEvents, toolUsage, topConversations, usageEvents, type UsageEvent } from './aiUsageStats';

describe('usage runtime (PC79)', () => {
    test('enregistre sessionId et régime, une seule fois par message (trame rejouée)', () => {
        resetUsageStats();
        expect(recordRuntimeUsage('s1', { messageId: 'm1', promptTokens: 10, completionTokens: 5, totalTokens: 15 })).toBe(true);
        expect(recordRuntimeUsage('s1', { messageId: 'm1', totalTokens: 15 })).toBe(false);
        expect(recordRuntimeUsage('s2', { messageId: 'm1', totalTokens: 7 })).toBe(true);
        expect(usageEvents.value.map(e => [e.sessionId, e.regime, e.totalTokens])).toEqual([['s1', 'runtime', 15], ['s2', 'runtime', 7]]);
    });
    test('une trame sans tokens est ignorée', () => {
        resetUsageStats();
        expect(recordRuntimeUsage('s1', { messageId: 'm2' })).toBe(false);
    });
});

const ev = (o: Partial<UsageEvent>): UsageEvent => ({ t: 1_000_000, provider: 'x', model: 'm', promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0, ...o });

describe('agrégats des statistiques (tokens seulement)', () => {
    const old = ev({ totalTokens: 100, model: 'ancien' }); // ancien format : ni sessionId, ni regime, ni tool
    const rt = ev({ totalTokens: 50, regime: 'runtime', sessionId: 's1', messageId: 'm1' });
    const tool = ev({ regime: 'runtime', sessionId: 's1', tool: 'create_task', messageId: 'c1' });

    test('ancien format : compté comme appareil, sans conversation', () => {
        expect(filterUsage([old, rt], { days: 0, source: 'device' })).toEqual([old]);
        expect(filterUsage([old, rt], { days: 0, source: 'runtime' })).toEqual([rt]);
        const s = summarizeUsage([old]);
        expect(s).toEqual({ tokens: 100, requests: 1, conversations: { runtime: 0, device: 0, total: 0 }, toolCalls: 0 });
    });
    test('la période écarte les évènements trop vieux', () => {
        expect(filterUsage([old], { days: 7, source: 'all', now: 1_000_000 + 8 * 86400000 })).toEqual([]);
        expect(filterUsage([old], { days: 7, source: 'all', now: 1_000_000 + 86400000 })).toEqual([old]);
    });
    test('les appels d\'outils ne gonflent ni les requêtes ni les tokens', () => {
        const s = summarizeUsage([old, rt, tool]);
        expect(s.requests).toBe(2);
        expect(s.tokens).toBe(150);
        expect(s.toolCalls).toBe(1);
        expect(s.conversations.runtime).toBe(1);
        expect(groupUsage(tokenEvents([old, rt, tool]), e => e.model).reduce((n, g) => n + g.requests, 0)).toBe(2);
    });
    test('par conversation et par outil', () => {
        expect(topConversations([rt, tool, ev({ totalTokens: 900, regime: 'runtime', sessionId: 's2' })], 1)).toEqual([{ sessionId: 's2', tokens: 900, tools: 0, source: 'runtime' }]);
        expect(topConversations([rt, tool])[0]).toEqual({ sessionId: 's1', tokens: 50, tools: 1, source: 'runtime' });
        expect(toolUsage([tool, ev({ tool: 'create_task', sessionId: 's2' }), ev({ tool: 'list' })])).toEqual([{ tool: 'create_task', calls: 2 }, { tool: 'list', calls: 1 }]);
    });
    test('enregistrement d\'un appel d\'outil : une fois par appel, jamais de montant', () => {
        resetUsageStats();
        expect(recordRuntimeTool('s1', 'c1', 'create_task')).toBe(true);
        expect(recordRuntimeTool('s1', 'c1', 'create_task')).toBe(false);
        expect(recordRuntimeTool('s1', '', 'x')).toBe(false);
        expect(usageEvents.value.length).toBe(1);
        expect(Object.keys(usageEvents.value[0]!).some(k => /cost|price|eur|amount/i.test(k))).toBe(false);
        resetUsageStats();
    });
});
