import * as webllm from '@mlc-ai/web-llm';
import { ref } from 'vue';

export interface LLMModel {
    id: string;
    name: string;
    size: string;
    vram: number;
    tier: number;
}

export const availableModels: LLMModel[] = [
    {
        id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
        name: "Mistral 7B Instruct",
        size: "4.1 GB",
        vram: 4096,
        tier: 1
    },
    {
        id: "Qwen2-1.5B-Instruct-q4f16_1-MLC",
        name: "Qwen2 1.5B",
        size: "1.1 GB",
        vram: 1536,
        tier: 2
    },
    {
        id: "SmolLM2-135M-Instruct-q4f16_1-MLC",
        name: "SmolLM2 135M",
        size: "0.2 GB",
        vram: 512,
        tier: 3
    }
];

class LocalLLMService {
    engine: webllm.MLCEngine | null = null;
    isInitialized = ref(false);
    downloadProgress = ref(0);
    downloadText = ref("");
    currentModel = ref<LLMModel | null>(null);

    async getRecommendedModel(): Promise<LLMModel> {
        try {
            if (!navigator.gpu) {
                console.warn("[LocalLLMService] WebGPU non supporté. On recommande le modèle Tier 3.");
                return availableModels.find(m => m.tier === 3)!;
            }

            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                return availableModels.find(m => m.tier === 3)!;
            }

            // Pour Chrome, requestAdapterInfo est parfois asynchrone, on gère les 2
            const info = await adapter.requestAdapterInfo();
            const device = await adapter.requestDevice();
            
            // Estimation basique via limits si disponible
            // On retourne Tier 1 par défaut si WebGPU est actif (ex: 4060).
            return availableModels.find(m => m.tier === 1)!;
        } catch (error) {
            console.error("[LocalLLMService] Erreur lors de l'évaluation du hardware:", error);
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

        try {
            this.engine = new webllm.MLCEngine();
            this.engine.setInitProgressCallback(initProgressCallback);
            await this.engine.reload(modelId);
            this.isInitialized.value = true;
        } catch (error) {
            console.error("[LocalLLMService] Erreur d'initialisation du modèle:", error);
            this.downloadText.value = "Erreur d'initialisation.";
            throw error;
        }
    }

    async *chat(messages: webllm.ChatCompletionMessageParam[]) {
        if (!this.engine || !this.isInitialized.value) {
            throw new Error("L'agent IA n'est pas prêt.");
        }

        const asyncChunkGenerator = await this.engine.chat.completions.create({
            messages,
            stream: true,
            temperature: 0.7,
        });

        for await (const chunk of asyncChunkGenerator) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }
}

export const localLLM = new LocalLLMService();
