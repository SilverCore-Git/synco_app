import { computed, ref, watch } from 'vue';
import type { RouteLocationNormalized, Router } from 'vue-router';
import { START_LOCATION } from 'vue-router';
import isDesktopApp from './isDesktopApp';
import { openedOrg, organizations } from './var';
import type { Org, Thread } from '@/types/types';

/**
 * Onglets de l'app de bureau (barre de titre, topBar.vue).
 *
 * Une seule page est rendue à la fois : un onglet n'est qu'un historique de routes. Changer d'onglet, c'est
 * naviguer vers la route courante de cet onglet, sans l'empiler. Chaque onglet a son propre historique, que
 * les flèches ←/→ de la barre (et Alt+←/→, les boutons latéraux de la souris) parcourent.
 *
 * Toute navigation ordinaire (clic, router.push d'un composant) s'inscrit dans l'onglet actif ; un lien ouvert
 * au clic molette, au Ctrl+clic ou par « Ouvrir dans un nouvel onglet » crée un onglet en arrière-plan.
 * Fermer le dernier onglet ramène sur l'accueil (« / »), dans un onglet neuf.
 *
 * Inerte hors de l'app de bureau : dans le navigateur, les onglets sont ceux du navigateur.
 */

export interface AppTab {
    id: string;
    /** Historique de l'onglet (fullPath), le plus ancien en premier. */
    history: string[];
    /** Position courante dans `history`. */
    index: number;
    title: string;
    icon: string;
    /** Organisation de la route courante : son logo s'affiche dans l'onglet. */
    orgId: string | null;
}

const STORAGE_KEY = 'synco:tabs:v1';
const HOME_PATH = '/';
const MAX_HISTORY = 50;

export const tabsEnabled = isDesktopApp();
/** Vrai une fois l'app affichée (connecté, déverrouillé) : avant, ni barre d'onglets ni raccourcis. Posé par topBar.vue. */
export const tabsReady = ref(false);

export const tabs = ref<AppTab[]>([]);
export const activeTabId = ref<string>('');
export const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) ?? null);
export const canGoBack = computed(() => (activeTab.value?.index ?? 0) > 0);
export const canGoForward = computed(() => !!activeTab.value && activeTab.value.index < activeTab.value.history.length - 1);

let router: Router | null = null;
/** Vrai pendant une navigation lancée par les onglets eux-mêmes (changement d'onglet, ←/→) : rien à empiler. */
let internalNav = false;
/** Des onglets ont été restaurés au lancement : la route « / » du démarrage n'est pas un choix de l'utilisateur. */
let restoredAtLaunch = false;

const newId = () => crypto.randomUUID();
const currentPath = (tab: AppTab) => tab.history[tab.index] ?? HOME_PATH;

/** Clé de comparaison d'une route : `showView` ne fait que basculer barres/contenu sur petit écran. */
function routeKey(fullPath: string): string {
    const url = new URL(fullPath, 'http://synco.local');
    url.searchParams.delete('showView');
    return url.pathname + url.search + url.hash;
}

// ---------------------------------------------------------------------------
// Titre et icône d'une route
// ---------------------------------------------------------------------------

const memberName = (org: Org | null, userId: string): string | null => {
    const m = org?.members?.find((x) => x.id === userId || x.userId === userId);
    const u = m?.user;
    if (!u) return null;
    return u.pseudo || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || null;
};

const findThread = (org: Org | null, threadId: string): Thread | null => {
    if (!org) return null;
    const pools: Thread[][] = [
        org.home?.threads ?? [],
        ...(org.home?.categories ?? []).map((c) => c.threads ?? []),
        ...(org.spaces ?? []).flatMap((s) => [s.threads ?? [], ...(s.categories ?? []).map((c) => c.threads ?? [])]),
    ];
    for (const pool of pools) {
        const t = pool.find((x) => x.id === threadId);
        if (t) return t;
    }
    return null;
};

const SETTINGS_TITLES: Record<string, string> = {
    OrgSettingsGeneral: 'Paramètres · Général',
    OrgSettingsMembers: 'Paramètres · Membres',
    OrgSettingsWebhooks: 'Paramètres · Webhooks',
    OrgSettingsRoles: 'Paramètres · Rôles',
    OrgSettingsAI: 'Paramètres · IA',
    OrgSettingsStorage: 'Paramètres · Stockage',
    OrgSettingsStats: 'Paramètres · Statistiques',
};

