import { describe, expect, test } from 'bun:test';
import type { ApiPort, HttpMethod } from '@/services/aiRuntime/ports';
import {
    addPolicyMembers, applyPolicyChange, disableWebAccess, enableWebAccess, fetchMyFeatures, webProviderLabel, listPolicies, listPolicyMembers, policyAnnouncement, PolicyApiError, setPolicyMode,
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

    test('de « Tout le monde » à une liste : liste vide = tous perdent (exact) ; sinon au moins n − choisies', () => {
        const empty = policyAnnouncement(change({ nextMode: 'list', enabledCount: 12, addedCount: 0 }));
        expect(empty.affected).toBe(12);
        expect(empty.text).toContain('12 personnes');
        const some = policyAnnouncement(change({ nextMode: 'list', enabledCount: 12, addedCount: 5 }));
        expect(some.affected).toBeNull();
        expect(some.text).toContain('au moins 7 le perdront');
        expect(policyAnnouncement(change({ nextMode: 'list', enabledCount: 3, addedCount: 5 })).text).toContain('qui ne sont pas dans la liste');
    });
});

describe('annonce de « Toujours accepter »', () => {
    test('vers « Personne » : aucune personne comptée (réglage local), la conséquence seulement', () => {
        const a = policyAnnouncement(change({ feature: 'tool_auto_accept', nextMode: 'none', enabledCount: 40 }));
        expect(a.affected).toBeNull();
        expect(a.text).not.toContain('40');
        expect(a.text).toContain('cessent de s\'appliquer');
        const b = policyAnnouncement(change({ feature: 'tool_auto_accept', nextMode: 'list', enabledCount: 40, addedCount: 3 }));
        expect(b.text).not.toContain('40');
    });
});

describe('enregistrement d\'un changement', () => {
    const ok = () => ({ status: 200, body: { revoked: 0, removed: 0, added: 0 } });
    test('tout le monde → liste : UN seul PUT { mode, userIds }, jamais « liste vide » puis ajouts', async () => {
        const { api, calls } = fakeApi(ok);
        await applyPolicyChange(api, 'o1', 'autonomous_mode', { currentMode: 'all', nextMode: 'list', added: ['u1', 'u2'], removed: [] });
        expect(calls).toEqual([{ method: 'PUT', path: '/api/orgs/o1/ai/feature-policies/autonomous_mode', body: { mode: 'list', userIds: ['u1', 'u2'] } }]);
    });
    test('plus de 100 personnes d\'un coup vers une liste : refus, rien envoyé', async () => {
        const { api, calls } = fakeApi(ok);
        const err = await applyPolicyChange(api, 'o1', 'autonomous_mode', { currentMode: 'none', nextMode: 'list', added: Array.from({ length: 101 }, (_, i) => `u${i}`), removed: [] }).catch(e => e);
        expect((err as PolicyApiError).code).toBe('list_too_large');
        expect(calls).toHaveLength(0);
    });
    test('déjà en liste : ajouts puis retraits ; autre mode : un PUT { mode }', async () => {
        const a = fakeApi(ok);
        await applyPolicyChange(a.api, 'o1', 'runtime_mode', { currentMode: 'list', nextMode: 'list', added: ['u1'], removed: ['u2'] });
        expect(a.calls.map(c => c.path.split('/').slice(-2).join('/'))).toEqual(['runtime_mode/members', 'members/remove']);
        const b = fakeApi(ok);
        await applyPolicyChange(b.api, 'o1', 'runtime_mode', { currentMode: 'list', nextMode: 'none', added: [], removed: [] });
        expect(b.calls).toEqual([{ method: 'PUT', path: '/api/orgs/o1/ai/feature-policies/runtime_mode', body: { mode: 'none' } }]);
    });
});

describe('accès web de l’agent (12 §11.3, PC92)', () => {
    test('GET /me : provider lu pour web_access seulement, nom hors liste ignoré', async () => {
        const { api } = fakeApi(() => ({ status: 200, body: { features: [
            { feature: 'web_access', allowed: true, enabled: false, warningVersion: 1, provider: 'staan' },
            { feature: 'autonomous_mode', allowed: false, enabled: false, warningVersion: 1, provider: 'staan' },
        ] } }));
        const out = await fetchMyFeatures(api, 'o1');
        expect(out[0]).toEqual({ feature: 'web_access', allowed: true, enabled: false, warningVersion: 1, provider: 'staan' });
        expect(out[1]).not.toHaveProperty('provider');
        const evil = fakeApi(() => ({ status: 200, body: { features: [{ feature: 'web_access', allowed: true, enabled: true, warningVersion: 1, provider: '<img src=x>' }] } }));
        expect((await fetchMyFeatures(evil.api, 'o1'))[0]!.provider).toBeNull();
    });

    test('activation : PUT opt-in avec la version de l’avertissement ; 403 de l’org → PolicyApiError', async () => {
        const ok = fakeApi(() => ({ status: 200, body: { feature: 'web_access', enabled: true } }));
        await enableWebAccess(ok.api, 'o 1', 1);
        expect(ok.calls).toEqual([{ method: 'PUT', path: '/api/orgs/o%201/ai/feature-policies/me/web_access/opt-in', body: { warningVersion: 1 } }]);
        const denied = fakeApi(() => ({ status: 403, body: { error: 'feature_not_allowed' } }));
        expect(((await enableWebAccess(denied.api, 'o1', 1).catch(e => e)) as PolicyApiError).code).toBe('feature_not_allowed');
        const none = fakeApi(() => ({ status: 200, body: {} }));
        expect(((await enableWebAccess(none.api, 'o1', 0).catch(e => e)) as PolicyApiError).code).toBe('invalid_body');
        expect(none.calls).toHaveLength(0);
    });

    test('désactivation : DELETE opt-in ; déjà désactivé (404) = succès ; autre erreur levée', async () => {
        const a = fakeApi(() => ({ status: 200, body: { feature: 'web_access', enabled: false, revoked: [] } }));
        await disableWebAccess(a.api, 'o1');
        expect(a.calls).toEqual([{ method: 'DELETE', path: '/api/orgs/o1/ai/feature-policies/me/web_access/opt-in', body: undefined }]);
        await disableWebAccess(fakeApi(() => ({ status: 404, body: { error: 'not_found' } })).api, 'o1');
        expect(((await disableWebAccess(fakeApi(() => ({ status: 500, body: null })).api, 'o1').catch(e => e)) as PolicyApiError).code).toBe('api_error');
    });

    test('nom du service : connu ou phrase neutre, jamais une valeur brute', () => {
        expect(webProviderLabel('staan')).toBe('Staan');
        expect(webProviderLabel('mojeek')).toBe('Mojeek');
        expect(webProviderLabel(null)).toContain('choisi par votre organisation');
    });

    test('annonce du retrait : nombre exact et conséquence propre au web', () => {
        const a = policyAnnouncement(change({ feature: 'web_access', enabledCount: 2 }));
        expect(a.affected).toBe(2);
        expect(a.text).toContain('ne cherche plus sur internet');
        const one = policyAnnouncement(change({ feature: 'web_access', currentMode: 'list', nextMode: 'list', removed: [{ name: 'Inès', enabled: true }] }));
        expect(one.text).toContain("Inès utilise l'accès web de l'agent");
    });
});
