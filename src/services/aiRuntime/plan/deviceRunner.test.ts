/** Phase d'appareil (12 §8.2) contre un faux serveur de plan : ordre, références, cascade PC54, arrêt PC70, reprise. */
import { describe, expect, test } from 'bun:test';
import raw from '../../../../scripts/e2ee-vectors/action-plan.json';
import { ToolManifest, type JsonObject, type JsonValue, type PlanContext } from '@/assets/utils/aiActionPlan';
import { AiRuntimeError } from '../errors';
import { openPhaseResult, openPlan, type OpenedPlan, type ServedPlanView } from '../actionPlan';
import type { ApiPort, HttpMethod } from '../ports';
import { DeviceHttpError, DeviceNotSentError } from './deviceErrors';
import { memoryPlanLocalStore } from './planLocal';
import { runDevicePhase, type DeviceCall } from './deviceRunner';

interface V { sessionId: string; planId: string; ckHex: string; plan: JsonObject; planValue: string; planExecutors: ('device' | 'agent')[]; toolManifest: JsonValue; serverDigests: { plan: string | null; n: number | null; sha256Hex: string }[] }
const v = raw as unknown as V;
const ck = Uint8Array.from(Buffer.from(v.ckHex, 'hex'));
const context: PlanContext = { sessionId: v.sessionId, maxLifetimeSecs: 604_800, manifest: ToolManifest.fromJson(v.toolManifest), mode: 'plan', createThreadAsk: true };
const SPACE = (v.plan.actions as JsonObject[])[0]!.args as JsonObject;
const actionsClear = v.plan.actions as JsonObject[];

type St = 'pending' | 'executing' | 'done' | 'failed' | 'skipped' | 'unknown_outcome';

/** Faux serveur : états par action, `ready` calculé, claim, sorties enregistrées par l'en-tête, cascade (PC54). */
class FakeServer implements ApiPort {
    state: St[] = [];
    output: (Record<string, string> | null)[] = [];
    status = 'accepted';
    devicePhases = 0;
    claim: { deviceId: string; phase: number } | null = null;
    deposits: { phase: number; value: string }[] = [];
    log: string[] = [];
    rateLimitOnce = false;
    claimedElsewhere = false;
    constructor(public agentDone = false) {
        this.state = actionsClear.map(() => 'pending' as St);
        this.output = actionsClear.map(() => null);
    }
    ready(n: number): boolean {
        const a = actionsClear[n - 1]!;
        return this.state[n - 1] === 'pending' && ((a.after as number[] | undefined) ?? []).every(m => this.state[m - 1] === 'done');
    }
    cascade(n: number) {
        const dead = new Set([n]);
        for (const a of actionsClear) if (((a.after as number[] | undefined) ?? []).some(m => dead.has(m))) dead.add(a.n as number);
        dead.delete(n);
        for (const m of dead) if (this.state[m - 1] === 'pending') this.state[m - 1] = 'skipped';
    }
    stop() { this.status = 'stopped'; this.state = this.state.map(s => (s === 'pending' ? 'skipped' : s)); }
    record(n: number, out: Record<string, string>) { this.output[n - 1] = out; }
    view() {
        const digest = v.serverDigests.find(d => d.plan === 'plan')!;
        return {
            planId: v.planId, sessionId: v.sessionId, toolCallId: 'call_7', status: this.status, actionCount: 5, devicePhases: this.devicePhases, agentPhases: 0,
            serverDigests: { [String(digest.n)]: digest.sha256Hex }, expiresAt: '2099-01-01T00:00:00.000Z', claim: this.claim,
            actions: actionsClear.map((a, i) => ({ n: a.n, executor: v.planExecutors[i], after: (a.after as number[] | undefined) ?? [], state: this.state[i], ready: this.ready(a.n as number), output: this.output[i] })),
            agentResults: [],
        };
    }
    async request(method: HttpMethod, path: string, body?: unknown) {
        const b = (body ?? {}) as Record<string, unknown>;
        const err = (status: number, error: string) => ({ status, body: { error } });
        if (method === 'GET') return { status: 200, body: this.view() };
        if (path.endsWith('/claim')) {
            if (this.claimedElsewhere) return err(409, 'plan_claimed');
            // Claim précédent perdu : ce qui était `executing` devient `unknown_outcome` (12 §8.2).
            this.state = this.state.map((s, i) => { if (s === 'executing') { this.cascade(i + 1); return 'unknown_outcome'; } return s; });
            this.claim = { deviceId: b.deviceId as string, phase: b.phase as number };
            this.log.push(`claim:${b.phase}`);
            return { status: 200, body: { phase: b.phase, claimExpiresAt: '2099-01-01T00:00:00.000Z' } };
        }
        if (path.endsWith('/progress')) {
            const n = b.n as number, st = b.state as string;
            if (this.rateLimitOnce) { this.rateLimitOnce = false; return err(429, 'rate_limited'); }
            this.log.push(`${st}:${n}`);
            if (st === 'executing') {
                if (this.status === 'stopped') return err(409, 'plan_not_executing');
                if (!this.ready(n)) return err(409, 'action_state_conflict');
                this.state[n - 1] = 'executing';
                this.status = 'executing';
            } else if (st === 'done') {
                if (!this.output[n - 1]) return err(409, 'action_output_missing');
                this.state[n - 1] = 'done';
            } else { this.state[n - 1] = 'failed'; this.cascade(n); }
            return { status: 200, body: this.view() };
        }
        if (path.endsWith('/inbox')) {
            const pending = actionsClear.some((a, i) => v.planExecutors[i] === 'device' && (this.ready(a.n as number) || this.state[i] === 'executing'));
            if (pending) return err(409, 'plan_phase_mismatch');
            this.deposits.push({ phase: b.phase as number, value: b.value as string });
            this.devicePhases++;
            this.claim = null;
            return { status: 201, body: {} };
        }
        return err(404, 'not_found');
    }
}

