import { pipeline, env, type TextGenerationPipeline } from '@xenova/transformers';

let cpuPipeline: TextGenerationPipeline | null = null;
let shouldStop = false;

self.onmessage = async (e: MessageEvent) => {
    const { type, payload, id } = e.data;

    try {
        if (type === 'STOP') {
            shouldStop = true;
            return;
        }
        
        if (type === 'INIT') {
            const baseUrl = payload.baseUrl;
            env.allowLocalModels = true;
            env.allowRemoteModels = false;
            env.localModelPath = baseUrl + '/models/';

            cpuPipeline = await pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', {
                progress_callback: (x: any) => {
                    self.postMessage({ type: 'PROGRESS', payload: x });
                }
            }) as TextGenerationPipeline;

            self.postMessage({ type: 'INIT_DONE', id });
        } 
        
        else if (type === 'GENERATE') {
            if (!cpuPipeline) throw new Error("Pipeline non initialisée");
            shouldStop = false;
            const { messages } = payload;

            const textPrompt = cpuPipeline.tokenizer.apply_chat_template(messages, {
                tokenize: false,
                add_generation_prompt: true
            }) as string;

            // Pré-calculer la chaîne du prompt sans les tokens spéciaux 
            // pour pouvoir isoler les nouveaux mots plus tard.
            const promptTokens = cpuPipeline.tokenizer(textPrompt).input_ids;
            const promptTextWithoutSpecial = cpuPipeline.tokenizer.decode(promptTokens, { skip_special_tokens: true });
            
            let previousText = promptTextWithoutSpecial;

            // Résoudre la promesse à la fin
            let isDone = false;

            await cpuPipeline(textPrompt, {
                max_new_tokens: 512,
                temperature: 0.7,
                do_sample: true,
                // @ts-ignore
                callback_function: (beams: any[]) => {
                    if (shouldStop) {
                        throw new Error("USER_STOPPED");
                    }
                    
                    const decodedText = cpuPipeline!.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true });
                    
                    if (decodedText.startsWith(previousText)) {
                        const newChunk = decodedText.slice(previousText.length);
                        if (newChunk.length > 0) {
                            self.postMessage({ type: 'CHUNK', payload: newChunk, id });
                            previousText = decodedText;
                        }
                    } else if (decodedText.length > previousText.length) {
                        // Fallback in case of special characters mismatch
                        const newChunk = decodedText.slice(previousText.length);
                        if (newChunk.length > 0) {
                            self.postMessage({ type: 'CHUNK', payload: newChunk, id });
                            previousText = decodedText;
                        }
                    }
                }
            });

            self.postMessage({ type: 'GENERATE_DONE', id });
        }
        
    } catch (error: any) {
        if (error.message === "USER_STOPPED" || String(error).includes("USER_STOPPED")) {
            self.postMessage({ type: 'GENERATE_DONE', id });
        } else {
            self.postMessage({ type: 'ERROR', payload: error.message || String(error), id });
        }
    }
};
