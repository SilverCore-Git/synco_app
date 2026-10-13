import { computed, ref, shallowRef } from 'vue';
import type { WorkerRequest, WorkerResponse } from '../workers/llm.worker';
import { availableModels, findModel, type LLMModel } from './localLLM/catalog';
import { clearAllModelCaches, deleteModelCache, getCachedBytes, getModelCacheStatus, getModelSize, type ModelCacheStatus } from './localLLM/modelCache';
import {
    assessModel, capTierAfterFailure, resetTierCap, getHardwareProfile, recommendModel,
    type HardwareProfile, type ModelAssessment, type Recommendation,
} from './localLLM/hardwareProfile';

export { availableModels, type LLMModel };

export type LocalAIStatus = 'detecting' | 'unsupported' | 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

const SELECTION_KEY = 'synco_local_ai_model';
const LAST_USED_KEY = 'synco_local_ai_last_used';
const AUTOLOAD_KEY = 'synco_local_ai_autoload';
const WARMUP_KEY = 'synco_local_ai_warmup';
const DEBUG_KEY = 'synco_local_ai_debug';
const RECENT_USE_MS = 7 * 24 * 3600 * 1000;
// Le téléchargement occupe 0→90 % de la barre, l'upload GPU 90→100 %, pour une barre monotone.
const DOWNLOAD_SHARE = 0.9;

const storageGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const storageSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* noop */ } };

class LocalLLMService {
    status = ref<LocalAIStatus>('detecting');
    profile = shallowRef<HardwareProfile | null>(null);
    recommendation = shallowRef<Recommendation | null>(null);
    /** Famille choisie sur CET appareil (pas synchronisée au compte : le matériel diffère d'un PC à l'autre). */
    selectedModelId = ref<string>('');
    currentModel = ref<LLMModel | null>(null);
    cacheStatus = ref<ModelCacheStatus | null>(null);
    exactSizeBytes = ref<number | null>(null);

    /** Réglages de l'appareil : charger le modèle seul à l'ouverture / le précharger en tâche de fond / journaliser. */
    autoLoad = ref(storageGet(AUTOLOAD_KEY) !== '0');
    backgroundWarmup = ref(storageGet(WARMUP_KEY) !== '0');
    debugLogs = ref(storageGet(DEBUG_KEY) === '1');

    progress = ref(0);
    phase = ref<'download' | 'load' | null>(null);
    downloadedBytes = ref(0);
    totalBytes = ref(0);
    bytesPerSec = ref(0);
    error = ref<{ message: string; kind: string } | null>(null);
    notice = ref('');

    isInitialized = computed(() => this.status.value === 'ready');
    hasWebGPU = computed(() => this.status.value !== 'unsupported');
    selectedModel = computed(() => findModel(this.selectedModelId.value) ?? null);
    selectedAssessment = computed<ModelAssessment | null>(() => {
        const p = this.profile.value;
        const m = this.selectedModel.value;
        return p && m ? assessModel(p, m, this.cacheStatus.value?.cachedBytes ?? 0) : null;
    });

    private worker: Worker | null = null;
    private prepared: Promise<void> | null = null;
    private loading: { mlcId: string; promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } | null = null;
    private chatListeners = new Map<string, (msg: WorkerResponse) => void>();
    private speedSamples: Array<{ t: number; bytes: number }> = [];
    private downloadedThisLoad = false;

    /** Détection matérielle + choix du modèle + état du cache. Idempotent et peu coûteux après le 1er appel. */
    prepare(): Promise<void> {
        this.prepared ??= (async () => {
            const profile = await getHardwareProfile();
            this.profile.value = profile;
            if (!profile.webgpu) {
                this.status.value = 'unsupported';
                return;
            }
            this.recommendation.value = recommendModel(profile);
            this.log('Profil matériel', profile, this.recommendation.value.assessments
                .map(a => ({ modèle: a.model.name, ok: a.fits, tokS: a.estTokensPerSec && Math.round(a.estTokensPerSec), bloquants: a.blockers.join(', ') })));
            const saved = findModel(storageGet(SELECTION_KEY));
            this.selectedModelId.value = (saved ?? this.recommendation.value.model).id;
            if (this.status.value === 'detecting') this.status.value = 'idle';
            await this.refreshCacheStatus();
        })();
        return this.prepared;
    }

    /** Charge le modèle sans intervention si ses poids sont déjà sur le disque. */
    async autoLoadIfCached() {
        await this.prepare();
        if (!this.autoLoad.value) return;
        if (this.status.value === 'idle' && this.cacheStatus.value?.complete) {
            await this.load().catch(() => { /* état d'erreur déjà exposé */ });
        }
    }

