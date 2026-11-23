import { computed, ref, watch } from 'vue';
import type { AgentContext } from '@/services/agentDock/context';
import { MAX_PANELS, agentPanelSlots, taskPanelSlots } from './dockCapacity';

/**
 * Conversations Synco AI ouvertes dans le dock en bas à droite (AgentDockColumn.vue, monté dans App.vue).
 *
 * Trois états par entrée (PC52) : `min` (barre réduite), `open` (panneau) et `full` (grande fenêtre,
 * PC78). Une seule entrée est dépliée à la fois : le panneau lit la conversation active de l'app.
 *
 * Règles de produit :
 * - PC75 : aucun bouton permanent. Quand rien n'est ouvert, rien n'est visible (`visible`).
 * - PC80 : le dock ne s'ouvre JAMAIS tout seul. Seules les fonctions d'ouverture ci-dessous
 *   (appelées sur un geste : Ctrl/Cmd+J, « Demander à Synco AI », clic sur une bulle, « détacher »)
 *   dépliant une entrée ; la synchro des conversations qui attendent ne fait que fournir des bulles.
 * - Plafond `MAX_PANELS` commun avec les tâches (dockCapacity.ts).
 * - Au rechargement, les entrées reviennent réduites (jamais ouvertes d'office).
 */

export type AgentDockState = 'min' | 'open' | 'full';

export interface AgentDockEntry {
    /** `sessionId` une fois la conversation créée, sinon `new-<n>` (brouillon). */
    key: string;
    sessionId: string | null;
    orgId: string;
    title: string;
    state: AgentDockState;
    context: AgentContext | null;
    /** Demande déjà écrite (suggestion cliquée) : envoyée telle quelle au premier envoi. */
    prompt: string;
}

const STORAGE_KEY = 'synco:agentDock:v1';
const entries = ref<AgentDockEntry[]>([]);
const dismissedNudges = ref<Set<string>>(new Set());
const fullPageDepth = ref(0);
let draftSeq = 0;
let pendingPrompt = '';
let triggerEl: HTMLElement | null = null;

interface Stored { orgId: string; items: { sessionId: string; title: string }[] }

function persist(): void {
    try {
        const first = entries.value.find(e => e.sessionId);
        if (!first) { localStorage.removeItem(STORAGE_KEY); return; }
        const orgId = first.orgId;
        const data: Stored = { orgId, items: entries.value.filter(e => e.sessionId && e.orgId === orgId).map(e => ({ sessionId: e.sessionId!, title: e.title })) };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* stockage indisponible : le dock ne se souvient simplement pas */ }
}

watch(entries, () => { agentPanelSlots.value = entries.value.length; persist(); }, { deep: true, flush: 'sync' });

/** Place libre pour une entrée de plus ; sinon la plus ancienne barre réduite (pas celle qu'on ouvre) est fermée. */
function makeRoom(keep: string): void {
    const cap = Math.max(1, MAX_PANELS - taskPanelSlots.value);
    while (entries.value.length > cap) {
        const victim = entries.value.find(e => e.state === 'min' && e.key !== keep) ?? entries.value.find(e => e.key !== keep);
        if (!victim) return;
        entries.value = entries.value.filter(e => e !== victim);
    }
}

function rememberTrigger(): void {
    if (typeof document === 'undefined') return;
    const el = document.activeElement;
    triggerEl = el instanceof HTMLElement && el !== document.body ? el : null;
}

function restoreFocus(): void {
    const el = triggerEl;
    triggerEl = null;
    if (el && el.isConnected) el.focus();
}

function reveal(entry: AgentDockEntry, state: 'open' | 'full'): void {
    for (const e of entries.value) if (e !== entry && e.state !== 'min') e.state = 'min';
    entry.state = state;
}

function pushEntry(entry: AgentDockEntry): AgentDockEntry {
    entries.value = [...entries.value, entry];
    makeRoom(entry.key);
    return entries.value.find(e => e.key === entry.key) ?? entry;
}

/** Quitter une organisation ferme tout : les conversations appartiennent à une org. */
function resetForOrg(orgId: string): void {
    if (entries.value.some(e => e.orgId !== orgId)) entries.value = entries.value.filter(e => e.orgId === orgId);
}

/** Restaure les barres du rechargement précédent : toujours réduites. */
function restore(orgId: string): void {
    if (entries.value.length > 0) return;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw) as Partial<Stored>;
        if (data.orgId !== orgId || !Array.isArray(data.items)) return;
        const cap = Math.max(1, MAX_PANELS - taskPanelSlots.value);
        entries.value = data.items
            .filter(i => i && typeof i.sessionId === 'string' && typeof i.title === 'string')
            .slice(-cap)
            .map(i => ({ key: i.sessionId, sessionId: i.sessionId, orgId, title: i.title.slice(0, 120), state: 'min' as const, context: null, prompt: '' }));
    } catch { /* ancien format ou stockage illisible : on repart de zéro */ }
}

