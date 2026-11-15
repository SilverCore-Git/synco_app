import { beforeEach, describe, expect, mock, test } from "bun:test";

// « Renouveler mes clés » (E2EE v4, rotateIdentity) : ce qui a été signé AVANT le renouvellement
// (messages, enveloppes de clés de salon/espace/fichier) doit rester lisible, sans rien céder sur
// la détection d'une vraie usurpation.

const store = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
}));

// Chaînes de transitions servies par /api/e2ee/v4/users/:id/transitions.
const chains = new Map<string, unknown[]>();
mock.module("@/assets/utils/sfetch", () => ({
    default: async (url: string) => {
        const m = /\/users\/([^/]+)\/transitions$/.exec(url);
        const body = m ? chains.get(decodeURIComponent(m[1]!)) ?? [] : null;
        return { ok: body !== null, status: body ? 200 : 404, json: async () => body };
    },
}));

const { user, openedOrg } = await import("@/assets/var");
const { privateSignKey } = await import("./crypto");
const { encryptThreadMessageV2, decryptThreadMessageV2, encryptDmV2, decryptDmV2 } = await import("./messageAuth");
const { signKeyEnvelope, verifyKeyEnvelopeIfPresent, KeyEnvelopeError } = await import("./keyEnvelope");
const { requireTrustedSignKey, trustSignKey } = await import("./keyTrust");
const { signIdentityTransition, predecessorSignKeys } = await import("./e2eeV4");

