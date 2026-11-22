/**
 * Vecteurs figés par la spécification (L00f) : scripts/e2ee-vectors/action-plan.json, copie conforme
 * de synco_ai_runtime/docs/plan/vectors/action-plan.json, rejoués sans modification (12 §3 à §9).
 * La crate `synco-e2ee` rejoue le même fichier (crates/synco-e2ee/tests/action_plan.rs).
 */
import { describe, expect, test } from 'bun:test';
import raw from '../../../scripts/e2ee-vectors/action-plan.json';
import {
    PlanGraph, PlanInvalidError, PlanRun, ToolManifest, checkServedGraph, checkServerCall, decryptAiFieldStrict, decryptPhaseResult,
    decryptPlan, encryptPhaseResult, encryptPlan, jcs, phaseResultAad, planAad, planServerDigests, serverDigest, validatePlan,
    type GraphAction, type JsonObject, type JsonValue, type PlanContext, type PlanExecutor,
} from './aiActionPlan';
import { sha256, toHex } from './runtimeCert';

interface Encrypted { label: string; fieldName: string; aad: string; ivHex: string; clear: JsonObject; canonical: string; value: string }
interface Run { concurrency: number; failedAt?: number[]; expectTicks: { device: number[]; agent: number[] }[]; expectStates?: Record<string, string>; expectStatus: string }
interface Case {
    name: string; expect: string; detail?: string; plan?: string; n?: number;
    // encryptionCases
    sessionId: string; messageId: string; fieldName: string; value: string; plaintext?: string; ckHex?: string;
    // serverDigests, executeCases
    input: { tool: string; args: JsonObject; argsRefs?: JsonObject }; canonical: string; sha256Hex: string;
    serverDigest: string; recordedOutputs: Record<string, JsonObject>; call: { tool: string; args: JsonObject; argsRefs?: JsonObject; refs?: JsonObject };
    effectiveArgs?: JsonObject;
    // levelCases, cascadeCases, failureCases, runCases
    actions?: { n: number; executor?: PlanExecutor; after?: number[] }[]; expectLevels: number[]; unchecked: number[]; expectSkipped: number[];
    accepted: number[]; failedAt: number; expectStates: Record<string, string>; expectStatus: string;
}
interface RunCase extends Run { name: string; plan: string; accepted: number[]; expiresBeforeTick?: number; expectStates: Record<string, string> }
interface ValidationCase { name: string; plan: JsonObject; expect: string; detail?: string }
interface Vectors {
    sessionId: string; planId: string; ckHex: string; plan: JsonObject; planCanonical: string; aadPlan: string; ivPlanHex: string; planValue: string;
    planExecutors: PlanExecutor[]; planLevels: number[]; pendingToolCall: { name: string; planId: string; args: string };
    planResult: JsonObject; planResultCanonical: string; aadPlanResult: string; ivPlanResultHex: string; planResultValue: string;
    mixedPlan: { planId: string; plan: JsonObject; executors: PlanExecutor[]; levels: number[]; encrypted: Encrypted[] };
    categoryPlan: {
        planId: string; plan: JsonObject; executors: PlanExecutor[]; canonical: string; aad: string; ivHex: string; value: string;
        expectLevels: number[]; wavesUnbounded: number[][]; scheduleConcurrency4: Run; failureOfCategory2: Run;
    };
    toolManifest: JsonValue; serverDigests: Case[]; executeCases: Case[]; encryptionCases: Case[]; validationCases: ValidationCase[];
    levelCases: Case[]; cascadeCases: Case[]; failureCases: Case[]; runCases: RunCase[];
}
const v = raw as unknown as Vectors;
const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
const manifest = ToolManifest.fromJson(v.toolManifest as JsonValue);
const ctx = (patch: Partial<PlanContext> = {}): PlanContext => ({
    sessionId: v.sessionId, maxLifetimeSecs: 604_800, manifest, mode: 'plan', createThreadAsk: true, ...patch,
});
const ck = fromHex(v.ckHex);
const plans: Record<string, JsonObject> = { plan: v.plan, mixedPlan: v.mixedPlan.plan, categoryPlan: v.categoryPlan.plan };

