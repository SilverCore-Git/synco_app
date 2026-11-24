import { describe, expect, test } from 'bun:test';
import { buildPlanKindRegistry, isPlanKindExecutor } from './registry';

const exec = (kind: string) => ({ kind, execute: async () => ({ id: 'x' }) });

describe('registre des exécutants de kind', () => {
    test('vide au socle', () => {
        expect(buildPlanKindRegistry({}).size).toBe(0);
    });

    test('enregistre les exécutants valides, ignore le reste', () => {
        const reg = buildPlanKindRegistry({
            './message.send.ts': { default: exec('message.send') },
            './helper.ts': { default: { nope: true } },
            './sans_defaut.ts': {},
            './mauvais.ts': { default: exec('MauvaisKind') },
        });
        expect([...reg.keys()]).toEqual(['message.send']);
        expect(isPlanKindExecutor(exec('thread.add_members'))).toBe(true);
        expect(isPlanKindExecutor(exec('sans_point'))).toBe(false);
    });

    test('un kind déclaré deux fois lève', () => {
        expect(() => buildPlanKindRegistry({ './a.ts': { default: exec('file.update_text') }, './b.ts': { default: exec('file.update_text') } })).toThrow('en double');
    });
});
