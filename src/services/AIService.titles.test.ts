import { describe, expect, mock, test } from "bun:test";

// L13c : le titre d'une conversation du régime client ne part jamais en clair (création, mise à jour, migration).
type Call = { url: string; method: string; body: string | undefined };
const calls: Call[] = [];
let sfetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response(null, { status: 500 });
const idbStore = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
    get: async (k: string) => idbStore.get(k),
    set: async (k: string, v: unknown) => { idbStore.set(k, v); },
    del: async (k: string) => { idbStore.delete(k); },
}));
mock.module("@/assets/utils/sfetch", () => ({
    default: (url: string, init?: any) => {
        calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
        return sfetchImpl(url, init);
    },
}));

const { syncSession, newSession, aiSessionMessages, fetchSessions, chatSessions, activeSessionId, NEUTRAL_SESSION_TITLE } = await import("./AIService");
const { openedOrg, user } = await import("@/assets/var");
const { privateKey, wrapAiSessionKeyForMember, decryptAiField } = await import("@/assets/utils/crypto");

const SECRET = "Licenciement de Jean Dupont";

async function setup(orgId: string) {
    const kp = await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const pub = JSON.stringify(await crypto.subtle.exportKey("jwk", kp.publicKey));
    openedOrg.value = { id: orgId } as any;
    user.value = { id: "u-" + orgId, publicKey: pub } as any;
    privateKey.value = kp.privateKey;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const encryptedKey = await wrapAiSessionKeyForMember(await crypto.subtle.exportKey("raw", key), pub);
    return { key, encryptedKey };
}
const writes = () => calls.filter((c) => c.method !== 'GET');

describe("titres chiffrés (régime client)", () => {
    test("création : POST au titre neutre, puis PATCH gcm1 ; le clair n'apparaît dans aucune requête", async () => {
        calls.length = 0;
        const { key, encryptedKey } = await setup("org-t1");
        newSession();
        aiSessionMessages.value = [{ role: "user", content: SECRET }];
        sfetchImpl = async (url, init) => {
            if (url.endsWith("/ai/key")) return new Response(JSON.stringify({ encryptedKey }), { status: 200 });
            if (init?.method === 'POST') return new Response(JSON.stringify({ id: "s-new" }), { status: 201 });
            return new Response(init?.method ? "{}" : "[]", { status: 200 });
        };
        await syncSession(SECRET);
        const w = writes();
        expect(JSON.parse(w[0].body!).title).toBe(NEUTRAL_SESSION_TITLE);
        const patch = w.find((c) => c.method === 'PATCH')!;
        const title = JSON.parse(patch.body!).title as string;
        expect(title.startsWith("gcm1:")).toBe(true);
        expect(await decryptAiField(key, "s-new", "__session_title__", "title", title)).toBe(SECRET);
        for (const c of w) expect(c.body).not.toContain("Licenciement");
    });

    test("sans clé disponible : le titre reste neutre, jamais de clair", async () => {
        calls.length = 0;
        await setup("org-t2");
        privateKey.value = null;
        newSession();
        aiSessionMessages.value = [];
        sfetchImpl = async (url, init) => url.endsWith("/ai/key") ? new Response(null, { status: 404 })
            : init?.method === 'POST' ? new Response(JSON.stringify({ id: "s-nokey" }), { status: 201 }) : new Response("[]", { status: 200 });
        await syncSession(SECRET);
        for (const c of writes()) expect(c.body ?? "").not.toContain("Licenciement");
    });

    test("ancien titre en clair : relu tel quel, puis réécrit chiffré à la prochaine synchro", async () => {
        calls.length = 0;
        const { key, encryptedKey } = await setup("org-t3");
        sfetchImpl = async (url, init) => {
            if (url.endsWith("/ai/key")) return new Response(JSON.stringify({ encryptedKey }), { status: 200 });
            if (!init?.method && url.endsWith("/ai/sessions")) return new Response(JSON.stringify([{ id: "s-old", title: "Mon vieux titre" }]), { status: 200 });
            return new Response("{}", { status: 200 });
        };
        await fetchSessions();
        expect(chatSessions.value.find((s: any) => s.id === "s-old")?.title).toBe("Mon vieux titre");
        activeSessionId.value = "s-old";
        aiSessionMessages.value = [{ role: "user", content: "x" }];
        await syncSession("x");
        const patch = writes().find((c) => c.method === 'PATCH')!;
        const title = JSON.parse(patch.body!).title as string;
        expect(title.startsWith("gcm1:")).toBe(true);
        expect(patch.body).not.toContain("Mon vieux titre");
        expect(await decryptAiField(key, "s-old", "__session_title__", "title", title)).toBe("Mon vieux titre");
        // Une fois migré, la synchro suivante n'y touche plus.
        calls.length = 0;
        await syncSession("x");
        expect(JSON.parse(writes()[0].body!).title).toBeUndefined();
    });
});
