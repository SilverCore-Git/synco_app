import { describe, expect, mock, test } from "bun:test";

const store = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
}));

const { user, openedOrg } = await import("@/assets/var");
const { privateSignKey } = await import("./crypto");
const { encryptThreadMessageV2, decryptThreadMessageV2, clientMsgIdOf, isAuthenticatedIv } = await import("./messageAuth");
const { decryptMessages } = await import("./decryptMessages");
const { encryptMessageWithContentKey } = await import("./crypto");

const threadKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
const signingPair = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);

async function asAlice() {
    store.clear();
    const pair = await signingPair();
    privateSignKey.value = pair.privateKey;
    const pub = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.publicKey));
    (user as any).value = { id: "bob" };
    (openedOrg as any).value = { members: [{ userId: "alice", user: { publicSignKey: pub } }] };
    return pair;
}

describe("messages de salon authentifiés (audit FC7)", () => {
    test("aller-retour : texte restitué, signature vérifiée", async () => {
        await asAlice();
        const key = await threadKey();
        const { ciphertext, iv } = await encryptThreadMessageV2("salut", key, { threadId: "t1", senderId: "alice" });
        expect(isAuthenticatedIv(iv)).toBe(true);
        const r = await decryptThreadMessageV2(ciphertext, iv, key, { threadId: "t1", senderId: "alice" });
        expect(r).toEqual({ text: "salut", auth: "verified" });
    });

    test("réattribution ou déplacement par le serveur : le déchiffrement échoue", async () => {
        await asAlice();
        const key = await threadKey();
        const { ciphertext, iv } = await encryptThreadMessageV2("virement ok", key, { threadId: "t1", senderId: "alice" });
        await expect(decryptThreadMessageV2(ciphertext, iv, key, { threadId: "t1", senderId: "direction" })).rejects.toThrow();
        await expect(decryptThreadMessageV2(ciphertext, iv, key, { threadId: "t2", senderId: "alice" })).rejects.toThrow();
    });

    test("signature retirée par le serveur alors que l'expéditeur a une clé : invalid", async () => {
        await asAlice();
        const key = await threadKey();
        const { ciphertext, iv } = await encryptThreadMessageV2("x", key, { threadId: "t1", senderId: "alice" });
        const stripped = iv.split(".").slice(0, 3).join(".") + ".";
        expect((await decryptThreadMessageV2(ciphertext, stripped, key, { threadId: "t1", senderId: "alice" })).auth).toBe("invalid");
    });

    test("un autre membre (qui a la clé du salon) ne peut pas signer au nom d'Alice", async () => {
        await asAlice();
        const key = await threadKey();
        const mallory = await signingPair();
        privateSignKey.value = mallory.privateKey;
        const { ciphertext, iv } = await encryptThreadMessageV2("faux", key, { threadId: "t1", senderId: "alice" });
        expect((await decryptThreadMessageV2(ciphertext, iv, key, { threadId: "t1", senderId: "alice" })).auth).toBe("invalid");
    });

    test("expéditeur sans clé de signature connue : unsigned (non vérifiable), jamais verified", async () => {
        await asAlice();
        privateSignKey.value = null;
        (openedOrg as any).value = { members: [] };
        const key = await threadKey();
        const { ciphertext, iv } = await encryptThreadMessageV2("x", key, { threadId: "t1", senderId: "alice" });
        expect((await decryptThreadMessageV2(ciphertext, iv, key, { threadId: "t1", senderId: "alice" })).auth).toBe("unsigned");
    });

    test("édition : l'identifiant du message d'origine est conservé", async () => {
        await asAlice();
        const key = await threadKey();
        const first = await encryptThreadMessageV2("v1", key, { threadId: "t1", senderId: "alice" });
        const id = clientMsgIdOf(first.iv)!;
        const edited = await encryptThreadMessageV2("v2", key, { threadId: "t1", senderId: "alice" }, id);
        expect(clientMsgIdOf(edited.iv)).toBe(id);
        expect((await decryptThreadMessageV2(edited.ciphertext, edited.iv, key, { threadId: "t1", senderId: "alice" })).text).toBe("v2");
    });

    test("decryptMessages : ancien format lisible, message v2 rejoué et usurpé masqués", async () => {
        await asAlice();
        const key = await threadKey();
        const legacy = await encryptMessageWithContentKey("ancien", key);
        const v2 = await encryptThreadMessageV2("nouveau", key, { threadId: "t1", senderId: "alice" });
        const base = (id: string, c: { ciphertext: string; iv: string }, at: number, sender = "alice") =>
            ({ id, threadId: "t1", senderId: sender, content: c.ciphertext, iv: c.iv, nonce: "n", createdAt: new Date(at).toISOString() }) as any;
        const out = await decryptMessages([
            base("m1", legacy, 1),
            base("m2", v2, 2),
            base("m3", v2, 3),                     // rejeu du même message
        ], key);
        expect(out[0]!.content).toBe("ancien");
        expect(out[0]!.authState).toBe("legacy");
        expect(out[1]!.content).toBe("nouveau");
        expect(out[1]!.authState).toBe("verified");
        expect(out[2]!.authState).toBe("invalid");
        expect(out[2]!.content).toContain("Expéditeur non vérifié");
    });
});
