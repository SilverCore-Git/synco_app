import { ref } from 'vue';
import STTWorker from '../workers/stt.worker.ts?worker';

export const sttIsLoadingModel = ref(false);
export const sttProgress = ref(0);
export const sttLoadingText = ref('');
export const sttIsReady = ref(false);

export class STTService {
    private worker: Worker | null = null;
    private callbacks: Map<string, Function> = new Map();

    init() {
        if (this.worker || sttIsReady.value) return;
        
        sttIsLoadingModel.value = true;
        this.worker = new STTWorker();
        
        this.worker.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'progress') {
                if (data.data.status === 'progress') {
                    sttProgress.value = Math.round(data.data.progress);
                    sttLoadingText.value = `Téléchargement du modèle vocal (${sttProgress.value}%)`;
                } else if (data.data.status === 'init') {
                    sttLoadingText.value = `Initialisation du modèle vocal...`;
                } else if (data.data.status === 'ready') {
                    sttLoadingText.value = `Modèle vocal prêt.`;
                }
            } else if (data.type === 'loaded') {
                sttIsLoadingModel.value = false;
                sttIsReady.value = true;
            } else if (data.type === 'result') {
                const cb = this.callbacks.get('result');
                if (cb) cb(data.text);
            } else if (data.type === 'error') {
                const cb = this.callbacks.get('error');
                if (cb) cb(data.error);
                sttIsLoadingModel.value = false;
            }
        };

        this.worker.postMessage({ type: 'load' });
    }

    async transcribe(audioBuffer: Float32Array): Promise<string> {
        if (!this.worker) this.init();
        
        return new Promise((resolve, reject) => {
            this.callbacks.set('result', (text: string) => resolve(text));
            this.callbacks.set('error', (err: string) => reject(new Error(err)));
            
            this.worker!.postMessage({ type: 'transcribe', audio: audioBuffer });
        });
    }
}

export const sttService = new STTService();
