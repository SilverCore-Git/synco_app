/** Conversation runtime côté vue, avec un WebSocket bouchon : flux, plan, usage, mise en file, confirmation, annulation, hors ligne. */
import { describe, expect, test } from 'bun:test';
import { ref } from 'vue';
import { encryptAiFieldStrict } from '@/assets/utils/aiActionPlan';
import { backoffMs, type ConnectionDeps, type InboxItem, type SocketLike } from './connection';
import { RuntimeEventSource } from './runtimeSource';
import { useRuntimeConversation } from './useRuntimeConversation';
import type { TranscriptMessage } from './transcript';

const SID = '0f0e0d0c-0b0a-4908-8706-050403020100';
const MID = '3c2b1a09-8f7e-4d6c-9b5a-493827161504';
const ck = new Uint8Array(32).fill(7);
const sealed = (messageId: string, field: string, v: string) => encryptAiFieldStrict(ck, SID, messageId, field, v);

class FakeSocket implements SocketLike {
    sent: Record<string, unknown>[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onclose: ((ev: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    send(d: string) { this.sent.push(JSON.parse(d)); }
    close() { /* rien */ }
    push(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
    drop(code: number) { this.onclose?.({ code }); }
}

async function setup() {
    const sockets: FakeSocket[] = [];
    const deposits: InboxItem[] = [];
    const timers: { fn: () => void; ms: number; live: boolean; id: number }[] = [];
    const usage: { sessionId: string; messageId: string }[] = [];
    let reloads = 0, tid = 0;
    const messages = ref<TranscriptMessage[]>([{ role: 'user', content: 'Avant' }]);
    const connDeps: ConnectionDeps = {
        sessionId: SID, ck,
        fetchTicket: async () => ({ ticket: 'srt1.t', url: 'https://rt.example.com' }),
        openSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
        deposit: async i => { deposits.push(i); return 201; },
        setTimeout: (fn, ms) => { const t = { fn, ms, live: true, id: ++tid }; timers.push(t); return t.id; },
        clearTimeout: h => { const t = timers.find(x => x.id === h); if (t) t.live = false; },
        random: () => 0.5, uuid: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', nowIso: () => '2026-11-23T10:00:00.000Z',
    };
    const conv = useRuntimeConversation({
        messages,
        connect: async (_o, _s, hooks) => new RuntimeEventSource(connDeps, { onLink: hooks.onLink, onSnapshot: hooks.onSnapshot, onReload: hooks.onReload }),
        recordUsage: (sessionId, f) => { usage.push({ sessionId, messageId: f.messageId }); },
        reloadHistory: async () => { reloads++; },
        fromSnapshot: raw => (raw as { role: string; content: string }[]).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content, viaAgentLoop: m.role !== 'user', parts: m.role === 'user' ? undefined : [{ type: 'text' as const, text: m.content }] })),
    });
    const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0)); };
    await conv.open('org1', SID);
    await flush();
    const s = sockets[0]!;
    s.onopen?.();
    s.push({ v: 1, t: 'ready', status: 'idle', rev: 1, epoch: 2, lastSeq: 0, mode: 'idle' });
    await flush();
    return { conv, messages, s, sockets, deposits, usage, timers, flush, reloads: () => reloads };
}

