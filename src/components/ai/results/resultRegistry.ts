/**
 * Registre des rendus de résultats d'outils, par domaine (L15-0). Un domaine ajoute son rendu en déposant
 * `components/ai/results/<Domaine>Result.vue` (ex. `TasksResult.vue`) : aucun fichier partagé à modifier.
 * Vide au socle ; `ToolResultBody.vue` retombe sur le rendu générique tant qu'un domaine n'a pas de rendu.
 */
import type { Component } from 'vue';

export const RESULT_DOMAINS = [
    'tasks', 'agenda', 'spaces', 'threads', 'messages', 'files', 'members',
    'notifications', 'reports', 'support', 'search', 'web', 'agent',
] as const;
export type ResultDomain = (typeof RESULT_DOMAINS)[number];

export type ResultLoader = () => Promise<{ default: Component }>;
export type ResultModules = Record<string, ResultLoader>;

/** `./TasksResult.vue` → `tasks`. Rend null pour tout autre nom (fichier étranger, domaine inconnu). */
export function domainFromResultPath(path: string): ResultDomain | null {
    const m = /^(?:.*\/)?([A-Z][A-Za-z]*)Result\.vue$/.exec(path);
    const domain = m?.[1]?.toLowerCase();
    return RESULT_DOMAINS.find(d => d === domain) ?? null;
}

export function buildResultRegistry(modules: ResultModules): Partial<Record<ResultDomain, ResultLoader>> {
    const out: Partial<Record<ResultDomain, ResultLoader>> = {};
    for (const [path, loader] of Object.entries(modules)) {
        const domain = domainFromResultPath(path);
        if (domain && typeof loader === 'function') out[domain] = loader;
    }
    return out;
}
