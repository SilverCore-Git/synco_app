import { describe, expect, test } from 'bun:test';
import type { ApiPort, HttpMethod } from '@/services/aiRuntime/ports';
import {
    addPolicyMembers, fetchMyFeatures, listPolicies, listPolicyMembers, policyAnnouncement, PolicyApiError, setPolicyMode,
    type PendingPolicyChange,
} from './aiFeaturePolicies';

function fakeApi(handler: (method: HttpMethod, path: string, body?: unknown) => { status: number; body: unknown }): { api: ApiPort; calls: Array<{ method: string; path: string; body?: unknown }> } {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    return {
        calls,
        api: { request: async (method, path, body) => { calls.push({ method, path, body }); return handler(method, path, body); } },
    };
}

describe('API des politiques', () => {
    test('listPolicies ignore une fonctionnalité réservée ou un mode inconnu', async () => {
        const { api } = fakeApi(() => ({
            status: 200,
            body: { policies: [
                { feature: 'autonomous_mode', mode: 'none', memberCount: 0, enabledCount: 0 },
                { feature: 'subagents', mode: 'all', memberCount: 9, enabledCount: 1 },
                { feature: 'runtime_mode', mode: 'weird', memberCount: 9, enabledCount: 1 },
                { feature: 'tool_auto_accept', mode: 'list', memberCount: 24, enabledCount: 12 },
            ] },
        }));
        const out = await listPolicies(api, 'o1');
        expect(out.map(p => p.feature)).toEqual(['autonomous_mode', 'tool_auto_accept']);
        expect(out[1]).toEqual({ feature: 'tool_auto_accept', mode: 'list', memberCount: 24, enabledCount: 12 });
    });

    test('la recherche part côté serveur (?q=) avec une limite bornée', async () => {
        const { api, calls } = fakeApi(() => ({ status: 200, body: { members: [{ userId: 'u1', enabled: true }, { nope: 1 }], next: 'u1' } }));
        const page = await listPolicyMembers(api, 'o 1', 'runtime_mode', { q: 'ines', limit: 5000 });
        expect(calls[0]!.path).toBe('/api/orgs/o%201/ai/feature-policies/runtime_mode/members?q=ines&limit=100');
        expect(page).toEqual({ members: [{ userId: 'u1', enabled: true }], next: 'u1' });
    });

    test("une erreur d'API devient une PolicyApiError au code lisible", async () => {
        const { api } = fakeApi(() => ({ status: 409, body: { error: 'policy_not_list' } }));
        const err = await addPolicyMembers(api, 'o1', 'runtime_mode', ['a']).catch(e => e);
        expect(err).toBeInstanceOf(PolicyApiError);
        expect((err as PolicyApiError).code).toBe('policy_not_list');
    });

    test("l'ajout de plus de 100 personnes est découpé", async () => {
        const { api, calls } = fakeApi(() => ({ status: 200, body: { added: 1 } }));
        await addPolicyMembers(api, 'o1', 'tool_auto_accept', Array.from({ length: 230 }, (_, i) => `u${i}`));
        expect(calls.map(c => (c.body as { userIds: string[] }).userIds.length)).toEqual([100, 100, 30]);
    });

    test('setPolicyMode et fetchMyFeatures lisent la réponse', async () => {
        const { api } = fakeApi((m) => m === 'PUT'
            ? { status: 200, body: { feature: 'runtime_mode', mode: 'none', revoked: 3 } }
            : { status: 200, body: { features: [{ feature: 'autonomous_mode', allowed: true, enabled: false, warningVersion: 2 }, { feature: 'x' }] } });
        expect(await setPolicyMode(api, 'o1', 'runtime_mode', 'none')).toEqual({ revoked: 3 });
        expect(await fetchMyFeatures(api, 'o1')).toEqual([{ feature: 'autonomous_mode', allowed: true, enabled: false, warningVersion: 2 }]);
    });
});

const change = (over: Partial<PendingPolicyChange>): PendingPolicyChange => ({
    feature: 'autonomous_mode', currentMode: 'all', nextMode: 'none', enabledCount: 0, removed: [], addedCount: 0, ...over,
});

describe("annonce avant l'enregistrement", () => {
    test('passer à « Personne » annonce le nombre exact', () => {
        const a = policyAnnouncement(change({ enabledCount: 3 }));
        expect(a.affected).toBe(3);
        expect(a.text).toContain('3 personnes l\'utilisent ; elles le perdront immédiatement.');
    });

    test('une seule personne retirée de la liste est nommée', () => {
        const a = policyAnnouncement(change({ currentMode: 'list', nextMode: 'list', removed: [{ name: 'Inès Benali', enabled: true }, { name: 'Zoé', enabled: false }] }));
        expect(a.affected).toBe(1);
        expect(a.text).toContain('Inès Benali utilise le mode autonome');
        expect(a.text).toContain('tout de suite');
    });

    test("seules les personnes qui l'utilisent comptent dans une liste", () => {
        const a = policyAnnouncement(change({ currentMode: 'list', nextMode: 'list', removed: [{ name: 'A', enabled: false }] }));
        expect(a).toEqual({ affected: 0, text: null });
        const b = policyAnnouncement(change({ currentMode: 'list', nextMode: 'list', removed: [{ name: 'A', enabled: true }, { name: 'B', enabled: true }, { name: 'C', enabled: true }] }));
        expect(b.affected).toBe(3);
        expect(b.text).toContain('3 personnes l\'utilisent ; elles le perdront immédiatement.');
    });

    test('rien à annoncer en élargissant ou quand personne ne l\'utilisait', () => {
        expect(policyAnnouncement(change({ currentMode: 'none', nextMode: 'all' })).text).toBeNull();
        expect(policyAnnouncement(change({ currentMode: 'list', nextMode: 'all', enabledCount: 4 })).text).toBeNull();
        expect(policyAnnouncement(change({ enabledCount: 0 })).text).toBeNull();
    });

    test('de « Tout le monde » à une liste, le nombre est un plafond', () => {
        const a = policyAnnouncement(change({ nextMode: 'list', enabledCount: 12 }));
        expect(a.affected).toBeNull();
        expect(a.text).toContain("Jusqu'à 12 personnes");
    });
});
