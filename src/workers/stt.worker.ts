import { pipeline, env } from '@xenova/transformers';

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;

class PipelineSingleton {
    static task = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-tiny';
    static instance: any = null;

    static async getInstance(progress_callback?: Function) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task as any, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.addEventListener('message', async (event) => {
    if (event.data.type === 'load') {
        try {
            await PipelineSingleton.getInstance((x: any) => {
                self.postMessage({ type: 'progress', data: x });
            });
            self.postMessage({ type: 'loaded' });
        } catch (e: any) {
            self.postMessage({ type: 'error', error: e.message });
        }
        return;
    }

    if (event.data.type === 'transcribe') {
        try {
            const transcriber = await PipelineSingleton.getInstance();
            
            const result = await transcriber(event.data.audio, {
                language: 'french',
                task: 'transcribe',
                chunk_length_s: 30,
                stride_length_s: 5,
            });

            self.postMessage({ type: 'result', text: result.text });
        } catch (e: any) {
            self.postMessage({ type: 'error', error: e.message });
        }
    }
});
