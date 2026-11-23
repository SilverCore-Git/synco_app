/**
 * Modèle de présentation d'un plan (12 §17), fonctions PURES : intitulés générés par l'app, actions
 * sensibles, sélection et cascade (PC37), règle du petit plan (PC76), disposition du graphe par
 * niveaux. Ne parle ni à l'API ni au DOM ; la décision envoyée reste `buildAcceptDecision` (L10).
 */
import type { JsonObject, JsonValue } from '@/assets/utils/aiActionPlan';
import type { OpenedPlan } from '../actionPlan';
import { isSensitiveAutoAcceptKey, type ManifestFlags } from '@/services/aiAutoAccept';
import { actionLabel, cleanText, placeOf, type NameResolver } from './planLabels';

export const SMALL_PLAN_MAX = 5;
export const LARGE_PLAN_MIN = 30;

export interface PlanActionModel {
    n: number;
    kind: string;
    tool?: string;
    args: JsonObject;
    /** Références `$m.champ` (cibles créées par une autre action) ; affichées, jamais résolues ici. */
    argsRefs?: JsonObject;
    group?: string;
    after: number[];
    executor: 'device' | 'agent';
    level: number;
    sensitive: boolean;
    label: string;
    place: { text: string; unknown: boolean } | null;
}

export interface PlanModel {
    planId: string;
    sessionId: string;
    summary: string;
    createdAt: number;
    expiresAt: number;
    groups: { id: string; label: string }[];
    actions: PlanActionModel[];
    maxLevel: number;
    /** `dependents[n-1]` : actions qui listent `n` dans leur `after`. */
    dependents: number[][];
}

const isObj = (x: JsonValue | undefined): x is JsonObject => !!x && typeof x === 'object' && !Array.isArray(x);

/** Action sensible (C1 §3) : jamais précochée, jamais validée dans la carte. Échec fermé : tout ce qui n'est pas admis. */
export function isSensitiveAction(kind: string, tool: string | undefined, flags: readonly ManifestFlags[] = []): boolean {
    if (kind !== 'server.call') return isSensitiveAutoAcceptKey(kind, flags);
    const t = tool ?? '';
    if (t.startsWith('delete_') || t === 'create_email_report') return true;
    return isSensitiveAutoAcceptKey(`server.call:${t}`, flags);
}

/** Construit le modèle depuis le plan DÉCHIFFRÉ et revalidé (`openPlan`) : rien ne vient du serveur sans contrôle. */
export function buildPlanModel(opened: OpenedPlan, resolver: NameResolver, flags: readonly ManifestFlags[] = []): PlanModel {
    const plan = opened.plan;
    const levels = opened.graph.levels();
    const raw = Array.isArray(plan.actions) ? plan.actions : [];
    const actions: PlanActionModel[] = raw.map((a, i) => {
        const o = isObj(a) ? a : {};
        const g = opened.graph.actions[i]!;
        const kind = typeof o.kind === 'string' ? o.kind : '';
        const tool = typeof o.tool === 'string' ? o.tool : undefined;
        const args = isObj(o.args) ? o.args : {};
        return {
            n: g.n, kind, tool, args, argsRefs: isObj(o.argsRefs) ? o.argsRefs : undefined, group: typeof o.group === 'string' ? o.group : undefined, after: [...g.after], executor: g.executor,
            level: levels[i] ?? 1, sensitive: isSensitiveAction(kind, tool, flags), label: actionLabel(kind, tool, args), place: placeOf(args, resolver, isObj(o.argsRefs) ? o.argsRefs : undefined),
        };
    });
    const groups = (Array.isArray(plan.groups) ? plan.groups : []).flatMap(g => (isObj(g) && typeof g.id === 'string' ? [{ id: g.id, label: cleanText(g.label, 100) }] : []));
    const dependents: number[][] = actions.map(() => []);
    for (const a of actions) for (const m of a.after) dependents[m - 1]?.push(a.n);
    return {
        planId: typeof plan.planId === 'string' ? plan.planId : '', sessionId: typeof plan.sessionId === 'string' ? plan.sessionId : '',
        summary: cleanText(plan.summary, 2000), createdAt: Number(plan.createdAt ?? 0), expiresAt: Number(plan.expiresAt ?? 0),
        groups, actions, maxLevel: Math.max(1, ...levels), dependents,
    };
}

/**
 * PC76 : validation directe dans la carte (et « Toujours accepter ») seulement si 5 actions au plus, aucune
 * sensible ET aucun lieu inconnu de l'annuaire local : une cible qu'on ne sait pas nommer passe par le graphe.
 */
