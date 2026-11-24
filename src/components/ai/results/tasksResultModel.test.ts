import { describe, expect, test } from 'bun:test';
import { buildTasksView, safeTagColor, statusIconOf, taskRow } from './tasksResultModel';
import { buildResultRegistry } from './resultRegistry';

describe('rendu du domaine Tâches', () => {
    test('TasksResult.vue s’enregistre sous le domaine tasks', () => {
        const loader = async () => ({ default: {} });
        expect(Object.keys(buildResultRegistry({ './TasksResult.vue': loader }))).toEqual(['tasks']);
    });

    test('list_task_lists : tâches sans liste puis une section par liste', () => {
        const v = buildTasksView('list_task_lists', {
            unlistedTasks: [{ id: 'u1', title: 'Libre', status: 'TODO' }],
            lists: [{ id: 'l1', title: 'Sprint', tasks: [{ id: 't1', title: 'A', description: 'd', status: 'DONE' }] }, { id: 'l2', title: 'Vide', tasks: [] }],
        });
        expect(v.kind).toBe('groups');
        if (v.kind !== 'groups') return;
        expect(v.groups.map(g => [g.title, g.rows.length])).toEqual([['Sans liste', 1], ['Sprint', 1], ['Vide', 0]]);
        expect(v.groups[1]!.rows[0]!.subtitle).toBe('d');
    });

    test('résultats vides ou mal formés : message, jamais d’exception', () => {
        for (const name of ['list_task_lists', 'list_archived_tasks', 'list_task_tags', 'update_task', 'create_task_list', 'attach_file_to_task']) {
            for (const bad of [null, undefined, 42, 'x', [], {}]) {
                expect(['message', 'tasks', 'tags', 'groups']).toContain(buildTasksView(name, bad).kind);
            }
        }
    });

    test('suppressions et ordre : message de confirmation propre à l’outil', () => {
        expect(buildTasksView('delete_task_list', { listId: 'l' })).toEqual({ kind: 'message', text: 'Liste supprimée.' });
        expect(buildTasksView('reorder_my_tasks', null)).toEqual({ kind: 'message', text: 'Ordre de vos tâches mis à jour.' });
    });

    test('étiquettes : la couleur venue d’un tiers est filtrée avant d’aller dans un style', () => {
        expect(safeTagColor('#a1B2c3')).toBe('#a1B2c3');
        expect(safeTagColor('red; background:url(//x)')).toBe('#6366f1');
        expect(safeTagColor(undefined)).toBe('#6366f1');
        const v = buildTasksView('list_task_tags', [{ id: 'a', name: '<img src=x onerror=1>', color: 'javascript:1' }]);
        expect(v).toEqual({ kind: 'tags', tags: [{ id: 'a', name: '<img src=x onerror=1>', color: '#6366f1' }] });
    });

    test('liste créée, fichier joint, tâche modifiée', () => {
        expect(buildTasksView('create_task_list', { id: 'l', title: 'Nouvelle' })).toEqual({ kind: 'list', id: 'l', title: 'Nouvelle', subtitle: undefined });
        expect(buildTasksView('attach_file_to_task', { file: { originalName: 'a.pdf' } })).toEqual({ kind: 'file', name: 'a.pdf' });
        const v = buildTasksView('complete_task', { id: 't', title: 'Fait', status: 'DONE' });
        expect(v.kind).toBe('tasks');
        expect(taskRow({ title: 'sans id' })).toBeNull();
        expect(statusIconOf('DONE')).toBe('bi-check-circle-fill');
        expect(statusIconOf(undefined)).toBe('bi-circle');
    });
});
