import type { ResultModules } from './resultRegistry';

/** Tous les rendus de domaine présents (`<Domaine>Result.vue`), chargés à la demande. */
export const resultModules = import.meta.glob('./*Result.vue') as unknown as ResultModules;
