/** Liaison runtime (05) avec un WebSocket bouchon : flux complet, reprise, file, confirmation, annulation. */
import { describe, expect, test } from 'bun:test';
import { encryptAiFieldStrict, decryptAiFieldStrict } from '@/assets/utils/aiActionPlan';
import { RuntimeConnection, backoffMs, wsUrl, type ConnectionDeps, type InboxItem, type LinkState, type SocketLike } from './connection';
import { toAgentEvent, type RuntimeEvent } from './events';

const SID = '0f0e0d0c-0b0a-4908-8706-050403020100';
const MID = '3c2b1a09-8f7e-4d6c-9b5a-493827161504';
const ck = new Uint8Array(32).fill(7);

class FakeSocket implements SocketLike {
    sent: Record<string, unknown>[] = [];
    closed: { code?: number } | null = null;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onclose: ((ev: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    send(d: string) { this.sent.push(JSON.parse(d)); }
    close(code?: number) { this.closed = { code }; }
    push(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
    drop(code: number) { this.onclose?.({ code }); }
}

function harness() {
    const sockets: FakeSocket[] = [];
    const deposits: InboxItem[] = [];
    const timers: { fn: () => void; ms: number; id: number; live: boolean }[] = [];
    let tid = 0, tickets = 0, depositStatus = 201;
    const events: RuntimeEvent[] = [];
    const states: LinkState[] = [];
    const deps: ConnectionDeps = {
        sessionId: SID, ck,
        fetchTicket: async () => ({ ticket: `srt1.t${++tickets}`, url: 'https://rt.example.com' }),
        openSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
        deposit: async item => { deposits.push(item); return depositStatus; },
        setTimeout: (fn, ms) => { const t = { fn, ms, id: ++tid, live: true }; timers.push(t); return t.id; },
        clearTimeout: h => { const t = timers.find(x => x.id === h); if (t) t.live = false; },
        random: () => 0.5, uuid: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', nowIso: () => '2026-11-23T10:00:00.000Z',
    };
    const conn = new RuntimeConnection(deps, { onEvent: e => events.push(e), onState: s => states.push(s) });
    const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0)); };
    const open = async () => { conn.start(); await flush(); const s = sockets[sockets.length - 1]!; s.onopen?.(); return s; };
    const runTimer = (ms: number) => { const t = timers.find(x => x.live && x.ms === ms); if (t) { t.live = false; t.fn(); } };
    return { conn, sockets, deposits, events, states, flush, open, runTimer, setDeposit: (n: number) => { depositStatus = n; } };
}

const sealed = (messageId: string, field: string, v: string) => encryptAiFieldStrict(ck, SID, messageId, field, v);

describe('flux complet', () => {
    test('hello avec ticket hors URL, ready, texte déchiffré, outil à confirmer, usage, idle', async () => {
        const h = await harness();
        const s = await h.open();
        expect(s.sent[0]).toEqual({ v: 1, t: 'hello', ticket: 'srt1.t1', resume: null });
        s.push({ v: 1, t: 'ready', status: 'idle', rev: 12, epoch: 2, lastSeq: 0, mode: 'idle' });
        s.push({ v: 1, t: 'text', epoch: 2, seq: 1, messageId: MID, delta: await sealed(MID, 'ws:text:2:1', 'Bonjour') });
        s.push({ v: 1, t: 'tool_call', epoch: 2, seq: 2, messageId: MID, toolCallId: 'call_1', name: 'create_task', category: 'server', mutating: true, interactive: false, status: 'pending', args: await sealed(MID, 'tool_call_arguments:call_1', '{"title":"x"}') });
        s.push({ v: 1, t: 'usage', epoch: 2, seq: 3, messageId: MID, totalTokens: 876 });
        await h.flush();
        expect(h.states).toContain('live');
        const text = h.events.find(e => e.t === 'text');
        expect(text).toEqual({ t: 'text', messageId: MID, delta: 'Bonjour' });
        const call = h.events.find(e => e.t === 'tool_call');
        expect(call && call.t === 'tool_call' && call.args).toEqual({ title: 'x' });
        expect(toAgentEvent(call!)).toEqual({ type: 'tool_call_pending', toolCallId: 'call_1', name: 'create_task', args: { title: 'x' } });
        expect(toAgentEvent({ t: 'status', status: 'idle' })).toEqual({ type: 'done' });
    });

    test('champ altéré ou rejoué à un autre seq : decrypt_failed, aucun clair', async () => {
        const h = harness();
        const s = await h.open();
        s.push({ v: 1, t: 'ready', status: 'running', rev: 0, epoch: 2, lastSeq: 0, mode: 'replay' });
        s.push({ v: 1, t: 'text', epoch: 2, seq: 1, messageId: MID, delta: await sealed(MID, 'ws:text:2:9', 'rejoué') });
        await h.flush();
        expect(h.events.some(e => e.t === 'text')).toBe(false);
        expect(h.events.some(e => e.t === 'error' && e.code === 'decrypt_failed')).toBe(true);
    });
});

