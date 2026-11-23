/**
 * Plan d'action, côté cryptographie seulement (12 §3.3, §5, §9, §12.1 ; PC69, PC74) : ouverture du
 * plan chiffré sous `CK`, revalidation par l'appareil (règles 1 à 8), empreintes des actions serveur
 * recalculées depuis le plan DÉCHIFFRÉ pour le corps de la décision, chiffrement et lecture des
 * résultats de phase. Aucune UI ; l'exécution des actions d'appareil appartient à L12.
 */
import {
    PlanInvalidError,
    checkServedGraph,
    decryptPhaseResult,
    decryptPlan,
    encryptPhaseResult,
    planServerDigests,
    validatePlan,
    type ActionState,
    type GraphAction,
    type JsonObject,
    type JsonValue,
    type PlanContext,
    type PlanExecutor,
    type PlanGraph,
    type AbandonCode,
} from '@/assets/utils/aiActionPlan';
import { RuntimeFormatError } from '@/assets/utils/runtimeCert';
import { AiRuntimeError, apiError } from './errors';
import type { ApiPort } from './ports';

const ACTION_STATE_NAMES = ['pending', 'executing', 'done', 'failed', 'skipped', 'unknown_outcome'] as const;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Action servie par l'API : graphe, plus l'état d'exécution quand l'API le donne (12 §12.1). */
export interface ServedAction extends GraphAction {
    state?: ActionState;
    /** Prête (12 §8.1), calculée par l'API. */
    ready?: boolean;
    /** Sortie enregistrée par l'API (`null` après la clôture du plan, PC56). */
    output?: Record<string, string> | null;
}

export interface ServedClaim { deviceId: string; phase: number; expiresAt: number }

/** Vue servie par l'API (`GET …/plans/:planId`), réduite à ce que la crypto et l'exécution contrôlent. */
export interface ServedPlanView {
    planId: string;
    sessionId: string;
    toolCallId: string;
    status: string;
    actionCount: number;
    /** `{ "<n>": "<hex>" }` déposé par le runtime (PC69). */
    serverDigests: Record<string, string>;
    actions: ServedAction[];
    agentResults: { phase: number; value: string }[];
    /** Phases d'appareil / d'agent closes. */
    devicePhases?: number;
    agentPhases?: number;
    expiresAt?: number;
    claim?: ServedClaim | null;
}

export function readPlanView(body: unknown): ServedPlanView {
    const b = isObj(body) ? body : null;
    const bad = () => new AiRuntimeError('plan_invalid');
    if (!b || typeof b.planId !== 'string' || typeof b.sessionId !== 'string' || typeof b.toolCallId !== 'string' || typeof b.status !== 'string'
        || typeof b.actionCount !== 'number' || !isObj(b.serverDigests) || !Array.isArray(b.actions)) throw bad();
    const digests: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.serverDigests)) {
        if (typeof v !== 'string' || !/^[0-9a-f]{64}$/.test(v)) throw bad();
        digests[k] = v;
    }
    const actions: ServedAction[] = b.actions.map(a => {
        if (!isObj(a) || typeof a.n !== 'number' || (a.executor !== 'device' && a.executor !== 'agent') || !Array.isArray(a.after)
            || !a.after.every((m): m is number => typeof m === 'number')) throw bad();
        const out: ServedAction = { n: a.n, executor: a.executor, after: a.after };
        if (typeof a.state === 'string' && (ACTION_STATE_NAMES as readonly string[]).includes(a.state)) out.state = a.state as ActionState;
        if (typeof a.ready === 'boolean') out.ready = a.ready;
        if (a.output === null) out.output = null;
        else if (isObj(a.output)) {
            const o: Record<string, string> = {};
            for (const [k, v] of Object.entries(a.output)) if (typeof v === 'string') o[k] = v;
            out.output = o;
        }
        return out;
    });
    const agentResults = (Array.isArray(b.agentResults) ? b.agentResults : []).map(r => {
        if (!isObj(r) || typeof r.phase !== 'number' || typeof r.value !== 'string') throw bad();
        return { phase: r.phase, value: r.value };
    });
    const view: ServedPlanView = { planId: b.planId, sessionId: b.sessionId, toolCallId: b.toolCallId, status: b.status, actionCount: b.actionCount, serverDigests: digests, actions, agentResults };
    if (typeof b.devicePhases === 'number') view.devicePhases = b.devicePhases;
    if (typeof b.agentPhases === 'number') view.agentPhases = b.agentPhases;
    const exp = typeof b.expiresAt === 'string' ? Date.parse(b.expiresAt) : NaN;
    if (Number.isFinite(exp)) view.expiresAt = exp;
    if (b.claim === null) view.claim = null;
    else if (isObj(b.claim) && typeof b.claim.deviceId === 'string' && typeof b.claim.phase === 'number') {
        const until = typeof b.claim.expiresAt === 'string' ? Date.parse(b.claim.expiresAt) : NaN;
        view.claim = { deviceId: b.claim.deviceId, phase: b.claim.phase, expiresAt: Number.isFinite(until) ? until : 0 };
    }
    return view;
}

