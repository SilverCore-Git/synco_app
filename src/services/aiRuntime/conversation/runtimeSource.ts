/**
 * Source d'évènements `runtime` (05) : adapte `RuntimeConnection` à l'interface commune
 * `AgentEventSource`, que `OrgAI.vue` consomme comme les autres sources (locale, SSE). Les évènements
 * qui ne sont pas du flux de l'agent (état du lien, snapshot, mise en file, relecture) passent par des
 * rappels. Aucun clair n'est journalisé.
 */
import { RuntimeConnection, type ConnectionDeps, type InboxItem, type LinkState } from './connection';
import { toAgentEvent, type AgentEventSource, type AgentStreamEvent, type RuntimeEvent, type SnapshotState } from './events';

export interface RuntimeSourceHooks {
    onLink?(state: LinkState, detail?: { closeCode?: number; reason?: string; attempts?: number }): void;
    onSnapshot?(state: SnapshotState): void;
    onQueued?(id: string): void;
    /** `ready { mode: "reload" }` : relire l'historique par l'API. */
    onReload?(): void;
    /** Évènement runtime brut déjà déchiffré (statuts, appels d'outil…), pour l'état de la vue. */
    onRuntimeEvent?(ev: RuntimeEvent): void;
}

export class RuntimeEventSource implements AgentEventSource {
    readonly kind = 'runtime' as const;
    readonly connection: RuntimeConnection;
    private queue: AgentStreamEvent[] = [];
    private wake: (() => void) | null = null;
    private ended = false;

    constructor(deps: ConnectionDeps, hooks: RuntimeSourceHooks = {}) {
        this.connection = new RuntimeConnection(deps, {
            onState: (state, detail) => hooks.onLink?.(state, detail),
            onEvent: ev => {
                hooks.onRuntimeEvent?.(ev);
                if (ev.t === 'snapshot') { hooks.onSnapshot?.(ev.state); return; }
                if (ev.t === 'queued') { hooks.onQueued?.(ev.id); return; }
                if (ev.t === 'reload') { hooks.onReload?.(); return; }
                const out = toAgentEvent(ev);
                if (out) this.push(out);
            },
        });
    }

    get linkState(): LinkState { return this.connection.linkState; }

    start(): void { this.connection.start(); }

    stop(): void {
        this.ended = true;
        this.connection.stop();
        this.wake?.();
    }

    private push(ev: AgentStreamEvent): void {
        this.queue.push(ev);
        this.wake?.();
    }

    async *events(): AsyncGenerator<AgentStreamEvent, void, unknown> {
        for (;;) {
            const next = this.queue.shift();
            if (next) { yield next; continue; }
            if (this.ended) return;
            await new Promise<void>(resolve => { this.wake = resolve; });
            this.wake = null;
        }
    }

    sendMessage(content: string): Promise<string> { return this.connection.sendMessage(content); }
    confirm(toolCallId: string, decision: 'accept' | 'reject'): Promise<'ws' | 'api'> { return this.connection.confirm(toolCallId, decision); }
    answer(toolCallId: string, value: string): Promise<void> { return this.connection.answer(toolCallId, value); }
    upload(toolCallId: string, ref: string): Promise<'ws' | 'api'> { return this.connection.upload(toolCallId, ref); }
    cancel(): Promise<'ws' | 'api'> { return this.connection.cancel(); }
    send(item: InboxItem): Promise<'ws' | 'api'> { return this.connection.send(item); }
}
