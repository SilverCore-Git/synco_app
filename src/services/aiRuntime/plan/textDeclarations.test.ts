import { describe, expect, test } from 'bun:test';
import td from '../../../../scripts/e2ee-vectors/text-declaration.json';
import { importEcdsaPrivate } from '../../../../scripts/e2ee-vectors/fixedRandom';
import { PlanGraph, type JsonObject } from '@/assets/utils/aiActionPlan';
import { parseTd } from '@/assets/utils/agentMessage';
import { buildTextDeclarations } from './textDeclarations';
import type { OpenedPlan } from '../actionPlan';

const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], b => parseInt(b, 16));

const opened = (actions: JsonObject[], executors: Array<'device' | 'agent'>): OpenedPlan => ({
    plan: { planId: td.ids.planId, sessionId: td.ids.sessionId, actions },
    graph: new PlanGraph(executors.map((executor, i) => ({ n: i + 1, executor, after: [] }))),
    digests: new Map(),
});

describe('textDeclarations de la décision (12 §10.7, étape 2)', () => {
    const actions: JsonObject[] = [
        { n: 1, kind: 'message.send', args: { threadId: td.ids.threadId, text: td.texts.T1 } },
        { n: 2, kind: 'message.edit', args: { messageId: td.ids.messageId, text: td.texts.T2 } },
        { n: 3, kind: 'message.send', args: { threadId: td.ids.threadId, text: 'appareil' } },
    ];
    const input = async () => ({ ck: fromHex(td.keys.ckHex), sessionId: td.ids.sessionId, orgId: td.ids.orgId, userId: td.ids.userId, userSignKey: await importEcdsaPrivate(fromHex(td.keys.userSignKey.privateScalarHex)) });

    test('une déclaration par message d’agent ACCEPTÉ, aucune pour l’appareil ni pour une action décochée', async () => {
        const out = await buildTextDeclarations(opened(actions, ['agent', 'agent', 'device']), [1, 3], await input());
        expect(out.map(d => d.n)).toEqual([1]);
        expect(parseTd(out[0]!.value)!.canonical).toBe(td.declarationCases[0]!.canonical);
    });
    test('sans clé de signature ou sans CK brute : refus, rien n’est envoyé', async () => {
        const base = await input();
        await expect(buildTextDeclarations(opened(actions, ['agent', 'agent', 'device']), [1], { ...base, userSignKey: null })).rejects.toThrow();
        const ck = await crypto.subtle.importKey('raw', base.ck as BufferSource, 'AES-GCM', false, ['encrypt']);
        await expect(buildTextDeclarations(opened(actions, ['agent', 'agent', 'device']), [1], { ...base, ck })).rejects.toThrow();
        expect(await buildTextDeclarations(opened(actions, ['device', 'device', 'device']), [1, 2], { ...base, userSignKey: null })).toEqual([]);
    });
});
