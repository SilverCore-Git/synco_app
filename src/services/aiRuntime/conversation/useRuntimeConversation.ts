/**
 * Conversation en mode runtime côté vue : ouvre la source `runtime`, applique ses évènements au fil
 * affiché (`OrgAI.vue` ne fait que lier ces états), enregistre l'usage, tient l'état du lien et du
 * statut, envoie messages, décisions, réponses et annulation. Tout est injecté (`connect`, `recordUsage`,
 * `reloadHistory`) : testable avec un runtime simulé.
 */
import { ref, shallowRef, type Ref } from 'vue';
import type { LinkState } from './connection';
import type { AgentStreamEvent, ConversationStatus, SnapshotState } from './events';
import type { RuntimeEventSource } from './runtimeSource';
import { applyAgentEvent, newTranscriptState, planPartsFromHistory, PLAN_TOOL, type TranscriptMessage } from './transcript';
import { isBusyStatus, messageWillQueue } from './status';

export interface RuntimeConversationDeps {
    messages: Ref<TranscriptMessage[]>;
    /** Ouvre la source (clé `CK`, ticket…) ; elle n'est démarrée qu'ici. */
    connect(orgId: string, sessionId: string, hooks: ConnectHooks): Promise<RuntimeEventSource>;
    recordUsage(sessionId: string, frame: { messageId: string; promptTokens?: number; completionTokens?: number; totalTokens?: number; reasoningTokens?: number }): void;
    /** Relit l'historique par l'API (`ready { mode: "reload" }`). */
    reloadHistory(sessionId: string): Promise<void>;
    /** Convertit l'état d'un `snapshot` en messages affichables. */
    fromSnapshot(messages: unknown[]): TranscriptMessage[];
    /** Appelé après chaque évènement appliqué (défilement…). */
    afterEvent?(): void;
}

export interface ConnectHooks {
    onLink(state: LinkState): void;
    onSnapshot(state: SnapshotState): void;
    onReload(): void;
}

export function useRuntimeConversation(deps: RuntimeConversationDeps) {
    const link = ref<LinkState>('connecting');
    const status = ref<ConversationStatus>('idle');
    const error = ref<string | null>(null);
    const source = shallowRef<RuntimeEventSource | null>(null);
    const planToolCallId = ref<string | null>(null);
    let st = newTranscriptState();
    let generation = 0;
    let currentSession: string | null = null;

    const clearQueued = () => { for (const m of deps.messages.value) if (m.queued) m.queued = false; };

    function onSnapshot(snap: SnapshotState): void {
        const msgs = deps.fromSnapshot(snap.messages);
        planPartsFromHistory(msgs);
        deps.messages.value = msgs;
        status.value = snap.status;
        const last = msgs[msgs.length - 1];
        st = { open: !!last && last.role === 'assistant' && isBusyStatus(snap.status) };
        const pending = snap.pendingToolCall;
        if (pending && typeof pending === 'object' && (pending as { name?: unknown }).name === PLAN_TOOL) {
            const id = (pending as { id?: unknown }).id;
            if (typeof id === 'string') {
                planToolCallId.value = id;
                const turn = st.open && last ? last : (() => { const t: TranscriptMessage = { role: 'assistant', content: '', viaAgentLoop: true, parts: [] }; msgs.push(t); return t; })();
                if (!turn.parts!.some(p => p.type === 'plan' && p.toolCallId === id)) turn.parts!.push({ type: 'plan', toolCallId: id });
            }
        }
    }

    async function consume(src: RuntimeEventSource, token: number): Promise<void> {
        for await (const ev of src.events()) {
            if (token !== generation) return;
            handle(ev, currentSession ?? '');
            deps.afterEvent?.();
        }
    }

    function handle(ev: AgentStreamEvent, sessionId: string): void {
        if (ev.type === 'usage' && ev.messageId) deps.recordUsage(sessionId, { ...ev, messageId: ev.messageId });
        if (ev.type === 'status') status.value = ev.status;
        if (ev.type === 'done') { status.value = 'idle'; clearQueued(); }
        const effect = applyAgentEvent(deps.messages.value, st, ev);
        if (effect === 'plan' && (ev.type === 'tool_call_pending' || ev.type === 'tool_call_client_required' || ev.type === 'tool_call_result')) {
            if (ev.name === PLAN_TOOL) planToolCallId.value = ev.toolCallId;
        }
    }

    async function open(orgId: string, sessionId: string): Promise<void> {
        close();
        const token = ++generation;
        currentSession = sessionId;
        link.value = 'connecting';
        error.value = null;
        st = newTranscriptState();
        try {
            const src = await deps.connect(orgId, sessionId, {
                onLink: s => { if (token === generation) link.value = s; },
                onSnapshot: s => { if (token === generation) onSnapshot(s); },
                onReload: () => { if (token === generation) void deps.reloadHistory(sessionId); },
            });
            if (token !== generation) { src.stop(); return; }
            source.value = src;
            src.start();
            void consume(src, token);
        } catch {
            if (token === generation) { link.value = 'offline'; error.value = 'Connexion au runtime impossible.'; }
        }
    }

    function close(): void {
        generation++;
        source.value?.stop();
        source.value = null;
        currentSession = null;
    }

    const readOnly = () => link.value === 'offline' || link.value === 'refused';

    /** Envoie un message ; pendant que la conversation travaille il s'affiche « en file ». */
    async function send(text: string): Promise<boolean> {
        const src = source.value;
        if (!src || readOnly()) return false;
        const queued = messageWillQueue(status.value);
        const msg: TranscriptMessage = { role: 'user', content: text, queued };
        deps.messages.value.push(msg);
        st = { open: false };
        try {
            await src.sendMessage(text);
            if (!queued) status.value = 'queued';
            return true;
        } catch {
            deps.messages.value = deps.messages.value.filter(m => m !== msg);
            error.value = "Le message n'a pas pu être envoyé.";
            return false;
        }
    }

    async function guarded(fn: (src: RuntimeEventSource) => Promise<unknown>): Promise<boolean> {
        const src = source.value;
        if (!src || readOnly()) return false;
        try { await fn(src); error.value = null; return true; } catch { error.value = "La demande n'a pas pu être envoyée."; return false; }
    }

    const confirm = (toolCallId: string, accept: boolean) => guarded(s => s.confirm(toolCallId, accept ? 'accept' : 'reject'));
    const answer = (toolCallId: string, value: string) => guarded(s => s.answer(toolCallId, value));
    const cancel = () => guarded(s => s.cancel());

    return { link, status, error, source, planToolCallId, open, close, send, confirm, answer, cancel };
}

export type RuntimeConversation = ReturnType<typeof useRuntimeConversation>;
