/** Cycle de vie d'un plan dans la conversation : chargement, décision, réouverture, plan illisible. */
import { describe, expect, test } from 'bun:test';
import raw from '../../../../scripts/e2ee-vectors/action-plan.json';
import { ToolManifest, type JsonObject, type JsonValue, type PlanContext } from '@/assets/utils/aiActionPlan';
import type { NameResolver } from './planLabels';
import { usePlanFlow } from './planFlow';
import { memoryPlanLocalStore, type PlanLocalStore } from './planLocal';
import type { PlanSessionDeps } from './planSession';

interface V { sessionId: string; planId: string; ckHex: string; plan: JsonObject; planValue: string; planExecutors: ('device' | 'agent')[]; toolManifest: JsonValue; serverDigests: { plan: string | null; n: number | null; sha256Hex: string }[] }
const v = raw as unknown as V;
/** Annuaire local qui connaît l'espace du vecteur : un lieu inconnu interdirait la carte (PC76). */
const spaceKnown: NameResolver = { resolve: (kind, id) => (kind === 'space' && id === (((v.plan.actions as JsonObject[])[0]!.args as JsonObject).spaceId as string) ? 'Chantiers' : null) };
const ck = Uint8Array.from(Buffer.from(v.ckHex, 'hex'));
const context: PlanContext = { sessionId: v.sessionId, maxLifetimeSecs: 604_800, manifest: ToolManifest.fromJson(v.toolManifest), mode: 'plan', createThreadAsk: true };
const SPACE = (v.plan.actions as JsonObject[])[0]!.args as JsonObject;
const call = { id: 'call_7', name: 'propose_actions', planId: v.planId, args: v.planValue };

function server(status: string, calls: { method: string; path: string; body: unknown }[], digestOverride?: Record<string, string>) {
    const digest = v.serverDigests.find(d => d.plan === 'plan')!;
    const actions = (v.plan.actions as JsonObject[]).map((a, i) => ({ n: a.n as number, executor: v.planExecutors[i]!, after: (a.after as number[] | undefined) ?? [], state: status === 'proposed' ? 'pending' : 'pending' }));
    const body = () => ({ planId: v.planId, sessionId: v.sessionId, toolCallId: 'call_7', status, actionCount: actions.length, serverDigests: digestOverride ?? { [String(digest.n)]: digest.sha256Hex }, actions, agentResults: [], expiresAt: '2099-01-01T00:00:00.000Z' });
    return async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, b?: unknown) => {
        calls.push({ method, path, body: b });
        if (method === 'POST') status = (b as { decision: string }).decision === 'accept' ? 'accepted' : 'rejected';
        return { status: 200, body: body() };
    };
}

function flow(status: string, pending: typeof call | null = call, digestOverride?: Record<string, string>, auto?: string[], flags?: { name: string; sensitive?: boolean }[], allowed = true, local?: PlanLocalStore) {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const session: PlanSessionDeps = {
        ck, orgId: 'o', sessionId: v.sessionId, context, knownLocalId: (_f, id) => id === SPACE.spaceId, resolver: spaceKnown, flags,
        api: { request: server(status, calls, digestOverride) },
    };
    return { calls, f: usePlanFlow({ session, pendingCall: async () => pending, now: () => Date.UTC(2026, 10, 23), autoAccept: auto ? () => auto : undefined, autoAcceptAllowed: () => allowed, local }) };
}

describe('usePlanFlow', () => {
  test('plan proposé : modèle construit, décision acceptée depuis le graphe, suivi', async () => {
        const { f, calls } = flow('proposed');
        await f.load();
        expect(f.status.value).toBe('proposed');
        expect(f.loaded.value?.model.actions).toHaveLength(5);
        expect(await f.accept([1, 2, 3, 4, 5], 'graph')).toBe(true);
        expect(f.status.value).toBe('following');
        expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/decision'))).toBe(true);
        expect(f.progress.value?.total).toBe(5);
    });
    test('l’ensemble accepté est conservé et relu après rechargement ; sans lui, rien n’est présumé accepté', async () => {
        const local = memoryPlanLocalStore();
        const a = flow('proposed', call, undefined, undefined, undefined, true, local);
        await a.f.load();
        await a.f.accept([1, 2, 3, 4, 5], 'graph');
        expect(local.read(v.planId).accepted).toEqual([1, 2, 3, 4, 5]);
        const b = flow('accepted', call, undefined, undefined, undefined, true, local);
        await b.f.load();
        expect(b.f.localAccepted.value).toEqual([1, 2, 3, 4, 5]);
        const c = flow('accepted', call, undefined, undefined, undefined, true, memoryPlanLocalStore());
        await c.f.load();
        expect(c.f.localAccepted.value).toBeNull();
    });
    test('refus : plan terminé, décision reject', async () => {
        const { f, calls } = flow('proposed');
        await f.load();
        expect(await f.reject()).toBe(true);
        expect(f.status.value).toBe('ended');
        expect((calls.find(c => c.method === 'POST')!.body as { decision: string }).decision).toBe('reject');
    });
    test('réouverture d’un plan déjà accepté : suivi sans nouvelle décision', async () => {
        const { f, calls } = flow('accepted');
        await f.load();
        expect(f.status.value).toBe('following');
        expect(calls.some(c => c.method === 'POST')).toBe(false);
        expect(await f.accept([1], 'graph')).toBe(false);
    });
    test('plan modifié : illisible, refusé sans rien faire', async () => {
        const { f, calls } = flow('proposed', call, { '5': '0'.repeat(64) });
        await f.load();
        expect(f.status.value).toBe('invalid');
        expect((calls.find(c => c.method === 'POST')!.body as { reason?: string }).reason).toBe('plan_invalid');
    });
    test('aucun plan en attente : rien à afficher', async () => {
        const { f } = flow('proposed', null);
        await f.load();
        expect(f.status.value).toBe('ended');
    });

    const ALL = ['thread.create', 'folder.create', 'file.create_text', 'server.call:create_task'];
    test('« Toujours accepter » : petit plan entièrement dans la liste, accepté sans clic', async () => {
        const { f, calls } = flow('proposed', call, undefined, ALL);
        await f.load();
        expect(f.status.value).toBe('following');
        expect(f.autoAccepted.value).toBe(true);
        expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
    });
    test('« Toujours accepter » : une action hors liste ou marquée sensible, le clic reste demandé', async () => {
        const a = flow('proposed', call, undefined, ALL.filter(k => k !== 'folder.create'));
        await a.f.load();
        expect(a.f.status.value).toBe('proposed');
        const b = flow('proposed', call, undefined, ALL, [{ name: 'create_task', sensitive: true }]);
        await b.f.load();
        expect(b.f.status.value).toBe('proposed');
        expect(b.calls.some(c => c.method === 'POST')).toBe(false);
    });
    test('« Toujours accepter » : politique d’org retirée ou illisible, le clic reste demandé', async () => {
        const { f, calls } = flow('proposed', call, undefined, ALL, undefined, false);
        await f.load();
        expect(f.status.value).toBe('proposed');
        expect(f.autoAccepted.value).toBe(false);
        expect(calls.some(c => c.method === 'POST')).toBe(false);
    });
    test('sans réglage : jamais d’acceptation automatique', async () => {
        const { f } = flow('proposed');
        await f.load();
        expect(f.autoAccepted.value).toBe(false);
        expect(f.status.value).toBe('proposed');
    });
});
