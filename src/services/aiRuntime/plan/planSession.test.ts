/**
 * Glue de plan (PC76, PC69) sur les vecteurs figés `action-plan.json`. Plan d'action côté appareil (12 §3.3, §5, §9, §12.1 ; PC69, PC74), sur les vecteurs figés
 * `action-plan.json` : ouverture sous `CK`, empreintes de la décision recalculées depuis le clair.
 */
import { describe, expect, test } from 'bun:test';
import raw from '../../../../scripts/e2ee-vectors/action-plan.json';
import { ToolManifest, type JsonObject, type JsonValue, type PlanContext } from '@/assets/utils/aiActionPlan';
import { AiRuntimeError } from '../errors';
import type { ServedPlanView } from './actionPlan';
import { acceptPlan, loadPlan, type PlanSessionDeps } from './planSession';
import { noResolver } from './planLabels';
import { isSmallPlan } from './planModel';
import type { ApiPort } from '../ports';

interface V {
    sessionId: string; planId: string; ckHex: string; plan: JsonObject; planValue: string; planExecutors: ('device' | 'agent')[];
    toolManifest: JsonValue; serverDigests: { plan: string | null; n: number | null; sha256Hex: string }[];
    mixedPlan: { planId: string; plan: JsonObject; executors: ('device' | 'agent')[]; encrypted: { fieldName: string; value: string; clear: JsonObject }[] };
}
const v = raw as unknown as V;
const ck = Uint8Array.from(Buffer.from(v.ckHex, 'hex'));
const ctx = (patch: Partial<PlanContext> = {}): PlanContext => ({
    sessionId: v.sessionId, maxLifetimeSecs: 604_800, manifest: ToolManifest.fromJson(v.toolManifest), mode: 'plan', createThreadAsk: true, ...patch,
});
const SPACE = (v.plan.actions as JsonObject[])[0]!.args as JsonObject;
const known = (_f: string, id: string) => id === SPACE.spaceId;
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof AiRuntimeError ? e.code : `autre:${String(e)}`));

function view(patch: Partial<ServedPlanView> = {}): ServedPlanView {
    const actions = (v.plan.actions as JsonObject[]).map((a, i) => ({ n: a.n as number, executor: v.planExecutors[i]!, after: (a.after as number[] | undefined) ?? [] }));
    const digest = v.serverDigests.find(d => d.plan === 'plan')!;
    return {
        planId: v.planId, sessionId: v.sessionId, toolCallId: 'call_7', status: 'proposed', actionCount: actions.length,
        serverDigests: { [String(digest.n)]: digest.sha256Hex }, actions, agentResults: [], ...patch,
    };
}
const call = { id: 'call_7', name: 'propose_actions', planId: v.planId, args: v.planValue };

const posted: unknown[] = [];
const depsFor = (flags: { name: string; sensitive?: boolean }[] = []): PlanSessionDeps => ({
    ck, orgId: 'o', sessionId: v.sessionId, context: ctx(), knownLocalId: known, resolver: noResolver, flags,
    api: {
        request: async (method, _path, body) => {
            if (method === 'POST') { posted.push(body); return { status: 200, body: { ...view(), status: 'accepted' } }; }
            return { status: 200, body: view() };
        },
    },
});

describe('glue de plan (PC76, PC69)', () => {
    test('plan lisible : modèle construit, accepté depuis la carte avec empreintes recalculées', async () => {
        const loaded = await loadPlan(depsFor(), call);
        if (loaded.state !== 'ready') throw new Error('plan illisible');
        expect(isSmallPlan(loaded.model)).toBe(true);
        posted.length = 0;
        await acceptPlan(depsFor(), loaded, [1, 2, 3, 4, 5], 'card');
        expect(posted).toHaveLength(1);
        expect((posted[0] as { decision: string }).decision).toBe('accept');
        expect((posted[0] as { serverDigests: unknown[] }).serverDigests).toHaveLength(1);
    });
    test('dès qu’une action est sensible, la carte ne peut pas accepter (le graphe le peut)', async () => {
        const tool = (v.plan.actions as JsonObject[]).find(a => a.kind === 'server.call')!.tool as string;
        const flags = [{ name: tool, sensitive: true }];
        const loaded = await loadPlan(depsFor(flags), call);
        if (loaded.state !== 'ready') throw new Error('plan illisible');
        expect(isSmallPlan(loaded.model)).toBe(false);
        posted.length = 0;
        expect(await code(acceptPlan(depsFor(flags), loaded, [1, 2, 3, 4, 5], 'card'))).toBe('plan_invalid');
        expect(posted).toHaveLength(0);
        await acceptPlan(depsFor(flags), loaded, [1, 2, 3, 4, 5], 'graph');
        expect(posted).toHaveLength(1);
    });
    test('plan modifié (empreinte différente) : illisible, aucune décision d’acceptation', async () => {
        const deps = depsFor();
        deps.api = { request: async () => ({ status: 200, body: view({ serverDigests: { '5': '0'.repeat(64) } }) }) };
        expect(await loadPlan(deps, call)).toEqual({ state: 'invalid', code: 'plan_digest_mismatch' });
    });
});
