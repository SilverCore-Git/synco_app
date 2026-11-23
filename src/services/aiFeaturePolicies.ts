/**
 * Politiques d'org des fonctionnalités IA (synco_ai_runtime/docs/plan/12 §11 et §12.3), côté app.
 * Les appels passent par le port `ApiPort` de L10 (testable sans réseau) ; le calcul de l'annonce
 * « N personnes perdront… » (C3 §1.8) est pur.
 */
import type { ApiPort } from '@/services/aiRuntime/ports';

export const POLICY_FEATURES = ['autonomous_mode', 'runtime_mode', 'tool_auto_accept'] as const;
export type PolicyFeature = (typeof POLICY_FEATURES)[number];
export type PolicyMode = 'all' | 'none' | 'list';

export interface PolicySummary {
    feature: PolicyFeature;
    mode: PolicyMode;
    memberCount: number;
    enabledCount: number;
}

export interface PolicyMember {
    userId: string;
    enabled: boolean;
}

export interface PolicyEvent {
    id: string;
    type: string;
    actorId: string;
    userId: string | null;
    fromMode: string | null;
    toMode: string | null;
    removedCount: number | null;
    createdAt: string;
}

export interface MyFeature {
    feature: PolicyFeature;
    allowed: boolean;
    enabled: boolean;
    warningVersion: number | null;
}

/** Erreur typée d'une route de politique : l'UI ne lit que `code` (corps `{ error }` de l'API). */
export class PolicyApiError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, status: number) {
        super(code);
        this.name = 'PolicyApiError';
        this.code = code;
        this.status = status;
    }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isPolicyFeature = (v: unknown): v is PolicyFeature => typeof v === 'string' && (POLICY_FEATURES as readonly string[]).includes(v);
const isMode = (v: unknown): v is PolicyMode => v === 'all' || v === 'none' || v === 'list';

const base = (orgId: string) => `/api/orgs/${encodeURIComponent(orgId)}/ai/feature-policies`;

async function call(api: ApiPort, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await api.request(method, path, body);
    if (res.status < 200 || res.status >= 300 || !isObj(res.body)) {
        const code = isObj(res.body) && typeof res.body.error === 'string' ? res.body.error : 'api_error';
        throw new PolicyApiError(code, res.status);
    }
    return res.body;
}

/** Les trois cartes, dans l'ordre de l'API ; une fonctionnalité inconnue (réservée) est ignorée. */
export async function listPolicies(api: ApiPort, orgId: string): Promise<PolicySummary[]> {
    const body = await call(api, 'GET', base(orgId));
    const rows = Array.isArray(body.policies) ? body.policies : [];
    const out: PolicySummary[] = [];
    for (const r of rows) {
        if (!isObj(r) || !isPolicyFeature(r.feature) || !isMode(r.mode)) continue;
        out.push({
            feature: r.feature,
            mode: r.mode,
            memberCount: typeof r.memberCount === 'number' ? r.memberCount : 0,
            enabledCount: typeof r.enabledCount === 'number' ? r.enabledCount : 0,
        });
    }
    return out;
}

export async function listPolicyMembers(api: ApiPort, orgId: string, feature: PolicyFeature, opts: { q?: string; after?: string; limit?: number } = {}): Promise<{ members: PolicyMember[]; next: string | null }> {
    const qs = new URLSearchParams();
    if (opts.q) qs.set('q', opts.q.slice(0, 100));
    if (opts.after) qs.set('after', opts.after);
    qs.set('limit', String(Math.min(Math.max(opts.limit ?? 50, 1), 100)));
    const body = await call(api, 'GET', `${base(orgId)}/${feature}/members?${qs.toString()}`);
    const rows = Array.isArray(body.members) ? body.members : [];
    return {
        members: rows.filter(isObj).filter(r => typeof r.userId === 'string').map(r => ({ userId: r.userId as string, enabled: r.enabled === true })),
        next: typeof body.next === 'string' ? body.next : null,
    };
}

/**
 * `PUT /:feature`. Avec `userIds` (1 à 100, mode `list` seulement), le mode ET la liste s'appliquent en UNE
 * transaction côté API : le retrait du mode autonome (§11.4) ne touche que les personnes hors de la liste.
 */
export async function setPolicyMode(api: ApiPort, orgId: string, feature: PolicyFeature, mode: PolicyMode, userIds?: string[]): Promise<{ revoked: number }> {
    const payload = mode === 'list' && userIds && userIds.length ? { mode, userIds } : { mode };
    const body = await call(api, 'PUT', `${base(orgId)}/${feature}`, payload);
    return { revoked: typeof body.revoked === 'number' ? body.revoked : 0 };
}

