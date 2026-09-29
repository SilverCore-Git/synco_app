import { describe, expect, test } from "bun:test";
import { createMediaCache } from "./mediaCache";

const blobOf = (size: number) => new Blob([new Uint8Array(size)]);

// Loader whose calls resolve only when the test says so.
const deferredLoader = () => {
    const calls: { id: string; resolve: (b: Blob) => void; reject: (e: Error) => void }[] = [];
    const load = (id: string) => new Promise<Blob>((resolve, reject) => calls.push({ id, resolve, reject }));
    return { calls, load };
};

const setup = (opts: { budgetBytes?: number; maxConcurrent?: number } = {}) => {
    const loader = deferredLoader();
    const revoked: string[] = [];
    let n = 0;
    const cache = createMediaCache({
        load: loader.load,
        createUrl: () => `blob:${++n}`,
        revokeUrl: url => revoked.push(url),
        ...opts,
    });
    return { cache, calls: loader.calls, revoked };
};

const flush = () => new Promise(r => setTimeout(r, 0));

describe("createMediaCache", () => {

    test("concurrent acquires of the same file share one load", async () => {
        const { cache, calls } = setup();
        const a = cache.acquire("f1");
        const b = cache.acquire("f1");
        await flush();
        expect(calls.length).toBe(1);
        calls[0]!.resolve(blobOf(10));
        expect(await a).toBe("blob:1");
        expect(await b).toBe("blob:1");
        // cached afterwards: no new load
        expect(await cache.acquire("f1")).toBe("blob:1");
        expect(calls.length).toBe(1);
    });

    test("an entry still referenced is never evicted, even over budget", async () => {
        const { cache, calls, revoked } = setup({ budgetBytes: 10 });
        const a = cache.acquire("big");
        await flush();
        calls[0]!.resolve(blobOf(50));
        await a;
        expect(revoked).toEqual([]);
        cache.release("big");
        expect(revoked).toEqual(["blob:1"]);
    });

    test("waiters that joined an in-flight load all hold a reference", async () => {
        const { cache, calls, revoked } = setup({ budgetBytes: 10 });
        const a = cache.acquire("f");
        const b = cache.acquire("f");
        await flush();
        calls[0]!.resolve(blobOf(50));
        await Promise.all([a, b]);
        cache.release("f");
        expect(revoked).toEqual([]);
        cache.release("f");
        expect(revoked).toEqual(["blob:1"]);
    });

    test("evicts least recently used idle entries first", async () => {
        const { cache, calls, revoked } = setup({ budgetBytes: 25 });
        for (const id of ["a", "b"]) {
            const p = cache.acquire(id);
            await flush();
            calls.at(-1)!.resolve(blobOf(10));
            await p;
        }
        cache.release("a");
        cache.release("b");
        // re-use "a" so that "b" becomes the least recently used
        await cache.acquire("a");
        cache.release("a");
        const c = cache.acquire("c");
        await flush();
        calls.at(-1)!.resolve(blobOf(10));
        await c;
        expect(revoked).toEqual(["blob:2"]);
    });

    test("a failed load rejects and can be retried", async () => {
        const { cache, calls } = setup();
        const a = cache.acquire("f");
        await flush();
        calls[0]!.reject(new Error("boom"));
        await expect(a).rejects.toThrow("boom");
        const b = cache.acquire("f");
        await flush();
        expect(calls.length).toBe(2);
        calls[1]!.resolve(blobOf(1));
        expect(await b).toBe("blob:1");
    });

    test("caps the number of loads running at once", async () => {
        const { cache, calls } = setup({ maxConcurrent: 2 });
        const all = ["a", "b", "c", "d"].map(id => cache.acquire(id));
        await flush();
        expect(calls.map(c => c.id)).toEqual(["a", "b"]);
        calls[0]!.resolve(blobOf(1));
        await flush();
        expect(calls.map(c => c.id)).toEqual(["a", "b", "c"]);
        calls[1]!.resolve(blobOf(1));
        calls[2]!.resolve(blobOf(1));
        await flush();
        expect(calls.length).toBe(4);
        calls[3]!.resolve(blobOf(1));
        await Promise.all(all);
    });

});
