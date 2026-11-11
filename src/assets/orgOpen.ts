import { ref } from 'vue';
import type { Router } from 'vue-router';
import sfetch from './utils/sfetch';
import { openedOrg } from './var';

/**
 * Ouverture d'une organisation depuis la liste (OrgSelection).
 *
 * Les données de l'organisation sont chargées AVANT de quitter la liste : la carte cliquée affiche son état
 * « ouverture » pendant ce temps, puis la liste s'efface en zoomant vers la carte (style.css, « Ouverture d'une
 * organisation ») pendant que l'organisation, déjà prête, apparaît par son apparition échelonnée. Sans ce
 * préchargement, OrgLayout se montait vide et affichait son squelette gris avant le vrai contenu.
 */

/** Organisation en cours d'ouverture (carte en attente), null sinon. */
export const openingOrgId = ref<string | null>(null);

/** Point vers lequel la liste zoome en partant (centre de la carte cliquée, relatif à la page). */
export const orgOrigin = ref<string>('50% 40%');

/**
 * Sens de la dernière navigation entre la liste et une organisation, posé par le routeur : sert de garde aux
 * transitions de style.css, pour qu'elles ne jouent qu'entre ces deux écrans (pas à la fermeture du SAV, etc.).
 */
export const orgNav = ref<'open' | 'close' | null>(null);

export function setOrgOriginFrom(el: Element, page: Element) {
    const r = el.getBoundingClientRect();
    const p = page.getBoundingClientRect();
    orgOrigin.value = `${r.left - p.left + r.width / 2}px ${r.top - p.top + r.height / 2}px`;
}

const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export async function openOrg(router: Router, orgId: string) {
    if (openingOrgId.value) return;
    openingOrgId.value = orgId;
    // Laisse le navigateur peindre l'état « ouverture » de la carte AVANT tout travail : sans cela, quand
    // l'organisation est déjà en mémoire, la navigation part dans la même tâche que le clic et le montage
    // d'OrgLayout (lourd) bloque l'affichage — la carte semble figée un instant.
    // La requête part tout de suite, en parallèle de cette peinture.
    const load = openedOrg.value?.id === orgId ? null : sfetch(`/api/orgs/${orgId}`);
    load?.catch(() => { /* traité plus bas ; évite un rejet « non géré » pendant l'attente de la peinture */ });
    await nextPaint();
    try {
        if (load) {
            // Échec (organisation bannie, réseau…) : on navigue quand même, OrgLayout refait la requête et
            // affiche le motif de bannissement ou renvoie à la liste, comme avant.
            const res = await load;
            if (res.ok) openedOrg.value = await res.json();
        }
    } catch { /* idem */ }

    try {
        // On ouvre sur le contenu de l'accueil, pas sur les barres ; la flèche de retour les révèle ensuite
        // (showView=0). Écrit explicitement, comme au démarrage à froid dans init.ts.
        await router.push(`/${orgId}?showView=1`);
    } finally {
        openingOrgId.value = null;
    }
}