async function opened(): Promise<OpenedPlan> {
    const digest = v.serverDigests.find(d => d.plan === 'plan')!;
    const view: ServedPlanView = {
        planId: v.planId, sessionId: v.sessionId, toolCallId: 'call_7', status: 'proposed', actionCount: 5, serverDigests: { [String(digest.n)]: digest.sha256Hex },
        actions: actionsClear.map((a, i) => ({ n: a.n as number, executor: v.planExecutors[i]!, after: (a.after as number[] | undefined) ?? [] })), agentResults: [],
    };
    return openPlan({ ck, pendingToolCall: { id: 'call_7', name: 'propose_actions', planId: v.planId, args: v.planValue }, view, context, knownLocalId: (_f, id) => id === SPACE.spaceId });
}

interface Setup { server: FakeServer; calls: { call: DeviceCall; header: string }[]; sync: number; run: () => ReturnType<typeof runDevicePhase> }
async function setup(opts: { fail?: number[]; failWith?: Error; concurrency?: number; onExecute?: (n: number, s: FakeServer) => void; recordedId?: (n: number) => string; accepted?: number[] | null } = {}): Promise<Setup> {
    const local = memoryPlanLocalStore();
    if (opts.accepted !== null) local.saveAccepted(v.planId, opts.accepted ?? [1, 2, 3, 4, 5]);
    const server = new FakeServer();
    const o = await opened();
    const calls: Setup['calls'] = [];
    const st: Setup = { server, calls, sync: 0, run: async () => ({ kind: 'none' }) };
    st.run = () => runDevicePhase({
        route: { api: server, orgId: 'o', sessionId: v.sessionId, planId: v.planId }, deviceId: 'dev1', ck, opened: o, local,
        execute: async (call, header) => {
            calls.push({ call, header });
            opts.onExecute?.(call.n, server);
            if (opts.fail?.includes(call.n)) throw opts.failWith ?? new DeviceHttpError(500);
            const id = `obj${call.n}`;
            server.record(call.n, { id, spaceId: 'cm3spaceexample0000000001' });
            return { id: opts.recordedId ? 'local' + call.n : id, spaceId: 'cm3spaceexample0000000001', extra: 'ignoré' };
        },
        syncKeys: async () => { st.sync++; },
        wait: async () => undefined, now: () => Date.UTC(2026, 10, 23), concurrency: opts.concurrency,
    });
    return st;
}

const sent = async (s: Setup) => openPhaseResult(ck, v.sessionId, v.planId, 'device', s.server.deposits[0]!.phase, (await opened()).graph, s.server.deposits[0]!.value);

