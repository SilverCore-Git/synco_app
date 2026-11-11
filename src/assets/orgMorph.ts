/**
 * Ouverture et fermeture d'une organisation façon « carte qui s'agrandit » : la page de l'organisation est
 * découpée (clip-path) au rectangle de sa carte dans la liste, puis s'élargit jusqu'à la fenêtre ; à la
 * fermeture, elle se resserre jusqu'à sa carte et s'efface dessus. Aucune capture d'écran (contrairement aux
 * View Transitions, qui figeaient la page) : la vraie page s'anime, en CSS (style.css, `#app-pages[data-morph]`).
 *
 * - le rectangle de départ ou d'arrivée est passé en variable CSS `--org-card-clip` sur le conteneur des pages ;
 * - `data-morph` n'est posé sur ce conteneur que pendant un passage liste ↔ organisation : changer
 *   d'organisation, ou de salon, reste instantané.
 */

const CONTAINER_ID = 'app-pages';
const CARD_RADIUS_PX = 16;
/** Un peu plus que la durée de la transition CSS (0,46 s) : au-delà, on revient à des navigations instantanées. */
const MORPH_WINDOW_MS = 700;

let clearTimer: ReturnType<typeof setTimeout> | undefined;

const container = () => document.getElementById(CONTAINER_ID);

/** Rectangle de la carte de l'organisation, exprimé en clip-path relatif au conteneur des pages. */
function setCardClip(card: Element | null | undefined): boolean {
    const box = container();
    if (!box || !card) return false;
    const c = box.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const top = Math.max(0, r.top - c.top);
    const left = Math.max(0, r.left - c.left);
    const right = Math.max(0, c.right - r.right);
    const bottom = Math.max(0, c.bottom - r.bottom);
    box.style.setProperty('--org-card-clip', `inset(${top}px ${right}px ${bottom}px ${left}px round ${CARD_RADIUS_PX}px)`);
    return true;
}

/** Arme l'animation pour la navigation qui commence (appelé par le routeur). */
export function armOrgMorph(): void {
    const box = container();
    if (!box) return;
    box.setAttribute('data-morph', '');
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => box.removeAttribute('data-morph'), MORPH_WINDOW_MS);
}

/** Ouverture : la carte cliquée donne le rectangle de départ. */
export function rememberOpeningCard(card: Element | null | undefined): void {
    setCardClip(card);
}

/** Fermeture : la liste vient de s'afficher, la carte de l'organisation quittée donne le rectangle d'arrivée. */
export function targetClosingCard(orgId: string | null | undefined): void {
    if (!orgId) return;
    const card = document.querySelector(`[data-org-card="${CSS.escape(orgId)}"]`);
    if (!setCardClip(card)) container()?.style.removeProperty('--org-card-clip');
}
