import { openedOrg } from '@/assets/var';
import { localLLM } from './LocalLLMService';
import { computed, ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';

export interface AIProviderConfig {
    provider: 'local' | 'openai' | 'gemini' | 'mistral' | 'custom';
    apiKey?: string;
    endpointUrl?: string;
    modelId?: string;
}

export class AIService {
    
    public get config(): AIProviderConfig {
        return openedOrg.value?.activeModules?.aiConfig || {
            provider: 'local'
        };
    }

    public get isLocal() {
        return this.config.provider === 'local';
    }

    public get currentModelName() {
        if (this.isLocal) {
            return localLLM.currentModel.value?.name || 'Aucun';
        }
        return this.config.modelId || 'Modèle distant';
    }

    public async chat(messages: any[]): Promise<AsyncGenerator<any, void, unknown>> {
        const conf = this.config;

        if (conf.provider === 'local') {
            return localLLM.chat(messages);
        }

        if (conf.provider === 'gemini') {
            return this.chatGemini(messages);
        }

        return this.chatOpenAICompatible(messages);
    }

    public interrupt() {
        if (this.isLocal) {
            localLLM.interrupt();
        } else {
            if (this.abortController) {
                this.abortController.abort();
                this.abortController = null;
            }
        }
    }

    private abortController: AbortController | null = null;

    private async *chatOpenAICompatible(messages: any[]): AsyncGenerator<any, void, unknown> {
        this.abortController = new AbortController();

        const orgId = openedOrg.value?.id;
        if (!orgId) throw new Error("Aucune organisation ouverte");

        const url = `/api/orgs/${orgId}/ai/proxy`;

        const response = await sfetch(url, {
            method: 'POST',
            body: JSON.stringify({
                model: this.config.modelId || 'gpt-4o',
                messages: messages,
                stream: true,
                temperature: 0.7
            }),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Erreur Proxy Backend: ${response.status} ${err}`);
        }

        yield* this.parseSSEStream(response.body);
    }

    private async *chatGemini(messages: any[]): AsyncGenerator<any, void, unknown> {
        this.abortController = new AbortController();

        const orgId = openedOrg.value?.id;
        if (!orgId) throw new Error("Aucune organisation ouverte");

        const url = `/api/orgs/${orgId}/ai/proxy`;

        const geminiMessages = messages
          .filter((m: any) => m.role !== 'system')
          .map((msg: any) => {
              let role = msg.role === 'assistant' ? 'model' : 'user';
              return { role, parts: [{ text: msg.content || '' }] };
          }).filter((m: any) => m.parts && m.parts[0] && m.parts[0].text && m.parts[0].text.trim() !== '');

        const systemMsgs = messages.filter((m: any) => m.role === 'system');
        const systemInstruction = systemMsgs.length > 0 ? {
            parts: [{ text: systemMsgs.map((m: any) => m.content).join('\n') }]
        } : undefined;

        const contents = geminiMessages.filter((m: any) => m.role !== 'system');

        const response = await sfetch(url, {
            method: 'POST',
            body: JSON.stringify({
                contents,
                systemInstruction,
                generationConfig: { temperature: 0.7 }
            }),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Erreur Proxy Backend: ${response.status} ${err}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (text) {
                            buffer += text;
                            const parsedBuffer = this.checkAndYieldTools(buffer);
                            if (parsedBuffer.yielded) {
                                yield parsedBuffer.toolCall;
                                buffer = parsedBuffer.remainingBuffer;
                            } else if (parsedBuffer.safeText) {
                                yield parsedBuffer.safeText;
                                buffer = parsedBuffer.remainingBuffer;
                            }
                        }
                    } catch (e) {
                        // ignore JSON parse error on incomplete chunks
                    }
                }
            }
        }

        if (buffer.trim()) {
            if (!buffer.includes('{"name"') && !buffer.includes('<tool_call>')) {
                yield buffer;
            }
        }
    }

    private async *parseSSEStream(body: ReadableStream<Uint8Array> | null): AsyncGenerator<any, void, unknown> {
        if (!body) throw new Error("No response body");
        
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunkStr = decoder.decode(value, { stream: true });
            const lines = chunkStr.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) {
                            buffer += content;
                            
                            const parsedBuffer = this.checkAndYieldTools(buffer);
                            if (parsedBuffer.yielded) {
                                yield parsedBuffer.toolCall;
                                buffer = parsedBuffer.remainingBuffer;
                            } else if (parsedBuffer.safeText) {
                                yield parsedBuffer.safeText;
                                buffer = parsedBuffer.remainingBuffer;
                            }
                        }
                    } catch (e) {
                        // ignore JSON parse error
                    }
                }
            }
        }

        if (buffer.trim()) {
            if (!buffer.includes('{"name"') && !buffer.includes('<tool_call>')) {
                yield buffer;
            }
        }
    }

    private checkAndYieldTools(buffer: string): { yielded: boolean, toolCall?: any, safeText?: string, remainingBuffer: string } {
        // 1. JSON
        const jsonMatch = buffer.match(/\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\}|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')\s*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (typeof parsed.arguments === 'string') {
                    try { parsed.arguments = JSON.parse(parsed.arguments); } catch(e) {}
                }
                return { yielded: true, toolCall: { type: 'tool_call', ...parsed }, remainingBuffer: buffer.replace(jsonMatch[0], "") };
            } catch(e) {}
        }

        // 2. XML
        const xmlMatch = buffer.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
        if (xmlMatch && xmlMatch[1]) {
            try {
                let inner = xmlMatch[1].trim();
                inner = inner.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
                const parsed = JSON.parse(inner);
                if (typeof parsed.arguments === 'string') {
                    try { parsed.arguments = JSON.parse(parsed.arguments); } catch(e) {}
                }
                return { yielded: true, toolCall: { type: 'tool_call', ...parsed }, remainingBuffer: buffer.replace(xmlMatch[0], "") };
            } catch(e) {}
        }

        // 3. Safe text
        let safeToFlushIndex = buffer.length;
        const lastBrace = buffer.lastIndexOf('{');
        const lastAngle = buffer.lastIndexOf('<');
        
        if (lastBrace !== -1) safeToFlushIndex = Math.min(safeToFlushIndex, lastBrace);
        if (lastAngle !== -1) safeToFlushIndex = Math.min(safeToFlushIndex, lastAngle);
        
        if (buffer.length > 300 && !buffer.includes('{"name"') && !buffer.includes('<tool_call>')) {
            safeToFlushIndex = buffer.length;
        }

        if (safeToFlushIndex > 0) {
            return { yielded: false, safeText: buffer.substring(0, safeToFlushIndex), remainingBuffer: buffer.substring(safeToFlushIndex) };
        }

        return { yielded: false, remainingBuffer: buffer };
    }
}

export const aiService = new AIService();

// Vue Reactive Bindings for OrgAI.vue compatibility
export const aiIsLocal = computed(() => aiService.isLocal);
export const aiIsInitialized = computed(() => aiService.isLocal ? localLLM.isInitialized.value : true);
export const aiCurrentModelName = computed(() => aiService.currentModelName);
export const aiHasWebGPU = localLLM.hasWebGPU;
export const aiDownloadProgress = localLLM.downloadProgress;
export const aiDownloadText = localLLM.downloadText;

export const aiSessionMessages = ref<any[]>([]);