describe('reprise et reconnexion', () => {
    test('coupure : backoff, nouveau ticket, resume {epoch, seq}, doublon ignoré', async () => {
        const h = harness();
        const s = await h.open();
        s.push({ v: 1, t: 'ready', status: 'running', rev: 0, epoch: 2, lastSeq: 0, mode: 'replay' });
        s.push({ v: 1, t: 'text', epoch: 2, seq: 1, messageId: MID, delta: await sealed(MID, 'ws:text:2:1', 'A') });
        await h.flush();
        s.drop(1006);
        expect(h.states[h.states.length - 1]).toBe('resuming');
        h.runTimer(backoffMs(1, 0.5));
        await h.flush();
        const s2 = h.sockets[1]!;
        s2.onopen?.();
        expect(s2.sent[0]).toEqual({ v: 1, t: 'hello', ticket: 'srt1.t2', resume: { epoch: 2, seq: 1 } });
        s2.push({ v: 1, t: 'ready', status: 'running', rev: 0, epoch: 2, lastSeq: 2, mode: 'replay' });
        s2.push({ v: 1, t: 'text', epoch: 2, seq: 1, messageId: MID, delta: await sealed(MID, 'ws:text:2:1', 'A') });
        s2.push({ v: 1, t: 'text', epoch: 2, seq: 2, messageId: MID, delta: await sealed(MID, 'ws:text:2:2', 'B') });
        await h.flush();
        expect(h.events.filter(e => e.t === 'text').map(e => (e as { delta: string }).delta)).toEqual(['A', 'B']);
    });

    test('échecs répétés : runtime hors ligne, puis retour en direct', async () => {
        const h = harness();
        await h.open().then(s => s.drop(1006));
        h.runTimer(backoffMs(1, 0.5));
        await h.flush();
        h.sockets[1]!.drop(1006);
        expect(h.states[h.states.length - 1]).toBe('offline');
        h.runTimer(backoffMs(2, 0.5));
        await h.flush();
        h.sockets[2]!.onopen?.();
        h.sockets[2]!.push({ v: 1, t: 'ready', status: 'idle', rev: 12, epoch: 3, lastSeq: 0, mode: 'idle' });
        await h.flush();
        expect(h.states[h.states.length - 1]).toBe('live');
    });

    test('snapshot : évènements en direct gardés en tampon, seuls seq > snapshot appliqués', async () => {
        const h = harness();
        const s = await h.open();
        s.push({ v: 1, t: 'ready', status: 'running', rev: 0, epoch: 2, lastSeq: 0, mode: 'snapshot' });
        s.push({ v: 1, t: 'text', epoch: 2, seq: 41, messageId: MID, delta: await sealed(MID, 'ws:text:2:41', 'ancien') });
        s.push({ v: 1, t: 'text', epoch: 2, seq: 43, messageId: MID, delta: await sealed(MID, 'ws:text:2:43', 'suite') });
        const state = JSON.stringify({ messages: [{ role: 'assistant', content: 'x' }], status: 'running', pendingToolCall: null });
        s.push({ v: 1, t: 'snapshot', epoch: 2, seq: 42, baseRev: 12, state: await sealed('__snapshot__', 'snapshot:2:42', state) });
        await h.flush();
        const kinds = h.events.map(e => e.t);
        expect(kinds.indexOf('snapshot')).toBeLessThan(kinds.indexOf('text'));
        expect(h.events.filter(e => e.t === 'text')).toEqual([{ t: 'text', messageId: MID, delta: 'suite' }]);
    });

    test('trou de séquence : fermeture pour reprendre', async () => {
        const h = harness();
        const s = await h.open();
        s.push({ v: 1, t: 'ready', status: 'running', rev: 0, epoch: 2, lastSeq: 0, mode: 'replay' });
        s.push({ v: 1, t: 'text', epoch: 2, seq: 1, messageId: MID, delta: await sealed(MID, 'ws:text:2:1', 'A') });
        s.push({ v: 1, t: 'text', epoch: 2, seq: 3, messageId: MID, delta: await sealed(MID, 'ws:text:2:3', 'C') });
        await h.flush();
        expect(s.closed).not.toBeNull();
        expect(h.events.filter(e => e.t === 'text').length).toBe(1);
    });

    test('ready reload : historique à relire puis reconnexion', async () => {
        const h = harness();
        const s = await h.open();
        s.push({ v: 1, t: 'ready', status: 'idle', rev: 0, epoch: 0, lastSeq: 0, mode: 'reload' });
        await h.flush();
        expect(h.events.some(e => e.t === 'reload')).toBe(true);
        h.runTimer(1000);
        await h.flush();
        expect(h.sockets.length).toBe(2);
    });
});