describe('phase d’appareil', () => {
  test('actions prêtes dans l’ordre, en-tête planId/n, références résolues, résultat scellé et déposé, clés des salons ajoutées', async () => {
        const s = await setup({ concurrency: 1 });
        const r = await s.run();
        expect(r.kind).toBe('done');
        expect(s.calls.map(c => c.header)).toEqual([1, 2, 3, 4].map(n => `${v.planId}/${n}`));
        expect(s.calls[3]!.call.args.folderId).toBe('obj3'); // $3.id résolu
        expect(s.calls[0]!.call.args).toEqual({ name: 'budget', type: 'text', spaceId: 'cm3spaceexample0000000001' });
        expect(s.sync).toBe(1);
        expect(s.server.log[0]).toBe('claim:1');
        const outcomes = await sent(s);
        expect(outcomes.map(o => [o.n, o.state])).toEqual([[1, 'done'], [2, 'done'], [3, 'done'], [4, 'done']]);
        expect(outcomes[0]!.output).toEqual({ id: 'obj1', spaceId: 'cm3spaceexample0000000001' }); // champ « extra » jamais transmis
        // executing avant l'appel, done après
        expect(s.server.log.indexOf('executing:1')).toBeLessThan(s.server.log.indexOf('done:1'));
    });

    test('échec en cascade (PC54) : seule la dépendante est annulée, le reste continue', async () => {
        const s = await setup({ fail: [3] });
        await s.run();
        const outcomes = await sent(s);
        expect(outcomes.map(o => [o.n, o.state])).toEqual([[1, 'done'], [2, 'done'], [3, 'failed'], [4, 'skipped']]);
        expect(s.calls.map(c => c.call.n).sort()).toEqual([1, 2, 3]); // 4 jamais appelée
    });

    test('erreur de transport après l’envoi : issue inconnue, jamais « failed » ; refus HTTP ou rien parti : « failed »', async () => {
        const net = await setup({ fail: [3], failWith: new TypeError('Failed to fetch') });
        const r = await net.run();
        // L'API garde l'action « executing » (le claim expirera) : la phase ne se clôt pas, l'issue locale reste inconnue.
        expect(r.kind === 'done' ? r.outcomes.find(o => o.n === 3)?.state : null).toBe('unknown_outcome');
        expect(net.server.state[2]).toBe('executing');
        const refused = await setup({ fail: [3], failWith: new DeviceHttpError(403) });
        await refused.run();
        expect((await sent(refused)).find(o => o.n === 3)?.state).toBe('failed');
        const local = await setup({ fail: [3], failWith: new DeviceNotSentError('no_org') });
        await local.run();
        expect((await sent(local)).find(o => o.n === 3)?.state).toBe('failed');
    });

    test('une action servie prête mais non acceptée sur cet appareil n’est jamais exécutée ; ensemble inconnu : rien', async () => {
        const some = await setup({ accepted: [1, 2], concurrency: 1 });
        await some.run();
        expect(some.calls.map(c => c.call.n)).toEqual([1, 2]);
        const none = await setup({ accepted: null });
        expect(await none.run()).toEqual({ kind: 'none' });
        expect(none.calls).toHaveLength(0);
        expect(none.server.log).toHaveLength(0);
    });

    test('arrêt du plan (PC70) pendant une action : plus aucun démarrage, l’action en cours va à son terme', async () => {
        const s = await setup({ concurrency: 1, onExecute: (n, srv) => { if (n === 1) srv.stop(); } });
        await s.run();
        expect(s.calls.map(c => c.call.n)).toEqual([1]);
        const outcomes = await sent(s);
        expect(outcomes.find(o => o.n === 1)?.state).toBe('done');
        expect(outcomes.filter(o => o.state === 'skipped').map(o => o.n)).toEqual([2, 3, 4]);
    });

    test('un autre appareil tient le claim : rien n’est exécuté', async () => {
        const s = await setup();
        s.server.claimedElsewhere = true;
        expect(await s.run()).toEqual({ kind: 'other_device' });
        expect(s.calls).toHaveLength(0);
        expect(s.server.deposits).toHaveLength(0);
    });

    test('reprise après rechargement : une action restée « executing » n’est jamais relancée, elle est rapportée inconnue', async () => {
        const s = await setup();
        s.server.state[2] = 'executing'; // la 3 tournait quand l’onglet s’est fermé
        s.server.status = 'executing';
        await s.run();
        expect(s.calls.map(c => c.call.n).sort()).toEqual([1, 2]);
        const outcomes = await sent(s);
        expect(outcomes.map(o => [o.n, o.state])).toEqual([[1, 'done'], [2, 'done'], [3, 'unknown_outcome'], [4, 'skipped']]);
    });

    test('progress « executing » refusé (conflit d’état) : l’action n’est pas lancée', async () => {
        const s = await setup({ concurrency: 1 });
        const real = s.server.request.bind(s.server);
        s.server.request = async (m, p, b) => ((b as { n?: number; state?: string } | undefined)?.n === 2 && (b as { state?: string }).state === 'executing'
            ? { status: 409, body: { error: 'action_state_conflict' } } : real(m, p, b));
        s.server.state[1] = 'executing'; // l'API la tient déjà
        await s.run().catch(e => { expect(e).toBeInstanceOf(AiRuntimeError); });
        expect(s.calls.map(c => c.call.n)).not.toContain(2);
    });

    test('référence incohérente avec la sortie enregistrée par l’API : échec sans appel, dépendantes annulées', async () => {
        const s = await setup({ recordedId: n => 'x' + n, concurrency: 1 });
        await s.run();
        const outcomes = await sent(s);
        expect(s.calls.map(c => c.call.n)).toEqual([1, 2, 3]); // 4 n'est pas appelée : $3.id ≠ sortie enregistrée
        expect(outcomes.find(o => o.n === 4)?.state).toBe('failed');
    });

    test('limite de débit (429) : le même appel est rejoué, la concurrence réduite', async () => {
        const s = await setup();
        s.server.rateLimitOnce = true;
        const r = await s.run();
        expect(r.kind).toBe('done');
        expect(s.calls).toHaveLength(4);
    });

    test('plan sans action d’appareil prête ou déjà décidé autrement : rien à faire', async () => {
        const s = await setup();
        s.server.status = 'stopped';
        expect(await s.run()).toEqual({ kind: 'none' });
    });
});
