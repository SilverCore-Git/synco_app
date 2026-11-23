/**
 * Phase d'appareil d'un plan (12 §8.2, §8.6, §8.7 ; PC54, PC70) : réserve la phase (claim), exécute les
 * actions d'appareil PRÊTES (jamais une action déjà `executing`), rapporte `progress`, puis scelle et
 * dépose `plan_result:<k>`. Pur : l'exécution réelle (routes de création) et les attentes sont injectées.
 *
 * Règles tenues ici :
 * - une action n'est lancée que si l'API la dit prête et `pending`, et si `progress executing` est accepté
 *   (`action_state_conflict` : on ne lance rien) ;
 * - les références `$m.champ` sont résolues depuis les résultats déchiffrés et doivent égaler la sortie
 *   enregistrée par l'API (écart : `failed` sans appel) ;
 * - un échec ne touche que ses dépendantes (l'API les passe `skipped`, PC54) ; aucune annulation ;
 * - plan arrêté (PC55, PC70) ou expiré : plus aucun démarrage, les actions en cours vont à leur terme ;
 * - claim perdu : on dépose quand même ce qui a été fait (12 §8.2) ; une issue incertaine est `unknown_outcome`.
 */
import { parseArgRef, type JsonObject, type JsonValue } from '@/assets/utils/aiActionPlan';
import { fetchPlanView, openAgentResults, sealDevicePhaseResult, type OpenedPlan, type PhaseOutcome, type ServedPlanView } from '../actionPlan';
import { creationFailureState } from './deviceErrors';
import { claimPhase, depositPlanResult, isCode, postProgress, type PlanRoute } from './planApi';

