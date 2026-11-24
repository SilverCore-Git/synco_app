/**
 * Registre des résumés de confirmation, par domaine. Un domaine dépose `<domaine>Summaries.ts` (export
 * `summaries`) : aucun fichier partagé à modifier. Les cartes de confirmation (`PendingActionBar.vue`) les
 * consultent avant leur résumé générique. Texte seulement : jamais de HTML.
 */
import { cleanText } from '@/services/aiRuntime/plan/planLabels';

/** Ce que l'app sait localement pour rendre un résumé lisible (noms de membres, partages d'agenda). */
export interface SummaryContext {
    /** Nom du membre dans l'annuaire local de l'org, ou null. */
    userName(id: string): string | null;
    /** Partage d'agenda connu de l'app (ex. `respond_calendar_access`), ou null. */
    grant?(grantId: string): { who: string; level: string; direction: 'owner' | 'grantee' } | null;
}

export type Summarizer = (args: Record<string, unknown>, ctx: SummaryContext) => string;
export type SummaryModules = Record<string, { summaries?: Record<string, Summarizer> }>;

export const noSummaryContext: SummaryContext = { userName: () => null };

/** Réunit les résumés de tous les modules `*Summaries.ts`. */
export function buildSummaryRegistry(modules: SummaryModules): Record<string, Summarizer> {
    const out: Record<string, Summarizer> = {};
    for (const [path, mod] of Object.entries(modules)) {
        if (!/(?:^|\/)[a-z][A-Za-z]*Summaries\.ts$/.test(path)) continue;
        for (const [tool, fn] of Object.entries(mod.summaries ?? {})) if (typeof fn === 'function') out[tool] = fn;
    }
    return out;
}

/** Résumé d'un outil, nettoyé ; chaîne vide s'il n'y en a pas (l'appelant retombe sur son résumé générique). */
export function summarizeTool(name: string, args: unknown, ctx: SummaryContext, modules: SummaryModules): string {
    const fn = buildSummaryRegistry(modules)[name];
    if (!fn) return '';
    const a = typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
    try {
        return cleanText(fn(a, ctx), 2400);
    } catch {
        return '';
    }
}