export interface PolicyChange {
    currentMode: PolicyMode;
    nextMode: PolicyMode;
    added: string[];
    removed: string[];
}

export const LIST_FIRST_WRITE_MAX = 100;

/**
 * Enregistre un changement de politique. Vers `list` depuis un autre mode : UN `PUT { mode, userIds }`
 * (jamais « mode `list` vide » puis ajouts, qui retirerait la fonctionnalité à toute l'org entre les deux) ;
 * plus de 100 personnes d'un coup est refusé (`list_too_large`) plutôt que découpé en deux temps, car la
 * seconde tranche perdrait la fonctionnalité entre les deux requêtes. Déjà en `list` : ajouts puis retraits.
 */
export async function applyPolicyChange(api: ApiPort, orgId: string, feature: PolicyFeature, c: PolicyChange): Promise<void> {
    if (c.nextMode === 'list' && c.currentMode !== 'list') {
        if (c.added.length > LIST_FIRST_WRITE_MAX) throw new PolicyApiError('list_too_large', 400);
        await setPolicyMode(api, orgId, feature, 'list', c.added);
        return;
    }
    if (c.nextMode !== c.currentMode) {
        await setPolicyMode(api, orgId, feature, c.nextMode);
        return;
    }
    if (c.nextMode === 'list') {
        if (c.added.length) await addPolicyMembers(api, orgId, feature, c.added);
        if (c.removed.length) await removePolicyMembers(api, orgId, feature, c.removed);
    }
}

/** L'API borne les écritures à 100 identifiants : on découpe. */
const WRITE_MAX = 100;
async function writeMembers(api: ApiPort, orgId: string, feature: PolicyFeature, path: 'members' | 'members/remove', userIds: string[]): Promise<void> {
    for (let i = 0; i < userIds.length; i += WRITE_MAX) {
        await call(api, 'POST', `${base(orgId)}/${feature}/${path}`, { userIds: userIds.slice(i, i + WRITE_MAX) });
    }
}
export const addPolicyMembers = (api: ApiPort, orgId: string, feature: PolicyFeature, userIds: string[]) => writeMembers(api, orgId, feature, 'members', userIds);
export const removePolicyMembers = (api: ApiPort, orgId: string, feature: PolicyFeature, userIds: string[]) => writeMembers(api, orgId, feature, 'members/remove', userIds);

export async function listPolicyEvents(api: ApiPort, orgId: string, feature: PolicyFeature, before?: string): Promise<{ events: PolicyEvent[]; next: string | null }> {
    const qs = new URLSearchParams({ limit: '30' });
    if (before) qs.set('before', before);
    const body = await call(api, 'GET', `${base(orgId)}/${feature}/events?${qs.toString()}`);
    const rows = Array.isArray(body.events) ? body.events : [];
    return {
        events: rows.filter(isObj).filter(r => typeof r.id === 'string' && typeof r.type === 'string').map(r => ({
            id: r.id as string,
            type: r.type as string,
            actorId: typeof r.actorId === 'string' ? r.actorId : '',
            userId: typeof r.userId === 'string' ? r.userId : null,
            fromMode: typeof r.fromMode === 'string' ? r.fromMode : null,
            toMode: typeof r.toMode === 'string' ? r.toMode : null,
            removedCount: typeof r.removedCount === 'number' ? r.removedCount : null,
            createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
        })),
        next: typeof body.next === 'string' ? body.next : null,
    };
}

/** Droits de l'utilisateur (`GET /me`) : sections grisées ou masquées selon `allowed`. */
export async function fetchMyFeatures(api: ApiPort, orgId: string): Promise<MyFeature[]> {
    const body = await call(api, 'GET', `${base(orgId)}/me`);
    const rows = Array.isArray(body.features) ? body.features : [];
    return rows.filter(isObj).filter(r => isPolicyFeature(r.feature)).map(r => ({
        feature: r.feature as PolicyFeature,
        allowed: r.allowed === true,
        enabled: r.enabled === true,
        warningVersion: typeof r.warningVersion === 'number' ? r.warningVersion : null,
    }));
}

// ---------------------------------------------------------------------------
// Annonce avant d'enregistrer (C3 §1.8)
// ---------------------------------------------------------------------------

