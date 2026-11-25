import { describe, expect, mock, test } from "bun:test";

/**
 * Formats m3 / d3 de bout en bout (12 §4.3, §10.7 ; L15f) : chiffrement et signature réels par l'app, lecture,
 * mention « avec Synco AI », déclaration du texte d'un message autonome (`rt1:`), jamais masqué quand le texte
 * n'est pas confirmé.
 */

const store = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
}));

const { user, openedOrg } = await import("@/assets/var");
const { privateSignKey } = await import("./crypto");
const ma = await import("./messageAuth");
const am = await import("./agentMessage");
const { buildTextDeclarationFor, saltHexFor } = await import("./agentMessagePlan");
const { decryptMessages } = await import("./decryptMessages");

const enc = new TextEncoder();
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const threadKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
const signingPair = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const CTX = { threadId: "t1", senderId: "alice", reader: { orgId: "org1", messageId: "msg9", replyToId: null } };
const ORG = "org1";
const DELEG = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

async function asAlice() {
    store.clear();
    const pair = await signingPair();
    privateSignKey.value = pair.privateKey;
    const pub = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.publicKey));
    (user as any).value = { id: "bob" };
    (openedOrg as any).value = { id: ORG, members: [{ userId: "alice", user: { publicSignKey: pub } }] };
    ma.setRt1AuthorVerifier(null);
    return pair;
}

/** Message `m3` `rt1:` tel que l'écrira le runtime (L15-rt) : clair = enveloppe { salt, text }, td en septième partie. */
async function runtimeMessage(key: CryptoKey, plaintext: string, td: string | null, rev = 0, cid = crypto.randomUUID()) {
    const author = `rt1:${DELEG}`;
    const ivBytes = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: ivBytes, additionalData: enc.encode(am.threadAadV3(CTX.threadId, CTX.senderId, cid, author, rev)) }, key, enc.encode(plaintext)));
    const csk = await signingPair();
    const ivB64 = toB64(ivBytes), ciphertext = toB64(ct);
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, csk.privateKey,
        enc.encode(am.threadSignedV3(CTX.threadId, CTX.senderId, cid, author, ivB64, ciphertext, rev, td))));
    return { ciphertext, iv: am.formatM3Iv({ iv: ivB64, clientMsgId: cid, author: author as `rt1:${string}`, signature: toB64(sig), rev, td }), csk };
}

const cskVerifier = (csk: CryptoKeyPair): Parameters<typeof ma.setRt1AuthorVerifier>[0] => async ({ signed, signature }) =>
    (await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, csk.publicKey, signature as BufferSource, signed as BufferSource)) ? "verified" : "invalid";

describe("m3 auteur ai (envoyé par l'appareil)", () => {
    test("aller-retour : verified, mention ai, révision et identifiant relus", async () => {
        await asAlice();
        const key = await threadKey();
        const { ciphertext, iv } = await ma.encryptThreadMessageV3("Bonjour", key, CTX);
        expect(iv.startsWith("m3.")).toBe(true);
        expect(ma.isAuthenticatedIv(iv)).toBe(true);
        expect(ma.revisionOf(iv)).toBe(0);
        expect(ma.clientMsgIdOf(iv)).toBe(am.parseM3Iv(iv).clientMsgId);
        expect(await ma.decryptThreadMessageV2(ciphertext, iv, key, CTX)).toEqual({ text: "Bonjour", auth: "verified", agent: { author: "ai" } });
    });

    test("le serveur ne peut pas ôter la mention : m3 relu comme m2, ou auteur changé → déchiffrement refusé", async () => {
        await asAlice();
        const key = await threadKey();
        const { ciphertext, iv } = await ma.encryptThreadMessageV3("x", key, CTX);
        const p = am.parseM3Iv(iv);
        await expect(ma.decryptThreadMessageV2(ciphertext, `m2.${p.iv}.${p.clientMsgId}.${p.signature}`, key, CTX)).rejects.toThrow();
        await expect(ma.decryptThreadMessageV2(ciphertext, am.formatM3Iv({ ...p, author: `rt1:${DELEG}` }), key, CTX)).rejects.toThrow();
    });

    test("signature vide ou d'un autre membre : invalid ; sans clé de signature, aucun envoi", async () => {
        await asAlice();
        const key = await threadKey();
        const { ciphertext, iv } = await ma.encryptThreadMessageV3("x", key, CTX);
        const p = am.parseM3Iv(iv);
        expect((await ma.decryptThreadMessageV2(ciphertext, am.formatM3Iv({ ...p, signature: "" }), key, CTX)).auth).toBe("invalid");
        privateSignKey.value = (await signingPair()).privateKey;
        const forged = await ma.encryptThreadMessageV3("faux", key, CTX);
        expect((await ma.decryptThreadMessageV2(forged.ciphertext, forged.iv, key, CTX)).auth).toBe("invalid");
        privateSignKey.value = null;
        await expect(ma.encryptThreadMessageV3("x", key, CTX)).rejects.toThrow();
    });

    test("révision rejouée (rev plus ancienne après une plus récente) : invalid", async () => {
        await asAlice();
        const key = await threadKey();
        const cid = crypto.randomUUID();
        const r1 = await ma.encryptThreadMessageV3("v1", key, CTX, cid, 1);
        const r0 = await ma.encryptThreadMessageV3("v0", key, CTX, cid, 0);
        expect((await ma.decryptThreadMessageV2(r1.ciphertext, r1.iv, key, CTX)).auth).toBe("verified");
        expect((await ma.decryptThreadMessageV2(r0.ciphertext, r0.iv, key, CTX)).auth).toBe("invalid");
    });
});

