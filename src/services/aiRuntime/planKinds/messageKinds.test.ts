import { afterEach, describe, expect, mock, test } from 'bun:test';
import pk from '../../../../scripts/e2ee-vectors/plan-kinds.json';
import { PlanGraph, PlanInvalidError, ToolManifest, validatePlan, type JsonObject, type PlanContext } from '@/assets/utils/aiActionPlan';
import { MESSAGE_KIND_EXPORTS, MESSAGE_KIND_RISK, checkMessageKindArgs } from '@/assets/utils/agentMessagePlan';
import { openedOrg } from '@/assets/var';

mock.module('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }));

const { isPlanKindExecutor } = await import('./registry');
const { planClientTool, planKindDescription, setPlanKindModules } = await import('./index');
const { actionLabel, KIND_ICON, kindChip } = await import('../plan/planLabels');
const { buildAcceptDecision, planTargetDigests } = await import('../actionPlan');
const { DeviceNotSentError } = await import('../plan/deviceErrors');
const mods = {
    'message.send': (await import('./message.send')).default,
    'message.edit': (await import('./message.edit')).default,
    'dm.send': (await import('./dm.send')).default,
    'dm.edit': (await import('./dm.edit')).default,
};
const TOOL = { 'message.send': 'send_message', 'message.edit': 'edit_message', 'dm.send': 'send_dm', 'dm.edit': 'edit_dm' } as const;
const inject = () => setPlanKindModules(Object.fromEntries(Object.entries(mods).map(([k, m]) => [`./${k}.ts`, { default: m }])));
afterEach(() => setPlanKindModules(undefined));

const reference = (pk.validationCases[0] as unknown as { plan: { actions: JsonObject[] } }).plan.actions;
const ctx = (patch: Partial<PlanContext> = {}): PlanContext => ({
    sessionId: 's1', maxLifetimeSecs: 3600, manifest: new ToolManifest(), mode: 'ask', createThreadAsk: true,
    availableTools: new Set(Object.values(TOOL)), ...patch,
});
const plan = (...actions: JsonObject[]): JsonObject => ({
    v: 1, planId: 'p1', sessionId: 's1', toolCallId: 't1', createdAt: 1000, expiresAt: 2000, summary: 'x',
    actions: actions.map((a, i) => ({ n: i + 1, ...a })),
});
/** L'action de référence sans les listes (`mentionUserIds`, `fileIds`) que `ArgsSchema` ne sait pas exprimer. */
const scalar = (kind: string): JsonObject => {
    const a = reference.find(x => x.kind === kind)!;
    const { mentionUserIds: _m, fileIds: _f, ...args } = a.args as JsonObject;
    return { kind, args };
};

describe('kinds de message dans le registre planKinds (contrat L15g)', () => {
    for (const [kind, m] of Object.entries(mods)) {
        test(`${kind} : exécutant complet (schéma, exports, outil, libellés)`, () => {
            expect(isPlanKindExecutor(m)).toBe(true);
            expect(m.kind).toBe(kind);
            expect(m.tool).toBe(TOOL[kind as keyof typeof TOOL]);
            expect(m.schema).toBeInstanceOf(Map);
            expect(m.exports).toEqual([...MESSAGE_KIND_EXPORTS[kind as keyof typeof MESSAGE_KIND_EXPORTS]]);
            expect(typeof m.label!(scalar(kind).args as JsonObject)).toBe('string');
            expect(m.chip!(2)).toMatch(/^2 /);
            expect(m.icon).toMatch(/^bi-/);
            expect(m.title).toBeTruthy();
            expect(m.clientTools!.some(t => t.name === m.tool)).toBe(true);
        });
    }

    test('sorties exportées (12 §4.2) : id + threadId pour les salons, id + peerId pour dm.send, id pour dm.edit', () => {
        expect(mods['message.send'].exports).toEqual(['id', 'threadId']);
        expect(mods['message.edit'].exports).toEqual(['id', 'threadId']);
        expect(mods['dm.send'].exports).toEqual(['id', 'peerId']);
        expect(mods['dm.edit'].exports).toEqual(['id']);
    });

    test('risques fixes de 12 §4.2 (plan-kinds.json kindRisk)', () => {
        for (const r of pk.kindRisk.filter(k => k.kind in mods)) expect(MESSAGE_KIND_RISK[r.kind as keyof typeof MESSAGE_KIND_RISK]).toBe(r.risk as 'R1' | 'R2');
    });

    test('outils client : écriture, lecture et noms attendus', () => {
        inject();
        for (const name of ['send_message', 'forward_message', 'read_thread_messages', 'get_message', 'edit_message', 'send_dm', 'read_dm', 'edit_dm']) {
            const t = planClientTool(name);
            expect(t?.name).toBe(name);
            expect(t?.label).toBeTruthy();
            expect(t?.icon).toMatch(/^bi-/);
        }
        expect(mods['message.send'].clientTools!.map(t => t.name)).toEqual(['send_message', 'forward_message', 'read_thread_messages', 'get_message']);
        expect(mods['dm.send'].clientTools!.map(t => t.name)).toEqual(['send_dm', 'read_dm']);
    });

    test('libellés, icônes et puces viennent du registre ; le texte du modèle est neutralisé et borné', () => {
        inject();
        expect(actionLabel('message.send', undefined, { threadId: 'x', text: 'x'.repeat(200) })).toBe(`Écrire dans un salon : « ${'x'.repeat(80)}… »`);
        expect(actionLabel('message.send', undefined, { threadId: 'x', text: 'a‮b\nc', forwardOf: 'm' })).toBe('Transférer un message dans un salon');
        expect(actionLabel('dm.send', undefined, { peerId: 'u2', text: 'Sa‮lut\n!' })).toBe('Message privé : « Sa lut ! »');
        expect(KIND_ICON['dm.edit']).toBe('bi-pencil');
        expect(kindChip('message.send', undefined, 3)).toBe('3 messages');
    });
});

describe('validatePlan : plan avec message.send / dm.send', () => {
    test('les quatre kinds sont acceptés (action de référence du vecteur, sans listes)', () => {
        inject();
        for (const kind of Object.keys(mods)) expect(validatePlan(plan(scalar(kind)), ctx())).toBeDefined();
        expect(validatePlan(plan(scalar('message.send'), scalar('dm.send')), ctx()).actions).toHaveLength(2);
    });

    test('refusé si l’outil est deny pour l’org (absent d’availableTools) : plan_kind', () => {
        inject();
        for (const kind of ['message.send', 'dm.send', 'message.edit', 'dm.edit'] as const) {
            const without = new Set(Object.values(TOOL).filter(t => t !== TOOL[kind]));
            expect(() => validatePlan(plan(scalar(kind)), ctx({ availableTools: without }))).toThrow(PlanInvalidError);
            expect(() => validatePlan(plan(scalar(kind)), ctx({ availableTools: undefined }))).toThrow(PlanInvalidError);
        }
    });

    test('non déclarés : refusés', () => {
        expect(() => validatePlan(plan(scalar('message.send')), ctx())).toThrow(PlanInvalidError);
        expect(planKindDescription('dm.send')).toBeUndefined();
    });

    test('champ inconnu, id invalide, texte hors bornes : refusés', () => {
        inject();
        const base = scalar('message.send').args as JsonObject;
        expect(() => validatePlan(plan({ kind: 'message.send', args: { ...base, inconnu: 1 } }), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(plan({ kind: 'message.send', args: { ...base, threadId: 'a b' } }), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(plan({ kind: 'message.send', args: { ...base, text: 'x'.repeat(8001) } }), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(plan({ kind: 'dm.send', args: { peerId: 'cm3userexample00000000002', text: '' } }), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(plan({ kind: 'message.edit', args: { text: 'x' } }), ctx())).toThrow(PlanInvalidError);
    });

    test('un transfert (commentaire vide) et un message d’un salon donné par argsRefs sont admis', () => {
        inject();
        expect(validatePlan(plan({ kind: 'message.send', args: { threadId: 'cm3threadexample000000001', text: '', forwardOf: 'cm3messageexample00000001' } }), ctx())).toBeDefined();
        const threadCreate: JsonObject = { kind: 'thread.create', args: { name: 'budget', type: 'text' } };
        const send: JsonObject = { kind: 'message.send', args: { text: 'Bonjour' }, argsRefs: { threadId: '$1.id' }, after: [1] };
        expect(validatePlan(plan(threadCreate, send), ctx())).toBeDefined();
    });
});

describe('exécution : refus locaux avant tout envoi', () => {
    test('arguments hors §4.2 : DeviceNotSentError invalid_args', async () => {
        await expect(mods['message.send'].execute({ threadId: 'cm3threadexample000000001', text: '' }, 'p/1', 'o')).rejects.toBeInstanceOf(DeviceNotSentError);
        await expect(mods['dm.send'].execute({ peerId: 'cm3userexample00000000002', text: 'x', fileIds: ['a', 'a'] }, 'p/1', 'o')).rejects.toBeInstanceOf(DeviceNotSentError);
        await expect(mods['message.edit'].execute({ messageId: 'x y', text: 'x' }, 'p/1', 'o')).rejects.toBeInstanceOf(DeviceNotSentError);
    });

    test('org de la conversation ≠ org ouverte : refusé, jamais envoyé', async () => {
        openedOrg.value = null;
        const args = scalar('message.send').args as JsonObject;
        await expect(mods['message.send'].execute(args, 'p/1', 'org-1')).rejects.toMatchObject({ message: 'org_mismatch' });
        await expect(mods['dm.edit'].execute(scalar('dm.edit').args as JsonObject, 'p/4', 'org-1')).rejects.toMatchObject({ message: 'org_mismatch' });
        for (const name of ['send_message', 'read_thread_messages', 'get_message', 'read_dm', 'send_dm', 'edit_dm', 'edit_message', 'forward_message']) {
            inject();
            await expect(planClientTool(name)!.run({ threadId: 'cm3threadexample000000001', peerId: 'cm3userexample00000000002' }, { orgId: 'org-1' })).rejects.toMatchObject({ message: 'org_mismatch' });
        }
    });

    test('args de référence : l’exécutant et le worker partagent la même validation', () => {
        for (const kind of Object.keys(mods)) expect(checkMessageKindArgs({ ...reference.find(a => a.kind === kind)! })).toBe(true);
    });
});

describe('condensats de cible à la décision (12 §8.4 point 6)', () => {
    const digests = pk.targetDigests as Array<{ name: string; input: { kind: string; target: Record<string, string>; argsRefs?: Record<string, string> }; sha256Hex: string }>;
    const byName = (n: string) => digests.find(d => d.name === n)!;

    test('message.send, message.edit d’agent : empreinte = vecteur ; action d’appareil : aucune', async () => {
        const p = plan(
            { kind: 'message.send', args: { threadId: 'cm3threadexample000000001', text: 'Bonjour' } },
            { kind: 'message.send', args: { threadId: 'cm3threadexample000000001', text: 'Re', replyTo: 'cm3messageexample00000001' } },
            { kind: 'message.edit', args: { text: 'Corrigé' }, argsRefs: { messageId: '$1.id' }, after: [1] },
            { kind: 'message.edit', args: { messageId: 'cm3messageexample00000001', text: 'Corrigé' } },
        );
        const graph = new PlanGraph([
            { n: 1, executor: 'agent', after: [] }, { n: 2, executor: 'agent', after: [] },
            { n: 3, executor: 'agent', after: [1] }, { n: 4, executor: 'device', after: [] },
        ]);
        const got = await planTargetDigests(p, graph);
        expect([...got.keys()]).toEqual([1, 2, 3]);
        expect(got.get(1)).toBe(byName('message.send').sha256Hex);
        expect(got.get(2)).toBe(byName('message.send en réponse').sha256Hex);
        expect(got.get(3)).toBe(byName('message.edit par argsRefs (cible vide)').sha256Hex);
    });

    test('buildAcceptDecision : empreinte de cible jointe aux actions acceptées, retirée avec la cascade', async () => {
        const p = plan(
            { kind: 'message.send', args: { threadId: 'cm3threadexample000000001', text: 'Bonjour' } },
            { kind: 'message.edit', args: { text: 'Corrigé' }, argsRefs: { messageId: '$1.id' }, after: [1] },
        );
        const graph = new PlanGraph([{ n: 1, executor: 'agent', after: [] }, { n: 2, executor: 'agent', after: [1] }]);
        const opened = { plan: p, graph, digests: await planTargetDigests(p, graph) };
        expect(buildAcceptDecision(opened, [1, 2]).serverDigests).toEqual([
            { n: 1, sha256Hex: byName('message.send').sha256Hex },
            { n: 2, sha256Hex: byName('message.edit par argsRefs (cible vide)').sha256Hex },
        ]);
        expect(() => buildAcceptDecision(opened, [2])).toThrow();
    });
});