export interface PendingPolicyChange {
    feature: PolicyFeature;
    currentMode: PolicyMode;
    nextMode: PolicyMode;
    /** `enabledCount` de la politique enregistrée : personnes qui utilisent la fonctionnalité aujourd'hui. */
    enabledCount: number;
    /** Personnes retirées de la liste (mode `list` conservé), avec leur état d'usage. */
    removed: Array<{ name: string; enabled: boolean }>;
    /** Personnes ajoutées à la liste : elles ne perdent rien, mais comptent pour l'annonce « liste vide ». */
    addedCount: number;
}

export interface PolicyAnnouncement {
    /** Personnes qui perdront la fonctionnalité immédiatement ; `null` quand le nombre n'est pas connu d'avance. */
    affected: number | null;
    text: string | null;
}

const CONSEQUENCE: Record<PolicyFeature, string> = {
    autonomous_mode: 'Leurs conversations reprennent en mode plan.',
    runtime_mode: 'Leurs conversations reviennent en local et leur délégation est révoquée.',
    tool_auto_accept: 'Leurs « Toujours accepter » cessent de s\'appliquer.',
};
const CONSEQUENCE_ONE: Record<PolicyFeature, string> = {
    autonomous_mode: 'ses conversations reprennent en mode plan',
    runtime_mode: 'ses conversations reviennent en local et sa délégation est révoquée',
    tool_auto_accept: 'ses « Toujours accepter » cessent de s\'appliquer',
};
const FEATURE_LABEL: Record<PolicyFeature, string> = {
    autonomous_mode: 'le mode autonome',
    runtime_mode: 'le mode runtime',
    tool_auto_accept: 'le « Toujours accepter »',
};

/**
 * Annonce chiffrée, calculée AVANT l'enregistrement. Le nombre vient des `enabled` des personnes
 * retirées et de `enabledCount` (jamais d'une liste par membre). Passer de « Tout le monde » à une liste
 * ne permet pas de savoir d'avance qui garde l'accès : l'annonce donne alors un plafond.
 */
export function policyAnnouncement(c: PendingPolicyChange): PolicyAnnouncement {
    const label = FEATURE_LABEL[c.feature];
    if (c.nextMode === 'all') return { affected: 0, text: null };

    if (c.currentMode === 'list' && c.nextMode === 'list') {
        const losers = c.removed.filter(r => r.enabled);
        if (losers.length === 0) return { affected: 0, text: null };
        if (losers.length === 1) {
            return { affected: 1, text: `${losers[0]!.name} utilise ${label}. Si vous retirez cette personne de la liste, ${CONSEQUENCE_ONE[c.feature]} tout de suite.` };
        }
        return { affected: losers.length, text: `${losers.length} personnes l'utilisent ; elles le perdront immédiatement. ${CONSEQUENCE[c.feature]}` };
    }

    if (c.currentMode === 'none') return { affected: 0, text: null };

    if (c.nextMode === 'none' || (c.nextMode === 'list' && c.currentMode === 'all')) {
        const n = c.enabledCount;
        if (n === 0) return { affected: 0, text: null };
        if (c.nextMode === 'none') {
            return {
                affected: n,
                text: n === 1
                    ? `Une personne utilise ${label} ; elle le perdra immédiatement. ${CONSEQUENCE[c.feature]}`
                    : `${n} personnes l'utilisent ; elles le perdront immédiatement. ${CONSEQUENCE[c.feature]}`,
            };
        }
        // Seules les personnes de la liste gardent l'accès (une seule requête côté API) : sans personne choisie,
        // toutes les `n` le perdent ; sinon au moins `n - choisies` le perdent (on ignore qui, parmi les choisies, l'utilise).
        if (c.addedCount === 0) {
            return {
                affected: n,
                text: n === 1
                    ? `Une personne utilise ${label} ; la liste étant vide, elle le perdra immédiatement. ${CONSEQUENCE[c.feature]}`
                    : `${n} personnes utilisent ${label} ; la liste étant vide, elles le perdront toutes immédiatement. ${CONSEQUENCE[c.feature]}`,
            };
        }
        const least = Math.max(0, n - c.addedCount);
        return {
            affected: null,
            text: `${n} personne${n > 1 ? 's' : ''} utilisent ${label}. Seules les ${c.addedCount} personne${c.addedCount > 1 ? 's' : ''} de la liste le gardent : ${least > 0 ? `au moins ${least} le perdront` : 'celles qui ne sont pas dans la liste le perdront'} immédiatement. ${CONSEQUENCE[c.feature]}`,
        };
    }

    // list -> none, déjà traité ; list -> list sans effet connu.
    return { affected: 0, text: null };
}