/** `pendingToolCall` d'une conversation (12 §3.4). */
export interface PendingPlanCall {
    id: string;
    name: string;
    planId?: string;
    args: string;
}

/** Champs d'`args` résolus dans l'annuaire local (12 §5, règle 7). */
export const LOCAL_ID_FIELDS = ['spaceId', 'categoryId', 'parentFolderId', 'folderId'] as const;
export type LocalIdField = (typeof LOCAL_ID_FIELDS)[number];

export interface OpenPlanInput {
    ck: CryptoKey | Uint8Array;
    pendingToolCall: PendingPlanCall;
    view: ServedPlanView;
    /** Contexte de validation ; `mode` = mode du mandat VÉRIFIÉ de la délégation courante. */
    context: PlanContext;
    /** Règle 7 : l'identifiant est-il connu de l'annuaire local ? */
    knownLocalId: (field: LocalIdField, id: string) => boolean;
    /** Statuts de plan admis à l'ouverture : `proposed` seul pour une décision, plus `accepted`/`executing` pour le suivi et l'exécution. */
    statuses?: readonly string[];
}

export interface OpenedPlan {
    plan: JsonObject;
    graph: PlanGraph;
    /** Empreintes recalculées depuis le clair : `n` → hex, pour chaque `server.call`. */
    digests: Map<number, string>;
}

/**
 * Ouvre et revalide le plan (12 §5) : AAD `sessionId:planId:plan`, règles 1 à 6 (`validatePlan`),
 * règle 7 (annuaire local), règle 8 (graphe servi), puis les empreintes servies (PC69) comparées à
 * celles recalculées. Seul un plan `proposed` (pas encore décidé, 12 §8) dont `actionCount` égale le
 * nombre d'actions déchiffrées est ouvert. Tout écart : `plan_invalid` (à refuser par `buildRejectDecision`).
 */
export async function openPlan(input: OpenPlanInput): Promise<OpenedPlan> {
    const { pendingToolCall: call, view } = input;
    const sessionId = input.context.sessionId;
    if (call.name !== 'propose_actions' || !call.planId || call.planId !== view.planId || call.id !== view.toolCallId || view.sessionId !== sessionId
        || !(input.statuses ?? ['proposed']).includes(view.status)) {
        throw new AiRuntimeError('plan_invalid');
    }
    let plan: JsonObject;
    let graph: PlanGraph;
    try {
        plan = await decryptPlan(input.ck, sessionId, call.planId, call.args);
        if (plan.toolCallId !== call.id) throw new PlanInvalidError('plan_header');
        if (!Array.isArray(plan.actions) || view.actionCount !== plan.actions.length) throw new PlanInvalidError('plan_header');
        graph = validatePlan(plan, input.context);
        checkServedGraph(graph, view.actions);
    } catch (e) {
        if (e instanceof RuntimeFormatError) throw new AiRuntimeError('plan_invalid');
        throw e;
    }
    for (const a of plan.actions as JsonValue[]) {
        const args = isObj(a) && isObj(a.args) ? a.args : {};
        for (const field of LOCAL_ID_FIELDS) {
            const v = args[field];
            if (v !== undefined && (typeof v !== 'string' || !input.knownLocalId(field, v))) throw new AiRuntimeError('plan_invalid');
        }
    }
    const digests = await planServerDigests(plan);
    const served = Object.keys(view.serverDigests);
    if (served.length !== digests.size || [...digests].some(([n, hex]) => view.serverDigests[String(n)] !== hex)) {
        throw new AiRuntimeError('plan_digest_mismatch');
    }
    return { plan, graph, digests };
}

export interface AcceptDecision {
    decision: 'accept';
    accepted: number[];
    serverDigests: { n: number; sha256Hex: string }[];
}
export interface RejectDecision {
    decision: 'reject';
    reason?: 'plan_invalid';
}

/**
 * Corps de la décision `accept` (12 §12.1, PC69) : actions cochées moins la cascade (PC37), et pour
 * chaque `server.call` acceptée l'empreinte recalculée depuis le plan déchiffré.
 */
