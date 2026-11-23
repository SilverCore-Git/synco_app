/**
 * Plan d'action côté appareil (12 §3.3, §5, §9, §12.1 ; PC69, PC74), sur les vecteurs figés
 * `action-plan.json` : ouverture sous `CK`, empreintes de la décision recalculées depuis le clair.
 */
import { describe, expect, test } from 'bun:test';
import raw from '../../../scripts/e2ee-vectors/action-plan.json';
import { ToolManifest, type JsonObject, type JsonValue, type PlanContext } from '@/assets/utils/aiActionPlan';
import { AiRuntimeError } from './errors';
import { buildAcceptDecision, buildRejectDecision, openAgentResults, openPhaseResult, openPlan, postPlanDecision, readPlanView, sealDevicePhaseResult, type ServedPlanView } from './actionPlan';
import type { ApiPort } from './ports';

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

describe('ouverture et décision (12 §5, §12.1, PC69)', () => {
    test('plan valide : empreintes recalculées depuis le clair = vecteur ; décision acceptée avec cascade', async () => {
        const opened = await openPlan({ ck, pendingToolCall: call, view: view(), context: ctx(), knownLocalId: known });
        const digest = v.serverDigests.find(d => d.plan === 'plan')!;
        expect([...opened.digests]).toEqual([[digest.n!, digest.sha256Hex]]);
        expect(buildAcceptDecision(opened, [1, 2, 3, 4, 5])).toEqual({ decision: 'accept', accepted: [1, 2, 3, 4, 5], serverDigests: [{ n: 5, sha256Hex: digest.sha256Hex }] });
        // Décocher 1 retire 5 (after [1]) et donc son empreinte.
        expect(buildAcceptDecision(opened, [2, 3, 4, 5])).toEqual({ decision: 'accept', accepted: [2, 3, 4], serverDigests: [] });
        expect(buildRejectDecision(true)).toEqual({ decision: 'reject', reason: 'plan_invalid' });
    });

    test('empreinte déposée par le runtime différente du plan : plan_digest_mismatch', async () => {
        const bad = view({ serverDigests: { '5': '0'.repeat(64) } });
        expect(await code(openPlan({ ck, pendingToolCall: call, view: bad, context: ctx(), knownLocalId: known }))).toBe('plan_digest_mismatch');
        const extra = view({ serverDigests: { ...view().serverDigests, '1': '1'.repeat(64) } });
        expect(await code(openPlan({ ck, pendingToolCall: call, view: extra, context: ctx(), knownLocalId: known }))).toBe('plan_digest_mismatch');
    });

    test('plan déjà décidé ou nombre d\'actions servi différent : plan_invalid, aucune décision construite', async () => {
        for (const patch of [{ status: 'accepted' }, { status: 'rejected' }, { actionCount: 4 }, { actionCount: 6 }]) {
            expect(await code(openPlan({ ck, pendingToolCall: call, view: view(patch), context: ctx(), knownLocalId: known }))).toBe('plan_invalid');
        }
    });

    test('graphe servi différent, identifiant local inconnu, autre appel, CK fausse : plan_invalid', async () => {
        const served = view();
        served.actions[4] = { ...served.actions[4]!, executor: 'device' };
        expect(await code(openPlan({ ck, pendingToolCall: call, view: served, context: ctx(), knownLocalId: known }))).toBe('plan_invalid');
        expect(await code(openPlan({ ck, pendingToolCall: call, view: view(), context: ctx(), knownLocalId: () => false }))).toBe('plan_invalid');
        expect(await code(openPlan({ ck, pendingToolCall: { ...call, id: 'call_8' }, view: view(), context: ctx(), knownLocalId: known }))).toBe('plan_invalid');
        expect(await code(openPlan({ ck: new Uint8Array(32), pendingToolCall: call, view: view(), context: ctx(), knownLocalId: known }))).toBe('plan_invalid');
        // Mode auto : thread.create passe à l'agent si create_thread n'est pas `ask` → graphe servi (plan) différent.
        expect(await code(openPlan({ ck, pendingToolCall: call, view: view(), context: ctx({ mode: 'auto', createThreadAsk: false }), knownLocalId: known }))).toBe('plan_invalid');
    });

    test('refus de l\'API rendu typé', async () => {
        const api: ApiPort = { request: async () => ({ status: 409, body: { error: 'plan_digest_mismatch' } }) };
        expect(await code(postPlanDecision(api, 'o', v.sessionId, v.planId, { decision: 'reject' }))).toBe('plan_digest_mismatch');
        expect(() => readPlanView({ planId: 1 })).toThrow(AiRuntimeError);
    });
});

describe('résultats de phase (12 §9, PC74)', () => {
    const m = v.mixedPlan;
    const mixedView = (): ServedPlanView => ({
        planId: m.planId, sessionId: v.sessionId, toolCallId: String(m.plan.toolCallId), status: 'executing', actionCount: m.executors.length,
        serverDigests: {}, actions: (m.plan.actions as JsonObject[]).map((a, i) => ({ n: a.n as number, executor: m.executors[i]!, after: (a.after as number[] | undefined) ?? [] })),
        agentResults: [],
    });

    test('phase d\'appareil : trame inbox chiffrée, relue ; phase d\'agent avec abandon relue', async () => {
        const { validatePlan } = await import('@/assets/utils/aiActionPlan');
        const graph = validatePlan(m.plan, ctx());
        const frame = await sealDevicePhaseResult(ck, v.sessionId, graph, m.planId, 1, [{ n: 1, state: 'done', output: { id: 'cm3threadnew0000000000001' } }]);
        expect(frame).toMatchObject({ t: 'plan_result', id: `plan:${m.planId}:1`, planId: m.planId, phase: 1 });
        expect(frame.value.startsWith('gcm1:')).toBe(true);
        expect(await openPhaseResult(ck, v.sessionId, m.planId, 'device', 1, graph, frame.value)).toEqual([{ n: 1, state: 'done', output: { id: 'cm3threadnew0000000000001' } }]);
        // Rejouée comme phase 2 ou comme résultat d'agent : refusée.
        expect(await code(openPhaseResult(ck, v.sessionId, m.planId, 'device', 2, graph, frame.value))).toBe('plan_invalid');
        expect(await code(openPhaseResult(ck, v.sessionId, m.planId, 'agent', 1, graph, frame.value))).toBe('plan_invalid');
        // Action d'agent déclarée par l'appareil, abandon d'une action d'appareil : refusés au chiffrement.
        expect(await code(sealDevicePhaseResult(ck, v.sessionId, graph, m.planId, 1, [{ n: 2, state: 'done' }]))).toBe('plan_invalid');

        const agent = m.encrypted.filter(e => e.fieldName.startsWith('plan_agent_result:'));
        const served = { ...mixedView(), agentResults: agent.map(e => ({ phase: Number(e.fieldName.split(':')[1]), value: e.value })) };
        const read = await openAgentResults(ck, served, graph);
        expect(read.map(r => r.phase)).toEqual(agent.map(e => Number(e.fieldName.split(':')[1])).sort((a, b) => a - b));

        const { encryptPhaseResult } = await import('@/assets/utils/aiActionPlan');
        const abandoned = await encryptPhaseResult(ck, v.sessionId, 'agent', graph, { v: 1, planId: m.planId, phase: 1, outcomes: [{ n: 2, state: 'failed', code: 'rate_limited' }] });
        expect(await openPhaseResult(ck, v.sessionId, m.planId, 'agent', 1, graph, abandoned)).toEqual([{ n: 2, state: 'failed', code: 'rate_limited' }]);
    });
});
