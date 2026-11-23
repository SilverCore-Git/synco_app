/** Cycle de vie d'un plan dans la conversation : chargement, décision, réouverture, plan illisible. */
import { describe, expect, test } from 'bun:test';
import raw from '../../../../scripts/e2ee-vectors/action-plan.json';
import { ToolManifest, type JsonObject, type JsonValue, type PlanContext } from '@/assets/utils/aiActionPlan';
import { noResolver } from './planLabels';
import { usePlanFlow } from './planFlow';
import type { PlanSessionDeps } from './planSession';

interface V { sessionId: string; planId: string; ckHex: string; plan: JsonObject; planValue: string; planExecutors: ('device' | 'agent')[]; toolManifest: JsonValue; serverDigests: { plan: string | null; n: number | null; sha256Hex: string }[] }
const v = raw as unknown as V;
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

function flow(status: string, pending: typeof call | null = call, digestOverride?: Record<string, string>) {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const session: PlanSessionDeps = {
        ck, orgId: 'o', sessionId: v.sessionId, context, knownLocalId: (_f, id) => id === SPACE.spaceId, resolver: noResolver,
        api: { request: server(status, calls, digestOverride) },
    };
    return { calls, f: usePlanFlow({ session, pendingCall: async () => pending, now: () => Date.UTC(2026, 10, 23) }) };
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
});
