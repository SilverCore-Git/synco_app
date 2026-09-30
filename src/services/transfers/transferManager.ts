import { reactive, readonly } from 'vue';

/**
 * Gestionnaire global des transferts de fichiers (envois et téléchargements).
 *
 * - File d'attente : au plus MAX_ACTIVE_FILES fichiers actifs par sens, les
 *   suivants attendent leur tour au lieu de tous démarrer (et de tous
 *   occuper la mémoire) en même temps.
 * - Sémaphore global de requêtes : au plus MAX_PARTS_IN_FLIGHT morceaux en
 *   vol, tous fichiers confondus — c'est aussi ce qui borne la mémoire
 *   (chaque morceau en vol = quelques Mio chiffrés/déchiffrés).
 * - État réactif (progression, vitesse, erreurs) affiché par TransfersPanel,
 *   annulation par AbortController.
 */

export type TransferKind = 'upload' | 'download';
export type TransferStatus = 'queued' | 'running' | 'finalizing' | 'done' | 'error' | 'cancelled';

export interface Transfer {
    id: number;
    kind: TransferKind;
    name: string;
    /** Taille en clair, en octets (0 si inconnue). */
    size: number;
    /** Octets (en clair) déjà transférés. */
    loaded: number;
    status: TransferStatus;
    error?: string;
    /** Débit lissé, en octets par seconde. */
    bytesPerSecond: number;
}

/** Ce que le moteur d'un transfert (envoi, téléchargement) reçoit pour piloter son entrée. */
export interface TransferHandle {
    readonly id: number;
    readonly signal: AbortSignal;
    setSize(size: number): void;
    setLoaded(loaded: number): void;
    setFinalizing(): void;
}

export const MAX_ACTIVE_FILES = 3;
export const MAX_PARTS_IN_FLIGHT = 6;
/** Durée d'affichage d'un transfert terminé avant de le retirer du panneau. */
const DONE_LINGER_MS = 4000;

export class TransferCancelledError extends Error {
    constructor() {
        super('Transfert annulé');
        this.name = 'AbortError';
    }
}

export const isAbortError = (error: unknown) =>
    error instanceof TransferCancelledError || (error as any)?.name === 'AbortError';

// ---------------------------------------------------------------------------
// Sémaphore
// ---------------------------------------------------------------------------

export class Semaphore {
    private waiters: (() => void)[] = [];
    private active = 0;
    private readonly limit: number;

    constructor(limit: number) {
        this.limit = limit;
    }

    async acquire(signal?: AbortSignal): Promise<() => void> {
        if (signal?.aborted) throw new TransferCancelledError();
        if (this.active < this.limit) {
            this.active++;
            return this.releaser();
        }
        await new Promise<void>((resolve, reject) => {
            const waiter = () => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            };
            const onAbort = () => {
                this.waiters = this.waiters.filter(w => w !== waiter);
                reject(new TransferCancelledError());
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            this.waiters.push(waiter);
        });
        // Le créneau a été transmis directement par release() : active inchangé.
        return this.releaser();
    }

    private releaser(): () => void {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const next = this.waiters.shift();
            if (next) next();
            else this.active--;
        };
    }
}

/** Exécute task(0..count-1) avec au plus `concurrency` tâches simultanées ; s'arrête à la première erreur. */
export async function runPool(count: number, concurrency: number, task: (index: number) => Promise<void>): Promise<void> {
    let next = 0;
    let failed = false;
    const worker = async () => {
        while (!failed && next < count) {
            const index = next++;
            try {
                await task(index);
            } catch (error) {
                failed = true;
                throw error;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, count) }, worker));
}

/**
 * AbortController annulé en même temps que `parent`, et qu'on peut annuler
 * seul : interrompt les morceaux encore en vol quand l'un d'eux échoue.
 */
export function linkedAbortController(parent: AbortSignal): AbortController {
    const child = new AbortController();
    if (parent.aborted) child.abort();
    else parent.addEventListener('abort', () => child.abort(), { once: true });
    return child;
}

/** Requêtes de morceaux en vol, partagé par tous les transferts. */
export const partSlots = new Semaphore(MAX_PARTS_IN_FLIGHT);

// ---------------------------------------------------------------------------
// État et file d'attente
// ---------------------------------------------------------------------------

interface Internal {
    controller: AbortController;
    lastSampleAt: number;
    lastSampleLoaded: number;
}

const state = reactive({ transfers: [] as Transfer[] });
const internals = new Map<number, Internal>();
const fileSlots: Record<TransferKind, Semaphore> = {
    upload: new Semaphore(MAX_ACTIVE_FILES),
    download: new Semaphore(MAX_ACTIVE_FILES),
};
let nextId = 1;

/** Liste réactive en lecture seule, pour l'affichage. */
export const transfers = readonly(state).transfers;