// ── Gestes d'ouverture (les seuls qui déplient une entrée) ────────────────
function openSession(orgId: string, sessionId: string, title = 'Conversation'): AgentDockEntry {
    rememberTrigger();
    const existing = entries.value.find(e => e.sessionId === sessionId);
    const entry = existing ?? pushEntry({ key: sessionId, sessionId, orgId, title, state: 'min', context: null, prompt: '' });
    if (existing && title !== 'Conversation') existing.title = title;
    reveal(entry, entry.state === 'full' ? 'full' : 'open');
    return entry;
}

function openNew(orgId: string, opts: { context?: AgentContext | null; prompt?: string } = {}): AgentDockEntry {
    rememberTrigger();
    const stale = entries.value.find(e => !e.sessionId && e.orgId === orgId);
    const entry = stale ?? pushEntry({ key: `new-${++draftSeq}`, sessionId: null, orgId, title: 'Nouvelle conversation', state: 'min', context: null, prompt: '' });
    entry.context = opts.context ?? null;
    entry.prompt = opts.prompt ?? '';
    reveal(entry, 'open');
    return entry;
}

/** Le brouillon devient une vraie conversation (créée au premier envoi). */
function bindSession(key: string, sessionId: string, title?: string): void {
    const e = entries.value.find(x => x.key === key);
    if (!e) return;
    const dup = entries.value.find(x => x.sessionId === sessionId && x !== e);
    if (dup) entries.value = entries.value.filter(x => x !== dup);
    e.sessionId = sessionId;
    e.key = sessionId;
    e.prompt = '';
    if (title) e.title = title;
}

function setTitle(key: string, title: string): void {
    const e = entries.value.find(x => x.key === key);
    if (e && title && e.title !== title) e.title = title.slice(0, 120);
}

function minimize(key: string): void {
    const e = entries.value.find(x => x.key === key);
    if (!e || e.state === 'min') return;
    e.state = 'min';
    restoreFocus();
}

function expand(key: string): void {
    const e = entries.value.find(x => x.key === key);
    if (e) reveal(e, 'full');
}

function restoreOpen(key: string): void {
    const e = entries.value.find(x => x.key === key);
    if (e) { rememberTrigger(); reveal(e, 'open'); }
}

function close(key: string): void {
    const e = entries.value.find(x => x.key === key);
    if (!e) return;
    const wasShown = e.state !== 'min';
    entries.value = entries.value.filter(x => x !== e);
    if (wasShown) restoreFocus();
}

function closeAll(): void {
    entries.value = [];
    restoreFocus();
}

/**
 * Ctrl/Cmd+J : ferme (réduit) ce qui est déplié ; sinon reprend la conversation qui attend l'utilisateur,
 * sinon en ouvre une nouvelle (avec le contexte de l'élément sélectionné s'il y en a un).
 */
function toggleShortcut(orgId: string, waiting: { sessionId: string; title: string } | null, context: AgentContext | null = null): void {
    const shown = entries.value.find(e => e.state !== 'min');
    if (shown) { minimize(shown.key); return; }
    if (waiting) { openSession(orgId, waiting.sessionId, waiting.title); return; }
    openNew(orgId, { context });
}

// ── Bulles (PC80) ─────────────────────────────────────────────────────────
function dismissNudge(key: string): void { dismissedNudges.value = new Set([...dismissedNudges.value, key]); }

// ── Page complète ─────────────────────────────────────────────────────────
/** OrgAI.vue le signale pendant qu'elle est affichée : le dock n'ouvre alors pas de second flux sur la même conversation. */
function enterFullPage(): void { fullPageDepth.value++; }
function leaveFullPage(): void { fullPageDepth.value = Math.max(0, fullPageDepth.value - 1); }
/** Demande de la fenêtre du dock transmise à la page complète (consommée une fois). */
function setPendingPrompt(text: string): void { pendingPrompt = text; }
function takePendingPrompt(): string { const t = pendingPrompt; pendingPrompt = ''; return t; }

export function useAgentDock() {
    return {
        entries,
        visible: computed(() => entries.value.length > 0),
        shown: computed(() => entries.value.find(e => e.state !== 'min') ?? null),
        bars: computed(() => entries.value.filter(e => e.state === 'min')),
        openIds: computed(() => new Set(entries.value.map(e => e.sessionId).filter((s): s is string => !!s))),
        dismissedNudges,
        fullPageOpen: computed(() => fullPageDepth.value > 0),
        restore, resetForOrg, openSession, openNew, bindSession, setTitle, minimize, expand, restoreOpen, close, closeAll,
        toggleShortcut, dismissNudge, enterFullPage, leaveFullPage, setPendingPrompt, takePendingPrompt,
    };
}

/** Pour les tests : repart d'un état vide. */
export function __resetAgentDock(): void {
    entries.value = [];
    dismissedNudges.value = new Set();
    fullPageDepth.value = 0;
    draftSeq = 0;
    pendingPrompt = '';
    triggerEl = null;
}
