import * as webllm from '@mlc-ai/web-llm';
import { modelBaseUrl, modelLibUrlOverride } from '@/services/localLLM/catalog';
import { CONFIG_CACHE, MODEL_CACHE, WASM_CACHE, getShardManifest, shardUrls } from '@/services/localLLM/modelCache';

export type WorkerRequest =
    | { type: 'load'; mlcId: string }
    | { type: 'chat'; id: string; messages: any[]; temperature: number }
    | { type: 'interrupt' }
    | { type: 'unload' };

export type WorkerResponse =
    | { type: 'progress'; phase: 'download' | 'load'; loadedBytes: number; totalBytes: number; progress: number }
    | { type: 'loaded'; mlcId: string; ms: number }
    | { type: 'loadError'; mlcId: string; message: string; kind: 'gpu-memory' | 'shader-f16' | 'network' | 'aborted' | 'other' }
    | { type: 'chunk'; id: string; content: string }
    | { type: 'usage'; id: string; promptTokens: number; completionTokens: number; totalTokens: number }
    | { type: 'done'; id: string }
    | { type: 'chatError'; id: string; message: string };

const post = (msg: WorkerResponse) => self.postMessage(msg);

const DOWNLOAD_CONCURRENCY = 6;
const MAX_RETRIES = 4;

let engine: webllm.MLCEngine | null = null;
let loadedId: string | null = null;
let loadController: AbortController | null = null;