/** IV figé le temps d'un chiffrement (vecteurs seulement). */
async function withIv<T>(ivHex: string, run: () => Promise<T>): Promise<T> {
    const original = crypto.getRandomValues.bind(crypto);
    let used = false;
    Object.defineProperty(crypto, 'getRandomValues', {
        configurable: true,
        value: <A extends ArrayBufferView | null>(array: A): A => {
            const iv = fromHex(ivHex);
            if (used || !array || array.byteLength !== iv.length) throw new Error('aléa inattendu');
            used = true;
            new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(iv);
            return array;
        },
    });
    try {
        return await run();
    } finally {
        Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: original });
    }
}

const executors = (g: PlanGraph) => g.actions.map(a => a.executor);
const graphFrom = (c: Case): PlanGraph => (c.actions
    ? new PlanGraph(c.actions.map(a => ({ n: a.n, executor: a.executor ?? 'device', after: a.after ?? [] })))
    : validatePlan(v.plan, ctx()));

function simulate(graph: PlanGraph, accepted: number[], concurrency: number, failed: number[] = [], expiresBefore?: number) {
    const run = new PlanRun(graph, accepted);
    const ticks: { device: number[]; agent: number[] }[] = [];
    for (let tick = 1; ; tick++) {
        if (expiresBefore !== undefined && tick >= expiresBefore) run.expire();
        const device = run.ready('device').slice(0, concurrency);
        const agent = run.ready('agent').slice(0, concurrency);
        if (device.length === 0 && agent.length === 0) break;
        for (const n of [...device, ...agent]) run.start(n);
        for (const n of [...device, ...agent]) run.finish(n, failed.includes(n) ? 'failed' : 'done');
        ticks.push({ device, agent });
    }
    return { ticks, run };
}

function expectStates(run: PlanRun, states: Record<string, string>, name: string): void {
    for (const [n, state] of Object.entries(states)) expect(`${name} #${n} ${run.state(Number(n))}`).toBe(`${name} #${n} ${state}`);
}

let checks = 0;

describe('action-plan.json — format et chiffrement (12 §3, §9)', () => {
    test('plan de référence : JCS, AAD, gcm1: exact, exécutants, niveaux, pendingToolCall', async () => {
        expect(jcs(v.plan)).toBe(v.planCanonical);
        expect(planAad(v.sessionId, v.planId)).toBe(v.aadPlan);
        expect(await withIv(v.ivPlanHex, () => encryptPlan(ck, v.plan))).toBe(v.planValue);
        expect(await decryptPlan(ck, v.sessionId, v.planId, v.planValue)).toEqual(v.plan);
        const g = validatePlan(v.plan, ctx());
        expect(executors(g)).toEqual(v.planExecutors);
        expect(g.levels()).toEqual(v.planLevels);
        checkServedGraph(g, g.actions);
        expect([v.pendingToolCall.name, v.pendingToolCall.planId, v.pendingToolCall.args]).toEqual(['propose_actions', v.planId, v.planValue]);
        checks++;
    });

    test('plan_result partiel de la phase d\'appareil 1', async () => {
        expect(jcs(v.planResult)).toBe(v.planResultCanonical);
        expect(phaseResultAad(v.sessionId, v.planId, 'device', 1)).toBe(v.aadPlanResult);
        const value = await withIv(v.ivPlanResultHex, () => encryptPhaseResult(ck, v.sessionId, 'device', v.planResult));
        expect(value).toBe(v.planResultValue);
        expect(await decryptPhaseResult(ck, v.sessionId, v.planId, 'device', 1, value)).toEqual(v.planResult);
        checks++;
    });

    test('plan mixte : plan et résultats numérotés par exécutant', async () => {
        const m = v.mixedPlan;
        const g = validatePlan(m.plan, ctx());
        expect(executors(g)).toEqual(m.executors);
        expect(g.levels()).toEqual(m.levels);
        for (const e of m.encrypted) {
            expect(jcs(e.clear)).toBe(e.canonical);
            if (e.fieldName === 'plan') {
                expect(planAad(v.sessionId, m.planId)).toBe(e.aad);
                expect(await withIv(e.ivHex, () => encryptPlan(ck, e.clear))).toBe(e.value);
            } else {
                const [label, k] = e.fieldName.split(':');
                const executor: PlanExecutor = label === 'plan_result' ? 'device' : 'agent';
                expect(phaseResultAad(v.sessionId, m.planId, executor, Number(k))).toBe(e.aad);
                expect(await withIv(e.ivHex, () => encryptPhaseResult(ck, v.sessionId, executor, e.clear))).toBe(e.value);
                expect(await decryptPhaseResult(ck, v.sessionId, m.planId, executor, Number(k), e.value)).toEqual(e.clear);
            }
            checks++;
        }
    });

    test('encryptionCases : mêmes codes que conversation-fields.json', async () => {
        for (const c of v.encryptionCases) {
            const key = fromHex(c.ckHex ?? v.ckHex);
            const read = decryptAiFieldStrict(key, c.sessionId, c.messageId, c.fieldName, c.value);
            if (c.expect === 'ok') {
                const clear = await read;
                expect(clear).toBe(c.plaintext);
                const [label, k] = c.fieldName.split(':');
                const typed = k === undefined
                    ? await decryptPlan(key, c.sessionId, c.messageId, c.value)
                    : await decryptPhaseResult(key, c.sessionId, c.messageId, label === 'plan_result' ? 'device' : 'agent', Number(k), c.value);
                expect(typed).toEqual(JSON.parse(clear));
            } else {
                await expect(read).rejects.toMatchObject({ code: c.expect });
            }
            checks++;
        }
    });
});

