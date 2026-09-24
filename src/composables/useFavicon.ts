import { watch } from 'vue';
import { unreadCount } from './useNotification';

/**
 * Favicon réactive : l'icône de l'onglet reflète en permanence le nombre de
 * notifications non lues, pour qu'un message reçu reste visible même quand
 * l'onglet Synco est en arrière-plan (le badge du centre de notifications,
 * lui, n'est visible que si l'onglet est au premier plan).
 *
 * 0 → logo nu, 1..9 → pastille chiffrée, 10 et plus → pastille « 9+ ».
 */

// Jeu d'icônes complet dans public/ico — y compris l'état « aucune
// notification », qui est le même fichier que le /favicon.ico référencé par
// index.html, dupliqué ici pour que tout le jeu vive au même endroit.
const ICON_DIR = '/ico';
const IDLE_ICON = `${ICON_DIR}/favicon.ico`;

// Au-delà de 9 on ne distingue plus le compte exact : une seule icône « 9+ ».
// Le « + » est un caractère valide dans un chemin d'URL (il n'est interprété
// comme une espace que dans une query string), donc pas d'encodage ici.
const MAX_BADGE = 9;
const OVERFLOW_ICON = `${ICON_DIR}/Synco_notif_9+.ico`;

const iconFor = (count: number): string => {

    if (!Number.isFinite(count) || count <= 0) return IDLE_ICON;
    if (count > MAX_BADGE) return OVERFLOW_ICON;

    return `${ICON_DIR}/Synco_notif_${Math.trunc(count)}.ico`;

};

const allIcons = (): string[] => {

    const icons: string[] = [IDLE_ICON, OVERFLOW_ICON];

    for (let i = 1; i <= MAX_BADGE; i++) {
        icons.push(`${ICON_DIR}/Synco_notif_${i}.ico`);
    }

    return icons;

};

// Dernier href appliqué, pour ne toucher au DOM que lorsque l'icône change
// réellement (unreadCount bouge à chaque lecture/réception, mais tant qu'on
// reste au-dessus de 9 c'est la même image).
let currentHref: string | null = null;

const applyIcon = (href: string): void => {

    if (href === currentHref) return;

    const previous = Array.from(
        document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']")
    );

    // On remplace le <link> plutôt que de réécrire son href : certains
    // navigateurs ignorent une simple mutation d'attribut et gardent
    // l'ancienne icône en cache. Le nouveau nœud est inséré avant le retrait
    // des anciens pour ne jamais laisser l'onglet sans icône entre les deux.
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/x-icon';
    link.href = href;

    document.head.appendChild(link);
    previous.forEach(node => node.remove());

    currentHref = href;

};

// Précharge tout le jeu d'icônes pour qu'un changement de compteur n'ait pas
// à attendre un aller-retour réseau (l'onglet afficherait sinon brièvement
// une icône vide). Fait pendant un temps mort : ces ~150 Ko ne doivent pas
// concurrencer le démarrage de l'app.
let preloaded = false;

const preloadIcons = (): void => {

    if (preloaded) return;
    preloaded = true;

    const warm = () => {
        for (const href of allIcons()) {
            const img = new Image();
            img.src = href;
        }
    };

    // requestIdleCallback n'existe pas partout (Safari ancien, WebView
    // Capacitor) — repli sur un timer, même intention.
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warm, { timeout: 5000 });
    } else {
        window.setTimeout(warm, 2000);
    }

};

// initFavicon() est appelé depuis App.vue, monté une seule fois, mais le
// garde-fou évite d'empiler deux watchers si un jour un autre appelant s'y
// ajoute (le watcher vit pour toute la durée de l'app, il n'est jamais arrêté).
let started = false;

const initFavicon = (): void => {

    if (started) return;
    started = true;

    preloadIcons();

    watch(unreadCount, (count) => {
        applyIcon(iconFor(count));
    }, { immediate: true });

};

export default function () {
    return {
        initFavicon
    };
}

export { iconFor };
