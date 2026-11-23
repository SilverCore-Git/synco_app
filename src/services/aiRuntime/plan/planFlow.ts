/**
 * Cycle de vie d'un plan dans la conversation (état réactif) : chargement et revalidation du plan
 * en attente, décision (carte ou graphe, PC76 revérifiée par `acceptPlan`), relecture de la vue
 * servie, état de suivi. L'exécution de la phase d'appareil est branchée par `attachRunner`.
 */
import { computed, ref, shallowRef } from 'vue';
import { AiRuntimeError } from '../errors';
import { fetchPlanView, type PendingPlanCall, type ServedPlanView } from '../actionPlan';
import { acceptPlan, loadPlan, rejectInvalidPlan, rejectPlan, type LoadedPlan, type PlanSessionDeps } from './planSession';
import { buildProgress, type Progress } from './planProgress';
import type { PhaseOutcome } from '../actionPlan';
import { stopPlan } from './planApi';
import { canAutoAccept } from './planAutoAccept';

export type FlowStatus = 'idle' | 'loading' | 'proposed' | 'following' | 'invalid' | 'ended' | 'error';
export type ReadyPlan = Extract<LoadedPlan, { state: 'ready' }>;

export interface PlanFlowDeps {
    session: PlanSessionDeps;
    /** `pendingToolCall` de la conversation (API) ; `null` s'il n'y en a pas. */
    pendingCall(): Promise<PendingPlanCall | null>;
    now(): number;
    /** Liste « Toujours accepter » de l'utilisateur pour cette org (`ai_auto_accept_<orgId>`), déjà lue et filtrée. */
    autoAccept?(): readonly string[];
}

const TERMINAL = new Set(['done', 'failed', 'interrupted', 'rejected', 'stopped', 'expired']);

/** Avancement affiché, tiré de la vue servie (états par action) ; `accepted` = ce que CET appareil a validé, sinon tout. */
export function progressFromView(model: ReadyPlan['model'], view: ServedPlanView, accepted?: readonly number[]): Progress {
    const acc = accepted ?? model.actions.map(a => a.n);
    const outcomes: PhaseOutcome[] = [];
    const executing = new Set<number>();
    for (const a of view.actions) {
        if (a.state === 'executing') executing.add(a.n);
        else if (a.state === 'done' || a.state === 'failed' || a.state === 'skipped' || a.state === 'unknown_outcome') outcomes.push({ n: a.n, state: a.state });
    }
    return buildProgress(model, acc, outcomes, executing);
}

export function usePlanFlow(deps: PlanFlowDeps) {
    const status = ref<FlowStatus>('idle');
    const loaded = shallowRef<ReadyPlan | null>(null);
    const view = shallowRef<ServedPlanView | null>(null);
    const invalidCode = ref<string | null>(null);
    const error = ref<string | null>(null);
    const busy = ref(false);
    const localAccepted = ref<number[] | null>(null);
    /** Une action d'appareil attend un autre appareil (claim tenu ailleurs). */
    const otherDevice = ref(false);
    /** Le plan a été accepté par « Toujours accepter » (affiché à l'utilisateur, qui peut l'arrêter). */
    const autoAccepted = ref(false);

    const expired = computed(() => {
        const at = view.value?.expiresAt ?? loaded.value?.model.expiresAt ?? 0;
        return view.value?.status === 'expired' || (at > 0 && deps.now() > at && view.value?.status === 'proposed');
    });
    const progress = computed<Progress | null>(() => (loaded.value && view.value && status.value !== 'proposed'
        ? progressFromView(loaded.value.model, view.value, localAccepted.value ?? undefined) : null));
    const finished = computed(() => !!view.value && TERMINAL.has(view.value.status));

    const fail = (e: unknown): void => {
        error.value = e instanceof AiRuntimeError ? e.message : "L'opération n'a pas abouti.";
        if (e instanceof AiRuntimeError && e.code === 'plan_not_pending') void refresh();
    };

    async function load(): Promise<void> {
        status.value = 'loading';
        error.value = null;
        try {
            const call = await deps.pendingCall();
            if (!call || call.name !== 'propose_actions' || !call.planId) { status.value = 'ended'; return; }
            const result = await loadPlan(deps.session, call, ['proposed', 'accepted', 'executing']);
            if (result.state === 'invalid') {
                invalidCode.value = result.code;
                status.value = 'invalid';
                // Un plan illisible est refusé sans rien faire, y compris à la réouverture (12 §5).
                try { view.value = await rejectInvalidPlan(deps.session, call.planId); } catch { /* déjà décidé */ }
                return;
            }
            loaded.value = result;
            view.value = result.view;
            status.value = result.view.status === 'proposed' ? 'proposed' : 'following';
            await maybeAutoAccept();
        } catch (e) {
            status.value = 'error';
            fail(e);
        }
    }

    /**
     * « Toujours accepter » (PC42) : seulement un plan encore à décider, non expiré, dont toutes les
     * actions sont dans la liste blanche et qui tient dans la carte (PC76, revérifiée par `acceptPlan`).
     */
    async function maybeAutoAccept(): Promise<void> {
        const l = loaded.value;
        const saved = deps.autoAccept?.() ?? [];
        if (!l || status.value !== 'proposed' || expired.value || !canAutoAccept(l.model, saved, deps.session.flags)) return;
        if (await accept(l.model.actions.map(a => a.n), 'card')) autoAccepted.value = true;
    }

    /** Relit la vue servie (après une décision, un push `ai:session-status`, une action…). */
    async function refresh(): Promise<ServedPlanView | null> {
        const l = loaded.value;
        if (!l) return null;
        try {
            const v = await fetchPlanView(deps.session.api, deps.session.orgId, deps.session.sessionId, l.view.planId);
            view.value = v;
            if (v.status !== 'proposed' && status.value === 'proposed') status.value = 'following';
            return v;
        } catch (e) { fail(e); return null; }
    }

    async function accept(checked: readonly number[], from: 'card' | 'graph'): Promise<boolean> {
        const l = loaded.value;
        if (!l || busy.value || status.value !== 'proposed') return false;
        busy.value = true;
        error.value = null;
        try {
            view.value = await acceptPlan(deps.session, l, checked, from);
            localAccepted.value = view.value.actions.filter(a => a.state !== 'skipped').map(a => a.n);
            status.value = 'following';
            return true;
        } catch (e) { fail(e); return false; } finally { busy.value = false; }
    }

    async function reject(): Promise<boolean> {
        const l = loaded.value;
        if (!l || busy.value || status.value !== 'proposed') return false;
        busy.value = true;
        error.value = null;
        try {
            view.value = await rejectPlan(deps.session, l.view.planId);
            status.value = 'ended';
            return true;
        } catch (e) { fail(e); return false; } finally { busy.value = false; }
    }

    /** « Arrêter le plan » (PC55, PC70) : aucune nouvelle action ne démarre, celles en cours vont à leur terme. */
    async function stop(): Promise<boolean> {
        const l = loaded.value;
        if (!l || busy.value) return false;
        busy.value = true;
        try {
            view.value = await stopPlan({ api: deps.session.api, orgId: deps.session.orgId, sessionId: deps.session.sessionId, planId: l.view.planId });
            return true;
        } catch (e) { fail(e); return false; } finally { busy.value = false; }
    }

    const setOtherDevice = (v: boolean): void => { otherDevice.value = v; };

    return { autoAccepted, setOtherDevice, stop, status, loaded, view, invalidCode, error, busy, otherDevice, expired, progress, finished, localAccepted, load, refresh, accept, reject };
}

export type PlanFlow = ReturnType<typeof usePlanFlow>;
