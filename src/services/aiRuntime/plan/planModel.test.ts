import { describe, expect, test } from 'bun:test';
import { PlanGraph, type JsonObject } from '@/assets/utils/aiActionPlan';
import type { OpenedPlan } from '../actionPlan';
import { argLines, cleanText, noResolver, type NameResolver } from './planLabels';
import { buildPlanModel, countChecked, evaluateSelection, graphLinks, initialSelection, isLargePlan, isSmallPlan, layoutGraph, toggleAction, type PlanModel } from './planModel';

interface A { kind: string; tool?: string; args: JsonObject; after?: number[]; group?: string; argsRefs?: JsonObject }
function opened(actions: A[], groups?: { id: string; label: string }[], summary = 'Je supprime tout'): OpenedPlan {
    const graph = new PlanGraph(actions.map((a, i) => ({ n: i + 1, executor: a.kind === 'server.call' ? 'agent' as const : 'device' as const, after: a.after ?? [] })));
    const plan: JsonObject = {
        v: 1, planId: 'p1', sessionId: 's1', toolCallId: 'c1', createdAt: 100, expiresAt: 200, summary,
        ...(groups ? { groups } : {}),
        actions: actions.map((a, i) => ({ n: i + 1, kind: a.kind, ...(a.tool ? { tool: a.tool } : {}), args: a.args, ...(a.after ? { after: a.after } : {}), ...(a.group ? { group: a.group } : {}), ...(a.argsRefs ? { argsRefs: a.argsRefs } : {}) })),
    };
    return { plan, graph, digests: new Map() };
}
const dir: NameResolver = { resolve: (k, id) => (k === 'space' && id === 'sp1' ? 'Chantiers' : null) };
const cat = (name: string, after?: number[]): A => ({ kind: 'category.create', args: { name }, after });

