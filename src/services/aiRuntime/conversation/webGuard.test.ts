import { describe, expect, test } from 'bun:test';
import { encryptAiFieldStrict } from '@/assets/utils/aiActionPlan';
import { guardedText, guardReasonText, guardSegments, isWebGuardTool, loadWebGuard, parseGuard } from './webGuard';

const SID = 'sess_1';
const CALL = 'call_9';
const clear = JSON.stringify({ v: 1, reasons: ['e2ee_passage', 'url_provenance', 'inconnu'], spans: [{ start: 26, end: 58 }] });

describe('garde web : motifs et passages (10 §4.4)', () => {
    test('outils concernés', () => {
        expect(isWebGuardTool('web_search')).toBe(true);
        expect(isWebGuardTool('web_fetch')).toBe(true);
        expect(isWebGuardTool('create_task')).toBe(false);
    });

    test('clair lu ; motif inconnu ignoré ; forme invalide → null', () => {
        expect(parseGuard(clear)).toEqual({ reasons: ['e2ee_passage', 'url_provenance'], spans: [{ start: 26, end: 58 }] });
        expect(parseGuard('{"v":2,"reasons":[]}')).toBeNull();
        expect(parseGuard('pas du json')).toBeNull();
        expect(parseGuard(JSON.stringify({ v: 1, reasons: [], spans: [{ start: 3, end: 1 }, { start: -1, end: 2 }, 'x'] }))?.spans).toEqual([]);
        expect(guardReasonText('member_name')).toContain('nom d’un membre');
    });

    test('passages soulignés : positions UTF-16, fusion, bornes', () => {
        const url = 'https://attaquant.example/budget-du-projet-helios-est-gele';
        expect(guardSegments(url, [{ start: 26, end: 58 }])).toEqual([
            { text: 'https://attaquant.example/', marked: false },
            { text: 'budget-du-projet-helios-est-gele', marked: true },
        ]);
        expect(guardSegments('abcdef', [{ start: 1, end: 3 }, { start: 2, end: 4 }, { start: 5, end: 99 }]).map(s => [s.text, s.marked]))
            .toEqual([['a', false], ['bcd', true], ['e', false], ['f', true]]);
        expect(guardSegments('é😀x', [{ start: 1, end: 3 }])).toEqual([{ text: 'é', marked: false }, { text: '😀', marked: true }, { text: 'x', marked: false }]);
        expect(guardSegments('', [])).toEqual([{ text: '', marked: false }]);
    });

    test('chaîne contrôlée : requête telle quelle, URL sous forme WHATWG', () => {
        expect(guardedText('web_search', { query: 'Projet  Hélios' })).toBe('Projet  Hélios');
        expect(guardedText('web_fetch', { url: 'HTTPS://Ex.Example:443/a?b#c' })).toBe('https://ex.example/a?b#c');
        expect(guardedText('web_fetch', {})).toBeNull();
    });

    test('lecture depuis l’API : déchiffré sous CK avec l’AAD de l’appel', async () => {
        const ck = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const guard = await encryptAiFieldStrict(ck, SID, CALL, 'web_guard', clear);
        const src = (pending: unknown) => ({ fetchPending: async () => pending, openKey: async () => ck });
        expect((await loadWebGuard(src({ id: CALL, name: 'web_fetch', guard }), SID, CALL))?.reasons).toEqual(['e2ee_passage', 'url_provenance']);
        // Sans garde (ancien worker) ou autre appel : null.
        expect(await loadWebGuard(src({ id: CALL, name: 'web_fetch' }), SID, CALL)).toBeNull();
        expect(await loadWebGuard(src({ id: 'autre', guard }), SID, CALL)).toBeNull();
        // Chiffré pour un autre appel (AAD) ou en clair : refusé.
        const other = await encryptAiFieldStrict(ck, SID, 'call_8', 'web_guard', clear);
        await expect(loadWebGuard(src({ id: CALL, guard: other }), SID, CALL)).rejects.toThrow();
        await expect(loadWebGuard(src({ id: CALL, guard: clear }), SID, CALL)).rejects.toThrow('web_guard_unreadable');
    });
});