describe('conversation runtime', () => {
    test('texte, carte de plan, usage enregistré une fois, fin de tour', async () => {
        const h = await setup();
        h.s.push({ v: 1, t: 'status', epoch: 2, seq: 1, status: 'running' });
        h.s.push({ v: 1, t: 'text', epoch: 2, seq: 2, messageId: MID, delta: await sealed(MID, 'ws:text:2:2', 'Je propose') });
        h.s.push({ v: 1, t: 'tool_call', epoch: 2, seq: 3, messageId: MID, toolCallId: 'call_7', name: 'propose_actions', category: 'client', mutating: true, interactive: false, status: 'pending', args: await sealed(MID, 'tool_call_arguments:call_7', '{}') });
        h.s.push({ v: 1, t: 'usage', epoch: 2, seq: 4, messageId: MID, totalTokens: 40, promptTokens: 30, completionTokens: 10 });
        h.s.push({ v: 1, t: 'status', epoch: 2, seq: 5, status: 'awaiting_confirmation' });
        await h.flush();
        expect(h.conv.link.value).toBe('live');
        const turn = h.messages.value[1]!;
        expect(turn.role).toBe('assistant');
        expect(turn.parts).toEqual([{ type: 'text', text: 'Je propose' }, { type: 'plan', toolCallId: 'call_7' }]);
        expect(turn.usage?.totalTokens).toBe(40);
        expect(h.conv.planToolCallId.value).toBe('call_7');
        expect(h.usage).toEqual([{ sessionId: SID, messageId: MID }]);
        expect(h.conv.status.value).toBe('awaiting_confirmation');
        h.s.push({ v: 1, t: 'status', epoch: 2, seq: 6, status: 'idle' });
        await h.flush();
        expect(h.conv.status.value).toBe('idle');
    });

    test('message pendant le travail : en file, puis traité à la fin du tour', async () => {
        const h = await setup();
        h.s.push({ v: 1, t: 'status', epoch: 2, seq: 1, status: 'running' });
        await h.flush();
        expect(await h.conv.send('Et aussi')).toBe(true);
        const mine = h.messages.value[h.messages.value.length - 1]!;
        expect(mine).toMatchObject({ role: 'user', content: 'Et aussi', queued: true });
        const item = h.s.sent.find(f => f.t === 'message')!;
        expect(item.content).not.toBe('Et aussi'); // chiffré sous CK
        h.s.push({ v: 1, t: 'status', epoch: 2, seq: 2, status: 'idle' });
        await h.flush();
        expect(mine.queued).toBe(false);
    });

    test('confirmation, réponse et annulation partent par le socket', async () => {
        const h = await setup();
        await h.conv.confirm('call_1', true);
        await h.conv.confirm('call_2', false);
        await h.conv.answer('call_3', 'Oui');
        await h.conv.cancel();
        expect(h.s.sent.filter(f => f.t !== 'hello').map(f => [f.t, f.toolCallId ?? null, f.decision ?? null])).toEqual([
            ['confirm', 'call_1', 'accept'], ['confirm', 'call_2', 'reject'], ['answer', 'call_3', null], ['cancel', null, null],
        ]);
    });

    test('snapshot : le fil est remplacé, un plan en attente reste affiché, les deltas suivants s’y ajoutent', async () => {
        const h = await setup();
        const state = JSON.stringify({ messages: [{ role: 'user', content: 'Range tout' }, { role: 'assistant', content: 'Voici' }], status: 'running', pendingToolCall: { id: 'call_9', name: 'propose_actions', planId: 'p1', args: 'gcm1:x' } });
        h.s.push({ v: 1, t: 'snapshot', epoch: 3, seq: 4, state: await encryptAiFieldStrict(ck, SID, '__snapshot__', 'snapshot:3:4', state) });
        await h.flush();
        expect(h.messages.value.map(m => m.role)).toEqual(['user', 'assistant']);
        expect(h.messages.value[1]!.parts).toEqual([{ type: 'text', text: 'Voici' }, { type: 'plan', toolCallId: 'call_9' }]);
        expect(h.conv.planToolCallId.value).toBe('call_9');
        h.s.push({ v: 1, t: 'text', epoch: 3, seq: 5, messageId: MID, delta: await sealed(MID, 'ws:text:3:5', ' suite') });
        await h.flush();
        expect(h.messages.value).toHaveLength(2);
        expect(h.messages.value[1]!.parts![2]).toEqual({ type: 'text', text: ' suite' });
    });

    test('coupure : reprise, puis hors ligne = lecture seule, envoi refusé', async () => {
        const h = await setup();
        h.s.drop(1006);
        expect(h.conv.link.value).toBe('resuming');
        for (let i = 1; i <= 3; i++) {
            const t = h.timers.find(x => x.live && x.ms === backoffMs(i, 0.5));
            if (t) { t.live = false; t.fn(); await h.flush(); h.sockets[h.sockets.length - 1]!.drop(1006); }
        }
        await h.flush();
        expect(['resuming', 'offline']).toContain(h.conv.link.value);
        h.conv.close();
        expect(await h.conv.send('x')).toBe(false);
    });
});
