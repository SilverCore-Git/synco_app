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
        id: "SmolLM2-135M-Instruct-q0f16-MLC",
        name: "SmolLM2 135M",
        size: "0.2 GB",
        vram: 512,
        tier: 3
    }
];

class LocalLLMService {
    engine: webllm.MLCEngine | null = null;
    isInitialized = ref(false);
    hasWebGPU = ref(!!navigator.gpu);
    isCPUFallback = ref(false);
    downloadProgress = ref(0);
    downloadText = ref("");
    currentModel = ref<LLMModel | null>(null);
    worker: Worker | null = null;
    messageQueue: Map<string, { resolve: any, reject: any, onChunk?: (chunk: string) => void }> = new Map();

    constructor() {
        if (typeof window !== 'undefined') {
            this.worker = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' });
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
        }
    }

    private handleWorkerMessage(e: MessageEvent) {
        const { type, payload, id } = e.data;
        
        if (type === 'PROGRESS') {
            if (payload.status === "progress") {
                this.downloadProgress.value = Math.round((payload.loaded / payload.total) * 100);
                this.downloadText.value = "Chargement (" + payload.file + ") : " + this.downloadProgress.value + "%";
            } else if (payload.status === "ready") {
                this.downloadText.value = "Prêt.";
            } else {
                this.downloadText.value = "Initialisation en cours...";
            }
        } 
        
        else if (id && this.messageQueue.has(id)) {
            const handlers = this.messageQueue.get(id)!;
            if (type === 'INIT_DONE') {
                handlers.resolve();
                this.messageQueue.delete(id);
            } else if (type === 'GENERATE_DONE') {
                handlers.resolve();
                this.messageQueue.delete(id);
            } else if (type === 'CHUNK' && handlers.onChunk) {
                handlers.onChunk(payload);
            } else if (type === 'ERROR') {
                handlers.reject(new Error(payload));
                this.messageQueue.delete(id);
            }
        }
    }

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

        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

        const customAppConfig: webllm.AppConfig = {
            ...webllm.prebuiltAppConfig,
            model_list: [
                {
                    model: baseUrl + "/models/Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
                    model_id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
                    model_lib: baseUrl + "/models/wasm/Mistral-7B-Instruct-v0.3-q4f16_1_cs1k-webgpu.wasm",
                    vram_required_MB: 4096,
                    low_resource_required: false
                },
                {
                    model: baseUrl + "/models/Qwen2-1.5B-Instruct-q4f16_1-MLC",
                    model_id: "Qwen2-1.5B-Instruct-q4f16_1-MLC",
                    model_lib: baseUrl + "/models/wasm/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm",
                    vram_required_MB: 1536,
                    low_resource_required: true
                },
                {
                    model: baseUrl + "/models/SmolLM2-135M-Instruct-q0f16-MLC",
                    model_id: "SmolLM2-135M-Instruct-q0f16-MLC",
                    model_lib: baseUrl + "/models/wasm/SmolLM2-135M-Instruct-q0f16_cs1k-webgpu.wasm",
                    vram_required_MB: 512,
                    low_resource_required: true
                }
            ]
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

    async initCPU() {
        if (this.engine) {
            this.engine.unload();
            this.engine = null;
        }

        this.isCPUFallback.value = true;
        this.isInitialized.value = false;
        this.downloadProgress.value = 0;
        this.downloadText.value = "Initialisation du moteur CPU...";
        
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        
        try {
            await new Promise<void>((resolve, reject) => {
                const id = 'init_' + Date.now();
                this.messageQueue.set(id, { resolve, reject });
                this.worker!.postMessage({ type: 'INIT', payload: { baseUrl }, id });
            });
            this.isInitialized.value = true;
        } catch (error) {
            console.error("[LocalLLMService] Erreur d'initialisation CPU:", error);
            this.downloadText.value = "Erreur CPU.";
            throw error;
        }
    }

    async *chat(messages: any[]) {
        if (this.isCPUFallback.value && this.worker) {
            let resolveNext: ((val: any) => void) | null = null;
            const queue: string[] = [];
            let isDone = false;
            
            const id = 'gen_' + Date.now();
            const genPromise = new Promise<void>((resolve, reject) => {
                this.messageQueue.set(id, { 
                    resolve, 
                    reject,
                    onChunk: (chunk: string) => {
                        queue.push(chunk);
                        if (resolveNext) {
                            resolveNext(true);
                            resolveNext = null;
                        }
                    }
                });
                this.worker!.postMessage({ type: 'GENERATE', payload: { messages }, id });
            });

            genPromise.then(() => {
                isDone = true;
                if (resolveNext) resolveNext(true);
            }).catch(err => {
                console.error("[CPU] Erreur de génération:", err);
                isDone = true;
                if (resolveNext) resolveNext(true);
            });

            while (!isDone || queue.length > 0) {
                if (queue.length > 0) {
                    yield queue.shift()!;
                } else if (!isDone) {
                    await new Promise(r => resolveNext = r);
                }
            }
            return;
        }

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
