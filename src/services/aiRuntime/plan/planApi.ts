/**
 * Routes utilisateur de l'exécution d'un plan (12 §12.1) : claim, progress, arrêt, dépôt du résultat de
 * phase. Les refus de l'API deviennent des `AiRuntimeError` à code fixe ; aucun corps brut n'est repris.
 */
import { AiRuntimeError, apiError } from '../errors';
import { readPlanView, type PlanResultFrame, type ServedPlanView } from '../actionPlan';
import type { ApiPort } from '../ports';

export interface PlanRoute { api: ApiPort; orgId: string; sessionId: string; planId: string }

const base = (r: PlanRoute) => `/api/orgs/${encodeURIComponent(r.orgId)}/ai/sessions/${encodeURIComponent(r.sessionId)}`;
const planPath = (r: PlanRoute) => `${base(r)}/plans/${encodeURIComponent(r.planId)}`;

export interface Claim { phase: number; claimExpiresAt: number }

export async function claimPhase(r: PlanRoute, deviceId: string, phase: number): Promise<Claim> {
    const res = await r.api.request('POST', `${planPath(r)}/claim`, { deviceId, phase });
    if (res.status !== 200) throw apiError(res.status, res.body);
    const b = res.body as { phase?: unknown; claimExpiresAt?: unknown } | null;
    const until = typeof b?.claimExpiresAt === 'string' ? Date.parse(b.claimExpiresAt) : NaN;
    return { phase: typeof b?.phase === 'number' ? b.phase : phase, claimExpiresAt: Number.isFinite(until) ? until : 0 };
}

export type ProgressState = 'executing' | 'done' | 'failed';

export async function postProgress(r: PlanRoute, deviceId: string, n: number, state: ProgressState): Promise<ServedPlanView> {
    const res = await r.api.request('POST', `${planPath(r)}/progress`, { deviceId, n, state });
    if (res.status !== 200) throw apiError(res.status, res.body);
    return readPlanView(res.body);
}

/** « Arrêter le plan » (PC55) ; rejeu sur un plan déjà arrêté : 200. */
export async function stopPlan(r: PlanRoute): Promise<ServedPlanView> {
    const res = await r.api.request('POST', `${planPath(r)}/stop`, {});
    if (res.status !== 200) throw apiError(res.status, res.body);
    return readPlanView(res.body);
}

/** `POST …/inbox` : `201` ou `200` (doublon) = déposé. */
export async function depositPlanResult(r: PlanRoute, frame: PlanResultFrame): Promise<void> {
    const res = await r.api.request('POST', `${base(r)}/inbox`, { t: frame.t, id: frame.id, planId: frame.planId, phase: frame.phase, value: frame.value });
    if (res.status !== 200 && res.status !== 201) throw apiError(res.status, res.body);
}

export const isCode = (e: unknown, ...codes: string[]): boolean => e instanceof AiRuntimeError && codes.includes(e.code);