    /** Préchargement en tâche de fond pour qui utilise l'IA locale régulièrement sur cette machine. */
    warmupInBackground() {
        if (!this.autoLoad.value || !this.backgroundWarmup.value) return;
        const last = Number(storageGet(LAST_USED_KEY) || 0);
        if (Date.now() - last > RECENT_USE_MS) return;
        const run = () => this.autoLoadIfCached();
        const ric = (globalThis as any).requestIdleCallback as ((cb: () => void, o?: any) => void) | undefined;
        if (ric) ric(run, { timeout: 5000 });
        else setTimeout(run, 2000);
    }

    async select(familyId: string) {
        // Sans le profil matériel on viserait la mauvaise variante (f16/f32) pour le cache et le chargement.
        await this.prepare();
        if (this.status.value === 'unsupported') return;
        const model = findModel(familyId);
        if (!model || model.id === this.selectedModelId.value) return;
        storageSet(SELECTION_KEY, model.id);
        this.selectedModelId.value = model.id;
        this.notice.value = '';
        this.error.value = null;
        if (this.loading) {
            this.unload();
        } else if (this.status.value === 'ready' || this.status.value === 'error') {
            this.status.value = 'idle';
        }
        await this.refreshCacheStatus();
        if (this.cacheStatus.value?.complete) await this.load().catch(() => {});
    }

    setAutoLoad(v: boolean) { this.autoLoad.value = v; storageSet(AUTOLOAD_KEY, v ? '1' : '0'); }
    setBackgroundWarmup(v: boolean) { this.backgroundWarmup.value = v; storageSet(WARMUP_KEY, v ? '1' : '0'); }
    setDebugLogs(v: boolean) { this.debugLogs.value = v; storageSet(DEBUG_KEY, v ? '1' : '0'); }

    private log(...args: unknown[]) {
        if (this.debugLogs.value) console.info('[LocalLLM]', ...args);
    }

    /**
     * Libère réellement la mémoire graphique : on termine le worker (donc le moteur WebGPU), là où
     * `unload()` ne fait que décharger le modèle en gardant le moteur. Les poids restent sur le disque.
     */
    releaseGpu() {
        this.log('Déchargement du GPU');
        this.loading?.reject(new Error('Chargement annulé.'));
        this.loading = null;
        this.worker?.postMessage({ type: 'interrupt' } satisfies WorkerRequest);
        this.worker?.terminate();
        this.worker = null;
        for (const [id, listener] of this.chatListeners) {
            listener({ type: 'chatError', id, message: 'Le GPU a été déchargé.' });
        }
        this.currentModel.value = null;
        this.phase.value = null;
        this.progress.value = 0;
        this.error.value = null;
        if (this.status.value !== 'unsupported') this.status.value = 'idle';
        return this.refreshCacheStatus();
    }

    /** Octets en cache de chaque modèle du catalogue (f16 + f32 cumulés). */
    async listModelDisk(): Promise<Array<{ model: LLMModel; cachedBytes: number }>> {
        await this.prepare();
        return Promise.all(availableModels.map(async model => ({
            model,
            cachedBytes: (await Promise.all((['f16', 'f32'] as const).map(k => getCachedBytes(model.variants[k].mlcId))))
                .reduce((a, b) => a + b, 0),
        })));
    }

    /** Supprime les poids du navigateur (les deux précisions). Décharge d'abord le GPU s'il s'agit du modèle actif. */
    async deleteModel(familyId: string) {
        const model = findModel(familyId);
        if (!model) return;
        if (this.selectedModelId.value === model.id && (this.currentModel.value || this.loading)) await this.releaseGpu();
        this.log('Suppression du modèle', model.id);
        await Promise.all((['f16', 'f32'] as const).map(k => deleteModelCache(model.variants[k].mlcId)));
        if (this.selectedModelId.value === model.id && this.status.value === 'error') this.status.value = 'idle';
        await this.refreshCacheStatus();
    }

    async deleteAllModels() {
        await this.releaseGpu();
        await clearAllModelCaches();
        await this.refreshCacheStatus();
    }

    /** Oublie la limite de tier mémorisée après un manque de VRAM, et recalcule la recommandation. */
    async resetTierLimit() {
        resetTierCap();
        if (this.profile.value?.webgpu) this.recommendation.value = recommendModel(this.profile.value);
    }