describe("m3 auteur rt1: (mode autonome) et déclaration du texte", () => {
    async function declared(text: string, n = 1) {
        const pair = await asAlice();
        const ck = crypto.getRandomValues(new Uint8Array(32));
        const input = { ck, sessionId: "s1", planId: "p1", orgId: ORG, userId: "alice", userSignKey: pair.privateKey };
        const td = await buildTextDeclarationFor({ n, kind: "message.send", args: { threadId: CTX.threadId, text } }, input);
        const salt = await saltHexFor(ck, "s1", "p1", n);
        return { td, salt };
    }

    test("csk vérifiée, déclaration et texte cohérents : text_verified, texte de l'enveloppe", async () => {
        const { td, salt } = await declared("Réunion à 15 h.");
        const key = await threadKey();
        const m = await runtimeMessage(key, am.encodeTextEnvelope(salt, "Réunion à 15 h."), td);
        ma.setRt1AuthorVerifier(cskVerifier(m.csk));
        const r = await ma.decryptThreadMessageV2(m.ciphertext, m.iv, key, CTX);
        expect(r.auth).toBe("verified");
        expect(r.text).toBe("Réunion à 15 h.");
        expect(r.agent).toEqual({ author: "rt1", delegationId: DELEG, text: "text_verified", action: { planId: "p1", n: 1 } });
    });

    test("texte changé par le runtime : affiché quand même, text_unverified (text_mismatch)", async () => {
        const { td, salt } = await declared("Réunion à 15 h.");
        const key = await threadKey();
        const m = await runtimeMessage(key, am.encodeTextEnvelope(salt, "Réunion à 17 h."), td);
        ma.setRt1AuthorVerifier(cskVerifier(m.csk));
        const r = await ma.decryptThreadMessageV2(m.ciphertext, m.iv, key, CTX);
        expect(r.auth).toBe("verified");
        expect(r.text).toBe("Réunion à 17 h.");
        expect(r.agent).toMatchObject({ author: "rt1", text: "text_unverified", reason: "text_mismatch" });
    });

    test("ôter la septième partie casse la signature csk ; forme à six parties : text_unverified (absent)", async () => {
        const { td, salt } = await declared("x");
        const key = await threadKey();
        const m = await runtimeMessage(key, am.encodeTextEnvelope(salt, "x"), td);
        ma.setRt1AuthorVerifier(cskVerifier(m.csk));
        const stripped = am.formatM3Iv({ ...am.parseM3Iv(m.iv), td: null });
        expect((await ma.decryptThreadMessageV2(m.ciphertext, stripped, key, CTX)).auth).toBe("invalid");
        const six = await runtimeMessage(key, "texte brut", null);
        ma.setRt1AuthorVerifier(cskVerifier(six.csk));
        const r = await ma.decryptThreadMessageV2(six.ciphertext, six.iv, key, CTX);
        expect(r.text).toBe("texte brut");
        expect(r.agent).toMatchObject({ text: "text_unverified", reason: "absent" });
    });

    test("sans vérificateur de mandat : invalid (jamais unsigned affiché) ; avec un vérificateur « unsigned », la déclaration reste contrôlée", async () => {
        const { td, salt } = await declared("ok");
        const key = await threadKey();
        const m = await runtimeMessage(key, am.encodeTextEnvelope(salt, "ok"), td);
        expect((await ma.decryptThreadMessageV2(m.ciphertext, m.iv, key, CTX)).auth).toBe("invalid");
        ma.setRt1AuthorVerifier(async () => "unsigned");
        const r = await ma.decryptThreadMessageV2(m.ciphertext, m.iv, key, CTX);
        expect(r.auth).toBe("unsigned");
        expect(r.agent).toMatchObject({ text: "text_verified" });
    });

    test("mandat refusé par le vérificateur : invalid (masqué par l'appelant comme aujourd'hui)", async () => {
        const { td, salt } = await declared("ok");
        const key = await threadKey();
        const m = await runtimeMessage(key, am.encodeTextEnvelope(salt, "ok"), td);
        ma.setRt1AuthorVerifier(async () => "invalid");
        expect((await ma.decryptThreadMessageV2(m.ciphertext, m.iv, key, CTX)).auth).toBe("invalid");
    });

    test("decryptMessages : agentMark posé, texte non confirmé jamais masqué, rejeu d'une déclaration détecté", async () => {
        const { td, salt } = await declared("ok");
        const key = await threadKey();
        const a = await runtimeMessage(key, am.encodeTextEnvelope(salt, "ok"), td);
        const b = await runtimeMessage(key, am.encodeTextEnvelope(salt, "ok"), td);
        const verifiers = new Map([[a.iv, a.csk], [b.iv, b.csk]]);
        ma.setRt1AuthorVerifier(async (i) => {
            for (const [, k] of verifiers) if (await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.publicKey, i.signature as BufferSource, i.signed as BufferSource)) return "verified";
            return "invalid";
        });
        const base = { threadId: CTX.threadId, senderId: CTX.senderId, nonce: "", replyToId: null } as const;
        const out = await decryptMessages([
            { ...base, id: "m1", content: a.ciphertext, iv: a.iv, createdAt: "2026-11-24T10:00:00Z" },
            { ...base, id: "m2", content: b.ciphertext, iv: b.iv, createdAt: "2026-11-24T10:05:00Z" },
        ] as never, key);
        expect(out[0]!.content).toBe("ok");
        expect(out[0]!.agentMark).toMatchObject({ author: "rt1", text: "text_verified" });
        expect(out[1]!.content).toBe("ok");
        expect(out[1]!.agentMark).toMatchObject({ author: "rt1", text: "text_unverified", reason: "replayed" });
    });
});

