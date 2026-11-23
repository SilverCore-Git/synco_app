import { describe, expect, mock, test } from "bun:test";

// Revue L11, point 2 : une conversation illisible est en lecture seule, et la synchro n'écrit jamais en clair.
type Call = { url: string; method: string; body: string | undefined };
const calls: Call[] = [];
let sfetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response(null, { status: 500 });
mock.module("idb-keyval", () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }));
mock.module("@/assets/utils/sfetch", () => ({
    default: (url: string, init?: any) => {
        calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
        return sfetchImpl(url, init);
    },
}));

const { loadSession, syncSession, aiSessionMessages, activeSessionReadOnly, newSession, convHistoryIo, activeSessionId } = await import("./AIService");
const { openedOrg, user } = await import("@/assets/var");
const { privateKey } = await import("@/assets/utils/crypto");

const writes = () => calls.filter((c) => c.method !== 'GET');

describe("syncSession : lecture seule et jamais en clair", () => {
    test("session E2EE illisible (clé privée absente) : aucune écriture, l'historique reste intact", async () => {
        calls.length = 0;
        openedOrg.value = { id: "org-ro" } as any;
        privateKey.value = null;
        sfetchImpl = async (url) => url.endsWith("/ai/sessions/s-ro")
            ? new Response(JSON.stringify({ id: "s-ro", messages: { isE2EE: true, ciphertext: "x", encryptedAesKey: "y", iv: "z" } }), { status: 200 })
            : new Response("{}", { status: 200 });
        await loadSession("s-ro");
        expect(activeSessionReadOnly.value).toBe(true);
        await syncSession("suite");
        expect(writes()).toEqual([]);
    });

    test("sans clé privée, une conversation lisible n'est pas écrite en clair", async () => {
        calls.length = 0;
        openedOrg.value = { id: "org-clair" } as any;
        user.value = { id: "u1", publicKey: undefined } as any;
        privateKey.value = null;
        newSession();
        aiSessionMessages.value = [{ role: "user", content: "secret" }];
        sfetchImpl = async () => new Response(JSON.stringify({ id: "n" }), { status: 201 });
        await syncSession("secret");
        expect(writes()).toEqual([]);
    });

    test("newSession lève la lecture seule", () => {
        newSession();
        expect(activeSessionReadOnly.value).toBe(false);
    });
});

describe("conversation conv-gcm1-v1 (retour en local)", () => {
    const stored = [{ id: "m1", role: "user", content: "gcm1:x", createdAt: "2026-11-23T00:00:00.000Z" }];

    test("loadSession la lit sous CK, la synchro la réécrit sous CK (jamais en blob E2EE)", async () => {
        calls.length = 0;
        openedOrg.value = { id: "org-conv" } as any;
        sfetchImpl = async (url) => url.endsWith("/ai/sessions/s-conv")
            ? new Response(JSON.stringify({ id: "s-conv", encryptionScheme: "conv-gcm1-v1", regime: "client", messages: stored }), { status: 200 })
            : new Response("{}", { status: 200 });
        const realOpen = convHistoryIo.open; const realSeal = convHistoryIo.seal;
        const sealed: unknown[][] = [];
        convHistoryIo.open = async (_o, _s, raw) => { expect(raw).toEqual(stored); return [{ id: "m1", role: "user", content: "Bonjour", createdAt: "2026-11-23T00:00:00.000Z" }]; };
        convHistoryIo.seal = async (_o, _s, display) => { sealed.push([...display]); return stored; };
        try {
            await loadSession("s-conv");
            expect(activeSessionReadOnly.value).toBe(false);
            expect(JSON.stringify(aiSessionMessages.value)).toContain("Bonjour");
            privateKey.value = null; // le blob E2EE serait impossible : seul le chemin CK écrit
            await syncSession("suite");
            expect(sealed).toHaveLength(1);
            const patch = writes().find((c) => c.method === "PATCH")!;
            expect(JSON.parse(patch.body!).messages).toEqual(stored);
            expect(activeSessionId.value).toBe("s-conv");
        } finally {
            convHistoryIo.open = realOpen; convHistoryIo.seal = realSeal;
        }
    });

    test("CK indisponible : conversation en lecture seule, aucune écriture", async () => {
        calls.length = 0;
        openedOrg.value = { id: "org-conv" } as any;
        sfetchImpl = async (url) => url.endsWith("/ai/sessions/s-conv2")
            ? new Response(JSON.stringify({ id: "s-conv2", encryptionScheme: "conv-gcm1-v1", regime: "client", messages: stored }), { status: 200 })
            : new Response("{}", { status: 200 });
        const realOpen = convHistoryIo.open;
        convHistoryIo.open = async () => { throw new Error("conversation_key_unavailable"); };
        try {
            await loadSession("s-conv2");
            expect(activeSessionReadOnly.value).toBe(true);
            await syncSession("suite");
            expect(writes()).toEqual([]);
        } finally {
            convHistoryIo.open = realOpen;
        }
    });
});