    async refreshCacheStatus() {
        const variant = this.selectedVariant();
        if (!variant) return;
        this.exactSizeBytes.value = null;
        this.cacheStatus.value = await getModelCacheStatus(variant.mlcId).catch(() => null);
        if (this.cacheStatus.value?.totalBytes) this.exactSizeBytes.value = this.cacheStatus.value.totalBytes;
        else getModelSize(variant.mlcId).then(s => { this.exactSizeBytes.value = s; }).catch(() => {});
    }

    load(): Promise<void> {
        const model = this.selectedModel.value;
        const variant = this.selectedVariant();
        if (!model || !variant) return Promise.reject(new Error('Aucun modèle sélectionné.'));
        if (this.status.value === 'ready' && this.currentModel.value?.id === model.id) return Promise.resolve();
        if (this.loading?.mlcId === variant.mlcId) return this.loading.promise;

        this.loading?.reject(new Error('Chargement remplacé par un autre modèle.'));
        let resolve!: () => void;
        let reject!: (e: Error) => void;
        const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
        promise.catch(() => {});
        this.loading = { mlcId: variant.mlcId, promise, resolve, reject };

        this.error.value = null;
        this.currentModel.value = null;
        this.progress.value = 0;
        this.phase.value = null;
        this.speedSamples = [];
        this.downloadedThisLoad = false;
        this.status.value = this.cacheStatus.value?.complete ? 'loading' : 'downloading';
        // Sans stockage persistant, le navigateur peut évincer plusieurs Go de poids sous pression disque.
        (navigator as any).storage?.persist?.().catch(() => {});

        this.ensureWorker().postMessage({ type: 'load', mlcId: variant.mlcId } satisfies WorkerRequest);
        return promise;
    }

    unload() {
        this.loading?.reject(new Error('Chargement annulé.'));
        this.loading = null;
        this.worker?.postMessage({ type: 'unload' } satisfies WorkerRequest);
        this.currentModel.value = null;
        this.phase.value = null;
        if (this.status.value !== 'unsupported') this.status.value = 'idle';
        this.refreshCacheStatus();
    }

