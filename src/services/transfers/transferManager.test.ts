import { describe, expect, test } from "bun:test";
import {
    MAX_ACTIVE_FILES,
    Semaphore,
    TransferCancelledError,
    TransferHttpError,
    cancelTransfer,
    enqueueTransfer,
    isAbortError,
    linkedAbortController,
    runPool,
    transfers,
    withRetry,
} from "./transferManager";

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

describe("Semaphore", () => {
    test("jamais plus de `limit` détenteurs simultanés", async () => {
        const sem = new Semaphore(2);
        let active = 0;
        let peak = 0;
        await Promise.all(Array.from({ length: 8 }, async () => {
            const release = await sem.acquire();
            active++;
            peak = Math.max(peak, active);
            await tick(2);
            active--;
            release();
        }));
        expect(peak).toBe(2);
    });

    test("une attente annulée libère sa place et rejette", async () => {
        const sem = new Semaphore(1);
        const hold = await sem.acquire();
        const controller = new AbortController();
        const waiting = sem.acquire(controller.signal);
        controller.abort();
        await expect(waiting).rejects.toBeInstanceOf(TransferCancelledError);
        hold();
        const again = await sem.acquire();
        again();
    });

    test("release idempotent", async () => {
        const sem = new Semaphore(1);
        const release = await sem.acquire();
        release();
        release();
        const a = await sem.acquire();
        let second = false;
        sem.acquire().then(() => { second = true; });
        await tick();
        expect(second).toBe(false);
        a();
    });
});

describe("runPool", () => {
    test("toutes les tâches exécutées, concurrence respectée", async () => {
        const seen: number[] = [];
        let active = 0;
        let peak = 0;
        await runPool(10, 3, async (i) => {
            active++;
            peak = Math.max(peak, active);
            await tick(1);
            seen.push(i);
            active--;
        });
        expect(seen.sort((a, b) => a - b)).toEqual([...Array(10).keys()]);
        expect(peak).toBe(3);
    });

    test("s'arrête à la première erreur", async () => {
        let started = 0;
        await expect(runPool(20, 2, async (i) => {
            started++;
            await tick(1);
            if (i === 1) throw new Error("boom");
        })).rejects.toThrow("boom");
        await tick(5);
        expect(started).toBeLessThan(20);
    });
});

describe("withRetry", () => {
    test("réessaie les erreurs transitoires puis réussit", async () => {
        let calls = 0;
        const result = await withRetry(async () => {
            calls++;
            if (calls < 3) throw new TransferHttpError(503, "indisponible");
            return "ok";
        }, new AbortController().signal);
        expect(result).toBe("ok");
        expect(calls).toBe(3);
    });

    test("n'insiste pas sur une erreur définitive (4xx)", async () => {
        let calls = 0;
        await expect(withRetry(async () => {
            calls++;
            throw new TransferHttpError(413, "trop gros");
        }, new AbortController().signal)).rejects.toThrow("trop gros");
        expect(calls).toBe(1);
    });

    test("s'interrompt à l'annulation", async () => {
        const controller = new AbortController();
        const run = withRetry(async () => { throw new TransferHttpError(0, "réseau"); }, controller.signal);
        await tick(10);
        controller.abort();
        await expect(run).rejects.toBeInstanceOf(TransferCancelledError);
    });
});

describe("linkedAbortController", () => {
    test("suit le parent, mais peut être annulé seul", () => {
        const parent = new AbortController();
        const a = linkedAbortController(parent.signal);
        const b = linkedAbortController(parent.signal);
        a.abort();
        expect(parent.signal.aborted).toBe(false);
        expect(b.signal.aborted).toBe(false);
        parent.abort();
        expect(b.signal.aborted).toBe(true);
    });
});

describe("enqueueTransfer", () => {
    test(`au plus ${MAX_ACTIVE_FILES} fichiers actifs par sens, les autres en attente`, async () => {
        let active = 0;
        let peak = 0;
        const gates: (() => void)[] = [];
        const jobs = Array.from({ length: MAX_ACTIVE_FILES + 2 }, (_, i) =>
            enqueueTransfer("upload", `f${i}`, 100, async (handle) => {
                active++;
                peak = Math.max(peak, active);
                handle.setLoaded(50);
                await new Promise<void>(r => gates.push(r));
                active--;
                return i;
            })
        );
        await tick();
        const ids = new Set(jobs.map(j => j.id));
        const mine = () => transfers.filter(t => ids.has(t.id));
        expect(mine().filter(t => t.status === "running").length).toBe(MAX_ACTIVE_FILES);
        expect(mine().filter(t => t.status === "queued").length).toBe(2);

        while (gates.length || active) {
            gates.shift()?.();
            await tick();
        }
        expect(await Promise.all(jobs.map(j => j.promise))).toEqual([0, 1, 2, 3, 4]);
        expect(peak).toBe(MAX_ACTIVE_FILES);
        expect(mine().every(t => t.status === "done")).toBe(true);
    });

    test("annulation : promesse rejetée, statut « annulé »", async () => {
        const job = enqueueTransfer("download", "gros.bin", 1000, (handle) => new Promise((_, reject) => {
            handle.signal.addEventListener("abort", () => reject(new TransferCancelledError()));
        }));
        await tick();
        cancelTransfer(job.id);
        const error = await job.promise.catch(e => e);
        expect(isAbortError(error)).toBe(true);
        expect(transfers.find(t => t.id === job.id)?.status).toBe("cancelled");
    });

    test("erreur : message conservé pour le panneau", async () => {
        const job = enqueueTransfer("upload", "x", 10, async () => { throw new Error("Limite de stockage atteinte"); });
        await expect(job.promise).rejects.toThrow("Limite de stockage atteinte");
        const t = transfers.find(t => t.id === job.id);
        expect(t?.status).toBe("error");
        expect(t?.error).toBe("Limite de stockage atteinte");
    });
});
