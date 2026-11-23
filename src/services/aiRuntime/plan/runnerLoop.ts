/**
 * Boucle de suivi et d'exécution d'un plan accepté : relit la vue servie, lance la phase d'appareil
 * quand une action d'appareil est prête (y compris après un rechargement, claim expiré), tient
 * l'indicateur « en cours sur votre autre appareil », et s'arrête quand le plan est clos. Une seule
 * phase à la fois par appareil ; jamais de relance d'une action déjà `executing` (c'est le runner).
 */
import type { ServedPlanView } from '../actionPlan';
import type { PhaseResult } from './deviceRunner';

export const POLL_MS = 5_000;
export const OTHER_DEVICE_POLL_MS = 15_000;
const TERMINAL = new Set(['done', 'failed', 'interrupted', 'rejected', 'stopped', 'expired']);

export interface LoopFlow {
    refresh(): Promise<ServedPlanView | null>;
    setOtherDevice(v: boolean): void;
}

export interface LoopOptions {
    flow: LoopFlow;
    run(): Promise<PhaseResult>;
    schedule(fn: () => void, ms: number): unknown;
    cancel(handle: unknown): void;
    onError?(e: unknown): void;
}

export const hasReadyDeviceAction = (v: ServedPlanView): boolean =>
    (v.status === 'accepted' || v.status === 'executing') && v.actions.some(a => a.executor === 'device' && a.state === 'pending' && a.ready === true);

export function createRunnerLoop(o: LoopOptions) {
    let timer: unknown = null;
    let busy = false;
    let stopped = true;
    let next = POLL_MS;

    const arm = () => { if (!stopped) timer = o.schedule(() => { timer = null; void tick(); }, next); };

    async function tick(): Promise<void> {
        if (stopped || busy) return;
        busy = true;
        next = POLL_MS;
        try {
            let view = await o.flow.refresh();
            if (view && hasReadyDeviceAction(view)) {
                const result = await o.run();
                o.flow.setOtherDevice(result.kind === 'other_device');
                if (result.kind === 'other_device') next = OTHER_DEVICE_POLL_MS;
                view = await o.flow.refresh();
            } else o.flow.setOtherDevice(false);
            if (view && TERMINAL.has(view.status)) stopped = true;
        } catch (e) {
            o.onError?.(e);
        } finally {
            busy = false;
            arm();
        }
    }

    return {
        start() { if (!stopped) return; stopped = false; void tick(); },
        /** Relance tout de suite (après une décision, un push de statut). */
        kick() { if (stopped || busy) return; if (timer !== null) { o.cancel(timer); timer = null; } void tick(); },
        stop() { stopped = true; if (timer !== null) { o.cancel(timer); timer = null; } },
        get running() { return !stopped; },
    };
}
