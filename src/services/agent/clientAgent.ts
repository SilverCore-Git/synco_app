import sfetch from '@/assets/utils/sfetch';
import { buildClientAgentSystemPrompt, type AgentToolSpec } from './clientAgentPrompt';
import { buildTranscript, type EngineMessage } from './clientAgentTranscript';
import { ThinkTagSplitter } from './thinkTagSplitter';

// Boucle d'agent pour les moteurs pilotés par le navigateur (WebGPU local, serveur custom). Elle émet
// exactement les mêmes événements que le flux SSE de synco_api (aiTurnRunner.ts) : l'interface
// (OrgAI.vue › consumeAgentStream) ne sait pas quel moteur la nourrit. Seule différence : ici le
// navigateur exécute lui-même les tools 'server', via POST /api/orgs/:orgId/ai/tools/:name/execute.

export type AgentEvent =
    | { type: 'text'; delta: string }
    | { type: 'thinking'; delta: string }
    | { type: 'usage'; promptTokens?: number; completionTokens?: number; totalTokens?: number; reasoningTokens?: number }
    | { type: 'tool_call_result'; toolCallId: string; name: string; args: any; mutating: false; result: any }
    | { type: 'tool_call_pending'; toolCallId: string; name: string; args: any }
    | { type: 'tool_call_client_required'; toolCallId: string; name: string; args: any; mutating: boolean; interactive: boolean }
    | { type: 'done' }
    | { type: 'error'; error: string };

export interface ClientAgentDeps {
    orgId: string;
    effort?: 'low' | 'medium' | 'high';
    /** Messages affichés, source de vérité de la conversation (le dernier tour d'assistant est en cours). */
    getMessages: () => any[];
    /** Appel au moteur : renvoie des chaînes de texte, des `tool_call` et des `usage`. */
    chat: (messages: EngineMessage[]) => AsyncGenerator<any, void, unknown>;
    interrupt: () => void;
    /** Restreint le manifeste (petits modèles qui se perdent dans une longue liste d'outils). */
    allowedTools?: string[];
}

export interface PendingClientTool {
    toolCallId: string;
    name: string;
    args: any;
    category?: 'server' | 'client';
}

export interface ClientDecision {
    accepted?: boolean;
    clientResult?: any;
}

/** Garde-fou contre un modèle qui enchaîne les appels d'outils sans jamais conclure. */
const MAX_STEPS = 8;

const manifests = new Map<string, Promise<AgentToolSpec[]>>();

export const loadToolManifest = (orgId: string): Promise<AgentToolSpec[]> => {
    let cached = manifests.get(orgId);
    if (!cached) {
        cached = (async () => {
            const res = await sfetch(`/api/orgs/${orgId}/ai/tools`);
            if (!res.ok) throw new Error(`Impossible de charger les outils de l'agent (${res.status}).`);
            return await res.json() as AgentToolSpec[];
        })();
        cached.catch(() => manifests.delete(orgId));
        manifests.set(orgId, cached);
    }
    return cached;
};

export const executeServerTool = async (orgId: string, name: string, args: any): Promise<any> => {
    const res = await sfetch(`/api/orgs/${orgId}/ai/tools/${encodeURIComponent(name)}/execute`, {
        method: 'POST',
        body: JSON.stringify({ args }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: body?.error || `Erreur ${res.status} pendant l'exécution de l'outil.` };
    return body?.data ?? {};
};

const newId = () => `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function* runLoop(deps: ClientAgentDeps): AsyncGenerator<AgentEvent> {
    let tools: AgentToolSpec[];
    try {
        tools = await loadToolManifest(deps.orgId);
    } catch (e: any) {
        yield { type: 'error', error: e?.message || "Impossible de charger les outils de l'agent." };
        return;
    }
    if (deps.allowedTools) tools = tools.filter(t => deps.allowedTools!.includes(t.name));
    const system = buildClientAgentSystemPrompt(tools, deps.effort);

    for (let step = 0; step < MAX_STEPS; step++) {
        const transcript: EngineMessage[] = [{ role: 'system', content: system }, ...buildTranscript(deps.getMessages())];
        const splitter = new ThinkTagSplitter();
        let call: { name: string; arguments: any } | null = null;

        const emit = (s: { text: string; thinking: string }): AgentEvent[] => [
            ...(s.thinking ? [{ type: 'thinking', delta: s.thinking } as const] : []),
            ...(s.text ? [{ type: 'text', delta: s.text } as const] : []),
        ];

        try {
            for await (const chunk of deps.chat(transcript)) {
                if (call) continue; // on draine le flux après l'interruption pour récupérer l'usage
                if (typeof chunk === 'string') {
                    yield* emit(splitter.push(chunk));
                } else if (chunk?.type === 'usage') {
                    yield { type: 'usage', promptTokens: chunk.promptTokens, completionTokens: chunk.completionTokens, totalTokens: chunk.totalTokens, reasoningTokens: chunk.reasoningTokens };
                } else if (chunk?.type === 'tool_call') {
                    call = chunk;
                    yield* emit(splitter.flush());
                    deps.interrupt();
                }
            }
            if (!call) yield* emit(splitter.flush());
        } catch (e: any) {
            // Le flux interrompu volontairement après un appel d'outil peut se terminer par une erreur d'abandon.
            if (!call) {
                yield { type: 'error', error: e?.message || 'Erreur du moteur IA.' };
                return;
            }
        }

        if (!call) {
            yield { type: 'done' };
            return;
        }

        const toolCallId = newId();
        const { name } = call;
        const args = call.arguments ?? {};
        const spec = tools.find(t => t.name === name);

        if (!spec) {
            yield { type: 'tool_call_result', toolCallId, name, args, mutating: false, result: { error: `Outil inconnu: ${name}` } };
            continue;
        }

        if (spec.category === 'server' && !spec.mutating) {
            const result = await executeServerTool(deps.orgId, name, args);
            yield { type: 'tool_call_result', toolCallId, name, args, mutating: false, result };
            continue;
        }

        yield spec.category === 'server'
            ? { type: 'tool_call_pending', toolCallId, name, args }
            : { type: 'tool_call_client_required', toolCallId, name, args, mutating: spec.mutating, interactive: spec.interactive };
        return;
    }

    yield { type: 'error', error: "L'agent a enchaîné trop d'appels d'outils sans conclure." };
}

/** Démarre un tour : le message de l'utilisateur et le tour d'assistant vide sont déjà dans getMessages(). */
export const startClientAgentTurn = (deps: ClientAgentDeps) => runLoop(deps);

/** Reprend après la décision de l'utilisateur (ou le résultat d'un tool client) sur un outil en pause. */
export async function* resumeClientAgentTurn(deps: ClientAgentDeps, tool: PendingClientTool, decision: ClientDecision): AsyncGenerator<AgentEvent> {
    let result: any;
    if (tool.category === 'client') {
        result = decision.clientResult ?? { error: 'Aucun résultat fourni par le client.' };
    } else if (decision.accepted) {
        result = await executeServerTool(deps.orgId, tool.name, tool.args ?? {});
    } else {
        result = { error: "Action refusée par l'utilisateur." };
    }
    yield { type: 'tool_call_result', toolCallId: tool.toolCallId, name: tool.name, args: tool.args, mutating: false, result };
    yield* runLoop(deps);
}
