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

export function canAutoAccept(model: PlanModel, saved: readonly string[], flags: readonly ManifestFlags[] = []): boolean {
    if (model.actions.length === 0 || !isSmallPlan(model)) return false;
    return model.actions.every(a => {
        if (a.sensitive) return false;
        const key = actionKey(a);
        return saved.includes(key) && isAutoAcceptable(key, flags);
    });
}