describe('action-plan.json — condensats et verrou (12 §8.4, PC47)', () => {
    test('serverDigests', async () => {
        for (const c of v.serverDigests) {
            expect(jcs(c.input)).toBe(c.canonical);
            expect(toHex(await sha256(new TextEncoder().encode(c.canonical)))).toBe(c.sha256Hex);
            expect(await serverDigest(c.input.tool, c.input.args, c.input.argsRefs)).toBe(c.sha256Hex);
            if (c.plan) expect((await planServerDigests(plans[c.plan]!)).get(c.n!)).toBe(c.sha256Hex);
            checks++;
        }
    });

    test('executeCases', async () => {
        for (const c of v.executeCases) {
            expect((await planServerDigests(plans[c.plan!]!)).get(c.n!)).toBe(c.serverDigest);
            const recorded = new Map(Object.entries(c.recordedOutputs).map(([m, o]) => [Number(m), o]));
            const result = checkServerCall(c.serverDigest, c.call, recorded);
            if (c.expect === 'ok') expect(await result).toEqual(c.effectiveArgs);
            else await expect(result).rejects.toMatchObject({ code: c.expect });
            checks++;
        }
    });
});

describe('action-plan.json — validation (12 §5, PC61)', () => {
    test('validationCases', () => {
        for (const c of v.validationCases) {
            let error: unknown = null;
            try {
                validatePlan(c.plan, ctx());
            } catch (e) {
                error = e;
            }
            if (c.expect === 'ok') {
                expect(`${c.name} : ${error && (error as PlanInvalidError).detail}`).toBe(`${c.name} : null`);
            } else {
                expect(error).toBeInstanceOf(PlanInvalidError);
                const e = error as PlanInvalidError;
                expect(`${c.name} : ${e.code}`).toBe(`${c.name} : ${c.expect}`);
                if (c.detail) expect(`${c.name} : ${e.detail}`).toBe(`${c.name} : ${c.detail}`);
                else expect(`${c.name} : ${e.detail}`).not.toBe(`${c.name} : plan_too_large`);
            }
            checks++;
        }
    });
});

describe('action-plan.json — graphe et exécution (12 §6–§8, PC37, PC54, PC58)', () => {
    test('levelCases, cascadeCases, failureCases', () => {
        for (const c of v.levelCases) {
            expect(graphFrom(c).levels()).toEqual(c.expectLevels);
            checks++;
        }
        for (const c of v.cascadeCases) {
            expect([...graphFrom(c).cascade(c.unchecked)].sort((a, b) => a - b)).toEqual(c.expectSkipped);
            checks++;
        }
        for (const c of v.failureCases) {
            const { run } = simulate(graphFrom(c), c.accepted, Infinity, [c.failedAt]);
            expectStates(run, c.expectStates, c.name);
            expect(run.status()).toBe(c.expectStatus);
            checks++;
        }
    });

    test('runCases', () => {
        for (const c of v.runCases) {
            const { ticks, run } = simulate(validatePlan(plans[c.plan]!, ctx()), c.accepted, c.concurrency, c.failedAt ?? [], c.expiresBeforeTick);
            expect(ticks).toEqual(c.expectTicks);
            expectStates(run, c.expectStates, c.name);
            expect(run.status()).toBe(c.expectStatus);
            checks++;
        }
    });

    test('plan des catégories (PC58)', async () => {
        const cat = v.categoryPlan;
        expect(jcs(cat.plan)).toBe(cat.canonical);
        expect(planAad(v.sessionId, cat.planId)).toBe(cat.aad);
        expect(await withIv(cat.ivHex, () => encryptPlan(ck, cat.plan))).toBe(cat.value);
        const g = validatePlan(cat.plan, ctx());
        expect(executors(g)).toEqual(cat.executors);
        expect(g.levels()).toEqual(cat.expectLevels);
        checks++;
        const all = g.actions.map(a => a.n);
        expect(simulate(g, all, Infinity).ticks.map(t => t.device)).toEqual(cat.wavesUnbounded);
        checks++;
        for (const key of ['scheduleConcurrency4', 'failureOfCategory2'] as const) {
            const c = cat[key];
            const { ticks, run } = simulate(g, all, c.concurrency, c.failedAt ?? []);
            expect(ticks).toEqual(c.expectTicks);
            if (c.expectStates) expectStates(run, c.expectStates, key);
            expect(run.status()).toBe(c.expectStatus);
            checks++;
        }
    });

    test('tous les cas rejoués', () => {
        console.log(`action-plan.json : ${checks} vérifications rejouées`);
        expect(checks).toBe(2 + 4 + 4 + 4 + 10 + 20 + 41 + 6 + 7 + 2 + 7);
    });
});

