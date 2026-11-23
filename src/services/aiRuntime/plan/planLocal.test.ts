import { describe, expect, test } from 'bun:test';
import { createPlanLocalStore, memoryPlanLocalStore, stableDeviceId, type KeyValueStorage } from './planLocal';

const mem = (): KeyValueStorage => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; };

describe('identifiant d’appareil stable', () => {
    test('le même appareil retrouve le même identifiant après rechargement ; un autre appareil en a un autre', () => {
        const a = mem();
        const first = stableDeviceId(a, () => 'aaaaaaaa-1111');
        expect(stableDeviceId(a, () => 'zzzzzzzz-9999')).toBe(first);
        expect(stableDeviceId(mem(), () => 'bbbbbbbb-2222')).not.toBe(first);
    });
    test('stockage indisponible : un identifiant est quand même rendu', () => {
        const broken: KeyValueStorage = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); } };
        expect(stableDeviceId(broken, () => 'cccccccc-3333')).toBe('cccccccc-3333');
        expect(stableDeviceId(null, () => 'dddddddd-4444')).toBe('dddddddd-4444');
    });
});

describe('état local d’un plan', () => {
    test('ensemble accepté et phases scellées relus ; contenu illisible : état vide', () => {
        const st = mem();
        const a = createPlanLocalStore(st, 'o', 's');
        a.saveAccepted('p', [1, 2]);
        a.addPhase('p', 1, 'gcm1:x');
        a.addPhase('p', 1, 'gcm1:y');
        expect(createPlanLocalStore(st, 'o', 's').read('p')).toEqual({ accepted: [1, 2], phases: [{ phase: 1, value: 'gcm1:y' }] });
        st.setItem('synco_plan_local:o:s:q', '{pas du json');
        expect(createPlanLocalStore(st, 'o', 's').read('q')).toEqual({ accepted: null, phases: [] });
        expect(memoryPlanLocalStore().read('inconnu').accepted).toBeNull();
    });
});
