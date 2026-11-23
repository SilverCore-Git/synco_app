import { describe, expect, test } from 'bun:test';
import type { PlanActionModel, PlanModel } from './planModel';
import { actionKey, autoAcceptAfterPolicy, canAutoAccept, policyAllows } from './planAutoAccept';
import { readAutoAcceptPolicy } from './planEnv';

const act = (n: number, kind: string, tool?: string, sensitive = false): PlanActionModel => ({ n, kind, tool, args: {}, after: [], executor: 'device', level: 1, sensitive, label: `a${n}`, place: null });
const plan = (...actions: PlanActionModel[]): PlanModel => ({ planId: 'p', sessionId: 's', summary: '', createdAt: 0, expiresAt: 0, groups: [], actions, maxLevel: 1, dependents: actions.map(() => []) });

describe('« Toujours accepter » sur un plan', () => {
    const saved = ['thread.create', 'folder.create', 'server.call:create_task'];
    test('clé d’une action', () => {
        expect(actionKey(act(1, 'thread.create'))).toBe('thread.create');
        expect(actionKey(act(1, 'server.call', 'create_task'))).toBe('server.call:create_task');
    });
    test('petit plan dont toutes les actions sont enregistrées : accepté sans clic', () => {
        expect(canAutoAccept(plan(act(1, 'thread.create'), act(2, 'server.call', 'create_task')), saved, [], true)).toBe(true);
    });
    test('une action hors liste : clic demandé', () => {
        expect(canAutoAccept(plan(act(1, 'thread.create'), act(2, 'file.create_text')), saved)).toBe(false);
    });
    test('action sensible : jamais, même si son nom est dans le réglage stocké', () => {
        expect(canAutoAccept(plan(act(1, 'server.call', 'delete_task', true)), ['server.call:delete_task'], [], true)).toBe(false);
        expect(canAutoAccept(plan(act(1, 'server.call', 'create_email_report', true)), ['server.call:create_email_report'], [], true)).toBe(false);
    });
    test('drapeau sensible du manifeste : l’emporte sur la liste', () => {
        expect(canAutoAccept(plan(act(1, 'server.call', 'create_task')), saved, [{ name: 'create_task', sensitive: true }], true)).toBe(false);
    });
    test('PC76 : plus de 5 actions, le graphe est obligatoire', () => {
        expect(canAutoAccept(plan(...[1, 2, 3, 4, 5, 6].map(n => act(n, 'thread.create'))), saved)).toBe(false);
        expect(canAutoAccept(plan(...[1, 2, 3, 4, 5].map(n => act(n, 'thread.create'))), saved, [], true)).toBe(true);
    });
    test('liste vide ou plan vide : jamais', () => {
        expect(canAutoAccept(plan(act(1, 'thread.create')), [])).toBe(false);
        expect(canAutoAccept(plan(), saved)).toBe(false);
    });
    test('politique d’org : refusée ou inconnue, jamais d’acceptation sans clic', () => {
        const p = plan(act(1, 'thread.create'));
        expect(canAutoAccept(p, saved, [], false)).toBe(false);
        expect(canAutoAccept(p, saved)).toBe(false);
        expect(policyAllows('allowed')).toBe(true);
        expect(policyAllows('denied')).toBe(false);
        expect(policyAllows('unknown')).toBe(false);
    });
    test('droit retiré : la liste locale est vidée ; lecture échouée : conservée', () => {
        expect(autoAcceptAfterPolicy('denied', saved)).toEqual([]);
        expect(autoAcceptAfterPolicy('unknown', saved)).toEqual(saved);
        expect(autoAcceptAfterPolicy('allowed', saved)).toEqual(saved);
    });
    test('lecture de la politique : allowed, denied, et échec fermé', async () => {
        const mk = (res: () => Promise<{ status: number; body: unknown }>) => ({ request: res });
        const ok = (allowed: boolean) => mk(async () => ({ status: 200, body: { features: [{ feature: 'tool_auto_accept', allowed, enabled: true }] } }));
        expect(await readAutoAcceptPolicy(ok(true), 'o')).toBe('allowed');
        expect(await readAutoAcceptPolicy(ok(false), 'o')).toBe('denied');
        expect(await readAutoAcceptPolicy(mk(async () => ({ status: 500, body: {} })), 'o')).toBe('unknown');
        expect(await readAutoAcceptPolicy(mk(async () => { throw new Error('réseau'); }), 'o')).toBe('unknown');
        expect(await readAutoAcceptPolicy(mk(async () => ({ status: 200, body: { features: [] } })), 'o')).toBe('unknown');
    });
});
