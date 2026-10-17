import { describe, expect, mock, test } from "bun:test";

const store = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
}));

const { user, openedOrg } = await import("@/assets/var");
const { privateSignKey } = await import("./crypto");
const { encryptThreadMessageV2, decryptThreadMessageV2, clientMsgIdOf, isAuthenticatedIv, encryptDmV2, decryptDmV2, findReplayedDms, dmClientMsgIdOf } = await import("./messageAuth");
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

describe("DM authentifiés (audit FC7)", () => {
    const rsaPair = () => crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const jwk = async (k: CryptoKey) => JSON.stringify(await crypto.subtle.exportKey("jwk", k));

    async function setup() {
        store.clear();
        const sign = await signingPair();
        privateSignKey.value = sign.privateKey;
        const pub = JSON.stringify(await crypto.subtle.exportKey("jwk", sign.publicKey));
        (user as any).value = { id: "bob" };
        (openedOrg as any).value = { members: [{ userId: "alice", user: { publicSignKey: pub } }] };
        const alice = await rsaPair(), bob = await rsaPair();
        return { alice, bob, ctx: { senderId: "alice", recipientId: "bob" } };
    }

    test("aller-retour destinataire et expéditeur, signature vérifiée", async () => {
        const { alice, bob, ctx } = await setup();
        const e = await encryptDmV2("salut Bob", await jwk(bob.publicKey), await jwk(alice.publicKey), ctx);
        const msg = { content: e.ciphertext, nonce: e.iv, encryptedAesKey: e.encryptedAesKey, selfEncryptedAesKey: e.selfEncryptedAesKey };
        expect(await decryptDmV2(msg, e.encryptedAesKey, bob.privateKey, ctx)).toEqual({ text: "salut Bob", auth: "verified" });
        expect((await decryptDmV2(msg, e.selfEncryptedAesKey!, alice.privateKey, ctx)).text).toBe("salut Bob");
    });

    test("DM fabriqué par un tiers au nom d'Alice (clé publique de Bob suffit) : invalid", async () => {
        const { alice, bob, ctx } = await setup();
        const mallory = await signingPair();
        privateSignKey.value = mallory.privateKey;
        const e = await encryptDmV2("virement urgent", await jwk(bob.publicKey), undefined, ctx);
        const msg = { content: e.ciphertext, nonce: e.iv, encryptedAesKey: e.encryptedAesKey, selfEncryptedAesKey: undefined };
        expect((await decryptDmV2(msg, e.encryptedAesKey, bob.privateKey, ctx)).auth).toBe("invalid");
    });

    test("réattribution (autre expéditeur) ou autre destinataire : déchiffrement refusé", async () => {
        const { bob, ctx } = await setup();
        const e = await encryptDmV2("x", await jwk(bob.publicKey), undefined, ctx);
        const msg = { content: e.ciphertext, nonce: e.iv, encryptedAesKey: e.encryptedAesKey, selfEncryptedAesKey: undefined };
        await expect(decryptDmV2(msg, e.encryptedAesKey, bob.privateKey, { senderId: "direction", recipientId: "bob" })).rejects.toThrow();
        await expect(decryptDmV2(msg, e.encryptedAesKey, bob.privateKey, { senderId: "alice", recipientId: "carol" })).rejects.toThrow();
    });

    test("clé AES emballée remplacée par le serveur : signature invalide", async () => {
        const { bob, ctx } = await setup();
        const e = await encryptDmV2("x", await jwk(bob.publicKey), undefined, ctx);
        const msg = { content: e.ciphertext, nonce: e.iv, encryptedAesKey: e.encryptedAesKey, selfEncryptedAesKey: "AAAA" };
        expect((await decryptDmV2(msg, e.encryptedAesKey, bob.privateKey, ctx)).auth).toBe("invalid");
    });

    test("rejeu repéré par date, identifiant conservé à l'édition", async () => {
        const { bob, ctx } = await setup();
        const e = await encryptDmV2("x", await jwk(bob.publicKey), undefined, ctx);
        const dm = (id: string, at: number) => ({ id, senderId: "alice", recipientId: "bob", nonce: e.iv, createdAt: new Date(at).toISOString() });
        expect([...findReplayedDms([dm("b", 2), dm("a", 1)])]).toEqual(["b"]);
        const edited = await encryptDmV2("y", await jwk(bob.publicKey), undefined, ctx, dmClientMsgIdOf(e.iv));
        expect(dmClientMsgIdOf(edited.iv)).toBe(dmClientMsgIdOf(e.iv));
    });
});

describe("clé de signature épinglée prioritaire sur l'annuaire (revue FC7)", () => {
    test("annuaire vidé par le serveur : message signé toujours vérifié, message non signé invalid", async () => {
        await asAlice();
        const key = await threadKey();
        const ctx = { threadId: "t1", senderId: "alice" };
        const first = await encryptThreadMessageV2("a", key, ctx);
        expect((await decryptThreadMessageV2(first.ciphertext, first.iv, key, ctx)).auth).toBe("verified"); // épingle la clé
        (openedOrg as any).value = { members: [] }; // le serveur retire la clé de l'annuaire
        const second = await encryptThreadMessageV2("b", key, ctx);
        expect((await decryptThreadMessageV2(second.ciphertext, second.iv, key, ctx)).auth).toBe("verified");
        const stripped = second.iv.split(".").slice(0, 3).join(".") + ".";
        expect((await decryptThreadMessageV2(second.ciphertext, stripped, key, ctx)).auth).toBe("invalid");
    });
});

describe("anciens DM (compatibilité FC7)", () => {
    test("un DM chiffré sans AAD ni signature se déchiffre toujours avec decryptFromPeer, et n'est pas pris pour du v2", async () => {
        const { encryptForPeer, decryptFromPeer } = await import("./crypto");
        const { isAuthenticatedDmNonce } = await import("./messageAuth");
        const rsa = await crypto.subtle.generateKey(
            { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
        const pub = JSON.stringify(await crypto.subtle.exportKey("jwk", rsa.publicKey));
        const old = await encryptForPeer("ancien DM", pub, pub);
        expect(isAuthenticatedDmNonce(old.iv)).toBe(false);
        expect(await decryptFromPeer(old.ciphertext, old.encryptedAesKey, old.iv, rsa.privateKey)).toBe("ancien DM");
        expect(await decryptFromPeer(old.ciphertext, old.selfEncryptedAesKey!, old.iv, rsa.privateKey)).toBe("ancien DM");
    });
});
