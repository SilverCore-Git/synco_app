// Ne doit jamais importer @mlc-ai/web-llm : ce module est chargé par le thread principal,
// la librairie (6 Mo) ne vit que dans le worker (cf. workers/llm.worker.ts).

export type Precision = 'f16' | 'f32';
export type Tier = 1 | 2 | 3;

export interface ModelVariant {
    mlcId: string;
    /** Valeurs vram_required_MB du prebuiltAppConfig WebLLM 0.2.84. */
    vramMB: number;
    approxBytes: number;
}

export interface LLMModel {
    /** Identifiant stable de la famille, indépendant de la précision choisie pour la machine. */
    id: string;
    name: string;
    tier: Tier;
    params: string;
    /** false = exige maxStorageBufferBindingSize ≥ 1 Go (règle WebLLM `low_resource_required`). */
    lowResource: boolean;
    variants: Record<Precision, ModelVariant>;
}

const GB = 1024 ** 3;

export const availableModels: LLMModel[] = [
    {
        id: 'mistral-7b',
        name: 'Mistral 7B',
        tier: 1,
        params: '7B',
        lowResource: false,
        variants: {
            f16: { mlcId: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC', vramMB: 4573, approxBytes: 3.8 * GB },
            f32: { mlcId: 'Mistral-7B-Instruct-v0.3-q4f32_1-MLC', vramMB: 5619, approxBytes: 4.0 * GB },
        },
    },
    {
        id: 'ministral-3b',
        name: 'Ministral 3B',
        tier: 2,
        params: '3B',
        lowResource: true,
        variants: {
            f16: { mlcId: 'Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC', vramMB: 2864, approxBytes: 2.0 * GB },
            f32: { mlcId: 'Ministral-3-3B-Instruct-2512-BF16-q4f32_1-MLC', vramMB: 3532, approxBytes: 2.2 * GB },
        },
    },
    {
        id: 'smollm2-1.7b',
        name: 'SmolLM2 1.7B',
        tier: 3,
        params: '1.7B',
        lowResource: true,
        variants: {
            f16: { mlcId: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', vramMB: 1774, approxBytes: 0.95 * GB },
            f32: { mlcId: 'SmolLM2-1.7B-Instruct-q4f32_1-MLC', vramMB: 2692, approxBytes: 1.05 * GB },
        },
    },
];

export const findModel = (id: string | null | undefined): LLMModel | undefined => {
    if (!id) return undefined;
    return availableModels.find(m => m.id === id);
};

const HF_BASE = 'https://huggingface.co/mlc-ai';

/** Miroir optionnel (même arborescence que scripts/download_ai_models.js). */
const mirrorBase = (): string | null => {
    const raw = (import.meta.env.VITE_LOCAL_AI_MODELS_URL as string | undefined)?.trim();
    if (!raw) return null;
    return new URL(raw.replace(/\/+$/, '') + '/', self.location.origin).href;
};

/** URL des poids, identique à `cleanModelUrl(record.model)` côté WebLLM : sert de clé de cache. */
export const modelBaseUrl = (mlcId: string): string => {
    const mirror = mirrorBase();
    return mirror ? `${mirror}${mlcId}/resolve/main/` : `${HF_BASE}/${mlcId}/resolve/main/`;
};

export const modelLibUrlOverride = (prebuiltLibUrl: string): string | null => {
    const mirror = mirrorBase();
    if (!mirror) return null;
    return `${mirror}wasm/${prebuiltLibUrl.split('/').pop()}`;
};

export const formatBytes = (bytes: number): string => {
    if (bytes >= GB) return `${(bytes / GB).toFixed(1).replace('.', ',')} Go`;
    return `${Math.round(bytes / 1024 ** 2)} Mo`;
};
