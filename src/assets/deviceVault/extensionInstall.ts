/**
 * Installation de Synco Extension depuis l'app, en un minimum de gestes (doc/securite/13-…md §16) :
 *   1. carte de suggestion (appareil protégé par le PIN local, navigateur de bureau compatible) ;
 *   2. « Installer » ouvre la boutique du navigateur et pose un marqueur de reprise ;
 *   3. l'extension, à l'installation, recharge l'onglet Synco (Chrome n'injecte pas son content script
 *      dans les onglets déjà ouverts, et elle refuse la permission `scripting`) ;
 *   4. au déverrouillage suivant, le PIN saisi sert aussi à basculer le verrou vers l'extension :
 *      l'utilisateur ne le tape qu'une fois.
 * Aucune installation « en un clic » n'est possible depuis une page (interdit par les navigateurs).
 */

export type ExtensionBrowser = 'chrome' | 'edge' | 'firefox';

export interface ExtensionStoreUrls {
    chrome?: string;
    edge?: string;
    firefox?: string;
}

/** Liens des boutiques, vides tant que l'extension n'est pas publiée : la suggestion reste alors masquée. */
export const STORE_URLS: ExtensionStoreUrls = {
    chrome: import.meta.env.VITE_EXTENSION_STORE_CHROME || undefined,
    edge: import.meta.env.VITE_EXTENSION_STORE_EDGE || undefined,
    firefox: import.meta.env.VITE_EXTENSION_STORE_FIREFOX || undefined,
};

/**
 * Navigateur de bureau qui accepte Synco Extension, d'après le User-Agent. Mobile exclu : la fenêtre
 * du PIN de l'extension (windows.create) n'existe pas sur Firefox Android, et Chrome mobile n'a pas
 * d'extensions. Opera, Brave, Vivaldi… passent pour Chrome (même boutique, même moteur).
 */
export function extensionBrowser(userAgent: string): ExtensionBrowser | undefined {
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return undefined;
    if (/Firefox\//.test(userAgent)) return 'firefox';
    if (/Edg\//.test(userAgent)) return 'edge';
    // Safari n'annonce jamais « Chrome/ » : il reste écarté (pas d'extension Safari).
    if (/Chrome\//.test(userAgent)) return 'chrome';
    return undefined;
}

/** Lien de la boutique pour ce navigateur, s'il est publié. Seuls les liens https sont acceptés. */
export function extensionStoreUrl(userAgent: string, urls: ExtensionStoreUrls = STORE_URLS): string | undefined {
    const browser = extensionBrowser(userAgent);
    const url = browser ? urls[browser] : undefined;
    return url && /^https:\/\//.test(url) ? url : undefined;
}

export interface SimpleStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

const PENDING_KEY = 'synco:ext-install-pending';
/** Au-delà, l'installation est considérée comme abandonnée : on ne bascule plus de verrou d'office. */
export const PENDING_TTL_MS = 30 * 60_000;

const safe = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

/** L'utilisateur vient d'ouvrir la boutique : la page sera rechargée par l'extension une fois installée. */
export function markInstallPending(store: SimpleStorage, userId: string, now = Date.now()): void {
    safe(() => store.setItem(PENDING_KEY, JSON.stringify({ userId, at: now })), undefined);
}

/** Une installation est-elle en cours pour cet utilisateur (sans consommer le marqueur) ? */
export function isInstallPending(store: SimpleStorage, userId: string, now = Date.now()): boolean {
    const raw = safe(() => store.getItem(PENDING_KEY), null);
    if (!raw) return false;
    try {
        const v = JSON.parse(raw) as { userId?: unknown; at?: unknown };
        return v.userId === userId && typeof v.at === 'number' && now - v.at >= 0 && now - v.at < PENDING_TTL_MS;
    } catch {
        return false;
    }
}

export function clearInstallPending(store: SimpleStorage): void {
    safe(() => store.removeItem(PENDING_KEY), undefined);
}

const SNOOZE_KEY = 'synco:ext-suggest-snoozed';
/** « Plus tard » : la carte ne revient pas avant ce délai. */
export const SNOOZE_MS = 30 * 24 * 3600_000;

export function snoozeSuggestion(store: SimpleStorage, now = Date.now()): void {
    safe(() => store.setItem(SNOOZE_KEY, String(now)), undefined);
}

export function isSuggestionSnoozed(store: SimpleStorage, now = Date.now()): boolean {
    const at = Number(safe(() => store.getItem(SNOOZE_KEY), null));
    return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < SNOOZE_MS;
}
