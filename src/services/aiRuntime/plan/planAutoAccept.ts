/**
 * « Toujours accepter » appliqué à un plan (PC42, PC76) : le plan n'est accepté sans clic que si
 * - il tient dans la carte (5 actions au plus, aucune sensible : PC76 reste la règle de la carte) ;
 * - CHAQUE action est dans la liste blanche de l'utilisateur (`ai_auto_accept_<orgId>`) ET admise par
 *   `isAutoAcceptable` (liste blanche d'`aiAutoAccept.ts`, drapeau « sensible » du manifeste en tête).
 * Une action sensible, inconnue ou hors liste bloque l'acceptation automatique : la carte demande alors
 * un clic, comme sans le réglage. Un plan plus grand passe toujours par le graphe.
 */
import { isAutoAcceptable, type ManifestFlags } from '@/services/aiAutoAccept';
import { isSmallPlan, type PlanActionModel, type PlanModel } from './planModel';

export const actionKey = (a: Pick<PlanActionModel, 'kind' | 'tool'>): string => (a.kind === 'server.call' ? `server.call:${a.tool ?? ''}` : a.kind);

/** Résultat de la lecture de la politique d'org `tool_auto_accept` (`GET …/feature-policies/me`). */
export type AutoAcceptPolicy = 'allowed' | 'denied' | 'unknown';

/** Lecture échouée ou droit retiré : aucune acceptation sans clic (échec fermé, 12 §11). */
export const policyAllows = (p: AutoAcceptPolicy): boolean => p === 'allowed';

/** Droit retiré par l'org : la liste locale est vidée (12 §11) ; lecture échouée : liste conservée mais sans effet. */
export const autoAcceptAfterPolicy = (p: AutoAcceptPolicy, saved: readonly string[]): string[] => (p === 'denied' ? [] : [...saved]);

export function canAutoAccept(model: PlanModel, saved: readonly string[], flags: readonly ManifestFlags[] = [], policyAllowed = false): boolean {
    if (!policyAllowed || model.actions.length === 0 || !isSmallPlan(model)) return false;
    return model.actions.every(a => {
        if (a.sensitive) return false;
        const key = actionKey(a);
        return saved.includes(key) && isAutoAcceptable(key, flags);
    });
}
