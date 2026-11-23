/**
 * Colle entre le plan chiffré et les écrans : ouvre et revalide (`openPlan`), construit le modèle de
 * présentation, envoie la décision. La carte de plan (PC76) n'a JAMAIS le droit d'accepter un plan de
 * plus de 5 actions ou contenant une action sensible : la règle est revérifiée ici, sur le plan
 * déchiffré, pas seulement dans l'écran.
 */
import { AiRuntimeError } from '../errors';
import {
    buildAcceptDecision, buildRejectDecision, fetchPlanView, openPlan, postPlanDecision,
    type OpenedPlan, type PendingPlanCall, type ServedPlanView,
} from '../actionPlan';
import type { ApiPort } from '../ports';
import type { PlanContext } from '@/assets/utils/aiActionPlan';
import type { ManifestFlags } from '@/services/aiAutoAccept';
import type { NameResolver } from './planLabels';
import { buildPlanModel, isSmallPlan, type PlanModel } from './planModel';
import type { LocalIdField } from '../actionPlan';

export interface PlanSessionDeps {
    api: ApiPort;
    ck: CryptoKey | Uint8Array;
    orgId: string;
    sessionId: string;
    context: PlanContext;
    knownLocalId: (field: LocalIdField, id: string) => boolean;
    resolver: NameResolver;
    flags?: readonly ManifestFlags[];
}

export type LoadedPlan =
    | { state: 'ready'; opened: OpenedPlan; view: ServedPlanView; model: PlanModel }
    | { state: 'invalid'; code: 'plan_invalid' | 'plan_digest_mismatch' };

export async function loadPlan(deps: PlanSessionDeps, call: PendingPlanCall, statuses?: readonly string[]): Promise<LoadedPlan> {
    if (!call.planId) return { state: 'invalid', code: 'plan_invalid' };
    const view = await fetchPlanView(deps.api, deps.orgId, deps.sessionId, call.planId);
    try {
        const opened = await openPlan({ ck: deps.ck, pendingToolCall: call, view, context: deps.context, knownLocalId: deps.knownLocalId, statuses });
        return { state: 'ready', opened, view, model: buildPlanModel(opened, deps.resolver, deps.flags) };
    } catch (e) {
        if (e instanceof AiRuntimeError && (e.code === 'plan_invalid' || e.code === 'plan_digest_mismatch')) return { state: 'invalid', code: e.code };
        throw e;
    }
}

/** Plan illisible : refusé sans rien faire (`reason: plan_invalid`). */
export const rejectInvalidPlan = (deps: PlanSessionDeps, planId: string): Promise<ServedPlanView> =>
    postPlanDecision(deps.api, deps.orgId, deps.sessionId, planId, buildRejectDecision(true));

export const rejectPlan = (deps: PlanSessionDeps, planId: string): Promise<ServedPlanView> =>
    postPlanDecision(deps.api, deps.orgId, deps.sessionId, planId, buildRejectDecision(false));

/**
 * Accepte les actions cochées. `from: 'card'` (validation sur place, PC76) est refusé si le plan
 * déchiffré a plus de 5 actions ou une action sensible. Les empreintes `serverDigests` sont recalculées
 * depuis le plan déchiffré (PC69), jamais prises dans l'état de l'écran.
 */
export async function acceptPlan(deps: PlanSessionDeps, loaded: Extract<LoadedPlan, { state: 'ready' }>, checked: readonly number[], from: 'card' | 'graph'): Promise<ServedPlanView> {
    if (from === 'card' && !isSmallPlan(buildPlanModel(loaded.opened, deps.resolver, deps.flags))) throw new AiRuntimeError('plan_invalid');
    const body = buildAcceptDecision(loaded.opened, checked);
    return postPlanDecision(deps.api, deps.orgId, deps.sessionId, loaded.view.planId, body);
}