describe('garde-fous hors vecteurs', () => {
    test('JCS : décimaux et entiers non sûrs refusés, tri par unités UTF-16', () => {
        expect(() => jcs({ a: 1.5 })).toThrow();
        expect(() => jcs({ a: 2 ** 53 })).toThrow();
        expect(jcs({ '｡': 1, '\u{1f600}': 2 })).toBe('{"\u{1f600}":2,"｡":1}');
    });

    test('exécutants selon le mode ; règle 8 ; délai de l\'org', () => {
        expect(executors(validatePlan(v.plan, ctx({ mode: 'auto' })))).toEqual(['agent', 'agent', 'device', 'device', 'agent']);
        expect(() => validatePlan(v.plan, ctx({ mode: 'auto', createThreadAsk: false }))).toThrow(expect.objectContaining({ detail: 'plan_kind' }));
        const g = validatePlan(v.plan, ctx());
        const served: GraphAction[] = g.actions.map(a => ({ ...a, after: [...a.after] }));
        served[4]!.executor = 'device';
        expect(() => checkServedGraph(g, served)).toThrow(expect.objectContaining({ detail: 'plan_served_mismatch' }));
        expect(() => validatePlan(v.plan, ctx({ maxLifetimeSecs: 3600 }))).toThrow(expect.objectContaining({ detail: 'plan_header' }));
    });

    test('résultat de phase : planId et phase du clair recontrôlés', async () => {
        const other = { ...v.planResult, phase: 2 };
        const value = await encryptPhaseResult(ck, v.sessionId, 'device', other);
        expect(await decryptPhaseResult(ck, v.sessionId, v.planId, 'device', 2, value)).toEqual(other);
        // Chiffré avec l'AAD de la phase 1 mais clair de la phase 2 : refusé après déchiffrement.
        const key = await crypto.subtle.importKey('raw', ck, 'AES-GCM', false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(phaseResultAad(v.sessionId, v.planId, 'device', 1)) }, key, new TextEncoder().encode(jcs(other))));
        const forged = `gcm1:${Buffer.from([...iv, ...ct]).toString('base64')}`;
        await expect(decryptPhaseResult(ck, v.sessionId, v.planId, 'device', 1, forged)).rejects.toMatchObject({ code: 'plan_invalid' });
    });

    test('plan de 256 Kio chiffré et relu (pas de débordement de pile)', async () => {
        const big: JsonObject = { ...v.plan, summary: 'x'.repeat(250_000) };
        const value = await encryptPlan(ck, big);
        expect(await decryptPlan(ck, v.sessionId, v.planId, value)).toEqual(big);
    });

    test('exécution : action non prête refusée, issue inconnue, arrêt', () => {
        const run = new PlanRun(validatePlan(v.plan, ctx()), [1, 2, 3, 4, 5]);
        expect(() => run.start(5)).toThrow();
        run.start(1);
        run.finish(1, 'unknown_outcome');
        expect(run.state(5)).toBe('skipped');
        for (const n of [2, 3]) {
            run.start(n);
            run.finish(n, 'done');
        }
        run.start(4);
        run.stop();
        expect(run.status()).toBe('executing');
        run.finish(4, 'done');
        expect(run.status()).toBe('stopped');
    });
});