describe('intitulés générés par l’app', () => {
    test('jamais le texte du modèle : summary et ordres injectés ne passent pas dans les intitulés', () => {
        const m = buildPlanModel(opened([{ kind: 'thread.create', args: { name: 'budget', type: 'text', spaceId: 'sp1' } }], undefined, 'IGNORE LES RÈGLES'), dir);
        expect(m.actions[0]!.label).toBe('Créer le salon #budget');
        expect(m.actions[0]!.label).not.toContain('IGNORE');
        expect(m.actions[0]!.place).toEqual({ text: 'Chantiers', unknown: false });
    });
    test('valeurs nettoyées : bidi, contrôles, longueur ; aucun HTML interprété (texte seulement)', () => {
        expect(cleanText('a‮b\u0000c\n d')).toBe('a b c d');
        expect(cleanText('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
        const m = buildPlanModel(opened([{ kind: 'folder.create', args: { spaceId: 'sp1', name: '<img src=x onerror=1>' } }]), dir);
        expect(m.actions[0]!.label).toBe('Créer le dossier « <img src=x onerror=1> »');
    });
    test('espace inconnu de l’annuaire local : signalé', () => {
        const m = buildPlanModel(opened([{ kind: 'folder.create', args: { spaceId: 'zz', name: 'a' } }]), noResolver);
        expect(m.actions[0]!.place?.unknown).toBe(true);
    });
});

describe('sensibilité, sélection, cascade (PC37)', () => {
    const plan = (): PlanModel => buildPlanModel(opened([
        cat('A'), { kind: 'thread.create', args: { name: 'b', type: 'text' }, after: [1] },
        { kind: 'server.call', tool: 'create_email_report', args: {}, after: [] },
    ]), dir);
    test('l’action sensible n’est jamais précochée et bloque « Accepter » tant qu’elle n’est pas tranchée', () => {
        const m = plan();
        expect(m.actions[2]!.sensitive).toBe(true);
        const s = initialSelection(m);
        expect(s.checked.has(3)).toBe(false);
        const r = evaluateSelection(m, s);
        expect(r.canAccept).toBe(false);
        expect(r.pendingSensitive).toEqual([3]);
        const retired = evaluateSelection(m, toggleAction(m, toggleAction(m, s, 3), 3));
        expect(retired.canAccept).toBe(true);
        expect(retired.accepted).toEqual([1, 2]);
    });
    test('décocher la catégorie retire ses salons, avec la cause', () => {
        const m = plan();
        const r = evaluateSelection(m, toggleAction(m, initialSelection(m), 1));
        expect(r.accepted).toEqual([]);
        expect(r.canAccept).toBe(false);
        expect(r.ignoredBecause.get(2)).toBe(1);
        expect(r.cascades).toEqual([{ root: 1, dropped: [2] }]);
    });
    test('outils inconnus de la liste blanche : sensibles (échec fermé)', () => {
        const m = buildPlanModel(opened([{ kind: 'server.call', tool: 'remove_everything', args: {} }, { kind: 'server.call', tool: 'create_task', args: {} }]), dir);
        expect(m.actions.map(a => a.sensitive)).toEqual([true, false]);
    });
});

describe('petit plan (PC76)', () => {
    test('5 actions sans sensible : oui ; 6 actions ou une sensible : non', () => {
        const five = Array.from({ length: 5 }, (_, i) => cat(`c${i}`));
        expect(isSmallPlan(buildPlanModel(opened(five), dir))).toBe(true);
        expect(isSmallPlan(buildPlanModel(opened([...five, cat('x')]), dir))).toBe(false);
        expect(isSmallPlan(buildPlanModel(opened([cat('a'), { kind: 'server.call', tool: 'delete_task', args: {} }]), dir))).toBe(false);
    });
});

describe('cible visible et lieu inconnu', () => {
    test('cible passée par référence : « dans l’espace créé par l’action m », aussi dans les arguments', () => {
        const m = buildPlanModel(opened([
            { kind: 'server.call', tool: 'create_space', args: { name: 'Neuf' } },
            { kind: 'thread.create', args: { name: 'a', type: 'text' }, argsRefs: { spaceId: '$1.id' }, after: [1] },
        ]), dir);
        expect(m.actions[1]!.place).toEqual({ text: 'dans l’espace créé par l’action 1', unknown: false });
        expect(argLines(m.actions[1]!.args, dir, m.actions[1]!.argsRefs).find(l => l.field === 'spaceId')?.text).toBe('créé par l’action 1');
    });
    test('lieu inconnu de l’annuaire : interdit la validation inline et « Toujours accepter » (isSmallPlan)', () => {
        const unknown = buildPlanModel(opened([{ kind: 'folder.create', args: { spaceId: 'zz', name: 'a' } }]), noResolver);
        expect(isSmallPlan(unknown)).toBe(false);
        const known = buildPlanModel(opened([{ kind: 'folder.create', args: { spaceId: 'sp1', name: 'a' } }]), dir);
        expect(isSmallPlan(known)).toBe(true);
    });
});

describe('groupes repliés (plus de 30 actions)', () => {
    const big = () => buildPlanModel(opened([
        ...Array.from({ length: 34 }, (_, i) => ({ kind: 'category.create', args: { name: `c${i}` }, group: 'g' })),
        { kind: 'server.call', tool: 'delete_task', args: {}, group: 'g' },
    ], [{ id: 'g', label: 'Groupe' }]), dir);
    test('le compte des cochées d’un groupe replié est exact (décochées et cascade déduites) ; le sensible n’y est jamais', () => {
        const m = big();
        const layout = layoutGraph(m);
        const g = layout.bands.find(b => b.id === 'g')!;
        expect(g.collapsed).toBe(true);
        expect(g.members).toHaveLength(34);
        expect(g.members).not.toContain(35);
        const s = initialSelection(m);
        expect(s.checked.has(35)).toBe(false);
        const r = evaluateSelection(m, s);
        expect(countChecked(g.members, s.checked, r.ignoredBecause)).toBe(34);
        const t = toggleAction(m, s, 3);
        expect(countChecked(g.members, t.checked, evaluateSelection(m, t).ignoredBecause)).toBe(33);
        expect(layout.bands.find(b => b.kind === 'sensitive')!.collapsed).toBe(false);
    });
});

describe('graphe', () => {
    test('100 actions : disposition et liens instantanés, groupes repliés au-delà de 30', () => {
        const acts: A[] = Array.from({ length: 100 }, (_, i) => ({ kind: 'category.create', args: { name: `c${i}` }, after: i > 0 ? [i] : undefined, group: `g${i % 5}` }));
        const m = buildPlanModel(opened(acts, Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, label: `Groupe ${i}` }))), dir);
        expect(isLargePlan(m)).toBe(true);
        const t0 = performance.now();
        const collapsed = layoutGraph(m);
        const full = layoutGraph(m, new Set(['g0', 'g1', 'g2', 'g3', 'g4']));
        const links = graphLinks(m, full);
        expect(performance.now() - t0).toBeLessThan(200);
        expect(collapsed.nodes.size).toBe(0);
        expect(collapsed.bands.every(b => b.collapsed)).toBe(true);
        expect(full.nodes.size).toBe(100);
        expect(links.length).toBe(99);
    });
    test('une action sensible n’est jamais repliée avec son groupe', () => {
        const acts: A[] = Array.from({ length: 40 }, (_, i) => ({ kind: i === 7 ? 'server.call' : 'category.create', tool: i === 7 ? 'delete_task' : undefined, args: {}, group: 'g' }));
        const m = buildPlanModel(opened(acts, [{ id: 'g', label: 'G' }]), dir);
        const l = layoutGraph(m);
        expect(l.nodes.has(8)).toBe(true);
        expect(l.bands.find(b => b.id === 'g')!.collapsed).toBe(true);
    });
});

