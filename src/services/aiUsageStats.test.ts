import { describe, expect, test } from 'bun:test';
import { recordRuntimeUsage, resetUsageStats, usageEvents } from './aiUsageStats';

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
