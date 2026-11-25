import { describe, expect, mock, test } from "bun:test";

/**
 * Marques d'agent et états d'authentification : seuls le déchiffrement local les pose. Un `agentMark` ou un
 * `authState` SERVI par le serveur ne doit jamais survivre (« avec Synco AI » sur un message humain), quelle que soit
 * la branche : m2, ancien format, contenu vide, clé absente, échec de déchiffrement, vecteur manquant.
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
const { decryptMessages, decryptEditedMessage, markReplayedDeclarations } = await import("./decryptMessages");
const { buildTextDeclarationFor, saltHexFor } = await import("./agentMessagePlan");
const { agentMarkView } = await import("@/views/OrgSpace/components/common/agentMessageMark");

const enc = new TextEncoder();
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const aesKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
const signingPair = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const ORG = "org1";
const DELEG = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const CTX = { threadId: "t1", senderId: "alice" };
const FAKE_MARK = { author: "rt1", delegationId: DELEG, text: "text_verified" } as const;

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
const base = (over: Record<string, unknown>) => ({
    id: "m1", threadId: CTX.threadId, senderId: CTX.senderId, nonce: "", replyToId: null, createdAt: "2026-11-24T10:00:00Z",
    agentMark: FAKE_MARK, authState: "verified", ...over,
}) as never;

async function runtimeMessage(key: CryptoKey, plaintext: string, td: string | null, cid = crypto.randomUUID()) {
    const author = `rt1:${DELEG}`;
    const ivBytes = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: ivBytes, additionalData: enc.encode(am.threadAadV3(CTX.threadId, CTX.senderId, cid, author, 0)) }, key, enc.encode(plaintext)));
    const csk = await signingPair();
    const ivB64 = toB64(ivBytes), ciphertext = toB64(ct);
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, csk.privateKey,
        enc.encode(am.threadSignedV3(CTX.threadId, CTX.senderId, cid, author, ivB64, ciphertext, 0, td))));
    return { ciphertext, iv: am.formatM3Iv({ iv: ivB64, clientMsgId: cid, author: author as `rt1:${string}`, signature: toB64(sig), rev: 0, td }), csk };
}

describe("agentMark / authState servis : jamais conservés", () => {
    test("m2 (message humain authentifié) + agentMark injecté : aucune mention, état calculé", async () => {
        await asAlice();
        const key = await aesKey();
        const e = await ma.encryptThreadMessageV2("Bonjour", key, { ...CTX, senderId: CTX.senderId });
        // l'expéditeur du message est alice : sa signature est vérifiable avec la clé publiée.
        const [out] = await decryptMessages([base({ content: e.ciphertext, iv: e.iv })], key);
        expect(out!.content).toBe("Bonjour");
        expect(out!.agentMark).toBeUndefined();
        expect(agentMarkView({ mark: out!.agentMark, authState: out!.authState })).toBeNull();
    });

    test("ancien format (sans vecteur authentifié) + agentMark / authState injectés : legacy, aucune mention", async () => {
        await asAlice();
        const key = await aesKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode("ancien")));
        const [out] = await decryptMessages([base({ content: toB64(ct), iv: toB64(iv) })], key);
        expect(out!.content).toBe("ancien");
        expect(out!.authState).toBe("legacy");
        expect(out!.agentMark).toBeUndefined();
    });

    test("échec de déchiffrement, vecteur manquant, contenu vide, clé absente : aucune marque ni état servis", async () => {
        await asAlice();
        const key = await aesKey();
        const other = await aesKey();
        const e = await ma.encryptThreadMessageV2("x", other, CTX);
        const out = await decryptMessages([
            base({ id: "fail", content: e.ciphertext, iv: e.iv }),
            base({ id: "noiv", content: "abc", iv: "", nonce: "" }),
            base({ id: "empty", content: "", iv: "" }),
        ], key);
        for (const m of out) {
            expect(m.agentMark).toBeUndefined();
            expect(m.authState).toBeUndefined();
        }
        const noKey = await decryptMessages([base({ content: "abc", iv: "x" })], null);
        expect(noKey[0]!.agentMark).toBeUndefined();
        expect(noKey[0]!.authState).toBeUndefined();
    });

    test("m3 relu dans nonce (champ libre de l'expéditeur) : jamais interprété, aucune mention", async () => {
        await asAlice();
        const key = await aesKey();
        const e = await ma.encryptThreadMessageV3("Bonjour", key, CTX);
        const [out] = await decryptMessages([base({ content: e.ciphertext, iv: "", nonce: e.iv })], key);
        expect(out!.agentMark).toBeUndefined();
        expect(out!.authState).toBeUndefined();
        expect(out!.content).not.toBe("Bonjour");
    });

    test("édition en direct : même règle (échec + marque servie)", async () => {
        await asAlice();
        const key = await aesKey();
        const other = await aesKey();
        const e = await ma.encryptThreadMessageV2("x", other, CTX);
        const out = await decryptEditedMessage(base({ content: e.ciphertext, iv: e.iv }), key, () => undefined);
        expect(out.agentMark).toBeUndefined();
        expect(out.authState).toBeUndefined();
    });
});

describe("auteur rt1: sans vérificateur de mandat (03 §10)", () => {
    test("invalid : texte masqué, aucune mention « mode autonome », jamais unsigned affiché", async () => {
        await asAlice();
        const key = await aesKey();
        const m = await runtimeMessage(key, "texte brut", null);
        const [out] = await decryptMessages([base({ content: m.ciphertext, iv: m.iv, agentMark: undefined, authState: undefined })], key);
        expect(out!.authState).toBe("invalid");
        expect(out!.agentMark).toBeUndefined();
        expect(out!.content).toContain("non vérifié");
        expect(agentMarkView({ mark: out!.agentMark, authState: out!.authState })).toBeNull();
        // vérificateur branché : l'état vient de lui.
        ma.setRt1AuthorVerifier(async () => "verified");
        const [ok] = await decryptMessages([base({ content: m.ciphertext, iv: m.iv, agentMark: undefined, authState: undefined })], key);
        expect(ok!.authState).toBe("verified");
        ma.setRt1AuthorVerifier(null);
    });
});

describe("rejeu d'une déclaration : relancé à l'insertion d'un message reçu en direct", () => {
    test("deux messages chargés séparément, puis markReplayedDeclarations sur la liste : le plus récent est marqué", async () => {
        const pair = await asAlice();
        const key = await aesKey();
        const ck = crypto.getRandomValues(new Uint8Array(32));
        const td = await buildTextDeclarationFor({ n: 1, kind: "message.send", args: { threadId: CTX.threadId, text: "ok" } },
            { ck, sessionId: "s1", planId: "p1", orgId: ORG, userId: "alice", userSignKey: pair.privateKey });
        const salt = await saltHexFor(ck, "s1", "p1", 1);
        const a = await runtimeMessage(key, am.encodeTextEnvelope(salt, "ok"), td);
        const b = await runtimeMessage(key, am.encodeTextEnvelope(salt, "ok"), td);
        ma.setRt1AuthorVerifier(async () => "verified");
        const first = (await decryptMessages([base({ id: "m1", content: a.ciphertext, iv: a.iv, createdAt: "2026-11-24T10:00:00Z", agentMark: undefined, authState: undefined })], key))[0]!;
        // Reçu en direct, déchiffré seul : rien ne révèle encore le rejeu.
        const live = (await decryptMessages([base({ id: "m2", content: b.ciphertext, iv: b.iv, createdAt: "2026-11-24T10:05:00Z", agentMark: undefined, authState: undefined })], key))[0]!;
        expect(live.agentMark).toMatchObject({ text: "text_verified" });
        const list = [first, live];
        markReplayedDeclarations(list);
        expect(list[0]!.agentMark).toMatchObject({ text: "text_verified" });
        expect(list[1]!.agentMark).toMatchObject({ author: "rt1", text: "text_unverified", reason: "replayed" });
        ma.setRt1AuthorVerifier(null);
    });
});