describe("d3 (MP écrit par l'agent)", () => {
    const rsaPair = () => crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const jwk = async (k: CryptoKey) => JSON.stringify(await crypto.subtle.exportKey("jwk", k));

    test("aller-retour, mention ai ; nonce d2 relabellisé : refusé", async () => {
        await asAlice();
        const alice = await rsaPair(), bob = await rsaPair();
        const ctx = { senderId: "alice", recipientId: "bob" };
        const e = await ma.encryptDmV3("salut", await jwk(bob.publicKey), await jwk(alice.publicKey), ctx);
        expect(e.iv.startsWith("d3.")).toBe(true);
        expect(ma.isAuthenticatedDmNonce(e.iv)).toBe(true);
        expect(ma.dmRevisionOf(e.iv)).toBe(0);
        const msg = { content: e.ciphertext, nonce: e.iv, encryptedAesKey: e.encryptedAesKey, selfEncryptedAesKey: e.selfEncryptedAesKey };
        expect(await ma.decryptDmV2(msg, e.encryptedAesKey, bob.privateKey, ctx)).toEqual({ text: "salut", auth: "verified", agent: { author: "ai" } });
        const p = am.parseD3Nonce(e.iv);
        await expect(ma.decryptDmV2({ ...msg, nonce: `d2.${p.iv}.${p.clientMsgId}.${p.signature}` }, e.encryptedAesKey, bob.privateKey, ctx)).rejects.toThrow();
    });
});
