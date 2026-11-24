import type { SummaryModules } from './summaryRegistry';

/** Tous les résumés de domaine présents (`<domaine>Summaries.ts`). */
export const summaryModules = import.meta.glob('./*Summaries.ts', { eager: true }) as unknown as SummaryModules;
