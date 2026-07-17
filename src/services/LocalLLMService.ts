import * as webllm from '@mlc-ai/web-llm';
import { ref } from 'vue';
import { availableTools } from './AITools';
export interface LLMModel {
    id: string;
    name: string;
    size: string;
    vram: number;
    tier: number;
}

export const availableModels: LLMModel[] = [
    {
        id: "Mistral-7B-Instruct-v0.3-q4f32_1-MLC",
        name: "Mistral 7B",
        size: "4.1 GB",
        vram: 4096,
        tier: 1
    },
    {
        id: "Ministral-3-3B-Instruct-2512-BF16-q4f32_1-MLC",
        name: "Ministral 3B",
        size: "2.2 GB",
        vram: 3072,
        tier: 2
    },
    {
        id: "SmolLM2-1.7B-Instruct-q4f32_1-MLC",
        name: "SmolLM2 1.7B",
        size: "1.1 GB",
        vram: 1536,
        tier: 3
    }
];

class LocalLLMService {
    engine: webllm.MLCEngine | null = null;
    isInitialized = ref(false);
    hasWebGPU = ref(!!navigator.gpu);
    downloadProgress = ref(0);
    downloadText = ref("");
    currentModel = ref<LLMModel | null>(null);

    constructor() {}

    async getRecommendedModel(): Promise<LLMModel> {
        try {
            if (!navigator.gpu) {
                console.warn("[LocalLLMService] WebGPU non supporté. On recommande le modèle Tier 3.");
                this.hasWebGPU.value = false;
                return availableModels.find(m => m.tier === 3)!;
            }

            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                this.hasWebGPU.value = false;
                return availableModels.find(m => m.tier === 3)!;
            }

            let info: any = null;
            if (adapter.requestAdapterInfo) {
                // Some older browsers might require this to be async, some synchronous.
                info = await adapter.requestAdapterInfo();
            } else {
                info = (adapter as any).info || {};
            }

            const description = (info.description || info.architecture || info.device || "").toLowerCase();
            const vendor = (info.vendor || "").toLowerCase();

            // M-series Apple Silicon
            if (vendor.includes('apple') || description.includes('apple')) {
                if (description.includes('max') || description.includes('pro') || description.includes('ultra')) {
                    return availableModels.find(m => m.tier === 1)!;
                }
                return availableModels.find(m => m.tier === 2)!;
            }

            // Nvidia
            if (vendor.includes('nvidia') || description.includes('rtx') || description.includes('geforce') || description.includes('gtx')) {
                if (description.match(/rtx\s*(30[6-9]\d|40[6-9]\d|40\d\d|30\d\d|a\d000)/)) {
                    return availableModels.find(m => m.tier === 1)!;
                }
                if (description.match(/rtx|gtx\s*(1660|1070|1080|980|1060|2060|2070|2080)/)) {
                    return availableModels.find(m => m.tier === 2)!;
                }
                return availableModels.find(m => m.tier === 2)!; // Default Nvidia is tier 2
            }

            // AMD Radeon
            if (vendor.includes('amd') || description.includes('radeon') || description.includes('rx')) {
                if (description.match(/rx\s*(6[7-9]\d\d|7[7-9]\d\d|6900|7900)/)) {
                    return availableModels.find(m => m.tier === 1)!;
                }
                return availableModels.find(m => m.tier === 2)!;
            }

            // Default fallback for Intel or unknown GPUs
            return availableModels.find(m => m.tier === 3)!;
        } catch (error) {
            console.error("[LocalLLMService] Erreur lors de l'évaluation du hardware:", error);
            this.hasWebGPU.value = false;
            return availableModels.find(m => m.tier === 3)!;
        }
    }

    async init(modelId: string) {
        if (this.engine) {
            this.engine.unload();
            this.engine = null;
        }

        this.isInitialized.value = false;
        this.downloadProgress.value = 0;
        this.downloadText.value = "Initialisation...";
        this.currentModel.value = availableModels.find(m => m.id === modelId) || null;

        const initProgressCallback = (report: webllm.InitProgressReport) => {
            console.log("[LocalLLMService] Progress:", report);
            this.downloadProgress.value = Math.round(report.progress * 100);
            this.downloadText.value = report.text;
        };

        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

        const customAppConfig: webllm.AppConfig = {
            ...webllm.prebuiltAppConfig,
            // On laisse WebLLM utiliser les URLs HuggingFace par défaut pour les modèles f32
            // puisqu'ils ne sont pas mis en cache sur le serveur local (seuls les f16 le sont).
        };

        try {
            this.engine = new webllm.MLCEngine();
            this.engine.setAppConfig(customAppConfig);
            this.engine.setInitProgressCallback(initProgressCallback);
            await this.engine.reload(modelId);
            this.isInitialized.value = true;
        } catch (error) {
            console.error("[LocalLLMService] Erreur d'initialisation du modèle:", error);
            this.downloadText.value = "Erreur d'initialisation.";
            throw error;
        }
    }

    async *chat(messages: any[]) {
        if (!this.engine || !this.isInitialized.value) {
            throw new Error("L'agent IA n'est pas prêt.");
        }


        const asyncChunkGenerator = await this.engine.chat.completions.create({
            messages,
            stream: true,
            temperature: 0.7,
        });

        let buffer = "";

        for await (const chunk of asyncChunkGenerator) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (!content) continue;
            
            buffer += content;
            
            // 1. Chercher un JSON brut complet avec regex
            // On utilise s (dotall) au cas où il y aurait des retours à la ligne
            const jsonMatch = buffer.match(/\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    yield { type: 'tool_call', ...parsed };
                    buffer = buffer.replace(jsonMatch[0], ""); // Enlever le JSON du buffer
                    continue; // On continue avec le reste du buffer
                } catch(e) {
                    // Pas encore un JSON valide, on attend
                }
            }

            // 2. Chercher une balise XML complète
            const xmlMatch = buffer.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
            if (xmlMatch) {
                try {
                    const parsed = JSON.parse(xmlMatch[1].trim());
                    yield { type: 'tool_call', ...parsed };
                    buffer = buffer.replace(xmlMatch[0], "");
                    continue;
                } catch(e) {
                    console.error("[WebGPU] Failed to parse XML tool call", e);
                }
            }

            // 3. Purge intelligente du buffer
            // On ne veut pas afficher les morceaux de JSON ou XML en cours de construction
            let safeToFlushIndex = buffer.length;
            
            const lastBrace = buffer.lastIndexOf('{');
            const lastAngle = buffer.lastIndexOf('<');
            
            if (lastBrace !== -1) safeToFlushIndex = Math.min(safeToFlushIndex, lastBrace);
            if (lastAngle !== -1) safeToFlushIndex = Math.min(safeToFlushIndex, lastAngle);
            
            // Si le buffer est bloqué par une accolade depuis trop longtemps (faux positif), on force la purge
            if (buffer.length > 300 && !buffer.includes('{"name"') && !buffer.includes('<tool_call>')) {
                safeToFlushIndex = buffer.length;
            }

            if (safeToFlushIndex > 0) {
                yield buffer.substring(0, safeToFlushIndex);
                buffer = buffer.substring(safeToFlushIndex);
            }
        }

        if (buffer.trim()) {
            // Nettoyage final pour ne pas cracher de restes de code JSON cassé
            if (!buffer.includes('{"name"') && !buffer.includes('<tool_call>')) {
                yield buffer;
            }
        }
    }

    interrupt() {
        if (this.engine) {
            this.engine.interruptGenerate();
        }
    }
}

export const localLLM = new LocalLLMService();
