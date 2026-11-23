import { ref } from 'vue';

// Statistiques d'usage de Synco AI, tenues sur CET appareil (localStorage) : le contenu des
// conversations est chiffré de bout en bout, le serveur ne peut pas en tirer ces chiffres.

export interface UsageEvent {
    /** Horodatage (ms). */
    t: number;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    /** Conversation et régime (« runtime » : trame `usage` du WebSocket) ; absents des anciens évènements. */
    sessionId?: string;
    regime?: 'device' | 'gateway' | 'runtime';
    messageId?: string;
    /** Appel d'outil (0 token) : nom de l'outil ; absent des évènements de tokens. */
    tool?: string;
}

const KEY = 'synco_ai_usage_log';
const MAX_EVENTS = 5000;

const read = (): UsageEvent[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
};

const write = (events: UsageEvent[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(events)); } catch { /* quota / navigation privée */ }
};

export const usageEvents = ref<UsageEvent[]>(read());

export const recordUsage = (provider: string, model: string, usage: Partial<Record<'promptTokens' | 'completionTokens' | 'reasoningTokens' | 'totalTokens', number>>) => {
    const total = usage.totalTokens || 0;
    if (total <= 0) return;
    const event: UsageEvent = {
        t: Date.now(),
        provider,
        model: model || 'inconnu',
        promptTokens: usage.promptTokens || 0,
        completionTokens: usage.completionTokens || 0,
        reasoningTokens: usage.reasoningTokens || 0,
        totalTokens: total,
    };
    usageEvents.value = [...usageEvents.value, event].slice(-MAX_EVENTS);
    write(usageEvents.value);
};

/**
 * Trame `usage` d'une conversation runtime (05 §5) : comptée en tokens seulement (PC79), une seule fois
 * par `(sessionId, messageId)` même si la trame est rejouée après une reconnexion.
 */
export const recordRuntimeUsage = (sessionId: string, frame: { messageId: string } & Partial<Record<'promptTokens' | 'completionTokens' | 'reasoningTokens' | 'totalTokens', number>>, model = 'runtime'): boolean => {
    const total = frame.totalTokens ?? ((frame.promptTokens || 0) + (frame.completionTokens || 0));
    if (total <= 0) return false;
    if (usageEvents.value.some(e => e.sessionId === sessionId && e.messageId === frame.messageId)) return false;
    const event: UsageEvent = {
        t: Date.now(), provider: 'runtime', model, promptTokens: frame.promptTokens || 0, completionTokens: frame.completionTokens || 0,
        reasoningTokens: frame.reasoningTokens || 0, totalTokens: total, sessionId, regime: 'runtime', messageId: frame.messageId,
    };
    usageEvents.value = [...usageEvents.value, event].slice(-MAX_EVENTS);
    write(usageEvents.value);
    return true;
};

/** Appel d'outil d'une conversation runtime : compté une fois par `(sessionId, toolCallId)` (trame rejouée). Aucun contenu. */
export const recordRuntimeTool = (sessionId: string, toolCallId: string, tool: string): boolean => {
    if (!sessionId || !toolCallId || !tool) return false;
    if (usageEvents.value.some(e => e.tool && e.sessionId === sessionId && e.messageId === toolCallId)) return false;
    const event: UsageEvent = {
        t: Date.now(), provider: 'runtime', model: 'runtime', promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0,
        sessionId, regime: 'runtime', messageId: toolCallId, tool,
    };
    usageEvents.value = [...usageEvents.value, event].slice(-MAX_EVENTS);
    write(usageEvents.value);
    return true;
};

export const resetUsageStats = () => {
    usageEvents.value = [];
    write([]);
};

export interface UsageGroup { key: string; requests: number; promptTokens: number; completionTokens: number; reasoningTokens: number; totalTokens: number }

const emptyGroup = (key: string): UsageGroup => ({ key, requests: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0 });

