/**
 * Liaison d'une conversation runtime (05) : WebSocket DIRECT vers le runtime, déchiffrement de chaque
 * champ sous `CK`, reprise par `epoch`/`seq`, tampon avant `snapshot`, reconnexion avec gigue, dépôt
 * par l'API quand le socket n'est pas disponible. Sans Vue ni réseau en dur : tout est injecté.
 * Aucun clair n'est journalisé ni stocké ; les erreurs ne portent que des codes.
 */
import { decryptAiFieldStrict, encryptAiFieldStrict } from '@/assets/utils/aiActionPlan';
import type { ConversationStatus, JsonLike, RuntimeEvent, SnapshotState, UsageFrame } from './events';

export type LinkState =
    | 'connecting'   // première connexion
    | 'live'         // connecté, flux en direct
    | 'resuming'     // reconnexion après coupure
    | 'offline'      // runtime hors ligne (injoignable) : lecture seule, nouvelles tentatives
    | 'refused';     // refus définitif (révoqué, plus en mode runtime) : plus de tentative

/** Socket minimal (WebSocket du navigateur, ou bouchon de test). */
export interface SocketLike {
    send(data: string): void;
    close(code?: number, reason?: string): void;
    onopen: (() => void) | null;
    onmessage: ((ev: { data: unknown }) => void) | null;
    onclose: ((ev: { code: number; reason?: string }) => void) | null;
    onerror: (() => void) | null;
}

export interface InboxItem { t: 'message' | 'confirm' | 'answer' | 'upload' | 'cancel'; [k: string]: unknown }

export interface ConnectionDeps {
    sessionId: string;
    ck: CryptoKey | Uint8Array;
    /** `POST …/runtime-ticket` : ticket `srt1` et URL du runtime. */
    fetchTicket(): Promise<{ ticket: string; url: string }>;
    openSocket(url: string): SocketLike;
    /** `POST …/inbox` (API) quand le socket n'est pas disponible ; rend le statut HTTP. */
    deposit(item: InboxItem): Promise<number>;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
    /** Aléa dans [0,1[ pour la gigue. */
    random(): number;
    uuid(): string;
    nowIso(): string;
}

export interface ConnectionHandlers {
    onEvent(ev: RuntimeEvent): void;
    onState(state: LinkState, detail?: { closeCode?: number; reason?: string; attempts?: number }): void;
}

export const PING_MS = 25_000;
export const IDLE_MS = 60_000;
export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
/** Après autant d'échecs de suite, le runtime est présenté « hors ligne ». */
export const OFFLINE_AFTER = 2;
/** Fermetures définitives : on ne réessaie pas (05 §7). */
const FATAL = new Set([4400, 4403, 4404]);

const isRec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);
const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

export function wsUrl(base: string, sessionId: string): string {
    const u = new URL(base);
    u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
    u.pathname = `${u.pathname.replace(/\/$/, '')}/v1/conversations/${encodeURIComponent(sessionId)}/ws`;
    u.search = '';
    u.hash = '';
    return u.toString();
}

export function backoffMs(attempt: number, random: number): number {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt - 1));
    return Math.round(base * (0.5 + random * 0.5));
}

function parseJson(text: string): unknown {
    try { return JSON.parse(text); } catch { return text; }
}

export class RuntimeConnection {
    private socket: SocketLike | null = null;
    private state: LinkState = 'connecting';
    private last: { epoch: number; seq: number } | null = null;
    private attempts = 0;
    private stopped = false;
    private ready = false;
    private awaitingSnapshot = false;
    private buffer: Record<string, unknown>[] = [];
    private retryTimer: unknown = null;
    private pingTimer: unknown = null;
    private idleTimer: unknown = null;
    private ticketRetried = false;
    private chain: Promise<void> = Promise.resolve();

    private readonly deps: ConnectionDeps;
    private readonly handlers: ConnectionHandlers;

