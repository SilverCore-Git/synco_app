/**
 * Évènements d'une conversation runtime déjà déchiffrés (05 §5), et interface commune de source
 * d'évènements de l'agent (locale, SSE de l'API, WebSocket du runtime) : `OrgAI.vue` ne consomme
 * que `AgentStreamEvent`, quelle que soit la source.
 */

export type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

export type ConversationStatus =
    | 'idle' | 'queued' | 'running' | 'awaiting_confirmation' | 'awaiting_input'
    | 'awaiting_upload' | 'awaiting_key' | 'failed' | 'cancelled' | string;

export interface UsageFrame {
    messageId: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
}

export interface SnapshotState {
    messages: unknown[];
    status: ConversationStatus;
    pendingToolCall: unknown;
}

export type RuntimeEvent =
    | { t: 'text'; messageId: string; delta: string }
    | { t: 'thinking'; messageId: string; delta: string }
    | { t: 'tool_call'; messageId: string; toolCallId: string; name: string; category: 'server' | 'client'; mutating: boolean; interactive: boolean; status: string; args: unknown }
    | { t: 'tool_result'; messageId: string; toolCallId: string; name: string; result: unknown }
    | { t: 'status'; status: ConversationStatus; reason?: string }
    /** Artefact déposé (13 §6.1) : identifiants seulement, le contenu se lit par l'API puis se déchiffre sous `CK`. */
    | { t: 'artifact'; messageId: string; toolCallId: string; artifactId: string }
    | ({ t: 'usage' } & UsageFrame)
    | { t: 'error'; code: string; detail?: string }
    | { t: 'snapshot'; state: SnapshotState }
    | { t: 'queued'; id: string }
    | { t: 'reload' };

/** Évènement consommé par la vue (même forme que le flux SSE existant, `OrgAI.vue`). */
export type AgentStreamEvent =
    | { type: 'text'; delta: string }
    | { type: 'thinking'; delta: string }
    | { type: 'usage'; messageId?: string; promptTokens?: number; completionTokens?: number; totalTokens?: number; reasoningTokens?: number }
    | { type: 'tool_call_pending'; toolCallId: string; name: string; args: unknown }
    | { type: 'tool_call_client_required'; toolCallId: string; name: string; args: unknown; mutating: boolean; interactive: boolean }
    | { type: 'tool_call_result'; toolCallId: string; name: string; result: unknown; args?: unknown }
    | { type: 'status'; status: ConversationStatus }
    | { type: 'artifact'; messageId: string; toolCallId: string; artifactId: string }
    | { type: 'done' }
    | { type: 'error'; error: string };

/** Source d'évènements de l'agent : l'unique contrat que la vue connaît. */
export interface AgentEventSource {
    readonly kind: 'local' | 'sse' | 'runtime';
    events(): AsyncGenerator<AgentStreamEvent, void, unknown>;
}

/** Libellés français des codes d'erreur de l'évènement `error` (05 §7). Jamais de détail brut. */
export const RUNTIME_ERROR_TEXT: Record<string, string> = {
    stale_decision: "Cette décision n'attendait plus de réponse.",
    key_unavailable: "La clé de la conversation n'est pas disponible pour le runtime.",
    provider_error: "Le fournisseur de modèle a répondu par une erreur.",
    budget_exceeded: "Le budget de la conversation est épuisé.",
    step_limit: "L'agent a atteint son nombre maximal d'étapes.",
    confirmation_timeout: "La confirmation a expiré.",
    tool_failed: "Un outil a échoué.",
    internal: "Erreur interne du runtime.",
    decrypt_failed: "Un évènement du runtime n'a pas pu être déchiffré sur cet appareil.",
};

export function runtimeErrorText(code: string): string {
    return RUNTIME_ERROR_TEXT[code] ?? "Erreur du runtime.";
}

/**
 * Conversion d'un évènement runtime vers le flux commun (05 §5.3) : `tool_call` `pending` d'un outil
 * serveur = `tool_call_pending`, d'un outil client ou interactif = `tool_call_client_required`,
 * `status: idle` = `done`. Les autres statuts d'outil (`executing`…) mettent l'étape à jour.
 */
export function toAgentEvent(ev: RuntimeEvent): AgentStreamEvent | null {
    switch (ev.t) {
        case 'text': return { type: 'text', delta: ev.delta };
        case 'thinking': return { type: 'thinking', delta: ev.delta };
        case 'usage': return { type: 'usage', messageId: ev.messageId, promptTokens: ev.promptTokens, completionTokens: ev.completionTokens, totalTokens: ev.totalTokens, reasoningTokens: ev.reasoningTokens };
        case 'tool_call':
            if (ev.status === 'pending') {
                return ev.category === 'client' || ev.interactive
                    ? { type: 'tool_call_client_required', toolCallId: ev.toolCallId, name: ev.name, args: ev.args, mutating: ev.mutating, interactive: ev.interactive }
                    : { type: 'tool_call_pending', toolCallId: ev.toolCallId, name: ev.name, args: ev.args };
            }
            return null;
        case 'tool_result': return { type: 'tool_call_result', toolCallId: ev.toolCallId, name: ev.name, result: ev.result };
        case 'status': return ev.status === 'idle' ? { type: 'done' } : { type: 'status', status: ev.status };
        case 'artifact': return { type: 'artifact', messageId: ev.messageId, toolCallId: ev.toolCallId, artifactId: ev.artifactId };
        case 'error': return { type: 'error', error: runtimeErrorText(ev.code) };
        default: return null;
    }
}