const appConfigFor = (mlcId: string): webllm.AppConfig => {
    const model_list = webllm.prebuiltAppConfig.model_list.map(record => {
        if (record.model_id !== mlcId) return record;
        const lib = modelLibUrlOverride(record.model_lib);
        return { ...record, model: modelBaseUrl(mlcId), ...(lib ? { model_lib: lib } : {}) };
    });
    return { model_list, cacheBackend: 'cache' };
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Met `url` en cache en streamant la réponse pour remonter la progression octet par octet. */
const fetchIntoCache = async (cache: Cache, url: string, onBytes: (n: number) => void, signal: AbortSignal) => {
    for (let attempt = 0; ; attempt++) {
        let received = 0;
        try {
            const res = await fetch(url, { signal });
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} sur ${url}`);
            const reader = res.body.getReader();
            const chunks: Uint8Array[] = [];
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.byteLength;
                onBytes(value.byteLength);
            }
            await cache.put(url, new Response(new Blob(chunks as BlobPart[])));
            return;
        } catch (e) {
            onBytes(-received);
            if (signal.aborted || attempt >= MAX_RETRIES) throw e;
            await sleep(500 * 2 ** attempt);
        }
    }
};

/**
 * Remplit les caches WebLLM avant `reload()`. WebLLM télécharge sinon séquentiellement
 * config → wasm → tokenizer → poids, répartit les shards en 4 blocs fixes (un bloc lent bloque
 * tout), ne reporte la progression qu'à la fin de chaque shard de ~30 Mo et ne réessaie jamais.
 */
const prefetch = async (mlcId: string, outerSignal: AbortSignal) => {
    // Un shard en échec définitif doit stopper les autres téléchargements, pas les laisser finir.
    const failFast = new AbortController();
    outerSignal.addEventListener('abort', () => failFast.abort(), { once: true });
    const signal = failFast.signal;
    const record = appConfigFor(mlcId).model_list.find(r => r.model_id === mlcId)!;
    const base = modelBaseUrl(mlcId);
    const [modelCache, configCache, wasmCache] = await Promise.all([
        caches.open(MODEL_CACHE), caches.open(CONFIG_CACHE), caches.open(WASM_CACHE),
    ]);

    const [shards, cachedKeys] = await Promise.all([
        getShardManifest(mlcId, signal).then(s => shardUrls(mlcId, s)),
        modelCache.keys().then(reqs => new Set(reqs.map(r => r.url))),
    ]);

    const totalBytes = shards.reduce((a, s) => a + s.nbytes, 0);
    let loadedBytes = shards.filter(s => cachedKeys.has(s.url)).reduce((a, s) => a + s.nbytes, 0);
    let lastPost = 0;
    const report = (force = false) => {
        const now = performance.now();
        if (!force && now - lastPost < 120) return;
        lastPost = now;
        post({ type: 'progress', phase: 'download', loadedBytes, totalBytes, progress: totalBytes ? loadedBytes / totalBytes : 0 });
    };
    report(true);

    const jobs: Array<() => Promise<void>> = shards
        .filter(s => !cachedKeys.has(s.url))
        .map(s => () => fetchIntoCache(modelCache, s.url, n => { loadedBytes += n; report(); }, signal));

    const configUrl = new URL('mlc-chat-config.json', base).href;
    const sideFiles = (async () => {
        if (!(await configCache.match(configUrl))) await fetchIntoCache(configCache, configUrl, () => {}, signal);
        const config = await (await configCache.match(configUrl))!.json();
        const tokenizer = (config.tokenizer_files as string[]).includes('tokenizer.json') ? 'tokenizer.json' : 'tokenizer.model';
        const tokUrl = new URL(tokenizer, base).href;
        if (!cachedKeys.has(tokUrl)) await fetchIntoCache(modelCache, tokUrl, () => {}, signal);
        // WebLLM ne met pas en cache un wasm servi en relatif ou depuis localhost.
        if (record.model_lib.startsWith('http') && !record.model_lib.includes('localhost') && !(await wasmCache.match(record.model_lib))) {
            await fetchIntoCache(wasmCache, record.model_lib, () => {}, signal);
        }
    })();

    let next = 0;
    const worker = async () => {
        while (next < jobs.length) await jobs[next++]!();
    };
    try {
        await Promise.all([sideFiles, ...Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, jobs.length) }, worker)]);
    } catch (e) {
        failFast.abort();
        throw e;
    }
    report(true);
};

const classify = (e: any): Extract<WorkerResponse, { type: 'loadError' }>['kind'] => {
    const text = `${e?.name ?? ''} ${e?.message ?? e}`.toLowerCase();
    if (e?.name === 'AbortError' || text.includes('abort')) return 'aborted';
    if (text.includes('shader-f16') || text.includes('shaderf16')) return 'shader-f16';
    if (text.includes('device was lost') || text.includes('devicelost') || text.includes('out of memory') || text.includes('allocation')) return 'gpu-memory';
    if (text.includes('fetch') || text.includes('network') || text.includes('http ')) return 'network';
    return 'other';
};

const load = async (mlcId: string) => {
    if (loadedId === mlcId && engine) {
        post({ type: 'loaded', mlcId, ms: 0 });
        return;
    }
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const t0 = performance.now();

    try {
        if (engine) {
            await engine.unload();
            loadedId = null;
        }
        await prefetch(mlcId, controller.signal);
        if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');

        engine ??= new webllm.MLCEngine();
        engine.setAppConfig(appConfigFor(mlcId));
        engine.setInitProgressCallback(report => {
            // Après le prefetch, seule la phase "Loading model from cache" (upload GPU) reste.
            post({ type: 'progress', phase: 'load', loadedBytes: 0, totalBytes: 0, progress: report.progress });
        });
        await engine.reload(mlcId);
        if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
        loadedId = mlcId;
        post({ type: 'loaded', mlcId, ms: Math.round(performance.now() - t0) });
    } catch (e: any) {
        if (loadController === controller) loadedId = null;
        post({ type: 'loadError', mlcId, message: e?.message ?? String(e), kind: classify(e) });
    } finally {
        if (loadController === controller) loadController = null;
    }
};

const chat = async (id: string, messages: any[], temperature: number) => {
    if (!engine || !loadedId) {
        post({ type: 'chatError', id, message: "L'agent IA n'est pas prêt." });
        return;
    }
    try {
        const stream = await engine.chat.completions.create({
            messages,
            stream: true,
            stream_options: { include_usage: true },
            temperature,
        });
        for await (const chunk of stream) {
            if (chunk.usage) {
                post({
                    type: 'usage', id,
                    promptTokens: chunk.usage.prompt_tokens,
                    completionTokens: chunk.usage.completion_tokens,
                    totalTokens: chunk.usage.total_tokens,
                });
            }
            const content = chunk.choices[0]?.delta?.content;
            if (content) post({ type: 'chunk', id, content });
        }
        post({ type: 'done', id });
    } catch (e: any) {
        post({ type: 'chatError', id, message: e?.message ?? String(e) });
    }
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'load': load(msg.mlcId); break;
        case 'chat': chat(msg.id, msg.messages, msg.temperature); break;
        case 'interrupt': engine?.interruptGenerate(); break;
        case 'unload':
            loadController?.abort();
            loadedId = null;
            engine?.unload();
            break;
    }
};
