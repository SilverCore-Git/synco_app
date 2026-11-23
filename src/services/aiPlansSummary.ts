/** Plans d'action de l'utilisateur dans l'org : `GET /api/orgs/:orgId/ai/plans/summary` (compteurs et liste courte, jamais de contenu). */
import { ref } from 'vue';
import type { ApiPort } from '@/services/aiRuntime/ports';

export interface PendingPlan { id: string; conversationId: string; expiresAt: Date; actionCount: number }
export interface PlansSummary { toValidate: number; inProgress: number; pending: PendingPlan[] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parsePlansSummary(body: unknown): PlansSummary {
    const b = isObj(body) ? body : {};
    const pending = (Array.isArray(b.pending) ? b.pending : []).filter(isObj).flatMap((p): PendingPlan[] => {
        const at = typeof p.expiresAt === 'string' ? new Date(p.expiresAt) : null;
        if (typeof p.id !== 'string' || typeof p.conversationId !== 'string' || !at || Number.isNaN(at.getTime())) return [];
        return [{ id: p.id, conversationId: p.conversationId, expiresAt: at, actionCount: typeof p.actionCount === 'number' ? p.actionCount : 0 }];
    });
    return {
        toValidate: typeof b.toValidate === 'number' ? b.toValidate : pending.length,
        inProgress: typeof b.inProgress === 'number' ? b.inProgress : 0,
        pending,
    };
}

export async function fetchPlansSummary(api: ApiPort, orgId: string): Promise<PlansSummary> {
    const r = await api.request('GET', `/api/orgs/${encodeURIComponent(orgId)}/ai/plans/summary`);
    if (r.status < 200 || r.status >= 300) throw new Error(`plans_summary_${r.status}`);
    return parsePlansSummary(r.body);
}

/** « dans 3 h », « dans 2 jours », « expiré » : la précision utile pour décider. */
export function expiryText(at: Date, now: Date = new Date()): string {
    const ms = at.getTime() - now.getTime();
    if (ms <= 0) return 'expiré';
    const min = Math.round(ms / 60000);
    if (min < 60) return `dans ${Math.max(1, min)} min`;
    const h = Math.round(min / 60);
    if (h < 48) return `dans ${h} h`;
    return `dans ${Math.round(h / 24)} jours`;
}

/** Compteur de l'onglet « Agent » : partagé entre la fenêtre et ses sections. */
export const plansSummary = ref<PlansSummary | null>(null);
export const plansSummaryFailed = ref(false);
export async function refreshPlansSummary(api: ApiPort, orgId: string): Promise<void> {
    try { plansSummary.value = await fetchPlansSummary(api, orgId); plansSummaryFailed.value = false; }
    catch { plansSummaryFailed.value = true; }
}
