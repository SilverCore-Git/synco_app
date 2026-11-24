import { buildPlanKindRegistry, type PlanKindExecutor } from './registry';

/** Tous les exécutants déposés dans ce dossier (hors `index.ts`, `registry.ts` et les tests). */
const modules = import.meta.glob(['./*.ts', '!./index.ts', '!./registry.ts', '!./*.test.ts'], { eager: true }) as Record<string, { default?: unknown }>;

const registry = buildPlanKindRegistry(modules);

export const planKindExecutor = (kind: string): PlanKindExecutor | undefined => registry.get(kind);
export const registeredPlanKinds = (): string[] => [...registry.keys()];
