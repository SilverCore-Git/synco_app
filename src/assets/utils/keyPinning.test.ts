import { describe, expect, mock, test } from "bun:test";

const store = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
}));

const { user } = await import("@/assets/var");
const { pinOrCheckKey, repinKey, KeyChangedError, keyCommitment } = await import("./keyPinning");

const newKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

describe("keyPinning (audit FC4)", () => {
    test("première clé épinglée, même clé acceptée, autre clé refusée", async () => {
        (user as any).value = { id: "me" };
        const a = await newKey();
        const b = await newKey();
        await pinOrCheckKey(a, "thread:t1", 1);
        await pinOrCheckKey(a, "thread:t1", 1);
        await expect(pinOrCheckKey(b, "thread:t1", 1)).rejects.toBeInstanceOf(KeyChangedError);
        await repinKey(b, "thread:t1", 1);
        await pinOrCheckKey(b, "thread:t1", 1);
    });

    test("l'engagement est lié au contexte et à la version", async () => {
        const a = await newKey();
        expect(await keyCommitment(a, "space:s1", 1)).not.toBe(await keyCommitment(a, "space:s2", 1));
        expect(await keyCommitment(a, "space:s1", 1)).not.toBe(await keyCommitment(a, "space:s1", 2));
    });
});
