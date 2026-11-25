import { afterEach, describe, expect, mock, test } from 'bun:test';
import pk from '../../../../scripts/e2ee-vectors/plan-kinds.json';
import { PlanInvalidError, ToolManifest, validatePlan, type JsonObject, type PlanContext } from '@/assets/utils/aiActionPlan';
import { isAutoAcceptable } from '@/services/aiAutoAccept';
import { openedOrg } from '@/assets/var';

mock.module('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }));

const { isPlanKindExecutor } = await import('./registry');
const { planClientTool, planKindDescription, setPlanKindModules } = await import('./index');
const { actionLabel, KIND_ICON, kindChip } = await import('../plan/planLabels');
const { isSensitiveAction } = await import('../plan/planModel');
const { DeviceNotSentError } = await import('../plan/deviceErrors');
const { checkSupportKindArgs, toSupportView, boundSupportViews, supportPageRequest } = await import('../agentSupport');
const mods = {
    'support.create': (await import('./support.create')).default,
    'support.reply': (await import('./support.reply')).default,
};
const TOOL = { 'support.create': 'create_support_ticket', 'support.reply': 'reply_support_ticket' } as const;
const inject = () => setPlanKindModules(Object.fromEntries(Object.entries(mods).map(([k, m]) => [`./${k}.ts`, { default: m }])));
afterEach(() => { setPlanKindModules(undefined); openedOrg.value = null; });

const reference = (pk.validationCases[0] as unknown as { plan: { actions: JsonObject[] } }).plan.actions;
const ctx = (patch: Partial<PlanContext> = {}): PlanContext => ({
    sessionId: 's1', maxLifetimeSecs: 3600, manifest: new ToolManifest(), mode: 'ask', createThreadAsk: true,
    availableTools: new Set(Object.values(TOOL)), ...patch,
});
const plan = (...actions: JsonObject[]): JsonObject => ({
    v: 1, planId: 'p1', sessionId: 's1', toolCallId: 't1', createdAt: 1000, expiresAt: 2000, summary: 'x',
    actions: actions.map((a, i) => ({ n: i + 1, ...a })),
});
const scalar = (kind: string): JsonObject => ({ kind, args: reference.find(x => x.kind === kind)!.args as JsonObject });
const TICKET = 'cm3ticketexample000000001';

describe('kinds de support dans le registre planKinds (contrat L15g)', () => {
    for (const [kind, m] of Object.entries(mods)) {
        test(`${kind} : exécutant complet (schéma, exports, outil, libellés)`, () => {
            expect(isPlanKindExecutor(m)).toBe(true);
            expect(m.kind).toBe(kind);
            expect(m.tool).toBe(TOOL[kind as keyof typeof TOOL]);
            expect(m.schema).toBeInstanceOf(Map);
            expect(m.exports).toEqual(['id']);
            expect(typeof m.label!(scalar(kind).args as JsonObject)).toBe('string');
            expect(m.chip!(2)).toMatch(/^2 /);
            expect(m.icon).toMatch(/^bi-/);
            expect(m.title).toBeTruthy();
            expect(m.clientTools!.some(t => t.name === TOOL[kind as keyof typeof TOOL])).toBe(true);
        });
    }

    test('outils client : écriture et lecture, aucun outil de modification, suppression ni réaction (EX-17)', () => {
        inject();
        const names = [...mods['support.create'].clientTools!, ...mods['support.reply'].clientTools!].map(t => t.name);
        expect(names).toEqual(['create_support_ticket', 'reply_support_ticket', 'read_support_ticket']);
        for (const n of names) expect(planClientTool(n)?.label).toBeTruthy();
        expect(planClientTool('edit_support_message')).toBeUndefined();
        expect(planClientTool('delete_support_message')).toBeUndefined();
        expect(planClientTool('react_support_message')).toBeUndefined();
    });

    test('risque R4 du vecteur : sensible, jamais précoché, jamais « Toujours accepter » (PC42)', () => {
        for (const r of pk.kindRisk.filter(k => k.kind in mods)) {
            expect(r.risk).toBe('R4');
            expect(r.sensitive).toBe(true);
            expect(r.prechecked).toBe(false);
            expect(r.autoAcceptAllowed).toBe(false);
            expect(isSensitiveAction(r.kind, undefined, [])).toBe(true);
            expect(isAutoAcceptable(r.kind)).toBe(false);
        }
    });

    test('libellés : le destinataire est l’équipe de Synco hors de l’org ; le texte du modèle est neutralisé et borné', () => {
        inject();
        expect(actionLabel('support.create', undefined, { subject: 'Export‮ KO\nvite', text: 'x' })).toBe('Écrire à l’équipe Synco (hors de l’organisation) : « Export KO vite »');
        expect(actionLabel('support.reply', undefined, { ticketId: TICKET, text: 'x'.repeat(200) })).toContain(`« ${'x'.repeat(80)}… »`);
        expect(KIND_ICON['support.create']).toBe('bi-life-preserver');
        expect(kindChip('support.reply', undefined, 3)).toBe('3 réponses au support');
    });
});

describe('validatePlan : plan avec support.create / support.reply', () => {
    test('les deux kinds sont acceptés (actions de référence du vecteur)', () => {
        inject();
        for (const kind of Object.keys(mods)) expect(validatePlan(plan(scalar(kind)), ctx())).toBeDefined();
    });

    test('réponse à un ticket créé plus haut : ticketId par argsRefs', () => {
        inject();
        const create = scalar('support.create');
        const reply: JsonObject = { kind: 'support.reply', args: { text: 'Suite' }, argsRefs: { ticketId: '$1.id' }, after: [1] };
        expect(validatePlan(plan(create, reply), ctx()).actions).toHaveLength(2);
    });

    test('non déclarés : refusés ; outil deny pour l’org : plan_kind', () => {
        expect(() => validatePlan(plan(scalar('support.create')), ctx())).toThrow(PlanInvalidError);
        expect(planKindDescription('support.reply')).toBeUndefined();
        inject();
        for (const kind of Object.keys(mods) as Array<keyof typeof TOOL>) {
            const without = new Set(Object.values(TOOL).filter(t => t !== TOOL[kind]));
            expect(() => validatePlan(plan(scalar(kind)), ctx({ availableTools: without }))).toThrow(PlanInvalidError);
        }
    });

    test('champ inconnu, id invalide, bornes : refusés', () => {
        inject();
        const create = (args: JsonObject) => plan({ kind: 'support.create', args });
        expect(() => validatePlan(create({ subject: 's', text: 't', organizationId: 'o' }), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(create({ subject: '', text: 't' }), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(create({ subject: 'x'.repeat(201), text: 't' }), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(create({ subject: 's', text: 'x'.repeat(8001) }), ctx())).toThrow(PlanInvalidError);
        expect(validatePlan(create({ subject: 'x'.repeat(200), text: 'x'.repeat(8000) }), ctx())).toBeDefined();
        const reply = (args: JsonObject) => plan({ kind: 'support.reply', args });
        expect(() => validatePlan(reply({ ticketId: 'a b', text: 't' }), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(reply({ text: 't' }), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(reply({ ticketId: TICKET, text: '' }), ctx())).toThrow(PlanInvalidError);
    });
});

describe('exécution : refus locaux avant tout envoi', () => {
    test('arguments hors §4.2 : DeviceNotSentError invalid_args', async () => {
        await expect(mods['support.create'].execute({ subject: '', text: 'x' }, 'p/1', 'o')).rejects.toBeInstanceOf(DeviceNotSentError);
        await expect(mods['support.create'].execute({ subject: 's', text: 'x', extra: 'y' }, 'p/1', 'o')).rejects.toBeInstanceOf(DeviceNotSentError);
        await expect(mods['support.reply'].execute({ ticketId: 'a b', text: 'x' }, 'p/1', 'o')).rejects.toBeInstanceOf(DeviceNotSentError);
    });

    test('org de la conversation ≠ org ouverte : refusé, jamais envoyé (kinds et outils client)', async () => {
        openedOrg.value = null;
        await expect(mods['support.create'].execute(scalar('support.create').args as JsonObject, 'p/1', 'org-1')).rejects.toMatchObject({ message: 'org_mismatch' });
        await expect(mods['support.reply'].execute(scalar('support.reply').args as JsonObject, 'p/2', 'org-1')).rejects.toMatchObject({ message: 'org_mismatch' });
        inject();
        for (const name of ['create_support_ticket', 'reply_support_ticket', 'read_support_ticket']) {
            await expect(planClientTool(name)!.run({ subject: 's', text: 't', ticketId: TICKET }, { orgId: 'org-1' })).rejects.toMatchObject({ message: 'org_mismatch' });
        }
    });

    test('contrôle d’arguments partagé avec le schéma : mêmes bornes', () => {
        expect(checkSupportKindArgs('support.create', { subject: 'a', text: 'b' })).toBe(true);
        expect(checkSupportKindArgs('support.create', { subject: 'a'.repeat(201), text: 'b' })).toBe(false);
        expect(checkSupportKindArgs('support.create', { subject: 'a', text: 'b'.repeat(8001) })).toBe(false);
        expect(checkSupportKindArgs('support.create', { subject: 'a', text: '\ud800' })).toBe(false);
        expect(checkSupportKindArgs('support.create', { subject: 'a', text: 'b', ticketId: TICKET })).toBe(false);
        expect(checkSupportKindArgs('support.reply', { ticketId: TICKET, text: 'b' })).toBe(true);
        expect(checkSupportKindArgs('support.reply', { text: 'b' })).toBe(false);
        expect(checkSupportKindArgs('support.reply', { ticketId: TICKET, text: 'b', channel: 'INTERNAL' })).toBe(false);
        for (const kind of Object.keys(mods)) expect(checkSupportKindArgs(kind as 'support.create', scalar(kind).args as JsonObject)).toBe(true);
    });
});

describe('lecture : vue des échanges', () => {
    test('un message de l’équipe est repéré et nommé, le mien aussi ; texte long coupé', () => {
        const mine = toSupportView({ id: 'm1', senderId: 'me', sender: { name: 'Moi' }, createdAt: '2026-11-25T10:00:00Z', content: 'bonjour' }, 'me');
        const team = toSupportView({ id: 'm2', senderId: 'mod', sender: { name: 'Agent Synco' }, createdAt: '2026-11-25T10:05:00Z', content: 'x'.repeat(5000) }, 'me');
        expect(mine.from).toBe('me');
        expect(team.from).toBe('team');
        expect(team.senderName).toBe('Agent Synco');
        expect(team.cut).toBe(true);
        expect(team.text.length).toBe(4000);
    });

    test('borné à 64 Kio, les plus récents gardés', () => {
        const views = Array.from({ length: 200 }, (_, i) => toSupportView({ id: `m${i}`, senderId: 'mod', sender: { name: 'A' }, createdAt: '2026-11-25T10:00:00Z', content: 'x'.repeat(3000) }, 'me'));
        const b = boundSupportViews(views);
        expect(b.truncated).toBe(true);
        expect(b.messages.at(-1)!.id).toBe('m199');
        expect(JSON.stringify(b.messages).length).toBeLessThan(64 * 1024);
    });
});

describe('lecture : sans rejoindre la salle du ticket', () => {
    test('toujours support:load-more, jamais support:join (le socket partagé garde ses autres salles)', () => {
        expect(supportPageRequest(TICKET)).toEqual({ event: 'support:load-more', payload: { ticketId: TICKET, channel: 'PUBLIC' } });
        expect(supportPageRequest(TICKET, 'm9')).toEqual({ event: 'support:load-more', payload: { ticketId: TICKET, channel: 'PUBLIC', before: 'm9' } });
        expect(supportPageRequest(TICKET).payload.channel).toBe('PUBLIC');
    });
});
