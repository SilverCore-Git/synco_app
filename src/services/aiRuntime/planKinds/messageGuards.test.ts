import { afterEach, describe, expect, mock, test } from 'bun:test';
import pk from '../../../../scripts/e2ee-vectors/plan-kinds.json';
import { ToolManifest, encryptPlan, parseArgRef, validatePlan, type JsonObject, type PlanContext } from '@/assets/utils/aiActionPlan';
import { openedOrg } from '@/assets/var';
import type { Org } from '@/types/types';

mock.module('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }));

const { setPlanKindModules, planClientTool } = await import('./index');
const { buildAcceptDecision, openPlan } = await import('../actionPlan');
const { AiRuntimeError } = await import('../errors');
const mods = {
    'message.send': (await import('./message.send')).default,
    'message.edit': (await import('./message.edit')).default,
    'dm.send': (await import('./dm.send')).default,
    'dm.edit': (await import('./dm.edit')).default,
};
const inject = () => setPlanKindModules(Object.fromEntries(Object.entries(mods).map(([k, m]) => [`./${k}.ts`, { default: m }])));
afterEach(() => { setPlanKindModules(undefined); openedOrg.value = null; });

const SESSION = '0f0e0d0c-0b0a-4908-8706-050403020100';
const THREAD = 'cm3threadexample000000001';
const OTHER_THREAD = 'cm3threadexample000000009';
const MSG = 'cm3messageexample00000001';
const ctx = (patch: Partial<PlanContext> = {}): PlanContext => ({
    sessionId: SESSION, maxLifetimeSecs: 604_800, manifest: new ToolManifest(), mode: 'auto', createThreadAsk: true,
    availableTools: new Set(['send_message', 'forward_message', 'edit_message', 'send_dm', 'edit_dm']), ...patch,
});
const plan = (...actions: JsonObject[]): JsonObject => ({
    v: 1, planId: '6c2d3e4f-5061-4b72-8c83-a4b5c6d7e8f9', sessionId: SESSION, toolCallId: 'call_9', createdAt: 1_795_000_000, expiresAt: 1_795_000_900, summary: 'x',
    actions: actions.map((a, i) => ({ n: i + 1, ...a })),
});
const send = (args: JsonObject = {}, extra: JsonObject = {}): JsonObject => ({ kind: 'message.send', args: { threadId: THREAD, text: 'Bonjour', ...args }, ...extra });
const executors = (p: JsonObject, c: PlanContext) => validatePlan(p, c).actions.map(a => a.executor);

describe('parseArgRef : sorties threadId et peerId (12 §4.2)', () => {
    test('acceptées ; champ inconnu, zéro de tête et forme libre refusés', () => {
        expect(parseArgRef('$1.id')).toEqual({ m: 1, field: 'id' });
        expect(parseArgRef('$2.spaceId')).toEqual({ m: 2, field: 'spaceId' });
        expect(parseArgRef('$3.threadId')).toEqual({ m: 3, field: 'threadId' });
        expect(parseArgRef('$4.peerId')).toEqual({ m: 4, field: 'peerId' });
        for (const bad of ['$1.text', '$01.id', '$0.id', '$1.threadid', '1.id', '$1.id ', '$1000.id']) expect(parseArgRef(bad)).toBeNull();
    });

    test('un plan peut viser $m.threadId (exports du kind) et refuse un champ non exporté', () => {
        inject();
        const first = send();
        const viaThread: JsonObject = { kind: 'message.send', args: { text: 'Re' }, argsRefs: { threadId: '$1.threadId' }, after: [1] };
        expect(validatePlan(plan(first, viaThread), ctx({ mode: 'plan' }))).toBeDefined();
        const bad: JsonObject = { kind: 'message.send', args: { text: 'Re' }, argsRefs: { threadId: '$1.peerId' }, after: [1] };
        expect(() => validatePlan(plan(first, bad), ctx({ mode: 'plan' }))).toThrow();
    });
});

describe('exécutant des message.* (12 §4.2, §10.7) : agent seulement si les conditions sont réunies', () => {
    test('mode plan (non autonome) : toujours l’appareil ; MP : toujours l’appareil, même autonome', () => {
        inject();
        expect(executors(plan(send()), ctx({ mode: 'plan' }))).toEqual(['device']);
        expect(executors(plan({ kind: 'dm.send', args: { peerId: 'cm3userexample00000000002', text: 'x' } }), ctx())).toEqual(['device']);
        expect(executors(plan({ kind: 'dm.edit', args: { dmMessageId: 'cm3dmmessageexample000001', text: 'x' } }), ctx())).toEqual(['device']);
    });

    test('mode autonome : message.send → agent ; avec fichier ou transfert → appareil', () => {
        inject();
        expect(executors(plan(send()), ctx())).toEqual(['agent']);
        expect(executors(plan(send({ mentionUserIds: ['cm3userexample00000000002'] })), ctx())).toEqual(['agent']);
        expect(executors(plan(send({ fileIds: ['cm3fileexample00000000001'] })), ctx())).toEqual(['device']);
        expect(executors(plan(send({ text: '', forwardOf: MSG })), ctx())).toEqual(['device']);
    });

    test('plan avec $m dans le texte (argsRefs hors cible) → appareil', () => {
        inject();
        const first: JsonObject = { kind: 'file.create_text', args: { spaceId: 'cm3spaceexample0000000001', name: 'a.md' } };
        const second: JsonObject = { kind: 'message.send', args: { threadId: THREAD }, argsRefs: { text: '$1.id' }, after: [1] };
        expect(executors(plan(first, second), ctx())).toEqual(['device', 'device']);
        // Un autre champ hors cible visé par argsRefs (forwardOf) passe à l'appareil.
        const viaForward: JsonObject = { kind: 'message.send', args: { threadId: THREAD, text: '' }, argsRefs: { forwardOf: '$1.id' }, after: [1] };
        expect(executors(plan(send(), viaForward), ctx())).toEqual(['agent', 'device']);
    });

    test('argsRefs limité à threadId / replyTo : agent', () => {
        inject();
        const create: JsonObject = { kind: 'thread.create', args: { name: 'budget', type: 'text' } };
        const s: JsonObject = { kind: 'message.send', args: { text: 'Bonjour' }, argsRefs: { threadId: '$1.id' }, after: [1] };
        expect(executors(plan(create, s), ctx({ createThreadAsk: true }))).toEqual(['agent', 'agent']);
    });

    test('message.edit : appareil par défaut ; agent si le message est de l’agent (contexte) ou vient d’un message.send d’agent', () => {
        inject();
        const edit: JsonObject = { kind: 'message.edit', args: { messageId: MSG, text: 'Corrigé' } };
        expect(executors(plan(edit), ctx())).toEqual(['device']);
        expect(executors(plan(edit), ctx({ runtimeAuthoredMessages: new Set([MSG]) }))).toEqual(['agent']);
        expect(executors(plan(edit), ctx({ runtimeAuthoredMessages: new Set([MSG]), mode: 'plan' }))).toEqual(['device']);
        const viaRef: JsonObject = { kind: 'message.edit', args: { text: 'Corrigé' }, argsRefs: { messageId: '$1.id' }, after: [1] };
        expect(executors(plan(send(), viaRef), ctx())).toEqual(['agent', 'agent']);
        expect(executors(plan(send({ fileIds: ['cm3fileexample00000000001'] }), viaRef), ctx())).toEqual(['device', 'device']);
    });
});

describe('de bout en bout : plan autonome → agent → condensat de cible dans la décision', () => {
    const ck = new Uint8Array(32).fill(7);
    const digestOf = (name: string) => (pk.targetDigests as Array<{ name: string; sha256Hex: string }>).find(d => d.name === name)!.sha256Hex;
    const open = async (p: JsonObject, served: Array<{ n: number; executor: 'agent' | 'device'; after: number[] }>, digests: Record<string, string>) => openPlan({
        ck, pendingToolCall: { id: 'call_9', name: 'propose_actions', planId: p.planId as string, args: await encryptPlan(ck, p) },
        view: { planId: p.planId as string, sessionId: SESSION, toolCallId: 'call_9', status: 'proposed', actionCount: served.length, serverDigests: digests, actions: served, agentResults: [] },
        context: ctx(), knownLocalId: () => true,
    });

    test('message.send d’agent : empreinte de cible recalculée et jointe à la décision ; l’API n’en dépose pas d’autre', async () => {
        inject();
        const p = plan(send());
        const opened = await open(p, [{ n: 1, executor: 'agent', after: [] }], { '1': digestOf('message.send') });
        expect(opened.graph.actions[0]!.executor).toBe('agent');
        expect(buildAcceptDecision(opened, [1]).serverDigests).toEqual([{ n: 1, sha256Hex: digestOf('message.send') }]);
        // Empreinte déposée différente : refusée avant toute exécution (PC69).
        await expect(open(p, [{ n: 1, executor: 'agent', after: [] }], { '1': '0'.repeat(64) })).rejects.toBeInstanceOf(AiRuntimeError);
    });

    test('message.send d’appareil (fichier joint) : aucune empreinte ; un graphe servi « agent » est refusé', async () => {
        inject();
        const p = plan(send({ fileIds: ['cm3fileexample00000000001'] }));
        const opened = await open(p, [{ n: 1, executor: 'device', after: [] }], {});
        expect(buildAcceptDecision(opened, [1]).serverDigests).toEqual([]);
        await expect(open(p, [{ n: 1, executor: 'agent', after: [] }], { '1': digestOf('message.send') })).rejects.toBeInstanceOf(AiRuntimeError);
    });

    test('message.send puis message.edit par argsRefs : deux empreintes, la seconde à cible vide', async () => {
        inject();
        const edit: JsonObject = { kind: 'message.edit', args: { text: 'Corrigé' }, argsRefs: { messageId: '$1.id' }, after: [1] };
        const p = plan(send(), edit);
        const opened = await open(p, [{ n: 1, executor: 'agent', after: [] }, { n: 2, executor: 'agent', after: [1] }], {
            '1': digestOf('message.send'), '2': digestOf('message.edit par argsRefs (cible vide)'),
        });
        expect(buildAcceptDecision(opened, [1, 2]).serverDigests.map(d => d.n)).toEqual([1, 2]);
    });
});

describe('garde d’org côté appareil : salon et interlocuteur recoupés avec l’org de la conversation', () => {
    const org = (id: string, threadIds: string[], members: string[]): Org => ({
        id, name: id, logo: null, ownerId: 'o', stats: { memberCount: members.length, onlineCount: 0 }, maxUsers: 1, maxStorage: 1, features: [],
        home: { categories: [], threads: threadIds.slice(0, 1).map(i => ({ id: i })) as never },
        spaces: [{ id: 's', orgId: id, name: 's', logo: null, ownerId: 'o', membersId: [], categories: [{ id: 'c', index: 0, name: 'c', ownerId: 'o', membersId: [], threads: threadIds.slice(1).map(i => ({ id: i })) as never }], threads: [] }],
        members: members.map(userId => ({ userId, user: { name: userId } })) as never,
    }) as unknown as Org;
    const refused = (p: Promise<unknown>, message: string) => expect(p).rejects.toMatchObject({ message });

    test('salon d’une autre org (ou inconnu de l’annuaire) : refusé avant tout envoi, écriture, lecture et transfert', async () => {
        inject();
        openedOrg.value = org('org-1', [THREAD, 'cm3threadexample000000002'], ['cm3userexample00000000002']);
        // Org de la conversation ≠ org ouverte.
        await refused(mods['message.send'].execute({ threadId: THREAD, text: 'x' }, 'p/1', 'org-2'), 'org_mismatch');
        // Salon qui n'est pas de l'org.
        await refused(mods['message.send'].execute({ threadId: OTHER_THREAD, text: 'x' }, 'p/1', 'org-1'), 'thread_not_in_org');
        await refused(planClientTool('send_message')!.run({ threadId: OTHER_THREAD, text: 'x' }, { orgId: 'org-1' }), 'thread_not_in_org');
        await refused(planClientTool('forward_message')!.run({ toThreadId: OTHER_THREAD, messageId: MSG, comment: '' }, { orgId: 'org-1' }), 'thread_not_in_org');
        await refused(planClientTool('read_thread_messages')!.run({ threadId: OTHER_THREAD }, { orgId: 'org-1' }), 'thread_not_in_org');
    });

    test('interlocuteur hors de l’org : refusé (envoi et lecture de MP)', async () => {
        inject();
        openedOrg.value = org('org-1', [THREAD], ['cm3userexample00000000002']);
        await refused(mods['dm.send'].execute({ peerId: 'cm3userexample00000000009', text: 'x' }, 'p/1', 'org-1'), 'peer_not_in_org');
        await refused(planClientTool('send_dm')!.run({ peerId: 'cm3userexample00000000009', text: 'x' }, { orgId: 'org-1' }), 'peer_not_in_org');
        await refused(planClientTool('read_dm')!.run({ peerId: 'cm3userexample00000000009' }, { orgId: 'org-1' }), 'peer_not_in_org');
    });
});
