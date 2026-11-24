/**
 * Registre des exécutants de `kind` du plan d'action (L15-0). Un `kind` ajouté par un lot de domaine
 * (ex. `message.send`) dépose `planKinds/<kind>.ts` exportant par défaut un `PlanKindExecutor` : aucun
 * fichier partagé à modifier. Vide au socle. Les kinds de la liste fermée historique
 * (`DEVICE_KINDS` : `category.create`, `thread.create`, `folder.create`, `file.create_text`) restent
 * exécutés par `deviceActions.ts`.
 */
import type { JsonObject } from '@/assets/utils/aiActionPlan';

export interface PlanKindExecutor {
    /** Identifiant du kind, `domaine.action` (ex. `message.send`). */
    kind: string;
    /** Exécute l'action avec les routes normales de l'utilisateur (`X-Synco-Plan: planHeader`) ; rend `{ id, … }`. */
    execute(args: JsonObject, planHeader: string, orgId: string): Promise<Record<string, string>>;
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