    constructor(deps: ConnectionDeps, handlers: ConnectionHandlers) {
        this.deps = deps;
        this.handlers = handlers;
    }

    get linkState(): LinkState { return this.state; }

    start(): void {
        this.stopped = false;
        void this.connect();
    }

    stop(): void {
        this.stopped = true;
        this.clearTimers();
        const s = this.socket;
        this.socket = null;
        this.ready = false;
        if (s) { s.onclose = null; s.onmessage = null; s.onerror = null; try { s.close(1000, 'client_stop'); } catch { /* déjà fermé */ } }
    }

    private setState(state: LinkState, detail?: { closeCode?: number; reason?: string; attempts?: number }): void {
        this.state = state;
        this.handlers.onState(state, detail);
    }

    private clearTimers(): void {
        for (const h of [this.retryTimer, this.pingTimer, this.idleTimer]) if (h !== null) this.deps.clearTimeout(h);
        this.retryTimer = this.pingTimer = this.idleTimer = null;
    }

    private async connect(): Promise<void> {
        if (this.stopped) return;
        this.setState(this.last || this.attempts > 0 ? 'resuming' : 'connecting');
        let ticket: { ticket: string; url: string };
        try {
            ticket = await this.deps.fetchTicket();
        } catch {
            this.scheduleRetry();
            return;
        }
        if (this.stopped) return;
        let socket: SocketLike;
        try {
            socket = this.deps.openSocket(wsUrl(ticket.url, this.deps.sessionId));
        } catch {
            this.scheduleRetry();
            return;
        }
        this.socket = socket;
        this.ready = false;
        this.awaitingSnapshot = false;
        this.buffer = [];
        socket.onopen = () => {
            // Le ticket ne va jamais dans l'URL (05 §1) : première trame.
            socket.send(JSON.stringify({ v: 1, t: 'hello', ticket: ticket.ticket, resume: this.last }));
            this.armIdle();
        };
        socket.onmessage = ev => {
            this.armIdle();
            if (typeof ev.data !== 'string') return;
            const frame = parseJson(ev.data);
            if (!isRec(frame)) return;
            // Les trames sont traitées dans l'ordre : le déchiffrement est asynchrone.
            this.chain = this.chain.then(() => this.onFrame(frame)).catch(() => undefined);
        };
        socket.onerror = () => undefined;
        socket.onclose = ev => this.onClose(socket, ev.code);
    }

    private armIdle(): void {
        if (this.idleTimer !== null) this.deps.clearTimeout(this.idleTimer);
        this.idleTimer = this.deps.setTimeout(() => this.socket?.close(4000, 'idle'), IDLE_MS);
    }

    private armPing(): void {
        if (this.pingTimer !== null) this.deps.clearTimeout(this.pingTimer);
        this.pingTimer = this.deps.setTimeout(() => {
            if (this.socket && this.ready) {
                try { this.socket.send(JSON.stringify({ v: 1, t: 'ping' })); } catch { /* onclose suivra */ }
                this.armPing();
            }
        }, PING_MS);
    }

    private onClose(socket: SocketLike, code: number): void {
        if (this.socket !== socket) return;
        this.socket = null;
        this.ready = false;
        this.clearTimers();
        if (this.stopped) return;
        if (FATAL.has(code)) {
            this.setState('refused', { closeCode: code });
            return;
        }
        if (code === 4401 && !this.ticketRetried) {
            // Ticket expiré : une seule nouvelle tentative immédiate (05 §7).
            this.ticketRetried = true;
            void this.connect();
            return;
        }
        this.scheduleRetry(code);
    }

    private scheduleRetry(code?: number): void {
        if (this.stopped) return;
        this.attempts += 1;
        const offline = this.attempts >= OFFLINE_AFTER;
        this.setState(offline ? 'offline' : 'resuming', { closeCode: code, attempts: this.attempts });
        this.retryTimer = this.deps.setTimeout(() => { this.retryTimer = null; void this.connect(); }, backoffMs(this.attempts, this.deps.random()));
    }

