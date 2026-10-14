// Miroir côté app de synco_api/src/services/ai/orgAiConfig.ts : même normalisation, pour que les
// deux côtés lisent identiquement l'ancien format (un seul provider) et le nouveau (plusieurs activés).

export type AiProviderId = 'local' | 'custom' | 'gateway' | 'openai' | 'gemini' | 'mistral';
export type ReasoningEffort = 'low' | 'medium' | 'high';
/** Famille de stockage/pilotage de conversation : on ne peut pas poursuivre une session dans une autre. */
export type SessionRegime = 'client' | 'gateway' | 'server';

export interface AiProviderMeta {
    id: AiProviderId;
    name: string;
    desc: string;
    category: 'local' | 'cloud';
    icon: string;
    regime: SessionRegime;
    needsKey: boolean;
    defaultModel?: string;
    recommendedModels?: string[];
}

export const AI_PROVIDERS: AiProviderMeta[] = [
    { id: 'local', name: 'WebGPU (local)', icon: 'bi-gpu-card', category: 'local', regime: 'client', needsKey: false,
        desc: "Exécuté sur la carte graphique de l'utilisateur. Gratuit, 100% privé, mais dépend des performances de chaque machine." },
    { id: 'custom', name: 'Serveur client (API custom)', icon: 'bi-hdd-rack', category: 'local', regime: 'client', needsKey: false,
        desc: 'Votre propre serveur local ou distant avec une API compatible OpenAI (Ollama, vLLM, etc.).' },
    { id: 'gateway', name: 'Passerelle Synco AI (auto-hébergée)', icon: 'bi-hdd-network', category: 'local', regime: 'gateway', needsKey: false,
        desc: 'Votre propre Synco AI Gateway devant un Ollama que vous contrôlez : vrais outils IA, authentification via votre compte Synco, aucune clé à distribuer.' },
    { id: 'openai', name: 'OpenAI', icon: 'bi-stars', category: 'cloud', regime: 'server', needsKey: true,
        defaultModel: 'gpt-4o-mini', recommendedModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o3-mini'],
        desc: 'Modèles cloud de pointe (GPT-4o, GPT-4o-mini).' },
    { id: 'gemini', name: 'Google Gemini', icon: 'bi-google', category: 'cloud', regime: 'server', needsKey: true,
        defaultModel: 'gemini-1.5-flash', recommendedModels: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
        desc: 'Modèles très rapides et puissants (1.5 Pro, Flash).' },
    { id: 'mistral', name: 'Mistral AI', icon: 'bi-wind', category: 'cloud', regime: 'server', needsKey: true,
        defaultModel: 'pixtral-12b-2409', recommendedModels: ['pixtral-12b-2409', 'mistral-large-latest', 'mistral-small-latest'],
        desc: 'Modèles souverains européens (Mistral Large, Pixtral).' },
];

export const AI_PROVIDER_IDS = AI_PROVIDERS.map(p => p.id);
export const getProviderMeta = (id: AiProviderId): AiProviderMeta => AI_PROVIDERS.find(p => p.id === id)!;
export const regimeOf = (id: AiProviderId): SessionRegime => getProviderMeta(id).regime;

export const isProviderId = (v: unknown): v is AiProviderId => typeof v === 'string' && (AI_PROVIDER_IDS as string[]).includes(v);
export const isReasoningEffort = (v: unknown): v is ReasoningEffort => v === 'low' || v === 'medium' || v === 'high';

export interface AiProviderEntry {
    enabled: boolean;
    modelId?: string;
    endpointUrl?: string;
    gatewayUrl?: string;
    hasApiKey?: boolean;
}

export interface NormalizedAiConfig {
    defaultProvider: AiProviderId;
    reasoningEffort: ReasoningEffort;
    providers: Partial<Record<AiProviderId, AiProviderEntry>>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

const cleanEntry = (raw: any, forceEnabled = false): AiProviderEntry => ({
    enabled: forceEnabled || raw?.enabled === true,
    ...(str(raw?.modelId) && { modelId: str(raw.modelId) }),
    ...(str(raw?.endpointUrl) && { endpointUrl: str(raw.endpointUrl) }),
    ...(str(raw?.gatewayUrl) && { gatewayUrl: str(raw.gatewayUrl) }),
    ...(raw?.hasApiKey === true && { hasApiKey: true }),
});

export const normalizeAiConfig = (raw: any): NormalizedAiConfig => {
    const reasoningEffort: ReasoningEffort = isReasoningEffort(raw?.reasoningEffort) ? raw.reasoningEffort : 'medium';

    if (!raw || typeof raw !== 'object' || typeof raw.providers !== 'object' || raw.providers === null) {
        const provider: AiProviderId = isProviderId(raw?.provider) ? raw.provider : 'local';
        return { defaultProvider: provider, reasoningEffort, providers: { [provider]: cleanEntry(raw, true) } };
    }

    const providers: NormalizedAiConfig['providers'] = {};
    for (const id of AI_PROVIDER_IDS) if (raw.providers[id]) providers[id] = cleanEntry(raw.providers[id]);
    const enabledIds = AI_PROVIDER_IDS.filter(id => providers[id]?.enabled);
    const wanted: unknown = raw.defaultProvider;
    const defaultProvider: AiProviderId = isProviderId(wanted) && providers[wanted]?.enabled ? wanted : (enabledIds[0] ?? 'local');
    return { defaultProvider, reasoningEffort, providers };
};

export const enabledProviderIds = (cfg: NormalizedAiConfig): AiProviderId[] =>
    AI_PROVIDER_IDS.filter(id => cfg.providers[id]?.enabled);

export interface AiUserPrefs {
    provider?: AiProviderId;
    reasoningEffort?: ReasoningEffort;
}

/** Provider réellement utilisé : le choix de l'utilisateur s'il est encore activé, sinon le défaut de l'org. */
export const resolveEffectiveProvider = (cfg: NormalizedAiConfig, prefs: AiUserPrefs, override?: AiProviderId | null): AiProviderId => {
    for (const candidate of [override, prefs.provider]) {
        if (candidate && cfg.providers[candidate]?.enabled) return candidate;
    }
    return cfg.defaultProvider;
};

export const resolveEffectiveEffort = (cfg: NormalizedAiConfig, prefs: AiUserPrefs): ReasoningEffort =>
    isReasoningEffort(prefs.reasoningEffort) ? prefs.reasoningEffort : cfg.reasoningEffort;

/** Premier provider activé qui peut poursuivre une conversation de cette famille, en préférant `preferred`. */
export const providerForRegime = (cfg: NormalizedAiConfig, regime: SessionRegime, preferred?: AiProviderId): AiProviderId | null => {
    const candidates = enabledProviderIds(cfg).filter(id => regimeOf(id) === regime);
    return (preferred && candidates.includes(preferred) ? preferred : candidates[0]) ?? null;
};
