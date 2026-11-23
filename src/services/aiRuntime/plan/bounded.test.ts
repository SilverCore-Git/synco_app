import { describe, expect, test } from 'bun:test';
import { mapBounded } from './bounded';

describe('mapBounded', () => {
    test('au plus `limit` en parallèle, résultats dans l’ordre, tout est traité', async () => {
        let live = 0, peak = 0;
        const res = await mapBounded(Array.from({ length: 30 }, (_, i) => i), 8, async i => {
            live++; peak = Math.max(peak, live);
            await new Promise(r => setTimeout(r, 2));
            live--;
            return i * 2;
        });
        expect(res).toEqual(Array.from({ length: 30 }, (_, i) => i * 2));
        expect(peak).toBeGreaterThan(1);
        expect(peak).toBeLessThanOrEqual(8);
    });
    test('liste vide', async () => { expect(await mapBounded([], 8, async () => 1)).toEqual([]); });
});