export function buildAcceptDecision(opened: OpenedPlan, checked: readonly number[]): AcceptDecision {
    const all = opened.graph.actions.map(a => a.n);
    const set = new Set(checked);
    const dropped = opened.graph.cascade(all.filter(n => !set.has(n)));
    const accepted = all.filter(n => !dropped.has(n));
    if (accepted.length === 0) throw new AiRuntimeError('plan_invalid');
    const serverDigests = accepted.flatMap(n => {
        const hex = opened.digests.get(n);
        return hex ? [{ n, sha256Hex: hex }] : [];
    });
    return { decision: 'accept', accepted, serverDigests };
}

export const buildRejectDecision = (invalid: boolean): RejectDecision => (invalid ? { decision: 'reject', reason: 'plan_invalid' } : { decision: 'reject' });

const planPath = (orgId: string, sessionId: string, planId: string) =>
    `/api/orgs/${encodeURIComponent(orgId)}/ai/sessions/${encodeURIComponent(sessionId)}/plans/${encodeURIComponent(planId)}`;

export async function fetchPlanView(api: ApiPort, orgId: string, sessionId: string, planId: string): Promise<ServedPlanView> {
    const res = await api.request('GET', planPath(orgId, sessionId, planId));
    if (res.status !== 200) throw apiError(res.status, res.body);
    return readPlanView(res.body);
}

/** `POST …/decision` ; `plan_digest_mismatch`, `plan_not_pending`… rendus typés. */
export async function postPlanDecision(api: ApiPort, orgId: string, sessionId: string, planId: string, body: AcceptDecision | RejectDecision): Promise<ServedPlanView> {
    const res = await api.request('POST', `${planPath(orgId, sessionId, planId)}/decision`, body);
    if (res.status !== 200) throw apiError(res.status, res.body);
    return readPlanView(res.body);
}

// ---------------------------------------------------------------------------
// Résultats de phase (12 §9, PC74)
// ---------------------------------------------------------------------------

export interface PhaseOutcome {
    n: number;
    state: Exclude<ActionState, 'pending' | 'executing'>;
    output?: Record<string, string>;
    /** Abandon (PC74) : seulement avec `failed` / `unknown_outcome`, jamais avec `output`. */
    code?: AbandonCode;
}

export interface PlanResultFrame {
    t: 'plan_result';
    id: string;
    planId: string;
    phase: number;
    value: string;
}

/** Résultat d'une phase d'appareil, chiffré sous `CK` (AAD `…:plan_result:<k>`), prêt pour `POST …/inbox`. */
export async function sealDevicePhaseResult(ck: CryptoKey | Uint8Array, sessionId: string, graph: PlanGraph, planId: string, phase: number, outcomes: readonly PhaseOutcome[]): Promise<PlanResultFrame> {
    const clear: JsonObject = {
        v: 1,
        planId,
        phase,
        outcomes: outcomes.map(o => {
            const out: JsonObject = { n: o.n, state: o.state };
            if (o.output) out.output = { ...o.output };
            if (o.code) out.code = o.code;
            return out;
        }),
    };
    try {
        const value = await encryptPhaseResult(ck, sessionId, 'device', graph, clear);
        return { t: 'plan_result', id: `plan:${planId}:${phase}`, planId, phase, value };
    } catch (e) {
        if (e instanceof RuntimeFormatError) throw new AiRuntimeError('plan_invalid');
        throw e;
    }
}

/** Lecture d'un résultat de phase (appareil ou agent), recontrôlé contre le graphe du plan. */
export async function openPhaseResult(ck: CryptoKey | Uint8Array, sessionId: string, planId: string, executor: PlanExecutor, phase: number, graph: PlanGraph, value: string): Promise<PhaseOutcome[]> {
    let clear: JsonObject;
    try {
        clear = await decryptPhaseResult(ck, sessionId, planId, executor, phase, graph, value);
    } catch (e) {
        if (e instanceof RuntimeFormatError) throw new AiRuntimeError('plan_invalid');
        throw e;
    }
    return (clear.outcomes as JsonObject[]).map(o => {
        const r: PhaseOutcome = { n: o.n as number, state: o.state as PhaseOutcome['state'] };
        if (isObj(o.output)) r.output = o.output as Record<string, string>;
        if (typeof o.code === 'string') r.code = o.code as AbandonCode;
        return r;
    });
}

/** Résultats des phases d'agent servis par la `PlanView`, déchiffrés dans l'ordre des phases. */
export async function openAgentResults(ck: CryptoKey | Uint8Array, view: ServedPlanView, graph: PlanGraph): Promise<{ phase: number; outcomes: PhaseOutcome[] }[]> {
    const sorted = [...view.agentResults].sort((a, b) => a.phase - b.phase);
    const out: { phase: number; outcomes: PhaseOutcome[] }[] = [];
    for (const r of sorted) out.push({ phase: r.phase, outcomes: await openPhaseResult(ck, view.sessionId, view.planId, 'agent', r.phase, graph, r.value) });
    return out;
}
