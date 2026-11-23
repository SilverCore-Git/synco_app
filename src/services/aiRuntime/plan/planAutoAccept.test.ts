import { describe, expect, test } from 'bun:test';
import type { PlanActionModel, PlanModel } from './planModel';
import { actionKey, canAutoAccept } from './planAutoAccept';

const act = (n: number, kind: string, tool?: string, sensitive = false): PlanActionModel => ({ n, kind, tool, args: {}, after: [], executor: 'device', level: 1, sensitive, label: `a${n}`, place: null });
const plan = (...actions: PlanActionModel[]): PlanModel => ({ planId: 'p', sessionId: 's', summary: '', createdAt: 0, expiresAt: 0, groups: [], actions, maxLevel: 1, dependents: actions.map(() => []) });

describe('« Toujours accepter » sur un plan', () => {
    const saved = ['thread.create', 'folder.create', 'server.call:create_task'];
    test('clé d’une action', () => {
        expect(actionKey(act(1, 'thread.create'))).toBe('thread.create');
        expect(actionKey(act(1, 'server.call', 'create_task'))).toBe('server.call:create_task');
    });
    test('petit plan dont toutes les actions sont enregistrées : accepté sans clic', () => {
        expect(canAutoAccept(plan(act(1, 'thread.create'), act(2, 'server.call', 'create_task')), saved)).toBe(true);
    });
    test('une action hors liste : clic demandé', () => {
        expect(canAutoAccept(plan(act(1, 'thread.create'), act(2, 'file.create_text')), saved)).toBe(false);
    });
    test('action sensible : jamais, même si son nom est dans le réglage stocké', () => {
        expect(canAutoAccept(plan(act(1, 'server.call', 'delete_task', true)), ['server.call:delete_task'])).toBe(false);
        expect(canAutoAccept(plan(act(1, 'server.call', 'create_email_report', true)), ['server.call:create_email_report'])).toBe(false);
    });
    test('drapeau sensible du manifeste : l’emporte sur la liste', () => {
        expect(canAutoAccept(plan(act(1, 'server.call', 'create_task')), saved, [{ name: 'create_task', sensitive: true }])).toBe(false);
    });
    test('PC76 : plus de 5 actions, le graphe est obligatoire', () => {
        expect(canAutoAccept(plan(...[1, 2, 3, 4, 5, 6].map(n => act(n, 'thread.create'))), saved)).toBe(false);
        expect(canAutoAccept(plan(...[1, 2, 3, 4, 5].map(n => act(n, 'thread.create'))), saved)).toBe(true);
    });
    test('liste vide ou plan vide : jamais', () => {
        expect(canAutoAccept(plan(act(1, 'thread.create')), [])).toBe(false);
        expect(canAutoAccept(plan(), saved)).toBe(false);
    });
});
