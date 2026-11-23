import { describe, expect, test } from 'bun:test';
import type { ServedPlanView } from '../actionPlan';
import type { PhaseResult } from './deviceRunner';
import { createRunnerLoop, OTHER_DEVICE_POLL_MS, POLL_MS } from './runnerLoop';

const view = (status: string, ready: boolean): ServedPlanView => ({
    planId: 'p', sessionId: 's', toolCallId: 'c', status, actionCount: 1, serverDigests: {}, agentResults: [],
    actions: [{ n: 1, executor: 'device', after: [], state: 'pending', ready }],
});

function make(views: ServedPlanView[], results: PhaseResult[]) {
    const timers: { fn: () => void; ms: number; live: boolean }[] = [];
    let runs = 0, other = false, i = 0;
    const loop = createRunnerLoop({
        flow: { refresh: async () => views[Math.min(i++, views.length - 1)]!, setOtherDevice: v => { other = v; } },
        run: async () => results[Math.min(runs++, results.length - 1)]!,
        schedule: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
        cancel: h => { (h as { live: boolean }).live = false; },
    });
    const flush = async () => { for (let k = 0; k < 10; k++) await new Promise(r => setTimeout(r, 0)); };
    return { loop, timers, flush, runs: () => runs, other: () => other };
}

describe('boucle d’exécution', () => {
    test('lance la phase quand une action d’appareil est prête, puis s’arrête quand le plan est clos', async () => {
        const h = make([view('accepted', true), view('executing', false), view('done', false)], [{ kind: 'done', phase: 1, outcomes: [] }]);
        h.loop.start();
        await h.flush();
        expect(h.runs()).toBe(1);
        const t = h.timers.find(x => x.live)!;
        expect(t.ms).toBe(POLL_MS);
        t.live = false; t.fn();
        await h.flush();
        expect(h.loop.running).toBe(false);
        expect(h.timers.filter(x => x.live)).toHaveLength(0);
    });
    test('un autre appareil tient le claim : indicateur levé, sondage espacé', async () => {
        const h = make([view('accepted', true)], [{ kind: 'other_device' }]);
        h.loop.start();
        await h.flush();
        expect(h.other()).toBe(true);
        expect(h.timers.find(x => x.live)!.ms).toBe(OTHER_DEVICE_POLL_MS);
    });
    test('rien de prêt : aucune phase lancée', async () => {
        const h = make([view('accepted', false)], [{ kind: 'none' }]);
        h.loop.start();
        await h.flush();
        expect(h.runs()).toBe(0);
        h.loop.stop();
        expect(h.timers.filter(x => x.live)).toHaveLength(0);
    });
});