export const DEVICE_KINDS = ['category.create', 'thread.create', 'folder.create', 'file.create_text'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
const isDeviceKind = (k: unknown): k is DeviceKind => (DEVICE_KINDS as readonly unknown[]).includes(k);

export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 8;
const RATE_RETRIES = 3;
const OUTPUT_RETRIES = 3;
const MAX_ROUNDS = 5;

export interface DeviceCall { n: number; kind: DeviceKind; args: JsonObject }

export interface RunnerDeps {
    route: PlanRoute;
    deviceId: string;
    ck: CryptoKey | Uint8Array;
    opened: OpenedPlan;
    /** Appelle la route normale de création avec `X-Synco-Plan: header` ; rend `{ id, spaceId? }`. Lève en cas d'échec. */
    execute(call: DeviceCall, planHeader: string): Promise<Record<string, string>>;
    /** Ajoute les entrées des salons créés à la délégation (03 §7.2, 12 §8.2 étape 5). Non bloquant. */
    syncKeys(): Promise<void>;
    wait(ms: number): Promise<void>;
    /** Vue relue : suivi en direct. */
    onView?(view: ServedPlanView): void;
    /** Plus aucun démarrage (onglet fermé). */
    stopped?(): boolean;
    now(): number;
    concurrency?: number;
}

export type PhaseResult =
    | { kind: 'none' }
    | { kind: 'other_device' }
    | { kind: 'done'; phase: number; outcomes: PhaseOutcome[] };

const clampConcurrency = (n: number | undefined) => Math.max(1, Math.min(MAX_CONCURRENCY, n ?? DEFAULT_CONCURRENCY));

const isObj = (x: JsonValue | undefined): x is JsonObject => !!x && typeof x === 'object' && !Array.isArray(x);

/** `{ id, spaceId? }` seulement, chaînes seulement : rien d'autre ne part vers l'API ni vers le résultat de phase. */
export function cleanOutput(out: Record<string, unknown>): Record<string, string> | null {
    const id = out.id;
    if (typeof id !== 'string' || !id) return null;
    const o: Record<string, string> = { id };
    if (typeof out.spaceId === 'string' && out.spaceId) o.spaceId = out.spaceId;
    return o;
}

/** Prête pour l'appareil d'après l'API (12 §8.1) : `pending`, prête, d'exécutant `device`. */
const deviceReady = (v: ServedPlanView): number[] =>
    v.actions.filter(a => a.executor === 'device' && a.state === 'pending' && a.ready === true).map(a => a.n).sort((a, b) => a - b);

const running = (v: ServedPlanView) => v.status === 'accepted' || v.status === 'executing';

export async function runDevicePhase(deps: RunnerDeps): Promise<PhaseResult> {
    const { route, opened } = deps;
    let view = await fetchPlanView(route.api, route.orgId, route.sessionId, route.planId);
    deps.onView?.(view);
    if (!running(view) || deviceReady(view).length === 0) return { kind: 'none' };

    const phase = (view.devicePhases ?? 0) + 1;
    try {
        await claimPhase(route, deps.deviceId, phase);
    } catch (e) {
        if (isCode(e, 'plan_claimed')) return { kind: 'other_device' };
        if (isCode(e, 'plan_phase_mismatch', 'plan_not_claimable', 'plan_not_executing')) return { kind: 'none' };
        throw e;
    }
    // États au moment du claim : ce qui est déjà final ici a été rapporté par une phase précédente,
    // sauf une issue inconnue (claim perdu) qu'aucun résultat n'a encore portée.
    view = await fetchPlanView(route.api, route.orgId, route.sessionId, route.planId);
    deps.onView?.(view);
    const atClaim = new Map(view.actions.map(a => [a.n, a.state]));
    const orphans = view.actions.filter(a => a.executor === 'device' && a.state === 'unknown_outcome').map(a => a.n);

    const local = new Map<number, PhaseOutcome>();
    const started = new Set<number>();
    let concurrency = clampConcurrency(deps.concurrency);
    let lostClaim = false;
    let createdThread = false;
    const agentOutputs = new Map<number, Record<string, string>>();

    const loadAgentOutputs = async (v: ServedPlanView) => {
        if (v.agentResults.length === 0) return;
        for (const r of await openAgentResults(deps.ck, v, opened.graph)) {
            for (const o of r.outcomes) if (o.output) agentOutputs.set(o.n, o.output);
        }
    };

    /** Valeur d'une référence `$m.champ` (12 §8.2 étape 3) ; `null` = incohérente ou absente. */
    const resolveRef = (v: ServedPlanView, m: number, field: 'id' | 'spaceId'): string | null => {
        const recorded = v.actions[m - 1]?.output?.[field];
        if (typeof recorded !== 'string') return null;
        const executor = opened.graph.actions[m - 1]?.executor;
        const clear = executor === 'agent' ? agentOutputs.get(m)?.[field] : local.get(m)?.output?.[field];
        if (executor === 'agent' && clear === undefined) return null;
        if (clear !== undefined && clear !== recorded) return null;
        return recorded;
    };

    const withRate = async <T>(fn: () => Promise<T>): Promise<T> => {
        for (let attempt = 0; ; attempt++) {
            try { return await fn(); } catch (e) {
                if (!isCode(e, 'rate_limited') || attempt >= RATE_RETRIES) throw e;
                concurrency = Math.max(1, Math.floor(concurrency / 2));
                await deps.wait(1000 * 2 ** attempt);
            }
        }
    };

    const report = async (n: number, state: 'executing' | 'done' | 'failed') => withRate(() => postProgress(route, deps.deviceId, n, state));

    const fail = async (n: number, state: 'failed' | 'unknown_outcome') => {
        local.set(n, { n, state });
        if (state === 'failed') { try { await report(n, 'failed'); } catch (e) { if (isCode(e, 'plan_claim_lost')) lostClaim = true; } }
    };

    async function perform(v: ServedPlanView, n: number): Promise<void> {
        const entry = (opened.plan.actions as JsonValue[])[n - 1];
        const action = isObj(entry) ? entry : null;
        const kind = action?.kind;
        if (!action || !isDeviceKind(kind) || !isObj(action.args)) { await fail(n, 'failed'); return; }
        // `progress executing` d'abord : s'il est refusé, rien n'est lancé (jamais de relance à l'aveugle).
        try {
            await report(n, 'executing');
        } catch (e) {
            if (isCode(e, 'plan_claim_lost')) lostClaim = true;
            return;
        }
        const args: JsonObject = { ...action.args };
        if (isObj(action.argsRefs)) {
            for (const [field, text] of Object.entries(action.argsRefs)) {
                const ref = typeof text === 'string' ? parseArgRef(text) : null;
                const value = ref ? resolveRef(v, ref.m, ref.field) : null;
                if (value === null) { await fail(n, 'failed'); return; }
                args[field] = value;
            }
        }
        let output: Record<string, string> | null = null;
        try {
            output = cleanOutput(await deps.execute({ n, kind, args }, `${route.planId}/${n}`));
        } catch (e) {
            // `failed` seulement si l'API a refusé (4xx/5xx) ou si rien n'est parti ; sinon l'objet existe peut-être.
            await fail(n, creationFailureState(e));
            return;
        }
        // Réponse reçue mais inexploitable : l'objet a pu être créé.
        if (!output) { await fail(n, 'unknown_outcome'); return; }
        if (kind === 'thread.create') createdThread = true;
        for (let attempt = 0; ; attempt++) {
            try {
                await report(n, 'done');
                local.set(n, { n, state: 'done', output });
                return;
            } catch (e) {
                if (isCode(e, 'action_output_missing') && attempt < OUTPUT_RETRIES) { await deps.wait(1000); continue; }
                // L'objet existe mais l'API ne l'a pas confirmé : issue incertaine, jamais « faite » sans preuve.
                if (isCode(e, 'plan_claim_lost')) lostClaim = true;
                local.set(n, { n, state: isCode(e, 'action_output_missing') ? 'failed' : 'unknown_outcome' });
                if (isCode(e, 'action_output_missing')) { try { await report(n, 'failed'); } catch { /* déjà traité côté API */ } }
                return;
            }
        }
    }

    for (let round = 0; round < MAX_ROUNDS; round++) {
        const inFlight = new Set<Promise<void>>();
        for (;;) {
            view = await fetchPlanView(route.api, route.orgId, route.sessionId, route.planId);
            deps.onView?.(view);
            await loadAgentOutputs(view);
            const expired = view.expiresAt !== undefined && deps.now() > view.expiresAt;
            const mayStart = running(view) && !expired && !lostClaim && !deps.stopped?.();
            if (mayStart) {
                for (const n of deviceReady(view)) {
                    if (inFlight.size >= concurrency) break;
                    if (started.has(n)) continue;
                    started.add(n);
                    const snapshot = view;
                    const p: Promise<void> = perform(snapshot, n).catch(() => { local.set(n, { n, state: 'unknown_outcome' }); }).finally(() => { inFlight.delete(p); });
                    inFlight.add(p);
                }
            }
            if (inFlight.size === 0) break;
            await Promise.race(inFlight);
        }

        if (createdThread) { try { await deps.syncKeys(); } catch { /* le runtime recevra les clés à la prochaine synchro */ } createdThread = false; }

        // Ce que cette phase rapporte : ses propres actions, les issues inconnues orphelines, et leurs dépendantes annulées.
        const final = await fetchPlanView(route.api, route.orgId, route.sessionId, route.planId);
        deps.onView?.(final);
        const out = new Map(local);
        const cascade = opened.graph.withDependents(orphans);
        for (const a of final.actions) {
            if (a.executor !== 'device' || out.has(a.n)) continue;
            const before = atClaim.get(a.n);
            if (a.state === 'unknown_outcome' && orphans.includes(a.n)) out.set(a.n, { n: a.n, state: 'unknown_outcome' });
            else if (a.state === 'skipped' && (before === 'pending' || (before === 'skipped' && cascade.has(a.n)))) out.set(a.n, { n: a.n, state: 'skipped' });
        }
        const outcomes = [...out.values()].sort((a, b) => a.n - b.n);
        const frame = await sealDevicePhaseResult(deps.ck, route.sessionId, opened.graph, route.planId, phase, outcomes);
        try {
            await depositPlanResult(route, frame);
            return { kind: 'done', phase, outcomes };
        } catch (e) {
            // Il reste une action d'appareil prête ou en cours : on relit et on continue (12 §8.2 étape 6).
            if (isCode(e, 'plan_phase_mismatch') && !deps.stopped?.() && !lostClaim) continue;
            throw e;
        }
    }
    return { kind: 'done', phase, outcomes: [...local.values()].sort((a, b) => a.n - b.n) };
}