    // ---- Trames reçues ----------------------------------------------------

    private async onFrame(f: Record<string, unknown>): Promise<void> {
        const t = str(f.t);
        if (t === 'ready') { this.onReady(f); return; }
        if (t === 'pong') return;
        if (t === 'queued') {
            const id = str(f.id);
            if (id) this.handlers.onEvent({ t: 'queued', id });
            return;
        }
        if (t === 'snapshot') { await this.onSnapshot(f); return; }
        if (this.awaitingSnapshot) { this.buffer.push(f); return; }
        await this.applyEvent(f);
    }

    private onReady(f: Record<string, unknown>): void {
        this.ready = true;
        this.attempts = 0;
        this.ticketRetried = false;
        this.setState('live');
        this.armPing();
        const mode = str(f.mode);
        const status = str(f.status);
        if (status) this.handlers.onEvent({ t: 'status', status });
        if (mode === 'reload') {
            // Relire l'historique par l'API, puis se reconnecter (05 §5.1).
            this.last = null;
            this.handlers.onEvent({ t: 'reload' });
            const s = this.socket;
            this.socket = null;
            this.ready = false;
            if (s) { s.onclose = null; try { s.close(1000, 'reload'); } catch { /* déjà fermé */ } }
            this.retryTimer = this.deps.setTimeout(() => { this.retryTimer = null; void this.connect(); }, 1_000);
            return;
        }
        if (mode === 'snapshot') { this.awaitingSnapshot = true; this.last = null; }
    }

    private async onSnapshot(f: Record<string, unknown>): Promise<void> {
        const epoch = num(f.epoch), seq = num(f.seq), state = str(f.state);
        if (epoch === undefined || seq === undefined || !state) return;
        let clear: unknown;
        try {
            clear = parseJson(await decryptAiFieldStrict(this.deps.ck, this.deps.sessionId, '__snapshot__', `snapshot:${epoch}:${seq}`, state));
        } catch {
            this.handlers.onEvent({ t: 'error', code: 'decrypt_failed' });
            return;
        }
        if (!isRec(clear) || !Array.isArray(clear.messages)) return;
        const snap: SnapshotState = { messages: clear.messages, status: str(clear.status) ?? 'idle', pendingToolCall: clear.pendingToolCall ?? null };
        this.handlers.onEvent({ t: 'snapshot', state: snap });
        this.last = { epoch, seq };
        this.awaitingSnapshot = false;
        const held = this.buffer;
        this.buffer = [];
        // Seuls les évènements d'un `seq` supérieur à celui du snapshot s'appliquent (05 §3).
        for (const e of held) {
            if (num(e.epoch) === epoch && (num(e.seq) ?? 0) <= seq) continue;
            await this.applyEvent(e);
        }
    }

    private async applyEvent(f: Record<string, unknown>): Promise<void> {
        const epoch = num(f.epoch), seq = num(f.seq);
        if (epoch === undefined || seq === undefined) return;
        const last = this.last;
        if (last && last.epoch === epoch) {
            if (seq <= last.seq) return; // doublon
            if (seq !== last.seq + 1) {
                // Trou : on repart avec `resume`, le runtime rejouera ou enverra un snapshot.
                this.socket?.close(4000, 'gap');
                return;
            }
        }
        this.last = { epoch, seq };
        const ev = await this.decode(f, epoch, seq);
        if (ev) this.handlers.onEvent(ev);
    }

