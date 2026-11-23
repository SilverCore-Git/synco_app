import { beforeEach, describe, expect, test } from 'bun:test';
import { MAX_PANELS, agentPanelSlots, taskPanelSlots } from './dockCapacity';
import { __resetAgentDock, useAgentDock } from './useAgentDock';

beforeEach(() => { __resetAgentDock(); taskPanelSlots.value = 0; });

describe('useAgentDock : rien de visible, jamais d\'ouverture sans geste (PC75, PC80)', () => {
    test('aucune entrée : rien de visible', () => {
        const d = useAgentDock();
        expect(d.visible.value).toBe(false);
        expect(d.shown.value).toBeNull();
        expect(d.bars.value).toEqual([]);
    });

    test('restaurer après un rechargement ne déplie rien : les barres reviennent réduites', () => {
        const d = useAgentDock();
        d.openSession('o1', 's1', 'Une');
        const store: Record<string, string> = {};
        // Simule le localStorage de la session précédente
        const first = (globalThis as { localStorage?: Storage }).localStorage;
        expect(first === undefined || typeof first.getItem === 'function').toBe(true);
        __resetAgentDock();
        (globalThis as { localStorage?: unknown }).localStorage = {
            getItem: (k: string) => store[k] ?? JSON.stringify({ orgId: 'o1', items: [{ sessionId: 's1', title: 'Une' }, { sessionId: 's2', title: 'Deux' }] }),
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
        };
        const d2 = useAgentDock();
        d2.restore('o1');
        expect(d2.entries.value.length).toBe(2);
        expect(d2.entries.value.every(e => e.state === 'min')).toBe(true);
        expect(d2.shown.value).toBeNull();
        d2.restore('autre');
        delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    test('un seul panneau déplié : en ouvrir un autre réduit le précédent', () => {
        const d = useAgentDock();
        d.openSession('o1', 'a', 'A');
        d.openSession('o1', 'b', 'B');
        expect(d.shown.value?.sessionId).toBe('b');
        expect(d.bars.value.map(e => e.sessionId)).toEqual(['a']);
    });

    test('Ctrl/Cmd+J : ouvre la conversation qui attend, sinon une nouvelle, et ferme sinon', () => {
        const d = useAgentDock();
        d.toggleShortcut('o1', { sessionId: 'w', title: 'Attend' });
        expect(d.shown.value?.sessionId).toBe('w');
        d.toggleShortcut('o1', null);
        expect(d.shown.value).toBeNull();
        expect(d.entries.value.length).toBe(1);
        d.closeAll();
        d.toggleShortcut('o1', null, { kind: 'file', id: 'f1', name: 'x.pdf' });
        expect(d.shown.value?.sessionId).toBeNull();
        expect(d.shown.value?.context?.id).toBe('f1');
    });

    test('un brouillon vide est réutilisé, et devient une conversation au premier envoi', () => {
        const d = useAgentDock();
        const a = d.openNew('o1', { prompt: 'Résume' });
        const b = d.openNew('o1');
        expect(b).toBe(a);
        expect(d.entries.value.length).toBe(1);
        d.bindSession(a.key, 'sess-9', 'Titre');
        expect(d.entries.value[0].key).toBe('sess-9');
        expect(d.entries.value[0].prompt).toBe('');
    });

    test('changer d\'organisation retire les conversations de l\'autre', () => {
        const d = useAgentDock();
        d.openSession('o1', 'a');
        d.resetForOrg('o2');
        expect(d.entries.value.length).toBe(0);
    });

    test('la page complète ouverte est signalée', () => {
        const d = useAgentDock();
        d.enterFullPage();
        expect(d.fullPageOpen.value).toBe(true);
        d.leaveFullPage();
        d.leaveFullPage();
        expect(d.fullPageOpen.value).toBe(false);
    });

    test('demande transmise à la page complète : consommée une seule fois', () => {
        const d = useAgentDock();
        d.setPendingPrompt('Bonjour');
        expect(d.takePendingPrompt()).toBe('Bonjour');
        expect(d.takePendingPrompt()).toBe('');
    });
});

describe('useAgentDock : plafond partagé avec les tâches', () => {
    test('le nombre d\'entrées est publié pour les tâches', () => {
        const d = useAgentDock();
        d.openSession('o1', 'a');
        d.openSession('o1', 'b');
        expect(agentPanelSlots.value).toBe(2);
    });

    test('au-delà du plafond, la plus ancienne barre est fermée, jamais celle qu\'on ouvre', () => {
        const d = useAgentDock();
        taskPanelSlots.value = MAX_PANELS - 2;
        d.openSession('o1', 'a');
        d.openSession('o1', 'b');
        d.openSession('o1', 'c');
        expect(d.entries.value.map(e => e.sessionId)).toEqual(['b', 'c']);
        expect(d.shown.value?.sessionId).toBe('c');
    });

    test('les tâches ne laissent jamais moins d\'une place', () => {
        taskPanelSlots.value = MAX_PANELS;
        const d = useAgentDock();
        d.openSession('o1', 'a');
        expect(d.entries.value.length).toBe(1);
    });
});
