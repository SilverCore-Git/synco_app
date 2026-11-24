import { describe, expect, test } from 'bun:test';
import { buildResultRegistry, domainFromResultPath } from './resultRegistry';
import { rememberToolDomains, resultComponentFor, toolDomainOf } from './toolDomains';

const loader = async () => ({ default: { render: () => null } });

describe('registre des rendus de résultats', () => {
    test('vide au socle : aucun rendu, rendu générique', () => {
        expect(buildResultRegistry({})).toEqual({});
        rememberToolDomains([{ name: 'read_tasks', domain: 'tasks' }]);
        expect(resultComponentFor('read_tasks', {})).toBeNull();
        expect(resultComponentFor('outil_inconnu', {})).toBeNull();
    });

    test('un fichier <Domaine>Result.vue s’enregistre sous son domaine, les autres sont ignorés', () => {
        expect(domainFromResultPath('./TasksResult.vue')).toBe('tasks');
        expect(domainFromResultPath('./src/components/ai/results/AgendaResult.vue')).toBe('agenda');
        expect(domainFromResultPath('./FooResult.vue')).toBeNull();
        expect(domainFromResultPath('./tasksResult.vue')).toBeNull();
        expect(domainFromResultPath('./TasksResult.ts')).toBeNull();
        const reg = buildResultRegistry({ './TasksResult.vue': loader, './FooResult.vue': loader });
        expect(Object.keys(reg)).toEqual(['tasks']);
    });

    test('le domaine d’un outil vient du manifeste, un domaine inconnu est ignoré', () => {
        rememberToolDomains([{ name: 'create_task', domain: 'tasks' }, { name: 'x_tool', domain: 'pirate' }, { name: 'y_tool' }]);
        expect(toolDomainOf('create_task')).toBe('tasks');
        expect(toolDomainOf('x_tool')).toBeUndefined();
        expect(toolDomainOf('y_tool')).toBeUndefined();
        expect(resultComponentFor('create_task', { './TasksResult.vue': loader })).not.toBeNull();
    });
});