const find = (id: number) => state.transfers.find(t => t.id === id);

const remove = (id: number) => {
    const index = state.transfers.findIndex(t => t.id === id);
    if (index >= 0) state.transfers.splice(index, 1);
    internals.delete(id);
};

/**
 * Ajoute un transfert à la file. `run` est le moteur (envoi ou
 * téléchargement) : il reçoit un TransferHandle pour rapporter sa
 * progression et doit respecter handle.signal.
 */
export function enqueueTransfer<T>(
    kind: TransferKind,
    name: string,
    size: number,
    run: (handle: TransferHandle) => Promise<T>
): { id: number; promise: Promise<T> } {

    const id = nextId++;
    const controller = new AbortController();
    state.transfers.push({ id, kind, name, size, loaded: 0, status: 'queued', bytesPerSecond: 0 });

    const handle: TransferHandle = {
        id,
        signal: controller.signal,
        setSize(size) {
            const t = find(id);
            if (t) t.size = size;
        },
        setLoaded(loaded) {
            const t = find(id);
            const internal = internals.get(id);
            if (!t || !internal) return;
            t.loaded = loaded;
            // Débit lissé, échantillonné au plus toutes les 500 ms.
            const now = performance.now();
            const elapsed = now - internal.lastSampleAt;
            if (elapsed >= 500) {
                const instant = ((loaded - internal.lastSampleLoaded) * 1000) / elapsed;
                t.bytesPerSecond = t.bytesPerSecond ? t.bytesPerSecond * 0.6 + instant * 0.4 : instant;
                internal.lastSampleAt = now;
                internal.lastSampleLoaded = loaded;
            }
        },
        setFinalizing() {
            const t = find(id);
            if (t && t.status === 'running') t.status = 'finalizing';
        },
    };

    const promise = new Promise<T>((resolve, reject) => {
        const start = async () => {
            let releaseSlot: (() => void) | null = null;
            try {
                releaseSlot = await fileSlots[kind].acquire(controller.signal);
                const t = find(id);
                if (t) t.status = 'running';
                const internal = internals.get(id);
                if (internal) internal.lastSampleAt = performance.now();

                const result = await run(handle);

                const done = find(id);
                if (done) {
                    done.status = 'done';
                    done.loaded = done.size || done.loaded;
                    done.bytesPerSecond = 0;
                }
                setTimeout(() => remove(id), DONE_LINGER_MS);
                resolve(result);
            } catch (error) {
                const t = find(id);
                if (isAbortError(error) || controller.signal.aborted) {
                    if (t) t.status = 'cancelled';
                    setTimeout(() => remove(id), DONE_LINGER_MS);
                    reject(new TransferCancelledError());
                } else {
                    if (t) {
                        t.status = 'error';
                        t.error = error instanceof Error ? error.message : String(error);
                        t.bytesPerSecond = 0;
                    }
                    reject(error);
                }
            } finally {
                releaseSlot?.();
            }
        };
        internals.set(id, { controller, lastSampleAt: performance.now(), lastSampleLoaded: 0 });
        start();
    });

    return { id, promise };
}

export function cancelTransfer(id: number): void {
    internals.get(id)?.controller.abort();
}

/** Retire un transfert terminé, annulé ou en erreur du panneau. */
export function dismissTransfer(id: number): void {
    const t = find(id);
    if (t && (t.status === 'done' || t.status === 'error' || t.status === 'cancelled')) remove(id);
}

export function cancelAllTransfers(): void {
    for (const internal of internals.values()) internal.controller.abort();
}

// ---------------------------------------------------------------------------
// Réessais
// ---------------------------------------------------------------------------

export const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new TransferCancelledError());
    const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
    }, ms);
    const onAbort = () => {
        clearTimeout(timer);
        reject(new TransferCancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
});

/** Erreur HTTP d'un morceau : `retryable` si une nouvelle tentative a du sens. */
export class TransferHttpError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.name = 'TransferHttpError';
        this.status = status;
    }
    get retryable(): boolean {
        return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
    }
}

/**
 * Rejoue `attempt` en cas d'erreur transitoire (réseau, 5xx, 429), avec
 * attente exponentielle. Une erreur définitive (4xx) ou une annulation
 * sort immédiatement.
 */
export async function withRetry<T>(attempt: () => Promise<T>, signal: AbortSignal, maxAttempts = 5): Promise<T> {
    for (let i = 1; ; i++) {
        try {
            return await attempt();
        } catch (error) {
            if (isAbortError(error) || signal.aborted) throw new TransferCancelledError();
            const retryable = error instanceof TransferHttpError ? error.retryable : true;
            if (!retryable || i >= maxAttempts) throw error;
            await sleep(Math.min(16000, 500 * 2 ** (i - 1)) * (0.75 + Math.random() * 0.5), signal);
        }
    }
}
