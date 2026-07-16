import { pipeline, env } from '@xenova/transformers';

// Eviter de charger des modèles locaux par défaut, utiliser le CDN Xenova
env.allowLocalModels = false;

class PipelineSingleton {
    static task = 'feature-extraction' as const;
    static model = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
    static instance: any = null;

    static async getInstance(progress_callback?: Function) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.addEventListener('message', async (event) => {
    const { id, text, type } = event.data;

    if (!text) return;

    try {
        const extractor = await PipelineSingleton.getInstance((x: any) => {
            self.postMessage({ id, status: 'progress', progress: x });
        });

        // Calculer l'embedding (vecteur)
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        
        self.postMessage({
            id,
            status: 'complete',
            vector: Array.from(output.data),
            text,
            type
        });
    } catch (error: any) {
        console.error("[VectorWorker] Error generating vector:", error);
        self.postMessage({
            id,
            status: 'error',
            error: error.message
        });
    }
});
