import { modelBaseUrl } from './catalog';

// Noms de caches et clés exactement identiques à ceux de WebLLM 0.2.84 (backend Cache API) :
// ce qu'on écrit ici, `MLCEngine.reload()` le relit sans rien retélécharger.
export const MODEL_CACHE = 'webllm/model';
export const CONFIG_CACHE = 'webllm/config';
export const WASM_CACHE = 'webllm/wasm';

export interface ShardRecord {
    dataPath: string;
    nbytes: number;
}

export interface ModelCacheStatus {
    totalBytes: number;
    cachedBytes: number;
    complete: boolean;
}

export const shardUrls = (mlcId: string, shards: ShardRecord[]) => {
    const base = modelBaseUrl(mlcId);
    return shards.map(s => ({ url: new URL(s.dataPath, base).href, nbytes: s.nbytes }));
};

/** Manifeste des shards : lu depuis le cache s'il y est, sinon téléchargé puis mis en cache. */
export const getShardManifest = async (mlcId: string, signal?: AbortSignal): Promise<ShardRecord[]> => {
    const url = new URL('tensor-cache.json', modelBaseUrl(mlcId)).href;
    const cache = await caches.open(MODEL_CACHE);
    let res = await cache.match(url);
    if (!res) {
        const fetched = await fetch(url, { signal });
        if (!fetched.ok) throw new Error(`Manifeste du modèle introuvable (${fetched.status})`);
        await cache.put(url, fetched.clone());
        res = fetched;
    }
    const json = await res.json();
    return json.records as ShardRecord[];
};

export const getModelCacheStatus = async (mlcId: string): Promise<ModelCacheStatus> => {
    if (typeof caches === 'undefined') return { totalBytes: 0, cachedBytes: 0, complete: false };
    const cache = await caches.open(MODEL_CACHE);
    const manifestUrl = new URL('tensor-cache.json', modelBaseUrl(mlcId)).href;
    const manifest = await cache.match(manifestUrl);
    if (!manifest) return { totalBytes: 0, cachedBytes: 0, complete: false };

    const shards = shardUrls(mlcId, (await manifest.json()).records);
    const keys = new Set((await cache.keys()).map(r => r.url));
    let cachedBytes = 0;
    let totalBytes = 0;
    for (const s of shards) {
        totalBytes += s.nbytes;
        if (keys.has(s.url)) cachedBytes += s.nbytes;
    }
    return { totalBytes, cachedBytes, complete: totalBytes > 0 && cachedBytes === totalBytes };
};

/** Taille exacte du modèle (télécharge seulement le manifeste, quelques centaines de Ko). */
export const getModelSize = async (mlcId: string): Promise<number> => {
    const shards = await getShardManifest(mlcId);
    return shards.reduce((acc, s) => acc + s.nbytes, 0);
};

/** Octets réellement présents dans le cache pour ce modèle (0 s'il n'a jamais été téléchargé). */
export const getCachedBytes = async (mlcId: string): Promise<number> => {
    if (typeof caches === 'undefined') return 0;
    const status = await getModelCacheStatus(mlcId).catch(() => null);
    return status?.cachedBytes ?? 0;
};

/**
 * Supprime du cache navigateur les poids, le tokenizer, le manifeste et la config d'un modèle.
 * Le wasm (WASM_CACHE) est conservé : quelques Mo, et il est partagé par les variantes d'une même architecture.
 */
export const deleteModelCache = async (mlcId: string): Promise<void> => {
    if (typeof caches === 'undefined') return;
    const base = modelBaseUrl(mlcId);
    for (const name of [MODEL_CACHE, CONFIG_CACHE]) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        await Promise.all(keys.filter(r => r.url.startsWith(base)).map(r => cache.delete(r)));
    }
};

/** Vide entièrement les caches WebLLM (tous modèles, configs et wasm). */
export const clearAllModelCaches = async (): Promise<void> => {
    if (typeof caches === 'undefined') return;
    await Promise.all([MODEL_CACHE, CONFIG_CACHE, WASM_CACHE].map(n => caches.delete(n)));
};
