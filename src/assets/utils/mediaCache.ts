// Shared cache of blob: URLs for decrypted media, so that the same attachment
// shown twice (message + search results, re-mounted message after scrolling)
// is fetched and decrypted only once, and memory stays bounded.
//
// - acquire() dedupes in-flight loads and counts references;
// - release() drops a reference; unreferenced entries are evicted LRU-first
//   (and their URL revoked) once the total exceeds `budgetBytes`. An entry
//   still on screen is never evicted, even over budget;
// - at most `maxConcurrent` loads run at once, so opening a busy channel does
//   not fire dozens of downloads + decryptions in parallel.
//
// Pure (loader and URL factory injected) so it can be unit-tested.

export interface MediaCacheOptions {
    load: (fileId: string) => Promise<Blob>;
    budgetBytes?: number;
    maxConcurrent?: number;
    createUrl?: (blob: Blob) => string;
    revokeUrl?: (url: string) => void;
}

// `mimeType` is the Blob's type, i.e. what the loader decided the bytes are.
export interface MediaHandle {
    url: string;
    mimeType: string;
}

export interface MediaCache {
    acquire: (fileId: string) => Promise<MediaHandle>;
    release: (fileId: string) => void;
}

interface Entry extends MediaHandle {
    size: number;
    refs: number;
    lastUsed: number;
}

interface Pending {
    promise: Promise<MediaHandle>;
    waiters: number;
}

export const createMediaCache = ({
    load,
    budgetBytes = 150 * 1024 * 1024,
    maxConcurrent = 3,
    createUrl = blob => URL.createObjectURL(blob),
    revokeUrl = url => URL.revokeObjectURL(url),
}: MediaCacheOptions): MediaCache => {

    const entries = new Map<string, Entry>();
    const pending = new Map<string, Pending>();
    let totalBytes = 0;
    let clock = 0;

    let active = 0;
    const queue: (() => void)[] = [];
    const takeSlot = (): Promise<void> => {
        if (active < maxConcurrent) {
            active++;
            return Promise.resolve();
        }
        return new Promise(resolve => queue.push(resolve));
    };
    // Hands the slot straight to the next waiter (active stays the same) so a
    // fresh caller can't sneak in between and exceed maxConcurrent.
    const giveSlot = () => {
        const next = queue.shift();
        if (next) next();
        else active--;
    };

    const evict = () => {
        if (totalBytes <= budgetBytes) return;
        const idle = [...entries.entries()]
            .filter(([, e]) => e.refs === 0)
            .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
        for (const [id, entry] of idle) {
            if (totalBytes <= budgetBytes) break;
            entries.delete(id);
            totalBytes -= entry.size;
            revokeUrl(entry.url);
        }
    };

    const acquire = (fileId: string): Promise<MediaHandle> => {
        const cached = entries.get(fileId);
        if (cached) {
            cached.refs++;
            cached.lastUsed = ++clock;
            return Promise.resolve({ url: cached.url, mimeType: cached.mimeType });
        }

        const inFlight = pending.get(fileId);
        if (inFlight) {
            inFlight.waiters++;
            return inFlight.promise;
        }

        const job: Pending = { waiters: 1, promise: Promise.resolve({ url: '', mimeType: '' }) };
        job.promise = (async () => {
            await takeSlot();
            try {
                const blob = await load(fileId);
                const entry: Entry = { url: createUrl(blob), mimeType: blob.type, size: blob.size, refs: job.waiters, lastUsed: ++clock };
                entries.set(fileId, entry);
                totalBytes += entry.size;
                evict();
                return { url: entry.url, mimeType: entry.mimeType };
            } finally {
                pending.delete(fileId);
                giveSlot();
            }
        })();
        pending.set(fileId, job);
        return job.promise;
    };

    const release = (fileId: string) => {
        const entry = entries.get(fileId);
        if (!entry || entry.refs === 0) return;
        entry.refs--;
        entry.lastUsed = ++clock;
        evict();
    };

    return { acquire, release };
};
