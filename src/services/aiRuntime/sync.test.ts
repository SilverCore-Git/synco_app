/**
 * Synchro P11 (03 §7.2) : tâche de fond, org concernée seulement, regroupement, backoff plafonné,
 * arrêt sur une erreur qui demande l'utilisateur.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDelegationKeys, createDelegation } from './delegation';
import { verifyRuntimeForDelegation } from './runtimeTrust';
import { RuntimeKeySync, SYNC_MAX_FAILURES } from './sync';
import { bindRuntimeSync } from './index';
import { ORG, OTHER_ORG, USER, makeHarness, type Harness } from './testHarness';

const T1 = 'cm3threadorg000000000001';
const T2 = 'cm3threadorg000000000002';
const T_OTHER = 'cm3threadother0000000001';
const rand = () => crypto.getRandomValues(new Uint8Array(32));
const count = (h: Harness, method: string, suffix: string) => h.requests.filter(r => r.method === method && r.path.endsWith(suffix)).length;

async function pinned(): Promise<Harness> {
    const h = await makeHarness();
    await verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true });
    h.threads.add(T1).add(T2);
    for (const t of [T1, T2, T_OTHER]) h.held.set(`thread|${t}|1`, rand());
    return h;
}

beforeEach(() => clearDelegationKeys());

describe('à l\'ouverture', () => {
    test('mode runtime jamais activé sur cet appareil : rien n\'est déposé', async () => {
        const h = await pinned();
        const s = new RuntimeKeySync(h.deps, ORG);
        s.start();
        await s.idle();
        expect(count(h, 'POST', '/ai/runtime/delegations')).toBe(0);
        expect(s.snapshot()).toMatchObject({ phase: 'idle', lastError: null });
        s.dispose();
    });

    test('start ne bloque pas l\'appelant ; DK absente (nouvelle session) → nouvelle délégation complète', async () => {
        const h = await pinned();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        const first = h.current!.delegationId;
        clearDelegationKeys(); // nouvelle session de l'app
        const s = new RuntimeKeySync(h.deps, ORG);
        s.start();
        expect(s.snapshot().phase).toBe('running');
        await s.idle();
        expect(h.current!.delegationId).not.toBe(first);
        expect(count(h, 'POST', '/ai/runtime/delegations')).toBe(2);
        s.dispose();
    });

    test('moins de 50 % restants → renouvellement ; sinon seulement les clés manquantes de l\'org', async () => {
        const h = await pinned();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        const s = new RuntimeKeySync(h.deps, ORG);
        h.missing = [{ kind: 'thread', ref: T2, version: 1 }, { kind: 'thread', ref: T_OTHER, version: 1 }];
        s.start();
        await s.idle();
        expect(count(h, 'POST', '/ai/runtime/delegations')).toBe(1);
        const sent = h.requests.filter(r => r.path.endsWith('/entries')).flatMap(r => (r.body as { entries: { ref: string }[] }).entries.map(e => e.ref));
        expect(sent).toContain(T2);
        expect(sent).not.toContain(T_OTHER);
        expect(h.opened.map(k => k.ref)).not.toContain(T_OTHER);

        h.now.t += 4 * 86_400; // plus de la moitié de 7 jours
        h.missing = [];
        s.start();
        await s.idle();
        expect(count(h, 'POST', '/ai/runtime/delegations')).toBe(2);
        s.dispose();
    });

    test('mode auto retiré par l\'org : redéposé en plan (PC40), état signalé', async () => {
        const h = await pinned();
        await createDelegation(h.deps, ORG, { mode: 'auto' });
        h.current!.status = 'revoked';
        h.override = (method, path, body) =>
            method === 'POST' && path.endsWith('/ai/runtime/delegations') && (body as { mode?: string }).mode === 'auto' ? { status: 403, body: { error: 'feature_not_allowed' } } : undefined;
        const s = new RuntimeKeySync(h.deps, ORG);
        s.start();
        await s.idle();
        expect(h.current).toMatchObject({ mode: 'plan', status: 'active' });
        expect(s.snapshot().autonomyWithdrawn).toBe(true);
        s.dispose();
    });

    test('le mode reconduit vient du mandat vérifié, pas du champ servi', async () => {
        const h = await pinned();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        h.current!.mode = 'auto'; // API qui ment
        h.current!.mandateVersion = 2;
        h.now.t += 5 * 86_400;
        const s = new RuntimeKeySync(h.deps, ORG);
        s.start();
        await s.idle();
        const last = h.requests.filter(r => r.method === 'POST' && r.path.endsWith('/ai/runtime/delegations')).at(-1)!;
        expect((last.body as { mode: string }).mode).toBe('plan');
        s.dispose();
    });
});

describe('jamais de boucle', () => {
    test('échecs : backoff 30 s, 60 s, 120 s, 240 s puis arrêt après 5 essais', async () => {
        const h = await pinned();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        h.override = (method, path) => (method === 'GET' && path.endsWith('/delegations/current') ? { status: 500, body: { error: 'internal' } } : undefined);
        const s = new RuntimeKeySync(h.deps, ORG);
        s.start();
        await s.idle();
        expect(s.snapshot()).toMatchObject({ phase: 'waiting_retry', failures: 1, lastError: 'api_error' });
        const calls = () => count(h, 'GET', '/delegations/current');
        const at = calls();
        await h.advance(29_000);
        expect(calls()).toBe(at);
        await h.advance(1_000);
        expect(calls()).toBe(at + 1);
        await h.advance(60_000 + 120_000 + 240_000);
        expect(s.snapshot()).toMatchObject({ phase: 'stopped', failures: SYNC_MAX_FAILURES });
        const final = calls();
        await h.advance(3 * 3_600_000);
        expect(calls()).toBe(final);
        s.notifyKeyEvent();
        await h.advance(10_000);
        expect(calls()).toBe(final);
        s.dispose();
    });

    test('clé du runtime changée : arrêt immédiat, aucun nouvel essai', async () => {
        const h = await pinned();
        h.store.set(`rt-mode:${USER}:${ORG}`, { v: 1, enabled: true, mode: 'plan' });
        h.store.set(`rt-pin:${USER}:${ORG}`, { v: 1, runtimeId: h.rt.runtimeId, fpr: '0'.repeat(64), firstSeen: 1, previous: [] });
        const s = new RuntimeKeySync(h.deps, ORG);
        s.start();
        await s.idle();
        expect(s.snapshot()).toMatchObject({ phase: 'stopped', lastError: 'runtime_key_changed' });
        expect(h.timers.filter(t => t.at < 3_600_000)).toHaveLength(0);
        expect(count(h, 'POST', '/ai/runtime/delegations')).toBe(0);
        s.dispose();
    });

    test('évènements temps réel regroupés : une seule requête pour une rafale ; autres orgs ignorées', async () => {
        const h = await pinned();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        const s = new RuntimeKeySync(h.deps, ORG);
        const listeners = new Map<string, (p: unknown) => void>();
        const unbind = bindRuntimeSync(h.deps, s, { on: (e, l) => listeners.set(e, l), off: e => listeners.delete(e) });
        const before = count(h, 'GET', '/current/missing');
        for (let i = 0; i < 10; i++) listeners.get('thread:created')!({ orgId: ORG, thread: { id: T2 } });
        listeners.get('thread:created')!({ orgId: OTHER_ORG, thread: { id: T_OTHER } });
        await h.advance(4_000);
        expect(count(h, 'GET', '/current/missing')).toBe(before);
        await h.advance(1_000);
        await s.idle();
        expect(count(h, 'GET', '/current/missing')).toBe(before + 1);
        listeners.get('thread:created')!({ orgId: OTHER_ORG, thread: { id: T_OTHER } });
        await h.advance(10_000);
        expect(count(h, 'GET', '/current/missing')).toBe(before + 1);
        unbind();
        expect(listeners.size).toBe(0);
        s.dispose();
    });
});
