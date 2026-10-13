import { describe, expect, test } from "bun:test";
import {
    normalizeAiConfig, providerForRegime, resolveEffectiveEffort, resolveEffectiveProvider,
} from "./aiProviders";

const multi = normalizeAiConfig({
    defaultProvider: 'openai',
    reasoningEffort: 'low',
    providers: {
        local: { enabled: true },
        openai: { enabled: true, modelId: 'gpt-4o', hasApiKey: true },
        mistral: { enabled: true, modelId: 'm' },
        gemini: { enabled: false },
    },
});

describe("normalizeAiConfig", () => {
    test("ancien format → un provider activé", () => {
        const cfg = normalizeAiConfig({ provider: 'gateway', gatewayUrl: 'https://gw', modelId: 'llama' });
        expect(cfg.defaultProvider).toBe('gateway');
        expect(cfg.providers.gateway).toEqual({ enabled: true, gatewayUrl: 'https://gw', modelId: 'llama' });
    });

    test("aucune config → local", () => {
        expect(normalizeAiConfig(undefined).defaultProvider).toBe('local');
    });

    test("défaut désactivé → premier provider activé", () => {
        const cfg = normalizeAiConfig({ defaultProvider: 'gemini', providers: { gemini: { enabled: false }, mistral: { enabled: true } } });
        expect(cfg.defaultProvider).toBe('mistral');
    });
});

describe("résolution du provider effectif", () => {
    test("sans préférence → défaut de l'org", () => {
        expect(resolveEffectiveProvider(multi, {})).toBe('openai');
    });

    test("préférence utilisateur prioritaire si activée", () => {
        expect(resolveEffectiveProvider(multi, { provider: 'mistral' })).toBe('mistral');
    });

    test("préférence sur un provider désormais désactivé → défaut de l'org", () => {
        expect(resolveEffectiveProvider(multi, { provider: 'gemini' })).toBe('openai');
    });

    test("l'override de session passe avant la préférence", () => {
        expect(resolveEffectiveProvider(multi, { provider: 'openai' }, 'local')).toBe('local');
    });

    test("effort : préférence sinon défaut de l'org", () => {
        expect(resolveEffectiveEffort(multi, {})).toBe('low');
        expect(resolveEffectiveEffort(multi, { reasoningEffort: 'high' })).toBe('high');
    });
});

describe("providerForRegime", () => {
    test("retrouve un provider de la même famille que la conversation", () => {
        expect(providerForRegime(multi, 'server', 'mistral')).toBe('mistral');
        expect(providerForRegime(multi, 'server')).toBe('openai');
        expect(providerForRegime(multi, 'client')).toBe('local');
        expect(providerForRegime(multi, 'gateway')).toBeNull();
    });
});
