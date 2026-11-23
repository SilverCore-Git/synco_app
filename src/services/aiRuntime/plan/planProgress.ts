/**
 * Suivi et bilan d'un plan (12 §8, §9 ; PC54, PC55, PC56, PC74) : états par action, compteurs, jauge,
 * bandeau d'échec et lignes du bilan. Fonctions PURES alimentées par les résultats de phase déjà
 * déchiffrés (`openPhaseResult` / `openAgentResults`) ; les intitulés restent ceux de `planModel`.
 */
import type { AbandonCode } from '@/assets/utils/aiActionPlan';
import type { PhaseOutcome } from '../actionPlan';
import type { PlanModel } from './planModel';
import { cleanText } from './planLabels';

export type ViewState = 'pending' | 'executing' | 'done' | 'failed' | 'skipped' | 'unknown_outcome' | 'removed';

export interface ActionProgress { n: number; state: ViewState; code?: AbandonCode }

/** Explication en clair d'un code d'abandon d'une action d'agent (PC74). */
export const ABANDON_TEXT: Record<AbandonCode, string> = {
    rate_limited: 'Trop de demandes en peu de temps : l’action a été abandonnée.',
    refs_inconsistent: 'Une référence du plan ne correspond plus à ce qui existe.',
    action_not_accepted: 'Vous n’aviez pas accepté cette action.',
    autonomy_required: 'Cette action demande le mode autonome, qui n’est pas activé.',
    key_unavailable: 'La clé de la conversation n’était pas disponible pour Synco AI.',
};

export const abandonText = (code: AbandonCode | undefined): string => (code ? ABANDON_TEXT[code] : '');

export const STATE_TEXT: Record<ViewState, string> = {
    pending: 'En attente', executing: 'En cours', done: 'Faite', failed: 'Échec', skipped: 'Annulée',
    unknown_outcome: 'Résultat inconnu', removed: 'Retirée par vous',
};

export interface Progress {
    byAction: Map<number, ActionProgress>;
    /** Actions acceptées. */
    total: number;
    done: number;
    failed: number;
    /** `skipped` + `unknown_outcome` : ni faites ni en échec. */
    cancelled: number;
    running: number;
    pending: number;
    removed: number;
    /** Plus aucune action en attente ou en cours. */
    finished: boolean;
}

export function buildProgress(m: PlanModel, accepted: readonly number[], outcomes: readonly PhaseOutcome[], executing: ReadonlySet<number> = new Set()): Progress {
    const acc = new Set(accepted);
    const out = new Map(outcomes.map(o => [o.n, o]));
    const byAction = new Map<number, ActionProgress>();
    const c = { done: 0, failed: 0, cancelled: 0, running: 0, pending: 0, removed: 0 };
    for (const a of m.actions) {
        let p: ActionProgress;
        const o = out.get(a.n);
        if (!acc.has(a.n)) { p = { n: a.n, state: 'removed' }; c.removed++; }
        else if (o) {
            p = { n: a.n, state: o.state, code: o.code };
            if (o.state === 'done') c.done++; else if (o.state === 'failed') c.failed++; else c.cancelled++;
        } else if (executing.has(a.n)) { p = { n: a.n, state: 'executing' }; c.running++; }
        else { p = { n: a.n, state: 'pending' }; c.pending++; }
        byAction.set(a.n, p);
    }
    return { byAction, total: acc.size, ...c, finished: c.running === 0 && c.pending === 0 };
}

/** Jauge en quatre couleurs (faites, en cours, échecs, reste), en pourcentages de la largeur. */
export function gauge(p: Progress): { done: number; running: number; failed: number; rest: number } {
    const t = Math.max(1, p.total);
    const pct = (x: number) => (x / t) * 100;
    return { done: pct(p.done), running: pct(p.running), failed: pct(p.failed), rest: pct(p.total - p.done - p.running - p.failed) };
}

/** « Plan 5 / 9 » (barre du dock). */
export const dockLabel = (p: Progress): string => `Plan ${p.done} / ${p.total}`;

/** Actions qui dépendent, directement ou non, de `n` (parmi les actions acceptées). */
export function transitiveDependents(m: PlanModel, n: number, accepted: ReadonlySet<number>): number[] {
    const seen = new Set<number>();
    const stack = [n];
    while (stack.length) {
        for (const d of m.dependents[stack.pop()! - 1] ?? []) if (accepted.has(d) && !seen.has(d)) { seen.add(d); stack.push(d); }
    }
    return [...seen].sort((a, b) => a - b);
}

/** Bandeau ambre PC54 : un échec n'annule que ses dépendantes. Texte entièrement généré par l'app. */
export function failureBanner(m: PlanModel, accepted: readonly number[], p: Progress): string | null {
    const first = [...p.byAction.values()].find(a => a.state === 'failed');
    if (!first) return null;
    const label = m.actions[first.n - 1]?.label ?? `Action ${first.n}`;
    const deps = transitiveDependents(m, first.n, new Set(accepted));
    return deps.length === 0
        ? `${label} a échoué : seules les actions qui en dépendent sont annulées. Ici aucune : le reste continue.`
        : `${label} a échoué : ${deps.length === 1 ? 'l’action qui en dépend est annulée' : `les ${deps.length} actions qui en dépendent sont annulées`}, le reste continue.`;
}

export interface SummaryLine { n: number; label: string; state: ViewState; reason: string }

/** Lignes du bilan : une par action, dans l'ordre du plan. */
export function summaryLines(m: PlanModel, p: Progress): SummaryLine[] {
    return m.actions.map(a => {
        const s = p.byAction.get(a.n)?.state ?? 'pending';
        const code = p.byAction.get(a.n)?.code;
        const reason = s === 'failed' || s === 'skipped' || s === 'unknown_outcome' ? (abandonText(code) || STATE_TEXT[s]) : s === 'pending' ? 'Jamais démarrée' : '';
        return { n: a.n, label: a.label, state: s, reason };
    });
}

/** Titre du bilan, y compris plan expiré (PC62) : « 6 actions faites, 3 jamais démarrées ». */
export function summaryTitle(p: Progress, expired: boolean): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
    const parts = [plural(p.done, 'action faite', 'actions faites')];
    if (p.failed) parts.push(plural(p.failed, 'échec', 'échecs'));
    if (p.pending) parts.push(plural(p.pending, 'jamais démarrée', 'jamais démarrées'));
    return `${expired ? 'Plan expiré' : 'Plan terminé'} : ${parts.join(', ')}`;
}

/** Bandeau bleu PC55 : message de l'utilisateur mis en file jusqu'à la fin du plan (texte tronqué, jamais interprété). */
export function queuedMessageBanner(text: string): string {
    return `Votre message « ${cleanText(text, 60)} » sera traité à la fin du plan.`;
}