export const groupUsage = (events: UsageEvent[], keyOf: (e: UsageEvent) => string): UsageGroup[] => {
    const map = new Map<string, UsageGroup>();
    for (const e of events) {
        const k = keyOf(e);
        const g = map.get(k) ?? emptyGroup(k);
        g.requests++;
        g.promptTokens += e.promptTokens;
        g.completionTokens += e.completionTokens;
        g.reasoningTokens += e.reasoningTokens;
        g.totalTokens += e.totalTokens;
        map.set(k, g);
    }
    return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
};

/** Tokens par jour sur les `days` derniers jours (le plus ancien d'abord), jours vides inclus. */
export const dailyTokens = (events: UsageEvent[], days: number): Array<{ day: string; tokens: number }> => {
    const out: Array<{ day: string; tokens: number }> = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const index = new Map<string, number>();
    for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = d.toLocaleDateString('fr-CA');
        index.set(key, out.length);
        out.push({ day: key, tokens: 0 });
    }
    for (const e of events) {
        const i = index.get(new Date(e.t).toLocaleDateString('fr-CA'));
        if (i !== undefined) out[i]!.tokens += e.totalTokens;
    }
    return out;
};

// ---------------------------------------------------------------------------
// Filtres et agrégats de l'écran « Statistiques » (tokens seulement, PC79 : aucun montant)
// ---------------------------------------------------------------------------

export type UsageSource = 'all' | 'device' | 'runtime';

/** Les anciens évènements n'ont pas de `regime` : ils viennent de l'appareil. */
export const sourceOf = (e: UsageEvent): 'device' | 'runtime' => (e.regime === 'runtime' ? 'runtime' : 'device');

export const filterUsage = (events: UsageEvent[], opts: { days: number; source: UsageSource; now?: number }): UsageEvent[] => {
    const since = opts.days ? (opts.now ?? Date.now()) - opts.days * 86400000 : 0;
    return events.filter(e => e.t >= since && (opts.source === 'all' || sourceOf(e) === opts.source));
};

/** Évènements de tokens (hors appels d'outils). */
export const tokenEvents = (events: UsageEvent[]): UsageEvent[] => events.filter(e => !e.tool);
export const toolEvents = (events: UsageEvent[]): UsageEvent[] => events.filter(e => !!e.tool);

export interface UsageSummary {
    tokens: number;
    requests: number;
    conversations: { runtime: number; device: number; total: number };
    toolCalls: number;
}

export const summarizeUsage = (events: UsageEvent[]): UsageSummary => {
    const tokens = tokenEvents(events);
    const runtime = new Set<string>();
    for (const e of events) if (e.sessionId && sourceOf(e) === 'runtime') runtime.add(e.sessionId);
    // Une conversation d'appareil n'a pas d'identifiant : on ne compte que celles dont l'évènement le porte.
    const device = new Set<string>();
    for (const e of events) if (e.sessionId && sourceOf(e) === 'device') device.add(e.sessionId);
    return {
        tokens: tokens.reduce((n, e) => n + e.totalTokens, 0),
        requests: tokens.length,
        conversations: { runtime: runtime.size, device: device.size, total: runtime.size + device.size },
        toolCalls: toolEvents(events).length,
    };
};

/** Les `limit` conversations les plus consommatrices : tokens, outils appelés, source. */
export const topConversations = (events: UsageEvent[], limit = 5): Array<{ sessionId: string; tokens: number; tools: number; source: 'device' | 'runtime' }> => {
    const map = new Map<string, { sessionId: string; tokens: number; tools: number; source: 'device' | 'runtime' }>();
    for (const e of events) {
        if (!e.sessionId) continue;
        const r = map.get(e.sessionId) ?? { sessionId: e.sessionId, tokens: 0, tools: 0, source: sourceOf(e) };
        if (e.tool) r.tools++; else r.tokens += e.totalTokens;
        map.set(e.sessionId, r);
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens || b.tools - a.tools).slice(0, limit);
};

/** Appels par outil, le plus utilisé d'abord. */
export const toolUsage = (events: UsageEvent[]): Array<{ tool: string; calls: number }> => {
    const map = new Map<string, number>();
    for (const e of toolEvents(events)) map.set(e.tool!, (map.get(e.tool!) ?? 0) + 1);
    return [...map].map(([tool, calls]) => ({ tool, calls })).sort((a, b) => b.calls - a.calls);
};