export const isSmallPlan = (m: PlanModel): boolean => m.actions.length <= SMALL_PLAN_MAX && !m.actions.some(a => a.sensitive || a.place?.unknown === true);

export const isLargePlan = (m: PlanModel): boolean => m.actions.length > LARGE_PLAN_MIN;

// ---------------------------------------------------------------------------
// Sélection et cascade
// ---------------------------------------------------------------------------

export interface Selection {
    /** Actions cochées par l'utilisateur. */
    checked: ReadonlySet<number>;
    /** Actions sensibles tranchées (cochées OU retirées explicitement). */
    resolved: ReadonlySet<number>;
}

/** Tout est coché sauf les actions sensibles, jamais précochées et à trancher une par une. */
export function initialSelection(m: PlanModel): Selection {
    return { checked: new Set(m.actions.filter(a => !a.sensitive).map(a => a.n)), resolved: new Set() };
}

export function toggleAction(m: PlanModel, sel: Selection, n: number): Selection {
    const checked = new Set(sel.checked);
    const resolved = new Set(sel.resolved);
    if (checked.has(n)) checked.delete(n); else checked.add(n);
    if (m.actions[n - 1]?.sensitive) resolved.add(n);
    return { checked, resolved };
}

export const uncheckAll = (m: PlanModel, sel: Selection): Selection => ({
    checked: new Set(), resolved: new Set([...sel.resolved, ...m.actions.filter(a => a.sensitive).map(a => a.n)]),
});

export interface SelectionResult {
    accepted: number[];
    /** Action écartée par la cascade (cochée mais dépendante d'une action retirée) → première cause. */
    ignoredBecause: Map<number, number>;
    /** Actions sensibles pas encore tranchées. */
    pendingSensitive: number[];
    canAccept: boolean;
    /** Phrase de cascade : décocher `root` retire aussi `dropped`. */
    cascades: { root: number; dropped: number[] }[];
    device: number;
    agent: number;
}

export function evaluateSelection(m: PlanModel, sel: Selection): SelectionResult {
    const dropped = new Set<number>();
    const ignoredBecause = new Map<number, number>();
    for (const a of m.actions) {
        if (!sel.checked.has(a.n)) { dropped.add(a.n); continue; }
        const cause = a.after.find(x => dropped.has(x));
        if (cause !== undefined) { dropped.add(a.n); ignoredBecause.set(a.n, ignoredBecause.get(cause) ?? cause); }
    }
    const accepted = m.actions.filter(a => !dropped.has(a.n)).map(a => a.n);
    const pendingSensitive = m.actions.filter(a => a.sensitive && !sel.resolved.has(a.n)).map(a => a.n);
    const rootsMap = new Map<number, number[]>();
    for (const [n, root] of ignoredBecause) rootsMap.set(root, [...(rootsMap.get(root) ?? []), n]);
    return {
        accepted, ignoredBecause, pendingSensitive, canAccept: accepted.length > 0 && pendingSensitive.length === 0,
        cascades: [...rootsMap].map(([root, d]) => ({ root, dropped: d })),
        device: accepted.filter(n => m.actions[n - 1]?.executor === 'device').length,
        agent: accepted.filter(n => m.actions[n - 1]?.executor === 'agent').length,
    };
}

// ---------------------------------------------------------------------------
// Disposition du graphe (colonnes = niveaux, bandes = groupes)
// ---------------------------------------------------------------------------

export const GEO = { colW: 288, colGap: 40, cardH: 104, rowGap: 14, bandPad: 14, bandHead: 34, bandGap: 26, collapsedH: 84, left: 12 } as const;

export interface BandLayout {
    id: string;
    label: string;
    kind: 'group' | 'free' | 'sensitive';
    x: number; y: number; w: number; h: number;
    members: number[];
    collapsed: boolean;
}
export interface NodeLayout { n: number; x: number; y: number; w: number; h: number }
export interface GraphLayout { width: number; height: number; bands: BandLayout[]; nodes: Map<number, NodeLayout> }

/**
 * Bandes empilées : groupes (dans l'ordre du plan), puis les actions sans groupe, puis « À vérifier une
 * par une » (les actions sensibles en sortent : jamais cachées, même quand leur groupe est replié).
 * Au-delà de 30 actions, un groupe est replié par défaut en une carte de synthèse.
 */
