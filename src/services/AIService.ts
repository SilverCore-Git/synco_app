import { openedOrg, user } from '@/assets/var';
import { localLLM } from './LocalLLMService';
import { computed, ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { encryptForPeer, decryptFromPeer, privateKey } from '@/assets/utils/crypto';

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

export const selectedModelId = ref<string>('');
export const chatSessions = ref<any[]>([]);
export const activeSessionId = ref<string | null>(null);

export const fetchSessions = async () => {
    if (!openedOrg.value) return;
    try {
        const res = await sfetch(`/api/orgs/${openedOrg.value.id}/ai/sessions`);
        if (res.ok) {
            chatSessions.value = await res.json();
        }
    } catch (e) {
        console.error("Erreur chargement des sessions", e);
    }
};

export const loadSession = async (id: string) => {
    if (!openedOrg.value) return;
    try {
        const res = await sfetch(`/api/orgs/${openedOrg.value.id}/ai/sessions/${id}`);
        if (res.ok) {
            const session = await res.json();
            activeSessionId.value = session.id;
            
            let loadedMessages = session.messages || [];
            if (loadedMessages.isE2EE && loadedMessages.ciphertext && loadedMessages.encryptedAesKey && loadedMessages.iv) {
                if (privateKey.value) {
                    try {
                        const decryptedStr = await decryptFromPeer(
                            loadedMessages.ciphertext, 
                            loadedMessages.encryptedAesKey, 
                            loadedMessages.iv, 
                            privateKey.value
                        );
                        loadedMessages = JSON.parse(decryptedStr);
                    } catch (e) {
                        console.error("Erreur de déchiffrement de la session AI", e);
                        loadedMessages = [{ role: 'system', content: '[⚠️ Impossible de déchiffrer cette conversation.]' }];
                    }
                } else {
                    loadedMessages = [{ role: 'system', content: '[🔒 Conversation chiffrée. Clé privée manquante.]' }];
                }
            }
            
            aiSessionMessages.value = loadedMessages;
        }
    } catch (e) {
        console.error("Erreur chargement de la session", e);
    }
};

export const deleteSession = async (id: string) => {
    if (!openedOrg.value) return;
    try {
        const res = await sfetch(`/api/orgs/${openedOrg.value.id}/ai/sessions/${id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            if (activeSessionId.value === id) {
                aiSessionMessages.value = [];
                activeSessionId.value = null;
            }
            await fetchSessions();
        }
    } catch (e) {
        console.error("Erreur suppression de la session", e);
    }
};

export const newSession = () => {
    aiService.interrupt();
    aiSessionMessages.value = [];
    activeSessionId.value = null;
};

export const syncSession = async (lastPrompt: string) => {
    if (!openedOrg.value) return;
    try {
        let payloadMessages: any = aiSessionMessages.value;

        if (user.value?.publicKey && privateKey.value) {
            try {
                const encrypted = await encryptForPeer(
                    JSON.stringify(aiSessionMessages.value), 
                    user.value.publicKey,
                    user.value.publicKey
                );
                
                payloadMessages = {
                    isE2EE: true,
                    ciphertext: encrypted.ciphertext,
                    encryptedAesKey: encrypted.selfEncryptedAesKey || encrypted.encryptedAesKey,
                    iv: encrypted.iv
                };
            } catch (e) {
                console.error("Erreur de chiffrement E2EE de la session AI", e);
            }
        }

        if (!activeSessionId.value) {
            // Create session
            const title = lastPrompt.substring(0, 30) + (lastPrompt.length > 30 ? '...' : '');
            const res = await sfetch(`/api/orgs/${openedOrg.value.id}/ai/sessions`, {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    messages: payloadMessages
                })
            });
            if (res.ok) {
                const data = await res.json();
                activeSessionId.value = data.id;
                await fetchSessions();
            }
        } else {
            // Update session
            await sfetch(`/api/orgs/${openedOrg.value.id}/ai/sessions/${activeSessionId.value}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    messages: payloadMessages
                })
            });
        }
    } catch (e) {
        console.error("Erreur synchro session", e);
    }
};
