/**
 * Registre des exécutants de `kind` du plan d'action (L15-0). Un `kind` ajouté par un lot de domaine
 * (ex. `message.send`) dépose `planKinds/<kind>.ts` exportant par défaut un `PlanKindExecutor` : aucun
 * fichier partagé à modifier. Vide au socle. Les kinds de la liste fermée historique
 * (`DEVICE_KINDS` : `category.create`, `thread.create`, `folder.create`, `file.create_text`) restent
 * exécutés par `deviceActions.ts`.
 */
import type { ArgsSchema, JsonObject } from '@/assets/utils/aiActionPlan';

/** Outil(s) de l'agent d'un kind : un nom, une liste (l'un suffit) ou fonction de l'action (`args`, `argsRefs`). */
export type PlanKindTool = string | readonly string[] | ((args: JsonObject, argsRefs: JsonObject) => string);

/** Outil client hors plan (`category: 'client'`) exécuté par l'appareil : `OrgAI.vue` l'appelle par son nom. */
export interface PlanClientTool {
    name: string;
    /** Libellé et icône de la carte de l'outil (`toolLabel`). */
    label: string;
    icon: string;
    /** `orgId` : l'organisation de la CONVERSATION ; tout identifiant venu du modèle est recoupé avec elle. */
    run(args: Record<string, unknown>, ctx: { orgId: string }): Promise<unknown>;
}

export interface PlanKindExecutor {
    /** Identifiant du kind, `domaine.action` (ex. `message.send`). */
    kind: string;
    /** Exécute l'action avec les routes normales de l'utilisateur (`X-Synco-Plan: planHeader`) ; rend `{ id, … }`. */
    execute(args: JsonObject, planHeader: string, orgId: string): Promise<Record<string, string>>;
    /**
     * Description du kind pour le validateur de plan (`validatePlan`, règle 4) et l'affichage. SANS `schema`
     * le kind reste refusé (`plan_kind`) : un exécutant seul ne rend pas un kind admissible.
     */
    /**
     * Outil de l'agent qui propose ce kind. Le kind n'est admis que si cet outil est disponible pour l'org
     * (au manifeste, politique non `deny`) : sans l'outil, `plan_kind`.
     */
    tool?: PlanKindTool;
    schema?: ArgsSchema;
    /** Champs exportables vers `argsRefs` (défaut : `id`). */
    exports?: readonly string[];
    /** Intitulé d'une action de ce kind dans le graphe, et sa puce de synthèse (« 2 fichiers »). */
    label?(args: JsonObject): string;
    chip?(count: number): string;
    icon?: string;
    /** Nom de l'action dans la liste « Toujours accepter » / réglages. */
    title?: string;
    /** Versions « hors plan » du même geste, exécutées par l'appareil (`executeClientTool`). */
    clientTools?: readonly PlanClientTool[];
}

const KIND = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export const isPlanKindExecutor = (v: unknown): v is PlanKindExecutor =>
    !!v && typeof v === 'object'
    && typeof (v as PlanKindExecutor).kind === 'string' && KIND.test((v as PlanKindExecutor).kind)
    && typeof (v as PlanKindExecutor).execute === 'function';

/** Construit le registre ; un module mal formé est ignoré, un kind en double lève (deux lots en conflit). */
export function buildPlanKindRegistry(modules: Record<string, { default?: unknown }>): ReadonlyMap<string, PlanKindExecutor> {
    const out = new Map<string, PlanKindExecutor>();
    for (const [path, mod] of Object.entries(modules)) {
        const exec = mod.default;
        if (!isPlanKindExecutor(exec)) continue;
        if (out.has(exec.kind)) throw new Error(`Kind de plan en double : ${exec.kind} (${path})`);
        out.set(exec.kind, exec);
    }
    return out;
}
