import { defineAsyncComponent, type Component } from 'vue';
import { buildResultRegistry, RESULT_DOMAINS, type ResultDomain, type ResultModules } from './resultRegistry';

/** Domaine de chaque outil, appris du manifeste `GET /ai/tools` (champ `domain`). */
const domainByTool = new Map<string, ResultDomain>();

export function rememberToolDomains(tools: ReadonlyArray<{ name: string; domain?: string | null }>): void {
    for (const t of tools) {
        const d = RESULT_DOMAINS.find(x => x === t.domain);
        if (d) domainByTool.set(t.name, d);
    }
}

/**
 * Outils propres au runtime, absents du manifeste de l'appareil (`GET /ai/tools` les écarte, L15-web) : leur
 * domaine ne peut pas s'y apprendre. Liste fermée, sans effet sur ce que l'agent peut appeler.
 */
const RUNTIME_ONLY_DOMAINS: ReadonlyMap<string, ResultDomain> = new Map([['web_search', 'web'], ['web_fetch', 'web']]);

export const toolDomainOf = (name: string): ResultDomain | undefined =>
    domainByTool.get(name) ?? RUNTIME_ONLY_DOMAINS.get(name);

const components = new Map<ResultDomain, Component>();

/** Composant de rendu du domaine d'un outil, ou null (rendu générique). `modules` : injectable pour les tests. */
export function resultComponentFor(name: string, modules: ResultModules): Component | null {
    const domain = toolDomainOf(name);
    if (!domain) return null;
    const cached = components.get(domain);
    if (cached) return cached;
    const loader = buildResultRegistry(modules)[domain];
    if (!loader) return null;
    const comp = defineAsyncComponent(loader);
    components.set(domain, comp);
    return comp;
}
