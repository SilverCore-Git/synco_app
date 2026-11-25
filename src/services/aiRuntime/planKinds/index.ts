import { buildPlanKindRegistry, type PlanClientTool, type PlanKindExecutor } from './registry';

type Modules = Record<string, { default?: unknown }>;

/**
 * Tous les exécutants déposés dans ce dossier (hors `index.ts`, `registry.ts`, `README.md` et les tests).
 * `import.meta.glob` n'existe que sous Vite : sous `bun test` l'appel lève, le registre est alors vide
 * et les tests injectent leurs modules par `setPlanKindModules`.
 */
function loadModules(): Modules {
    try {
        return import.meta.glob(['./*.ts', '!./index.ts', '!./registry.ts', '!./*.test.ts'], { eager: true }) as Modules;
    } catch {
        return {};
    }
}

let registry: ReadonlyMap<string, PlanKindExecutor> | null = null;
let tools: ReadonlyMap<string, PlanClientTool> | null = null;
let injected: Modules | null = null;

function ensure(): ReadonlyMap<string, PlanKindExecutor> {
    if (!registry) {
        registry = buildPlanKindRegistry(injected ?? loadModules());
        const t = new Map<string, PlanClientTool>();
        for (const exec of registry.values()) for (const tool of exec.clientTools ?? []) t.set(tool.name, tool);
        tools = t;
    }
    return registry;
}

/** Point d'injection des tests (`undefined` : retour au glob). */
export function setPlanKindModules(modules: Modules | undefined): void {
    injected = modules ?? null;
    registry = null;
    tools = null;
}

export const planKindExecutor = (kind: string): PlanKindExecutor | undefined => ensure().get(kind);
export const registeredPlanKinds = (): string[] => [...ensure().keys()];
/** Kind admissible dans un plan : déclaré par un module ET doté d'un schéma d'arguments. */
export const planKindDescription = (kind: string): PlanKindExecutor | undefined => {
    const exec = ensure().get(kind);
    return exec?.schema ? exec : undefined;
};
export const planClientTool = (name: string): PlanClientTool | undefined => { ensure(); return tools?.get(name); };