    private async decode(f: Record<string, unknown>, epoch: number, seq: number): Promise<RuntimeEvent | null> {
        const { ck, sessionId } = this.deps;
        const t = str(f.t);
        const fail = (): RuntimeEvent => ({ t: 'error', code: 'decrypt_failed' });
        try {
            if (t === 'text' || t === 'thinking') {
                const messageId = str(f.messageId), delta = str(f.delta);
                if (!messageId || !delta) return null;
                return { t, messageId, delta: await decryptAiFieldStrict(ck, sessionId, messageId, `ws:${t}:${epoch}:${seq}`, delta) };
            }
            if (t === 'tool_call') {
                const messageId = str(f.messageId), toolCallId = str(f.toolCallId), name = str(f.name), args = str(f.args);
                if (!messageId || !toolCallId || !name || args === undefined) return null;
                const plain = await decryptAiFieldStrict(ck, sessionId, messageId, `tool_call_arguments:${toolCallId}`, args);
                return {
                    t, messageId, toolCallId, name,
                    category: f.category === 'client' ? 'client' : 'server',
                    mutating: f.mutating === true, interactive: f.interactive === true,
                    status: str(f.status) ?? 'pending', args: parseJson(plain),
                };
            }
            if (t === 'tool_result') {
                const messageId = str(f.messageId), toolCallId = str(f.toolCallId), name = str(f.name), result = str(f.result);
                if (!messageId || !toolCallId || !name || result === undefined) return null;
                return { t, messageId, toolCallId, name, result: parseJson(await decryptAiFieldStrict(ck, sessionId, messageId, 'tool_result', result)) };
            }
            if (t === 'artifact') {
                const messageId = str(f.messageId), toolCallId = str(f.toolCallId), artifactId = str(f.artifactId);
                return messageId && toolCallId && artifactId ? { t, messageId, toolCallId, artifactId } : null;
            }
            if (t === 'status') {
                const status = str(f.status);
                return status ? { t, status: status as ConversationStatus, reason: str(f.reason) } : null;
            }
            if (t === 'usage') {
                const messageId = str(f.messageId);
                if (!messageId) return null;
                const u: UsageFrame = { messageId, promptTokens: num(f.promptTokens), completionTokens: num(f.completionTokens), totalTokens: num(f.totalTokens), reasoningTokens: num(f.reasoningTokens) };
                return { t, ...u };
            }
            if (t === 'error') {
                const code = str(f.code) ?? 'internal';
                // Le détail est déchiffré pour vérifier l'intégrité mais jamais exposé : un code suffit.
                const detail = str(f.detail);
                if (detail) await decryptAiFieldStrict(ck, sessionId, '__error__', `error:${epoch}:${seq}`, detail);
                return { t, code };
            }
        } catch {
            return fail();
        }
        return null;
    }

    // ---- Envoi ------------------------------------------------------------

    /** Dépose un élément : par le socket s'il est prêt, sinon par l'API (05 §6.2, §9). */
    async send(item: InboxItem): Promise<'ws' | 'api'> {
        const s = this.socket;
        if (s && this.ready) {
            try {
                s.send(JSON.stringify({ v: 1, ...item }));
                return 'ws';
            } catch { /* repli par l'API */ }
        }
        const status = await this.deps.deposit(item);
        if (status !== 200 && status !== 201) throw new Error(`deposit_${status}`);
        return 'api';
    }

    async sendMessage(content: string): Promise<string> {
        const id = this.deps.uuid();
        const sealed = await encryptAiFieldStrict(this.deps.ck, this.deps.sessionId, id, 'content', content);
        await this.send({ t: 'message', id, content: sealed, createdAt: this.deps.nowIso() });
        return id;
    }

    confirm(toolCallId: string, decision: 'accept' | 'reject'): Promise<'ws' | 'api'> {
        return this.send({ t: 'confirm', toolCallId, decision });
    }

    async answer(toolCallId: string, value: string): Promise<void> {
        const sealed = await encryptAiFieldStrict(this.deps.ck, this.deps.sessionId, '__answer__', `answer:${toolCallId}`, value);
        await this.send({ t: 'answer', toolCallId, value: sealed });
    }

    upload(toolCallId: string, ref: string): Promise<'ws' | 'api'> {
        return this.send({ t: 'upload', toolCallId, ref });
    }

    cancel(): Promise<'ws' | 'api'> {
        return this.send({ t: 'cancel', id: this.deps.uuid() });
    }
}

export type { JsonLike };
