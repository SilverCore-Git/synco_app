/**
 * Environnement de l'app pour un plan : annuaire local (règle 7 de 12 §5), résolution des noms pour
 * les intitulés, contexte de validation (manifeste des outils, mode du mandat vérifié). Les noms ne
 * viennent que de l'annuaire local de l'org ouverte, jamais du plan.
 */
import { ToolManifest, type JsonValue, type PlanContext } from '@/assets/utils/aiActionPlan';
import type { Org, Category } from '@/types/types';
import { currentVerifiedMode, type AiRuntimeDeps } from '@/services/aiRuntime';
import type { LocalIdField } from '../actionPlan';
import type { ManifestFlags } from '@/services/aiAutoAccept';
import { fetchMyFeatures } from '@/services/aiFeaturePolicies';
import type { AutoAcceptPolicy } from './planAutoAccept';
import type { NameResolver, ResolveKind } from './planLabels';

/** Plafond de la durée d'un plan (12 §7.4) : l'API applique la valeur exacte de l'org, plus courte. */
export const MAX_PLAN_LIFETIME_SECS = 604_800;

const allCategories = (org: Org): Category[] => [...(org.home?.categories ?? []), ...(org.spaces ?? []).flatMap(s => s.categories ?? [])];

export function orgResolver(org: () => Org | null): NameResolver {
    return {
        resolve(kind: ResolveKind, id: string): string | null {
            const o = org();
            if (!o) return null;
            switch (kind) {
                case 'space': return o.spaces?.find(s => s.id === id)?.name ?? null;
                case 'category': return allCategories(o).find(c => c.id === id)?.name ?? null;
                case 'user': return o.members?.find(m => m.userId === id)?.user?.name ?? null;
                case 'thread': {
                    const threads = [...(o.home?.threads ?? []), ...(o.spaces ?? []).flatMap(s => s.threads ?? [])];
                    return threads.find(t => t.id === id)?.name ?? null;
                }
                default: return null;
            }
        },
    };
}

/**
 * Règle 7 : l'identifiant est connu de l'annuaire local. Les dossiers ne sont pas dans l'arbre de l'org
 * (chargés par espace) : un `folderId` est accepté ici et refusé par l'API si l'espace ne le contient pas.
 */
export function orgKnownLocalId(org: () => Org | null): (field: LocalIdField, id: string) => boolean {
    return (field, id) => {
        const o = org();
        if (!o) return false;
        if (field === 'spaceId') return !!o.spaces?.some(s => s.id === id);
        if (field === 'categoryId') return allCategories(o).some(c => c.id === id);
        return true;
    };
}

export interface LoadedPlanEnv {
    context: PlanContext;
    flags: ManifestFlags[];
    /** Politique d'org « Toujours accepter » de l'utilisateur ; `unknown` (lecture échouée) vaut refus. */
    autoAcceptPolicy: AutoAcceptPolicy;
}

/** Lit `GET …/feature-policies/me` ; toute erreur donne `unknown` (échec fermé). */
export async function readAutoAcceptPolicy(api: AiRuntimeDeps['api'], orgId: string): Promise<AutoAcceptPolicy> {
    try {
        const f = (await fetchMyFeatures(api, orgId)).find(x => x.feature === 'tool_auto_accept');
        if (!f) return 'unknown';
        return f.allowed ? 'allowed' : 'denied';
    } catch { return 'unknown'; }
}

interface ToolSpecLike { name: string; sensitive?: boolean }

export async function loadPlanEnv(
    deps: AiRuntimeDeps,
    orgId: string,
    sessionId: string,
    loadTools: (orgId: string) => Promise<unknown[]>,
): Promise<LoadedPlanEnv> {
    const [tools, verified, registry, autoAcceptPolicy] = await Promise.all([
        loadTools(orgId),
        currentVerifiedMode(deps, orgId),
        deps.api.request('GET', `/api/orgs/${encodeURIComponent(orgId)}/ai/runtime`),
        readAutoAcceptPolicy(deps.api, orgId),
    ]);
    const policy = registry.body && typeof registry.body === 'object' ? (registry.body as { policy?: { toolPolicy?: Record<string, unknown> } }).policy : undefined;
    // Sans règle explicite, `create_thread` se confirme (`ask`) : c'est le cas qui passe par le plan.
    const createThreadAsk = policy?.toolPolicy?.create_thread !== 'auto';
    const list = tools.filter((t): t is ToolSpecLike => !!t && typeof t === 'object' && typeof (t as ToolSpecLike).name === 'string');
    return {
        context: {
            sessionId,
            maxLifetimeSecs: MAX_PLAN_LIFETIME_SECS,
            manifest: ToolManifest.fromJson(tools as JsonValue),
            mode: verified.mode,
            createThreadAsk,
        },
        flags: list.map(t => ({ name: t.name, sensitive: t.sensitive === true })),
        autoAcceptPolicy,
    };
}
