import { openedOrg, user } from '@/assets/var';
import { localLLM } from './LocalLLMService';
import { computed, ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { keycloak } from '@/assets/keycloak';
import { encryptForPeer, decryptFromPeer, privateKey, encryptAiField, decryptAiField } from '@/assets/utils/crypto';
import { ensureAiSessionKey, getAiSessionKeyRawBase64, AiSessionKeyUnavailableError } from './AiSessionKeyService';
import { assertAllowedGateway } from './aiGatewayPolicy';

export interface AIProviderConfig {
    provider: 'local' | 'openai' | 'gemini' | 'mistral' | 'custom' | 'gateway';
    apiKey?: string;
    endpointUrl?: string;
    /** URL de la Synco AI Gateway auto-hébergée (provider 'gateway' uniquement). */
    gatewayUrl?: string;
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

    /**
     * Appel direct navigateur → passerelle, sans passer par sfetch (qui cible toujours
     * VITE_API_URL) : on attache le même token Keycloak à la main, exactement comme sfetch le
     * ferait, mais vers une origine arbitraire (l'URL de la Synco AI Gateway auto-hébergée).
     * Porte aussi la clé de session IA de l'org (X-Session-Key) — la passerelle en a besoin pour
     * déchiffrer/chiffrer les champs sensibles avant/après son propre appel à synco_api, cf.
     * E2EE_PLAN.md §3-4. `synco_api` ne voit jamais cette clé (appel direct navigateur→gateway).
     *
     * `gatewayUrl` vient d'activeModules.aiConfig, lu tel quel depuis la réponse de l'API : un
     * détenteur de ORG_AI (ou l'opérateur/un intrus côté synco_api, sans toucher la base) peut la
     * pointer vers un serveur arbitraire, qui recevrait alors le jeton Keycloak complet de chaque
     * membre et la clé de session IA en clair. `assertAllowedGateway` valide la forme de l'URL et,
     * si l'origine n'est pas déjà fiable (liste blanche au build ou déjà acceptée), bloque tant que
     * l'utilisateur n'a pas explicitement autorisé cette origine précise (audit FC5).
     */
    private async gatewayFetch(orgId: string, path: string, body: any, signal: AbortSignal): Promise<Response> {
        const userId = user.value?.id;
        if (!userId) throw new Error('Utilisateur non identifié.');
        const base = await assertAllowedGateway(this.config.gatewayUrl, userId, orgId);

        // Indépendants l'un de l'autre (rafraîchir le token Keycloak / récupérer la clé de session
        // IA) — en parallèle plutôt qu'en séquence, ça évite d'empiler deux aller-retours réseau
        // quand ni l'un ni l'autre n'est déjà en cache (ex: tout premier message d'une session).
        const [, sessionKeyB64] = await Promise.all([
            keycloak.authenticated ? keycloak.updateToken(60).catch(() => {}) : Promise.resolve(),
            getAiSessionKeyRawBase64(orgId),
        ]);
        return fetch(`${base}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {}),
                'X-Session-Key': sessionKeyB64,
            },
            body: JSON.stringify(body),
            signal,
        });
    }

    /**
     * Nouvelle boucle d'agent serveur (providers OpenAI/Mistral/Gemini via synco_api, ou une
     * Synco AI Gateway auto-hébergée pour Ollama) : le backend qui répond possède la conversation
     * et exécute lui-même les tools 'server' — contrairement à chat()/chatOpenAICompatible
     * ci-dessous qui restent l'ancien parseur regex <tool_call> côté client pour les autres providers.
     */
    public async *chatAgentTurn(orgId: string, sessionId: string | null, message: string): AsyncGenerator<any, void, unknown> {
        this.abortController = new AbortController();

        let response: Response;

        if (this.config.provider === 'gateway') {
            response = await this.gatewayFetch(orgId, '/chat', {
                orgId,
                sessionId: sessionId || undefined,
                message,
                syncoApiUrl: import.meta.env.VITE_API_URL,
                modelId: this.config.modelId,
            }, this.abortController.signal);
        } else {
            response = await sfetch(`/api/orgs/${orgId}/ai/chat`, {
                method: 'POST',
                body: JSON.stringify({ sessionId: sessionId || undefined, message }),
                signal: this.abortController.signal,
            });
        }

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            throw new Error(`Erreur agent IA (${response.status}): ${err}`);
        }

        yield* this.parseAgentEventStream(response.body);
    }

    public async *resumeAgentTurn(orgId: string, sessionId: string, decision: { accepted?: boolean; clientResult?: any }): AsyncGenerator<any, void, unknown> {
        this.abortController = new AbortController();

        let response: Response;

        if (this.config.provider === 'gateway') {
            response = await this.gatewayFetch(orgId, `/chat/${sessionId}/tool-result`, {
                orgId,
                syncoApiUrl: import.meta.env.VITE_API_URL,
                modelId: this.config.modelId,
                ...decision,
            }, this.abortController.signal);
        } else {
            response = await sfetch(`/api/orgs/${orgId}/ai/chat/${sessionId}/tool-result`, {
                method: 'POST',
                body: JSON.stringify(decision),
                signal: this.abortController.signal,
            });
        }

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            throw new Error(`Erreur agent IA (${response.status}): ${err}`);
        }

        yield* this.parseAgentEventStream(response.body);
    }

    private async *parseAgentEventStream(body: ReadableStream<Uint8Array> | null): AsyncGenerator<any, void, unknown> {
        if (!body) throw new Error('Réponse vide du serveur.');

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() || '';

            for (const chunk of chunks) {
                const line = chunk.split('\n').find((l) => l.startsWith('data:'));
                if (!line) continue;
                try {
                    yield JSON.parse(line.slice(5).trim());
                } catch {
                    // ignore malformed lines
                }
            }
        }
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

/**
 * Liste les modèles déjà présents sur l'Ollama d'une organisation, via sa Synco AI Gateway (pas
 * d'appel direct navigateur → Ollama, pour éviter une config CORS séparée sur Ollama). La
 * passerelle sait elle-même où joindre Ollama (OLLAMA_URL, config de déploiement) — on ne le lui
 * dit pas ici. Utilisé par AISettings.vue pour peupler le sélecteur de modèle du provider 'gateway'.
 *
 * Même contrôle que gatewayFetch (audit FC5) : avant ce correctif, chaque frappe dans le champ
 * d'URL (débounce 500ms côté AISettings.vue) envoyait le jeton Keycloak complet à l'origine en
 * cours de saisie, sans aucune validation.
 */
export async function listGatewayModels(gatewayUrl: string, orgId: string): Promise<string[]> {
    const userId = user.value?.id;
    if (!userId) throw new Error('Utilisateur non identifié.');
    const base = await assertAllowedGateway(gatewayUrl, userId, orgId);

    if (keycloak.authenticated) {
        await keycloak.updateToken(60).catch(() => {});
    }
    const url = `${base}/models`;

    const res = await fetch(url, {
        headers: keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {},
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body.error || `Erreur ${res.status} lors de la récupération des modèles.`);
    }

    const data = await res.json();
    return Array.isArray(data.models) ? data.models : [];
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
        const orgId = openedOrg.value.id;
        const res = await sfetch(`/api/orgs/${orgId}/ai/sessions`);
        if (res.ok) {
            const sessions: any[] = await res.json();

            await Promise.all(sessions.map(async (session) => {
                // Titre chiffré côté client (provider 'gateway' uniquement, cf. setEncryptedSessionTitle).
                // Détecté par le préfixe "gcm1:" du champ lui-même, PAS par session.encryptionScheme : la
                // passerelle Synco AI Gateway ne pose jamais ce marqueur (elle chiffre/déchiffre chaque
                // champ selon son propre préfixe, sans jamais lire/écrire encryptionScheme — voir
                // Synco_AI_Gateway/src/crypto.rs::decrypt_field_if_encrypted), donc s'y fier laisserait
                // le titre affiché en clair-ciphertext indéfiniment. Un titre pas encore posé (session
                // flambant neuve) reste le défaut en clair de synco_api, sans préfixe "gcm1:".
                if (typeof session.title === 'string' && session.title.startsWith('gcm1:')) {
                    try {
                        const key = await ensureAiSessionKey(orgId);
                        session.title = await decryptAiField(key, session.id, '__session_title__', 'title', session.title);
                    } catch (e) {
                        session.title = '🔒 Titre chiffré';
                    }
                }
            }));

            chatSessions.value = sessions;
        }
    } catch (e) {
        console.error("Erreur chargement des sessions", e);
    }
};

/**
 * Reconstruit les turns "parts" (texte + tools entrelacés) affichés par OrgAI.vue à partir des
 * StoredMessage[] structurés persistés par la nouvelle boucle d'agent serveur (rôles 'user' /
 * 'assistant' avec toolCalls / 'tool' avec le résultat) — sans quoi une session rechargée perd
 * tout l'affichage des tools (ils n'existent que sous forme de turns "parts" côté client).
 * Une seule "turn" regroupe tout ce qui suit un message 'user', jusqu'au 'user' suivant :
 * une réponse peut en effet être composée de plusieurs StoredMessage successifs (texte, tool,
 * texte, tool...) qui forment visuellement un seul tour assistant continu.
 */
function convertStoredMessagesToChatMessages(stored: any[]): any[] {
    const result: any[] = [];
    let currentTurn: any = null;

    for (const m of stored) {
        if (m.role === 'user') {
            currentTurn = null;
            result.push({ role: 'user', content: m.content || '' });
            continue;
        }

        if (!currentTurn) {
            currentTurn = { role: 'assistant', content: '', viaAgentLoop: true, parts: [] };
            result.push(currentTurn);
        }

        if (m.role === 'assistant') {
            if (m.content) currentTurn.parts.push({ type: 'text', text: m.content });
            for (const tc of m.toolCalls || []) {
                currentTurn.parts.push({
                    type: 'tool',
                    tool: {
                        toolCallId: tc.id,
                        name: tc.name,
                        args: tc.arguments,
                        status: tc.status === 'error' ? 'error' : 'pending',
                        category: tc.category,
                        mutating: tc.mutating,
                    },
                });
            }
        } else if (m.role === 'tool') {
            const part = currentTurn.parts.find((p: any) => p.type === 'tool' && p.tool.toolCallId === m.toolCallId);
            if (part) {
                part.tool.status = m.toolResult?.error ? 'error' : 'done';
                part.tool.result = m.toolResult;
            }
        }
    }

    return result;
}

/** true si ces messages viennent de la nouvelle boucle d'agent serveur (présence d'un rôle 'tool' ou de toolCalls structurés). */
function isStructuredAgentTranscript(messages: any[]): boolean {
    return messages.some((m) => m.role === 'tool' || (Array.isArray(m.toolCalls) && m.toolCalls.length > 0));
}

/**
 * true si au moins un champ de ces StoredMessage[] porte le préfixe "gcm1:" (nouveau flux agent
 * serveur, provider 'gateway'). Sert de détecteur à la place de `session.encryptionScheme` : la
 * passerelle Synco AI Gateway ne pose jamais ce marqueur côté synco_api (elle chiffre/déchiffre
 * chaque champ selon son propre préfixe uniquement, cf. Synco_AI_Gateway/src/crypto.rs —
 * `decrypt_field_if_encrypted`/`encrypt_field` ne lisent/écrivent jamais encryptionScheme), donc
 * une session gateway a systématiquement encryptionScheme === null malgré un contenu chiffré.
 */
function hasEncryptedGatewayFields(messages: any[]): boolean {
    return messages.some((m) => {
        if (typeof m.content === 'string' && m.content.startsWith('gcm1:')) return true;
        if (typeof m.toolResult === 'string' && m.toolResult.startsWith('gcm1:')) return true;
        if (Array.isArray(m.toolCalls) && m.toolCalls.some((tc: any) => typeof tc.arguments === 'string' && tc.arguments.startsWith('gcm1:'))) return true;
        return false;
    });
}

/**
 * Déchiffre les champs opaques `"gcm1:..."` d'un StoredMessage[] issu du nouveau flux agent
 * serveur : `content`, `toolResult`, `toolCalls[].arguments`, tous liés par AAD à `session.id` +
 * l'id du message (cf. E2EE_PLAN.md §2 et §4.3). Chaque champ est déchiffré indépendamment — un
 * échec isolé (auth GCM invalide, JSON malformé) retombe sur un placeholder pour CE champ, sans
 * effacer le reste de l'historique : sans marqueur de session fiable (cf. hasEncryptedGatewayFields
 * ci-dessus), on ne peut plus présumer que TOUT le contenu d'une session est chiffré de façon
 * homogène. `pendingToolCall.args` n'est décrypté nulle part côté frontend aujourd'hui (aucun
 * composant ne lit `session.pendingToolCall`) — laissé chiffré tel quel plutôt que déchiffré pour
 * rien ; utiliser decryptAiField(key, session.id, '__pending__', 'pending_tool_call_args', ...) le
 * jour où une UI en a besoin.
 */
async function decryptGatewaySessionMessages(key: CryptoKey, sessionId: string, messages: any[]): Promise<any[]> {
    return Promise.all(messages.map(async (m) => {
        const out = { ...m };

        if (typeof out.content === 'string' && out.content.startsWith('gcm1:')) {
            try {
                out.content = await decryptAiField(key, sessionId, m.id, 'content', out.content);
            } catch (e) {
                console.error("[E2EE] Échec du déchiffrement du contenu du message", m.id, e);
                out.content = '[⚠️ Contenu illisible.]';
            }
        }

        if (typeof out.toolResult === 'string' && out.toolResult.startsWith('gcm1:')) {
            try {
                out.toolResult = JSON.parse(await decryptAiField(key, sessionId, m.id, 'tool_result', out.toolResult));
            } catch (e) {
                console.error("[E2EE] Échec du déchiffrement du résultat d'outil", m.id, e);
                out.toolResult = { error: 'Résultat illisible.' };
            }
        }

        if (Array.isArray(out.toolCalls)) {
            out.toolCalls = await Promise.all(out.toolCalls.map(async (tc: any) => {
                if (typeof tc.arguments === 'string' && tc.arguments.startsWith('gcm1:')) {
                    try {
                        const decrypted = await decryptAiField(key, sessionId, m.id, `tool_call_arguments:${tc.id}`, tc.arguments);
                        return { ...tc, arguments: JSON.parse(decrypted) };
                    } catch (e) {
                        console.error("[E2EE] Échec du déchiffrement des arguments d'outil", tc.id, e);
                        return { ...tc, arguments: {} };
                    }
                }
                return tc;
            }));
        }

        return out;
    }));
}

export const loadSession = async (id: string) => {
    if (!openedOrg.value) return;
    try {
        const orgId = openedOrg.value.id;
        const res = await sfetch(`/api/orgs/${orgId}/ai/sessions/${id}`);
        if (res.ok) {
            const session = await res.json();
            activeSessionId.value = session.id;

            let loadedMessages = session.messages || [];

            if (Array.isArray(loadedMessages) && hasEncryptedGatewayFields(loadedMessages)) {
                // Cas 3 (nouveau) : structure JSON en clair, mais content/toolResult/toolCalls[].arguments
                // sont des chaînes opaques "gcm1:..." chiffrées avec la clé de session IA de l'org.
                try {
                    const key = await ensureAiSessionKey(orgId);
                    loadedMessages = await decryptGatewaySessionMessages(key, session.id, loadedMessages);
                } catch (e) {
                    if (e instanceof AiSessionKeyUnavailableError) {
                        loadedMessages = [{ role: 'system', content: '[🔒 Conversation chiffrée. Clé privée manquante.]' }];
                    } else {
                        console.error("Erreur de déchiffrement de la session AI (gateway)", e);
                        loadedMessages = [{ role: 'system', content: '[⚠️ Impossible de déchiffrer cette conversation.]' }];
                    }
                }
            } else if (loadedMessages && loadedMessages.isE2EE && loadedMessages.ciphertext && loadedMessages.encryptedAesKey && loadedMessages.iv) {
                // Cas 2 (legacy E2EE client-driven, providers 'local'/'custom') : enveloppe RSA+AES-GCM auto-chiffrée.
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
            // Sinon cas 1 (legacy le plus ancien) : messages déjà en clair, rien à faire.

            if (Array.isArray(loadedMessages) && isStructuredAgentTranscript(loadedMessages)) {
                loadedMessages = convertStoredMessagesToChatMessages(loadedMessages);
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

/**
 * Pose le titre chiffré d'une session gateway. `syncSession()` ne s'applique pas au provider
 * 'gateway' (c'est Synco_AI_Gateway, pas ce repo, qui écrit les messages) mais le titre reste à la
 * charge du navigateur puisque `synco_api` ne peut plus le dériver lui-même depuis un `content`
 * désormais chiffré (cf. E2EE_PLAN.md §4.4). À appeler juste après le tout premier message d'une
 * nouvelle session gateway, en fire-and-forget (ne doit jamais bloquer/faire échouer l'envoi).
 *
 * On en profite pour poser `encryptionScheme: 'gateway-aes-gcm-v1'` sur la session — la passerelle
 * ne le fait jamais elle-même (elle chiffre/déchiffre chaque champ par son seul préfixe "gcm1:",
 * sans lire/écrire ce marqueur), alors qu'un provider 'gateway' chiffre TOUJOURS son contenu sans
 * condition côté passerelle : c'est donc une affirmation vraie dès qu'on sait qu'on parle à une
 * session gateway. Ça active enfin le garde-fou anti-downgrade déjà présent côté synco_api
 * (PATCH /:sessionId refuse de changer encryptionScheme une fois posé) — synco_app lui-même ne
 * s'appuie plus sur ce marqueur pour décider quoi déchiffrer (cf. hasEncryptedGatewayFields), donc
 * son absence éventuelle (session encore plus ancienne que ce premier PATCH) ne casse rien ici.
 */
export const setEncryptedSessionTitle = async (orgId: string, sessionId: string, plainTitle: string) => {
    try {
        const key = await ensureAiSessionKey(orgId);
        const encryptedTitle = await encryptAiField(key, sessionId, '__session_title__', 'title', plainTitle.slice(0, 60));
        await sfetch(`/api/orgs/${orgId}/ai/sessions/${sessionId}`, {
            method: 'PATCH',
            body: JSON.stringify({ title: encryptedTitle, encryptionScheme: 'gateway-aes-gcm-v1' }),
        });
    } catch (e) {
        console.error("Erreur lors de la pose du titre chiffré de la session AI", e);
    }
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