function describe(fullPath: string): { title: string; icon: string; orgId: string | null } {
    if (!router) return { title: 'Accueil', icon: 'bi-house-door', orgId: null };
    const r = router.resolve(fullPath);
    const name = String(r.name ?? '');
    const p = r.params as Record<string, string>;
    const inOrg = r.matched.some((m) => m.name === 'OrgLayout');
    const orgId = inOrg ? String(p.orgId) : null;
    // Détails (salons, espaces, membres) connus seulement pour l'organisation chargée.
    const org = orgId && openedOrg.value?.id === orgId ? openedOrg.value : null;
    const space = p.spaceId ? org?.spaces?.find((s) => s.id === p.spaceId) : null;
    const spaceName = space?.name ?? 'Espace';
    const threadTitle = () => {
        const t = p.threadId ? findThread(org, p.threadId) : null;
        return t ? `# ${t.name.toLowerCase()}` : 'Salon';
    };

    const out = (title: string, icon: string) => ({ title, icon, orgId });

    if (name.startsWith('OrgSettings')) return out(SETTINGS_TITLES[name] ?? 'Paramètres', 'bi-gear');
    switch (name) {
        case 'OrgSelection': return out('Accueil', 'bi-house-door');
        case 'OrgHome': return out('Général', 'bi-house');
        case 'OrgThreadHome': return out(threadTitle(), 'bi-hash');
        case 'OrgChat': return out('Messages privés', 'bi-chat-dots');
        case 'OrgThreadChat':
        case 'OrgThreadChatPrivateMeet':
            return out(memberName(org, p.userId ?? '') ?? 'Conversation', 'bi-chat-dots');
        case 'SpaceView': return out(spaceName, 'bi-grid');
        case 'SpaceThreadView': return out(threadTitle(), 'bi-hash');
        case 'SpaceFiles': return out(`Fichiers · ${spaceName}`, 'bi-file-earmark');
        case 'TasksSpace':
        case 'TasksSpaceArchived': return out(`Tâches · ${spaceName}`, 'bi-check2-square');
        case 'OrgAI': return out('Synco AI', 'bi-robot');
        case 'TasksGlobal':
        case 'TasksGlobalArchived': return out('Mes tâches', 'bi-list-check');
        case 'AgendaGlobal': return out('Agenda', 'bi-calendar3');
        case 'AdminPanel':
        case 'AdminUsers':
        case 'AdminOrgs': return out('Administration', 'bi-shield-lock');
        case 'SupportTicketList':
        case 'SupportTicketView': return out('Support', 'bi-life-preserver');
        case 'SupportPanel':
        case 'SupportPanelTicketView': return out('Panel support', 'bi-headset');
        case 'InviteView':
        case 'GuestVoiceView': return out('Invitation', 'bi-envelope-open');
    }
    return out(org?.name ?? 'Synco', 'bi-window');
}

function refreshMeta(tab: AppTab) {
    Object.assign(tab, describe(currentPath(tab)));
}

/** Organisation affichée dans un onglet (logo, nom), depuis la liste des organisations de l'utilisateur. */
export function tabOrg(tab: AppTab): Pick<Org, 'id' | 'name' | 'logo'> | null {
    if (!tab.orgId) return null;
    if (openedOrg.value?.id === tab.orgId) return openedOrg.value;
    return organizations.value.find((o: Org) => o.id === tab.orgId) ?? null;
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

function load(): void {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as { tabs?: AppTab[]; activeTabId?: string };
        const valid = (saved.tabs ?? []).filter((t) =>
            t && typeof t.id === 'string' && Array.isArray(t.history) && t.history.length > 0
            && t.history.every((h) => typeof h === 'string' && h.startsWith('/'))
            && Number.isInteger(t.index) && t.index >= 0 && t.index < t.history.length,
        );
        if (!valid.length) return;
        tabs.value = valid.map((t) => ({
            id: t.id,
            history: t.history,
            index: t.index,
            title: typeof t.title === 'string' ? t.title : 'Synco',
            icon: typeof t.icon === 'string' ? t.icon : 'bi-window',
            orgId: typeof t.orgId === 'string' ? t.orgId : null,
        }));
        activeTabId.value = valid.some((t) => t.id === saved.activeTabId) ? saved.activeTabId! : valid[0]!.id;
        restoredAtLaunch = true;
    } catch { /* stockage indisponible ou corrompu : on repart d'un onglet neuf */ }
}