    async *chat(messages: any[]): AsyncGenerator<any, void, unknown> {
        if (this.status.value !== 'ready') {
            if (!this.loading) throw new Error("L'agent IA n'est pas prêt.");
            await this.loading.promise;
        }
        storageSet(LAST_USED_KEY, String(Date.now()));

        const id = crypto.randomUUID();
        const queue: WorkerResponse[] = [];
        let wake: (() => void) | null = null;
        this.chatListeners.set(id, msg => { queue.push(msg); wake?.(); });
        // Les messages viennent souvent de refs Vue : un Proxy n'est pas clonable par postMessage.
        const plain = JSON.parse(JSON.stringify(messages));
        this.ensureWorker().postMessage({ type: 'chat', id, messages: plain, temperature: 0.7 } satisfies WorkerRequest);

        let buffer = '';
        try {
            for (;;) {
                if (queue.length === 0) await new Promise<void>(r => { wake = r; });
                wake = null;
                const msg = queue.shift()!;
                if (msg.type === 'done') break;
                if (msg.type === 'chatError') throw new Error(msg.message);
                if (msg.type === 'usage') {
                    yield { type: 'usage', promptTokens: msg.promptTokens, completionTokens: msg.completionTokens, totalTokens: msg.totalTokens };
                    continue;
                }
                if (msg.type !== 'chunk') continue;

                buffer += msg.content;

                const jsonMatch = buffer.match(/\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        yield { type: 'tool_call', ...parsed };
                        buffer = buffer.replace(jsonMatch[0], '');
                        continue;
                    } catch { /* JSON encore incomplet */ }
                }

                const xmlMatch = buffer.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
                if (xmlMatch && xmlMatch[1]) {
                    try {
                        const parsed = JSON.parse(xmlMatch[1].trim());
                        yield { type: 'tool_call', ...parsed };
                        buffer = buffer.replace(xmlMatch[0], '');
                        continue;
                    } catch (e) {
                        console.error('[WebGPU] Failed to parse XML tool call', e);
                    }
                }

                // Ne pas afficher un JSON/XML d'appel d'outil en cours de construction.
                let safeToFlushIndex = buffer.length;
                const lastBrace = buffer.lastIndexOf('{');
                const lastAngle = buffer.lastIndexOf('<');
                if (lastBrace !== -1) safeToFlushIndex = Math.min(safeToFlushIndex, lastBrace);
                if (lastAngle !== -1) safeToFlushIndex = Math.min(safeToFlushIndex, lastAngle);
                if (buffer.length > 300 && !buffer.includes('{"name"') && !buffer.includes('<tool_call>')) {
                    safeToFlushIndex = buffer.length;
                }
                if (safeToFlushIndex > 0) {
                    yield buffer.substring(0, safeToFlushIndex);
                    buffer = buffer.substring(safeToFlushIndex);
                }
            }

            if (buffer.trim() && !buffer.includes('{"name"') && !buffer.includes('<tool_call>')) {
                yield buffer;
            }
        } finally {
            this.chatListeners.delete(id);
        }
    }

    interrupt() {
        this.worker?.postMessage({ type: 'interrupt' } satisfies WorkerRequest);
    }

    private selectedVariant() {
        const model = this.selectedModel.value;
        if (!model) return null;
        return model.variants[this.profile.value?.shaderF16 ? 'f16' : 'f32'];
    }

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;
        const worker = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onWorkerMessage(e.data);
        this.worker = worker;
        return worker;
    }

    private onWorkerMessage(msg: WorkerResponse) {
        if ('id' in msg) {
            this.chatListeners.get(msg.id)?.(msg);
            return;
        }
        if (msg.type === 'progress') return this.onProgress(msg);
        if (!this.loading || this.loading.mlcId !== msg.mlcId) return;

        const loading = this.loading;
        this.loading = null;
        if (msg.type === 'loaded') {
            this.currentModel.value = this.selectedModel.value;
            this.status.value = 'ready';
            this.progress.value = 100;
            this.phase.value = null;
            this.cacheStatus.value = { totalBytes: this.totalBytes.value, cachedBytes: this.totalBytes.value, complete: true };
            loading.resolve();
            return;
        }

        const err = new Error(msg.message);
        loading.reject(err);
        this.phase.value = null;
        if (msg.kind === 'aborted') return;
        if (msg.kind === 'gpu-memory') return this.downgradeAfterOOM();
        this.status.value = 'error';
        this.error.value = { message: msg.message, kind: msg.kind };
        this.refreshCacheStatus();
    }

    private onProgress(msg: Extract<WorkerResponse, { type: 'progress' }>) {
        if (!this.loading) return;
        this.phase.value = msg.phase;
        if (msg.phase === 'download') {
            this.downloadedBytes.value = msg.loadedBytes;
            this.totalBytes.value = msg.totalBytes;
            if (msg.progress < 1) {
                this.downloadedThisLoad = true;
                this.status.value = 'downloading';
                this.trackSpeed(msg.loadedBytes);
            }
        } else {
            this.status.value = 'loading';
        }
        let value = msg.progress;
        if (this.downloadedThisLoad) {
            value = msg.phase === 'download' ? msg.progress * DOWNLOAD_SHARE : DOWNLOAD_SHARE + msg.progress * (1 - DOWNLOAD_SHARE);
        } else if (msg.phase === 'download') {
            return;
        }
        this.progress.value = Math.max(this.progress.value, Math.min(99, Math.round(value * 100)));
    }

    private trackSpeed(bytes: number) {
        const t = performance.now();
        this.speedSamples.push({ t, bytes });
        while (this.speedSamples.length > 2 && t - this.speedSamples[0]!.t > 5000) this.speedSamples.shift();
        const first = this.speedSamples[0]!;
        const dt = (t - first.t) / 1000;
        if (dt > 0.5) this.bytesPerSec.value = Math.max(0, (bytes - first.bytes) / dt);
    }

    /** VRAM insuffisante : on mémorise la limite pour cette machine et on bascule sur le tier inférieur. */
    private async downgradeAfterOOM() {
        const failed = this.selectedModel.value;
        if (!failed || failed.tier === 3 || !this.profile.value) {
            this.status.value = 'error';
            this.error.value = { message: 'La mémoire graphique de cet appareil est insuffisante pour le modèle local.', kind: 'gpu-memory' };
            return;
        }
        capTierAfterFailure(failed.tier);
        this.recommendation.value = recommendModel(this.profile.value);
        const fallback = this.recommendation.value.model;
        storageSet(SELECTION_KEY, fallback.id);
        this.selectedModelId.value = fallback.id;
        this.status.value = 'idle';
        this.notice.value = `${failed.name} est trop lourd pour la mémoire graphique de cet appareil : ${fallback.name} a été sélectionné à la place.`;
        await this.refreshCacheStatus();
        if (this.cacheStatus.value?.complete) await this.load().catch(() => {});
    }
}

export const localLLM = new LocalLLMService();
