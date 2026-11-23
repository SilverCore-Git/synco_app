/**
 * Fil d'une conversation runtime : applique les évènements du flux commun (`AgentStreamEvent`) aux
 * messages affichés par `OrgAI.vue`. Fonctions sur des objets simples (réactifs ou non) pour pouvoir
 * être testées sans Vue. `propose_actions` n'est jamais un outil à confirmer : c'est une part `plan`.
 */
import type { ToolStep, TurnPart } from '@/views/OrgSpace/components/ai/agentTypes';
import type { AgentStreamEvent } from './events';

export const PLAN_TOOL = 'propose_actions';

export interface UsageTotals { promptTokens: number; completionTokens: number; totalTokens: number; reasoningTokens: number }

export interface TranscriptMessage {
    role: string;
    content: string;
    viaAgentLoop?: boolean;
    parts?: TurnPart[];
    usage?: UsageTotals;
    /** Message de l'utilisateur déposé pendant que la conversation travaille (« en file »). */
    queued?: boolean;
}

export interface TranscriptState {
    /** Un tour d'assistant est ouvert : les prochains évènements s'y ajoutent. */
    open: boolean;
}

export const newTranscriptState = (): TranscriptState => ({ open: false });

function turn(messages: TranscriptMessage[], st: TranscriptState): TranscriptMessage {
    const last = messages[messages.length - 1];
    if (st.open && last && last.role === 'assistant' && last.parts) return last;
    const t: TranscriptMessage = { role: 'assistant', content: '', viaAgentLoop: true, parts: [] };
    messages.push(t);
    st.open = true;
    return messages[messages.length - 1]!;
}

const tail = <T extends TurnPart['type']>(parts: TurnPart[], type: T): Extract<TurnPart, { type: T }> | undefined => {
    const last = parts[parts.length - 1];
    return last && last.type === type ? (last as Extract<TurnPart, { type: T }>) : undefined;
};

function upsertTool(parts: TurnPart[], toolCallId: string, patch: Partial<ToolStep> & { name: string }): ToolStep | null {
    if (patch.name === PLAN_TOOL) {
        if (!parts.some(p => p.type === 'plan' && p.toolCallId === toolCallId)) parts.push({ type: 'plan', toolCallId });
        return null;
    }
    const existing = parts.find((p): p is { type: 'tool'; tool: ToolStep } => p.type === 'tool' && p.tool.toolCallId === toolCallId);
    if (existing) { Object.assign(existing.tool, patch); return existing.tool; }
    const tool: ToolStep = { toolCallId, status: 'pending', ...patch };
    parts.push({ type: 'tool', tool });
    return tool;
}

/** Cumule l'usage d'un tour (plusieurs appels provider par tour). */
export function addUsage(m: TranscriptMessage, u: Partial<UsageTotals>): void {
    const acc = m.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, reasoningTokens: 0 };
    m.usage = {
        promptTokens: acc.promptTokens + (u.promptTokens ?? 0),
        completionTokens: acc.completionTokens + (u.completionTokens ?? 0),
        totalTokens: acc.totalTokens + (u.totalTokens ?? 0),
        reasoningTokens: acc.reasoningTokens + (u.reasoningTokens ?? 0),
    };
}

/**
 * Applique un évènement. Rend le nom de l'effet utile à la vue : `turn_closed` (fin de tour),
 * `plan` (une carte de plan est apparue ou a changé), sinon `null`.
 */
export function applyAgentEvent(messages: TranscriptMessage[], st: TranscriptState, ev: AgentStreamEvent): 'turn_closed' | 'plan' | null {
    switch (ev.type) {
        case 'text': {
            const t = turn(messages, st), parts = t.parts!;
            const last = tail(parts, 'text');
            if (last) last.text += ev.delta; else parts.push({ type: 'text', text: ev.delta });
            return null;
        }
        case 'thinking': {
            const t = turn(messages, st), parts = t.parts!;
            const last = tail(parts, 'thinking');
            if (last) last.text += ev.delta; else parts.push({ type: 'thinking', text: ev.delta });
            return null;
        }
        case 'usage': addUsage(turn(messages, st), ev); return null;
        case 'tool_call_pending': {
            const t = turn(messages, st);
            const tool = upsertTool(t.parts!, ev.toolCallId, { name: ev.name, args: ev.args, status: 'pending', category: 'server', mutating: true });
            return tool ? null : 'plan';
        }
        case 'tool_call_client_required': {
            const t = turn(messages, st);
            const tool = upsertTool(t.parts!, ev.toolCallId, {
                name: ev.name, args: ev.args, status: ev.mutating || ev.interactive ? 'pending' : 'executing',
                category: 'client', mutating: ev.mutating, interactive: ev.interactive,
            });
            return tool ? null : 'plan';
        }
        case 'tool_call_result': {
            const t = turn(messages, st);
            const tool = upsertTool(t.parts!, ev.toolCallId, { name: ev.name, status: 'done', result: ev.result });
            return tool ? null : 'plan';
        }
        case 'error': {
            const t = turn(messages, st), parts = t.parts!;
            const last = tail(parts, 'text');
            const text = `\n\n**Erreur :** ${ev.error}`;
            if (last) last.text += text; else parts.push({ type: 'text', text });
            return null;
        }
        case 'done': st.open = false; return 'turn_closed';
        case 'status': return null;
    }
}

/** Part `plan` d'un historique converti : un outil `propose_actions` devient une carte de plan. */
export function planPartsFromHistory(messages: TranscriptMessage[]): void {
    for (const m of messages) {
        if (!m.parts) continue;
        m.parts = m.parts.map(p => (p.type === 'tool' && p.tool.name === PLAN_TOOL ? { type: 'plan', toolCallId: p.tool.toolCallId } as TurnPart : p));
    }
}

/** Identifiants de plan à afficher : l'appel `propose_actions` en attente le plus récent. */
export const lastPlanToolCallId = (messages: readonly TranscriptMessage[]): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const parts = messages[i]!.parts ?? [];
        for (let j = parts.length - 1; j >= 0; j--) {
            const p = parts[j]!;
            if (p.type === 'plan') return p.toolCallId;
        }
    }
    return null;
};