function persist(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: tabs.value, activeTabId: activeTabId.value }));
    } catch { /* stockage indisponible : les onglets ne survivront pas au redémarrage */ }
}

/**
 * Route de l'onglet actif restauré au lancement, ou null s'il n'y a rien à restaurer (premier lancement,
 * navigateur…). init.ts s'en sert à la place de « dernière organisation ouverte ».
 */
export function restoredLaunchPath(): string | null {
    if (!tabsEnabled || !restoredAtLaunch || !activeTab.value) return null;
    return currentPath(activeTab.value);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

async function navigate(fullPath: string): Promise<void> {
    if (!router) return;
    internalNav = true;
    try {
        await router.replace(fullPath);
    } finally {
        internalNav = false;
    }
}

/** Chemin complet de `to`, redirection de route suivie (/:orgId → /:orgId/home) pour titrer l'onglet. */
function resolveTarget(to: string): string {
    const r = router!.resolve(to);
    const redirect = r.matched[r.matched.length - 1]?.redirect;
    if (!redirect) return r.fullPath;
    try {
        const next = typeof redirect === 'function' ? (redirect as (to: unknown) => any)(r) : redirect;
        return router!.resolve(next).fullPath;
    } catch {
        return r.fullPath;
    }
}

function makeTab(fullPath: string): AppTab {
    const tab: AppTab = { id: newId(), history: [fullPath], index: 0, title: '', icon: '', orgId: null };
    refreshMeta(tab);
    return tab;
}

/** Ouvre `to` (chemin interne) dans un nouvel onglet ; en arrière-plan par défaut, comme un navigateur. */
export function openInNewTab(to: string, opts: { activate?: boolean; append?: boolean } = {}): void {
    if (!tabsEnabled || !router) return;
    const tab = makeTab(resolveTarget(to));
    if (opts.append) {
        tabs.value.push(tab);
    } else {
        const at = tabs.value.findIndex((t) => t.id === activeTabId.value);
        tabs.value.splice(at + 1 + countOpenedFrom(at), 0, tab);
        lastOpener = { tabId: activeTabId.value, count: (lastOpener?.tabId === activeTabId.value ? lastOpener.count : 0) + 1 };
    }
    if (opts.activate) void switchTab(tab.id);
}

// Comme un navigateur : les liens ouverts successivement depuis un même onglet se rangent à sa droite, dans
// l'ordre d'ouverture (et non chacun collé à l'onglet, ce qui inverserait leur ordre).
let lastOpener: { tabId: string; count: number } | null = null;
function countOpenedFrom(at: number): number {
    if (!lastOpener || lastOpener.tabId !== tabs.value[at]?.id) return 0;
    return Math.min(lastOpener.count, tabs.value.length - at - 1);
}

export function newTab(): void {
    openInNewTab(HOME_PATH, { activate: true, append: true });
}

export async function switchTab(id: string): Promise<void> {
    const tab = tabs.value.find((t) => t.id === id);
    if (!tab) return;
    if (id === activeTabId.value && router?.currentRoute.value.fullPath === currentPath(tab)) return;
    if (id !== activeTabId.value) lastOpener = null;
    activeTabId.value = id;
    await navigate(currentPath(tab));
}

export function closeTab(id: string): void {
    const at = tabs.value.findIndex((t) => t.id === id);
    if (at === -1) return;
    const wasActive = id === activeTabId.value;
    tabs.value.splice(at, 1);
    if (lastOpener?.tabId === id) lastOpener = null;

    if (!tabs.value.length) {
        // Plus aucun onglet : on revient sur l'accueil, dans un onglet neuf.
        const home = makeTab(HOME_PATH);
        tabs.value.push(home);
        void switchTab(home.id);
        return;
    }
    if (wasActive) void switchTab(tabs.value[Math.min(at, tabs.value.length - 1)]!.id);
}

export function closeOtherTabs(id: string): void {
    tabs.value = tabs.value.filter((t) => t.id === id);
    lastOpener = null;
    if (activeTabId.value !== id) void switchTab(id);
}

export function duplicateTab(id: string): void {
    const tab = tabs.value.find((t) => t.id === id);
    if (!tab) return;
    const copy: AppTab = { ...tab, id: newId(), history: [...tab.history] };
    tabs.value.splice(tabs.value.indexOf(tab) + 1, 0, copy);
}

export function cycleTab(step: 1 | -1): void {
    const n = tabs.value.length;
    if (n < 2) return;
    const at = tabs.value.findIndex((t) => t.id === activeTabId.value);
    void switchTab(tabs.value[(at + step + n) % n]!.id);
}

export function goBack(): void {
    const tab = activeTab.value;
    if (!tab || tab.index === 0) return;
    tab.index--;
    void navigate(currentPath(tab));
}

export function goForward(): void {
    const tab = activeTab.value;
    if (!tab || tab.index >= tab.history.length - 1) return;
    tab.index++;
    void navigate(currentPath(tab));
}

/** Inscrit une navigation terminée dans l'onglet actif. */
function record(to: RouteLocationNormalized, from: RouteLocationNormalized): void {
    const fullPath = to.fullPath;

    // Démarrage : la route « / » d'un lancement à froid n'est pas un choix de l'utilisateur quand des onglets
    // ont été restaurés (init.ts rouvre ensuite l'onglet actif). Un lien profond (deep link, rechargement sur
    // une autre route) s'ouvre en revanche dans un onglet à lui, s'il n'est pas déjà celui de l'onglet actif.
    if (from === START_LOCATION && restoredAtLaunch && activeTab.value) {
        if (fullPath === HOME_PATH || routeKey(fullPath) === routeKey(currentPath(activeTab.value))) return;
        const tab = makeTab(fullPath);
        tabs.value.push(tab);
        activeTabId.value = tab.id;
        return;
    }

    let tab = activeTab.value;
    if (!tab) {
        tab = makeTab(fullPath);
        tabs.value.push(tab);
        activeTabId.value = tab.id;
        return;
    }

    if (internalNav) {
        // Redirection éventuelle (garde, /:orgId → /:orgId/home) : l'entrée prend la route réellement atteinte.
        tab.history[tab.index] = fullPath;
    } else {
        const key = routeKey(fullPath);
        const sameAs = (i: number) => i >= 0 && i < tab!.history.length && routeKey(tab!.history[i]!) === key;
        if (sameAs(tab.index)) {
            tab.history[tab.index] = fullPath;
        } else if (sameAs(tab.index - 1)) {
            // router.back() d'un composant (MobileBackBtn…) : on recule dans l'onglet au lieu d'empiler.
            tab.index--;
            tab.history[tab.index] = fullPath;
        } else if (sameAs(tab.index + 1)) {
            tab.index++;
            tab.history[tab.index] = fullPath;
        } else if (window.history.state?.replaced) {
            tab.history[tab.index] = fullPath;
        } else {
            tab.history = [...tab.history.slice(0, tab.index + 1), fullPath].slice(-MAX_HISTORY);
            tab.index = tab.history.length - 1;
        }
    }
    refreshMeta(tab);
}

// ---------------------------------------------------------------------------
// Liens : clic molette, Ctrl+clic, clic droit
// ---------------------------------------------------------------------------

/**
 * Chemin interne ciblé par un élément : `data-tab-href` (boutons qui naviguent en JS) ou lien `<a href>`
 * interne (RouterLink). Les liens externes, de téléchargement ou « # » ne comptent pas.
 */
export function tabTargetOf(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>('[data-tab-href], a[href]');
    if (!el) return null;
    if (el.dataset.tabHref) return el.dataset.tabHref;
    const a = el as HTMLAnchorElement;
    if (a.hasAttribute('download') || (a.target && a.target !== '_self')) return null;
    const raw = a.getAttribute('href') ?? '';
    if (!raw || raw.startsWith('#')) return null;
    try {
        const url = new URL(a.href, window.location.href);
        if (url.origin !== window.location.origin) return null;
        return url.pathname + url.search + url.hash;
    } catch {
        return null;
    }
}

export interface ContextMenuItem {
    label: string;
    icon?: string;
    danger?: boolean;
    separator?: boolean;
    action: () => void;
}

/** Menu contextuel global (AppContextMenu.vue). */
export const contextMenu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

export function openContextMenu(e: MouseEvent, items: ContextMenuItem[]): void {
    e.preventDefault();
    e.stopPropagation();
    contextMenu.value = { x: e.clientX, y: e.clientY, items };
}

const isEditable = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function installGlobalHandlers(): void {
    // Chaque gestionnaire commence par `if (!tabsReady.value) return;` : rien avant que l'app soit affichée.
    // Clic molette : empêche le défilement automatique (et le collage de la sélection primaire sous Linux)
    // dès l'appui, puis ouvre l'onglet au relâchement.
    document.addEventListener('mousedown', (e) => {
        if (!tabsReady.value) return;
        if (e.button === 1 && tabTargetOf(e.target)) e.preventDefault();
    }, true);
    document.addEventListener('auxclick', (e) => {
        if (!tabsReady.value) return;
        if (e.button !== 1) return;
        const to = tabTargetOf(e.target);
        if (!to) return;
        e.preventDefault();
        e.stopPropagation();
        openInNewTab(to);
    }, true);

    // Ctrl/Cmd+clic : nouvel onglet en arrière-plan. En capture, avant le @click du composant, qui
    // naviguerait sinon dans l'onglet courant.
    document.addEventListener('click', (e) => {
        if (!tabsReady.value) return;
        if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
        const to = tabTargetOf(e.target);
        if (!to) return;
        e.preventDefault();
        e.stopPropagation();
        openInNewTab(to);
    }, true);

    // Clic droit sur un lien : menu « Ouvrir dans un nouvel onglet ». En phase de bouillonnement, et seulement
    // si le composant n'a pas déjà son propre menu (DropDown click="right" appelle preventDefault) — ces menus
    // proposent eux-mêmes l'entrée (OpenInTabMenuItem.vue).
    window.addEventListener('contextmenu', (e) => {
        if (!tabsReady.value) return;
        if (e.defaultPrevented) return;
        const to = tabTargetOf(e.target);
        if (!to) return;
        openContextMenu(e, [
            { label: 'Ouvrir dans un nouvel onglet', icon: 'bi-window-plus', action: () => openInNewTab(to) },
            { label: 'Ouvrir et afficher l\'onglet', icon: 'bi-box-arrow-up-right', action: () => openInNewTab(to, { activate: true }) },
        ]);
    });

    // Boutons latéraux de la souris : précédent / suivant.
    window.addEventListener('mouseup', (e) => {
        if (!tabsReady.value) return;
        if (e.button === 3) { e.preventDefault(); goBack(); }
        else if (e.button === 4) { e.preventDefault(); goForward(); }
    });

    window.addEventListener('keydown', (e) => {
        if (!tabsReady.value) return;
        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        if (mod && !e.shiftKey && !e.altKey && key === 't') { e.preventDefault(); newTab(); }
        else if (mod && !e.shiftKey && !e.altKey && key === 'w') { e.preventDefault(); if (activeTabId.value) closeTab(activeTabId.value); }
        else if (mod && e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); }
        else if (mod && e.key === 'PageDown') { e.preventDefault(); cycleTab(1); }
        else if (mod && e.key === 'PageUp') { e.preventDefault(); cycleTab(-1); }
        else if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
            e.preventDefault();
            const n = Number(e.key);
            const tab = n === 9 ? tabs.value[tabs.value.length - 1] : tabs.value[n - 1];
            if (tab) void switchTab(tab.id);
        }
        else if (e.altKey && !mod && !e.shiftKey && !isEditable(e.target) && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
        else if (e.altKey && !mod && !e.shiftKey && !isEditable(e.target) && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
    });
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

export function installAppTabs(r: Router): void {
    if (!tabsEnabled) return;
    router = r;
    load();
    r.afterEach((to, from, failure) => {
        if (failure) return;
        record(to, from);
    });
    // Titre de l'onglet actif tenu à jour quand les données arrivent (salons, membres, renommages).
    // Le getter ne lit que ce dont le titre dépend (nom du salon, de l'espace, du membre…).
    watch(
        () => activeTab.value && describe(currentPath(activeTab.value)),
        (meta) => { if (meta && activeTab.value) Object.assign(activeTab.value, meta); },
    );
    watch([tabs, activeTabId], persist, { deep: true });
    installGlobalHandlers();
}