export function layoutGraph(m: PlanModel, expanded: ReadonlySet<string> = new Set()): GraphLayout {
    const large = isLargePlan(m);
    const sensitive = m.actions.filter(a => a.sensitive).map(a => a.n);
    const bandsDef: { id: string; label: string; kind: BandLayout['kind']; members: number[] }[] = [];
    for (const g of m.groups) {
        const members = m.actions.filter(a => a.group === g.id && !a.sensitive).map(a => a.n);
        if (members.length) bandsDef.push({ id: g.id, label: g.label, kind: 'group', members });
    }
    const free = m.actions.filter(a => !a.group && !a.sensitive).map(a => a.n);
    if (free.length) bandsDef.push({ id: '_free', label: free.length === m.actions.length ? 'Actions' : 'Autres actions', kind: 'free', members: free });
    if (sensitive.length) bandsDef.push({ id: '_sensitive', label: 'À vérifier une par une', kind: 'sensitive', members: sensitive });

    const nodes = new Map<number, NodeLayout>();
    const bands: BandLayout[] = [];
    const colX = (level: number) => GEO.left + GEO.bandPad + (level - 1) * (GEO.colW + GEO.colGap);
    let y = 0;
    for (const b of bandsDef) {
        const collapsed = large && b.kind !== 'sensitive' && !expanded.has(b.id);
        const width = GEO.bandPad * 2 + m.maxLevel * GEO.colW + (m.maxLevel - 1) * GEO.colGap;
        if (collapsed) {
            bands.push({ ...b, x: GEO.left, y, w: width, h: GEO.collapsedH, collapsed });
            y += GEO.collapsedH + GEO.bandGap;
            continue;
        }
        const stacks = new Map<number, number>();
        for (const n of b.members) {
            const a = m.actions[n - 1]!;
            const row = stacks.get(a.level) ?? 0;
            stacks.set(a.level, row + 1);
            nodes.set(n, { n, x: colX(a.level), y: y + GEO.bandHead + GEO.bandPad + row * (GEO.cardH + GEO.rowGap), w: GEO.colW, h: GEO.cardH });
        }
        const rows = Math.max(1, ...stacks.values());
        const h = GEO.bandHead + GEO.bandPad * 2 + rows * GEO.cardH + (rows - 1) * GEO.rowGap;
        const usedLevels = [...stacks.keys()];
        const x0 = b.kind === 'sensitive' ? colX(Math.min(...usedLevels)) - GEO.bandPad : GEO.left;
        const x1 = b.kind === 'sensitive' ? colX(Math.max(...usedLevels)) + GEO.colW + GEO.bandPad : GEO.left + width;
        bands.push({ ...b, x: x0, y, w: x1 - x0, h, collapsed });
        y += h + GEO.bandGap;
    }
    return { width: GEO.left * 2 + m.maxLevel * GEO.colW + (m.maxLevel - 1) * GEO.colGap + GEO.bandPad * 2, height: Math.max(0, y - GEO.bandGap), bands, nodes };
}

export interface LinkPath { from: number; to: number; d: string }

/** Liens courbes entre une action et celles de son `after` ; seuls les nœuds visibles sont reliés. */
export function graphLinks(m: PlanModel, layout: GraphLayout, only?: ReadonlySet<number>): LinkPath[] {
    const out: LinkPath[] = [];
    for (const a of m.actions) {
        const to = layout.nodes.get(a.n);
        if (!to) continue;
        for (const dep of a.after) {
            if (only && !only.has(a.n) && !only.has(dep)) continue;
            const from = layout.nodes.get(dep);
            if (!from) continue;
            const x1 = from.x + from.w, y1 = from.y + from.h / 2, x2 = to.x, y2 = to.y + to.h / 2;
            const dx = Math.max(24, (x2 - x1) / 2);
            out.push({ from: dep, to: a.n, d: `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}` });
        }
    }
    return out;
}

export function levelTitle(level: number): string {
    if (level === 1) return 'Étape 1 · en parallèle';
    if (level === 2) return 'Étape 2 · quand l’étape 1 est faite';
    return `Étape ${level} · ensuite`;
}

/** Chaîne « Dépend de … » (intitulés générés), tronquée à deux noms. */
export function dependsText(m: PlanModel, a: PlanActionModel): string {
    if (a.after.length === 0) return 'Sans dépendance';
    const names = a.after.slice(0, 2).map(n => m.actions[n - 1]?.label ?? `#${n}`);
    return `Dépend de ${names.join(', ')}${a.after.length > 2 ? ` et ${a.after.length - 2} autre(s)` : ''}`;
}
