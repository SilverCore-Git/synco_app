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