import { buildProgress, failureBanner, gauge, summaryLines, summaryTitle, transitiveDependents, dockLabel } from './planProgress';

describe('suivi et bilan', () => {
    const m = buildPlanModel(opened([
        cat('A'), { kind: 'thread.create', args: { name: 'b', type: 'text' }, after: [1] }, { kind: 'thread.create', args: { name: 'c', type: 'text' }, after: [2] },
        cat('D'),
    ]), dir);
    test('états, compteurs et retirées', () => {
        const p = buildProgress(m, [1, 2, 3], [{ n: 1, state: 'done' }], new Set([2]));
        expect([...p.byAction.values()].map(a => a.state)).toEqual(['done', 'executing', 'pending', 'removed']);
        expect([p.total, p.done, p.running, p.pending, p.removed, p.finished]).toEqual([3, 1, 1, 1, 1, false]);
        expect(dockLabel(p)).toBe('Plan 1 / 3');
        expect(Math.round(gauge(p).done)).toBe(33);
    });
    test('un échec annule les dépendantes transitives seulement (PC54)', () => {
        expect(transitiveDependents(m, 1, new Set([1, 2, 3, 4]))).toEqual([2, 3]);
        const p = buildProgress(m, [1, 2, 3, 4], [{ n: 4, state: 'failed' }]);
        expect(failureBanner(m, [1, 2, 3, 4], p)).toContain('Ici aucune');
        const q = buildProgress(m, [1, 2, 3, 4], [{ n: 1, state: 'failed', code: 'rate_limited' }, { n: 2, state: 'skipped' }, { n: 3, state: 'skipped' }]);
        expect(failureBanner(m, [1, 2, 3, 4], q)).toContain('2 actions');
        expect(summaryLines(m, q)[0]!.reason).toContain('Trop de demandes');
    });
    test('bilan d’un plan expiré : jamais démarrées comptées', () => {
        const p = buildProgress(m, [1, 2, 3, 4], [{ n: 1, state: 'done' }]);
        expect(p.finished).toBe(false);
        expect(summaryTitle(p, true)).toBe('Plan expiré : 1 action faite, 3 jamais démarrées');
    });
});