describe('fermetures', () => {
    test('4403 : refus définitif, aucune nouvelle tentative', async () => {
        const h = harness();
        (await h.open()).drop(4403);
        expect(h.states[h.states.length - 1]).toBe('refused');
        await h.flush();
        expect(h.sockets.length).toBe(1);
    });
    test('4401 : une seule nouvelle tentative immédiate', async () => {
        const h = harness();
        (await h.open()).drop(4401);
        await h.flush();
        expect(h.sockets.length).toBe(2);
        h.sockets[1]!.drop(4401);
        expect(h.states[h.states.length - 1]).not.toBe('refused');
        await h.flush();
        expect(h.sockets.length).toBe(2);
    });
    test('wsUrl : https devient wss, le ticket n’y est pas', () => {
        expect(wsUrl('https://rt.example.com/', SID)).toBe(`wss://rt.example.com/v1/conversations/${SID}/ws`);
    });
});

describe('envoi', () => {
    test('message chiffré par le socket, en file (queued) ; confirmation et annulation', async () => {
        const h = harness();
        const s = await h.open();
        s.push({ v: 1, t: 'ready', status: 'running', rev: 0, epoch: 2, lastSeq: 0, mode: 'replay' });
        await h.flush();
        const id = await h.conn.sendMessage('Bonjour secret');
        const frame = s.sent.find(f => f.t === 'message')!;
        expect(JSON.stringify(frame)).not.toContain('Bonjour secret');
        expect(await decryptAiFieldStrict(ck, SID, id, 'content', frame.content as string)).toBe('Bonjour secret');
        s.push({ v: 1, t: 'queued', id });
        await h.flush();
        expect(h.events).toContainEqual({ t: 'queued', id });
        await h.conn.confirm('call_1', 'accept');
        await h.conn.cancel();
        expect(s.sent.map(f => f.t)).toEqual(['hello', 'message', 'confirm', 'cancel']);
        await h.conn.answer('call_2', 'oui');
        const ans = s.sent.find(f => f.t === 'answer')!;
        expect(await decryptAiFieldStrict(ck, SID, '__answer__', 'answer:call_2', ans.value as string)).toBe('oui');
    });

    test('hors ligne : dépôt par l’API, erreur si refusé', async () => {
        const h = harness();
        expect(await h.conn.confirm('call_1', 'reject')).toBe('api');
        expect(h.deposits).toEqual([{ t: 'confirm', toolCallId: 'call_1', decision: 'reject' }]);
        h.setDeposit(429);
        await expect(h.conn.cancel()).rejects.toThrow('deposit_429');
    });
});
