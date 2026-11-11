import { ref } from 'vue';
import type { Router } from 'vue-router';

/**
 * Sens de la dernière navigation, pour les transitions mobiles (OrgLayout.vue, style.css « Pages mobiles ») :
 * en avant, la nouvelle page arrive de la droite par-dessus l'ancienne ; en arrière, la page courante repart vers
 * la droite et découvre la précédente.
 *
 * Lu depuis la position d'historique que Vue Router pose dans history.state : elle baisse quand on dépile
 * (router.back(), geste ou bouton retour d'Android). Un `push` qui revient en arrière sans dépiler (la flèche de
 * MobileBackBtn quand l'entrée précédente n'est pas dans l'organisation) l'annonce avec markBackNavigation().
 *
 * afterEach s'exécute avant que Vue ne redessine la nouvelle route : le nom de transition est donc déjà le bon
 * quand les composants changent.
 */
export const navDirection = ref<'forward' | 'back'>('forward');

let nextIsBack = false;

/** La prochaine navigation est un retour, même si elle empile une entrée d'historique. */
export function markBackNavigation(): void {
    nextIsBack = true;
}

export function trackNavDirection(router: Router): void {
    let lastPosition: number = window.history.state?.position ?? 0;

    router.afterEach((_to, _from, failure) => {
        const forcedBack = nextIsBack;
        nextIsBack = false;
        if (failure) return;

        const position = window.history.state?.position;
        const poppedBack = typeof position === 'number' && position < lastPosition;
        if (typeof position === 'number') lastPosition = position;

        navDirection.value = forcedBack || poppedBack ? 'back' : 'forward';
    });
}
