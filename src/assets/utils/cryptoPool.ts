import CryptoWorker from '@/workers/crypto.worker.ts?worker';
import type { CryptoJob, CryptoWorkerRequest, CryptoWorkerResponse } from '@/workers/crypto.worker';
import { encryptChunk, decryptChunk } from './chunkedCryptoCore';

/**
 * Pool de Web Workers pour le chiffrement E2EE par morceaux : plusieurs
 * morceaux (de plusieurs fichiers) sont chiffrés ou déchiffrés en même temps
 * sur plusieurs cœurs, sans bloquer l'interface.
 *
 * Si les workers sont indisponibles (environnement sans Worker, CryptoKey
 * non transférable…), les opérations retombent sur le thread principal —
 * WebCrypto y reste asynchrone, seul le parallélisme est perdu.
 */

type Pending = { resolve: (data: ArrayBuffer) => void; reject: (error: Error) => void; worker: PoolWorker };
type PoolWorker = { worker: Worker; busy: number };

const POOL_SIZE = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));

let workers: PoolWorker[] | null = null;
let workersBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorkers(): PoolWorker[] | null {
    if (workersBroken) return null;
    if (workers) return workers;
    try {
        workers = Array.from({ length: POOL_SIZE }, () => {
            const entry: PoolWorker = { worker: new CryptoWorker(), busy: 0 };
            entry.worker.onmessage = (event: MessageEvent<CryptoWorkerResponse>) => {
                const res = event.data;
                const job = pending.get(res.id);
                if (!job) return;
                pending.delete(res.id);
                job.worker.busy--;
                if (res.ok) job.resolve(res.data);
                else job.reject(new Error(res.error));
            };
            entry.worker.onerror = (event) => {
                console.error('[cryptoPool] worker error', event);
            };
            return entry;
        });
        return workers;
    } catch (error) {
        console.warn('[cryptoPool] Web Workers indisponibles, chiffrement sur le thread principal', error);
        workersBroken = true;
        return null;
    }
}

function run(message: CryptoJob, transfer: Transferable[]): Promise<ArrayBuffer> | null {
    const pool = getWorkers();
    if (!pool) return null;

    const target = pool.reduce((a, b) => (b.busy < a.busy ? b : a));
    const id = nextId++;

    return new Promise<ArrayBuffer>((resolve, reject) => {
        pending.set(id, { resolve, reject, worker: target });
        target.busy++;
        try {
            target.worker.postMessage({ ...message, id } satisfies CryptoWorkerRequest, transfer);
        } catch (error) {
            // DataCloneError (CryptoKey non sérialisable dans ce navigateur) :
            // on abandonne les workers pour de bon.
            pending.delete(id);
            target.busy--;
            workersBroken = true;
            reject(error);
        }
    });
}

/** Chiffre la tranche `blob` du fichier (lue dans le worker). */
export async function encryptChunkInPool(
    key: CryptoKey,
    noncePrefix: Uint8Array,
    index: number,
    isLast: boolean,
    blob: Blob
): Promise<ArrayBuffer> {
    const job = run({ op: 'encrypt', key, noncePrefix, index, isLast, blob }, []);
    if (job) {
        try {
            return await job;
        } catch (error) {
            if (!workersBroken) throw error;
        }
    }
    return encryptChunk(key, noncePrefix, index, isLast, await blob.arrayBuffer());
}

/** Déchiffre un morceau ; `data` est transféré au worker (inutilisable ensuite). */
export async function decryptChunkInPool(
    key: CryptoKey,
    noncePrefix: Uint8Array,
    index: number,
    isLast: boolean,
    data: ArrayBuffer
): Promise<ArrayBuffer> {
    if (!workersBroken) {
        const job = run({ op: 'decrypt', key, noncePrefix, index, isLast, data }, [data]);
        if (job) {
            try {
                return await job;
            } catch (error) {
                if (!workersBroken) throw error;
                // Échec de postMessage : le transfert n'a pas eu lieu et
                // `data` est intact (un morceau chiffré fait toujours au
                // moins 16 octets) — sinon, rien à rejouer.
                if (data.byteLength === 0) throw error;
            }
        }
    }
    return decryptChunk(key, noncePrefix, index, isLast, data);
}
