import { pipeline, env } from '@xenova/transformers';

// Utiliser le CDN Xenova (Hugging Face)
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useBrowserCache = true;

class PipelineSingleton {
    static task = 'feature-extraction' as const;
    static model = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
    static instance: any = null;

    static async getInstance(progress_callback?: Function) {
        if (this.instance === null) {
            // FIX: Clear potentially corrupted cache from previous wrong settings
            try {
                const cache = await caches.open('transformers-cache');
                const requests = await cache.keys();
                for (const req of requests) {
                    if (req.url.includes('paraphrase-multilingual-MiniLM-L12-v2')) {
                        if (req.url.endsWith('.json')) {
                            const res = await cache.match(req);
                            const text = await res?.clone().text();
                            if (text && text.trim().startsWith('<')) {
                                // C'est du HTML de Vite (erreur 404), on supprime du cache
                                await cache.delete(req);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to clear bad cache", e);
            }

            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.addEventListener('message', async (event) => {
    const { id, text, type, metadata } = event.data;

    if (!text) {
        return;
    }

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
            type,
            metadata
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
