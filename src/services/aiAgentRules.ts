/**
 * Règles de l'onglet « Agent » (réglages utilisateur), isolées de la vue pour être testées.
 */

export interface AutonomyToggleState {
    busy: boolean;
    featuresFailed: boolean;
    /** L'org autorise le mode autonome à cette personne. */
    allowed: boolean;
    autonomyOn: boolean;
    /** L'agent tourne sur le runtime (délégation active). */
    onRuntime: boolean;
}

/**
 * L'interrupteur du mode autonome est-il bloqué ? Désactiver reste TOUJOURS possible (même si l'org a
 * retiré la fonctionnalité ou si l'état n'a pas pu être lu) ; activer exige le runtime, une délégation
 * active (jamais créée en douce) et l'autorisation de l'org.
 */
export function autonomyToggleDisabled(s: AutonomyToggleState): boolean {
    if (s.busy) return true;
    if (s.autonomyOn) return false;
    return s.featuresFailed || !s.allowed || !s.onRuntime;
}

/**
 * Après l'acceptation d'une nouvelle clé du runtime : on ne redélègue que si une délégation était active.
 * Un membre « Sur cet appareil » n'a rien confié et ne doit pas se retrouver délégué.
 */
export function redelegateAfterKeyAcceptance(delegationWasActive: boolean): boolean {
    return delegationWasActive;
}