const ec = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const rsa = () => crypto.subtle.generateKey({ name: "RSA-OAEP", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["encrypt", "decrypt"]);
const pubOf = async (k: CryptoKeyPair) => JSON.stringify(await crypto.subtle.exportKey("jwk", k.publicKey));
const threadKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
const T = { threadId: "t1", senderId: "alice" };

let k0: CryptoKeyPair;
let k1: CryptoKeyPair;
let rsaPub: string;

/** Alice renouvelle ses clés : transition k0 → k1 signée par k0, et l'annuaire sert désormais k1. */
async function aliceRotates() {
    const t = await signIdentityTransition(k0.privateKey, "alice", 0, await pubOf(k0), rsaPub, await pubOf(k1));
    chains.set("alice", [t]);
    (openedOrg as any).value = { members: [{ userId: "alice", user: { publicSignKey: await pubOf(k1) } }] };
}

/** Message de salon et enveloppe de clé de salon signés par Alice avec `pair`. */
async function signedByAlice(pair: CryptoKeyPair, text: string, key: CryptoKey) {
    privateSignKey.value = pair.privateKey;
    const msg = await encryptThreadMessageV2(text, key, T);
    const env = await signKeyEnvelope(key, "thread:t1", 1);
    return { msg, env: { creatorId: "alice", ...env } };
}

beforeEach(async () => {
    store.clear();
    chains.clear();
    k0 = await ec();
    k1 = await ec();
    rsaPub = JSON.stringify(await crypto.subtle.exportKey("jwk", (await rsa()).publicKey));
    (user as any).value = { id: "bob" };
    (openedOrg as any).value = { members: [{ userId: "alice", user: { publicSignKey: await pubOf(k0) } }] };
});

describe("renouvellement des clés d'un autre membre", () => {
    test("appareil qui connaissait l'ancienne clé : anciens ET nouveaux contenus vérifiés", async () => {
        const key = await threadKey();
        const before = await signedByAlice(k0, "avant", key);
        expect((await decryptThreadMessageV2(before.msg.ciphertext, before.msg.iv, key, T)).auth).toBe("verified"); // épingle k0

        await aliceRotates();
        const after = await signedByAlice(k1, "après", key);

        expect(await decryptThreadMessageV2(after.msg.ciphertext, after.msg.iv, key, T)).toEqual({ text: "après", auth: "verified" });
        // La clé épinglée est passée à k1 : l'ancien message reste vérifié grâce à l'historique.
        expect(await decryptThreadMessageV2(before.msg.ciphertext, before.msg.iv, key, T)).toEqual({ text: "avant", auth: "verified" });
        await verifyKeyEnvelopeIfPresent(key, "thread:t1", 1, before.env);
        await verifyKeyEnvelopeIfPresent(key, "thread:t1", 1, after.env);
    });

    test("ancien message lu APRÈS le passage à la nouvelle clé (pas avant)", async () => {
        const key = await threadKey();
        const before = await signedByAlice(k0, "avant", key);
        await requireTrustedSignKey("alice", await pubOf(k0)); // vu une fois, contenu jamais ouvert
        await aliceRotates();
        await requireTrustedSignKey("alice", await pubOf(k1)); // suit la chaîne : épingle k1
        expect((await decryptThreadMessageV2(before.msg.ciphertext, before.msg.iv, key, T)).auth).toBe("verified");
    });

    test("appareil neuf, qui n'a connu que la nouvelle clé : ancien contenu affiché mais pas « vérifié »", async () => {
        const key = await threadKey();
        const before = await signedByAlice(k0, "avant", key);
        await aliceRotates();

        expect(await decryptThreadMessageV2(before.msg.ciphertext, before.msg.iv, key, T)).toEqual({ text: "avant", auth: "unsigned" });
        await verifyKeyEnvelopeIfPresent(key, "thread:t1", 1, before.env); // ne lève plus
    });

    test("DM signé avant le renouvellement : toujours vérifié", async () => {
        const peer = await rsa();
        const peerPub = JSON.stringify(await crypto.subtle.exportKey("jwk", peer.publicKey));
        const ctx = { senderId: "alice", recipientId: "bob" };
        privateSignKey.value = k0.privateKey;
        const dm = await encryptDmV2("coucou", peerPub, undefined, ctx);
        await requireTrustedSignKey("alice", await pubOf(k0));
        await aliceRotates();
        await requireTrustedSignKey("alice", await pubOf(k1));
        const r = await decryptDmV2(
            { content: dm.ciphertext, nonce: dm.iv, encryptedAesKey: dm.encryptedAesKey, selfEncryptedAesKey: dm.selfEncryptedAesKey ?? null },
            dm.encryptedAesKey, peer.privateKey, ctx
        );
        expect(r).toEqual({ text: "coucou", auth: "verified" });
    });
});

describe("ce qui reste refusé", () => {
    test("signature d'une clé étrangère à la chaîne : message masqué, enveloppe refusée", async () => {
        const key = await threadKey();
        await aliceRotates();
        const mallory = await ec();
        const forged = await signedByAlice(mallory, "faux", key);
        expect((await decryptThreadMessageV2(forged.msg.ciphertext, forged.msg.iv, key, T)).auth).toBe("invalid");
        await expect(verifyKeyEnvelopeIfPresent(key, "thread:t1", 1, forged.env)).rejects.toBeInstanceOf(KeyEnvelopeError);
    });

    test("clé substituée par le serveur sans chaîne : le nouveau contenu reste refusé", async () => {
        const key = await threadKey();
        await requireTrustedSignKey("alice", await pubOf(k0));
        (openedOrg as any).value = { members: [{ userId: "alice", user: { publicSignKey: await pubOf(k1) } }] }; // pas de transition
        const sub = await signedByAlice(k1, "substitué", key);
        expect((await decryptThreadMessageV2(sub.msg.ciphertext, sub.msg.iv, key, T)).auth).toBe("invalid");
        await expect(verifyKeyEnvelopeIfPresent(key, "thread:t1", 1, sub.env)).rejects.toThrow();
    });

    test("« ancienne clé » fabriquée par le serveur : ignorée par un appareil qui a des clés prouvées", async () => {
        const key = await threadKey();
        await requireTrustedSignKey("alice", await pubOf(k0));
        await aliceRotates();
        await requireTrustedSignKey("alice", await pubOf(k1)); // historique prouvé : [k0]
        // Le serveur ajoute un maillon X → k1 signé par une clé X qu'il contrôle.
        const x = await ec();
        const fake = await signIdentityTransition(x.privateKey, "alice", 0, await pubOf(x), rsaPub, await pubOf(k1));
        chains.set("alice", [fake, ...(chains.get("alice") ?? [])]);
        const forged = await signedByAlice(x, "faux ancien", key);
        expect((await decryptThreadMessageV2(forged.msg.ciphertext, forged.msg.iv, key, T)).auth).toBe("invalid");
    });

    test("chaîne à rebours : rangs strictement décroissants, pas de boucle", async () => {
        const k2 = await ec();
        const a = await signIdentityTransition(k0.privateKey, "alice", 0, await pubOf(k0), rsaPub, await pubOf(k1));
        const b = await signIdentityTransition(k1.privateKey, "alice", 1, await pubOf(k1), rsaPub, await pubOf(k2));
        const loop = await signIdentityTransition(k2.privateKey, "alice", 2, await pubOf(k2), rsaPub, await pubOf(k1));
        const canon = (s: string) => { const k = JSON.parse(s); return JSON.stringify({ crv: k.crv, kty: k.kty, x: k.x, y: k.y }); };
        expect(await predecessorSignKeys("alice", await pubOf(k2), [b, a])).toEqual([canon(await pubOf(k1)), canon(await pubOf(k0))]);
        // k1 → k2 → k1 : chaque pas descend d'un rang, la remontée s'arrête forcément à seq 0.
        expect(await predecessorSignKeys("alice", await pubOf(k1), [a, b, loop]))
            .toEqual([canon(await pubOf(k2)), canon(await pubOf(k1)), canon(await pubOf(k0))]);
    });
});

describe("son propre renouvellement de clés", () => {
    test("ses propres anciens messages et clés de salon restent vérifiés", async () => {
        (user as any).value = { id: "alice", publicSignKey: await pubOf(k0) };
        await trustSignKey("alice", await pubOf(k0));
        const key = await threadKey();
        const before = await signedByAlice(k0, "à moi", key);

        // Renouvellement sur cet appareil : l'identité locale épingle k1.
        await trustSignKey("alice", await pubOf(k1));
        (user as any).value = { id: "alice", publicSignKey: await pubOf(k1) };

        expect((await decryptThreadMessageV2(before.msg.ciphertext, before.msg.iv, key, T)).auth).toBe("verified");
        await verifyKeyEnvelopeIfPresent(key, "thread:t1", 1, before.env);
    });
});
