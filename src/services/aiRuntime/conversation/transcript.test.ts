import { describe, expect, test } from 'bun:test';
import { toAgentEvent, type RuntimeEvent } from './events';
import { applyAgentEvent, newTranscriptState, type TranscriptMessage } from './transcript';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';

const call = (status: string, over: Partial<Extract<RuntimeEvent, { t: 'tool_call' }>> = {}): RuntimeEvent => ({
    t: 'tool_call', messageId: 'm1', toolCallId: 'c1', name: 'web_search', category: 'client', mutating: false, interactive: false,
    status, args: { query: 'x y' }, ...over,
});

function toolAfter(...evs: RuntimeEvent[]): ToolStep | undefined {
    const msgs: TranscriptMessage[] = [];
    const st = newTranscriptState();
    for (const e of evs) {
        const a = toAgentEvent(e);
        if (a) applyAgentEvent(msgs, st, a);
    }
    const part = msgs[0]?.parts?.find(p => p.type === 'tool');
    return part && part.type === 'tool' ? part.tool : undefined;
}

describe('appel du runtime en attente de l’utilisateur (10 §4.4)', () => {
    test('web_search retenu par la garde (client, non mutant, `pending`) : à confirmer, jamais « en cours »', () => {
        expect(toAgentEvent(call('pending'))).toMatchObject({ type: 'tool_call_client_required', awaiting: true });
        expect(toolAfter(call('pending'))?.status).toBe('pending');
        expect(toolAfter(call('pending', { name: 'web_fetch', args: { url: 'https://a.example/' } }))?.status).toBe('pending');
    });

    test('appel automatique : le runtime l’émet `executing`, aucune confirmation', () => {
        expect(toAgentEvent(call('executing'))).toBeNull();
    });

    test('outil client non mutant d’une autre source (sans `awaiting`) : exécuté comme avant', () => {
        const msgs: TranscriptMessage[] = [];
        applyAgentEvent(msgs, newTranscriptState(), { type: 'tool_call_client_required', toolCallId: 'c', name: 'search_messages', args: {}, mutating: false, interactive: false });
        const p = msgs[0]!.parts![0]!;
        expect(p.type === 'tool' && p.tool.status).toBe('executing');
    });
});
