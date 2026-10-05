import { describe, expect, mock, test } from "bun:test";

const store = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
}));

const { user, openedOrg } = await import("@/assets/var");
const { privateSignKey } = await import("./crypto");
const { signKeyEnvelope, verifyKeyEnvelope, verifyKeyEnvelopeIfPresent, KeyEnvelopeError } = await import("./keyEnvelope");
const { UntrustedKeyError } = await import("./keyTrust");

const newSymKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
const newSigningPair = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);

describe("keyEnvelope — signature d'origine d'une clé distribuée (audit FC4 §2)", () => {
    test("signKeyEnvelope/verifyKeyEnvelope : round-trip correct", async () => {
        (user as any).value = { id: "alice" };
        const signingPair = await newSigningPair();
        privateSignKey.value = signingPair.privateKey;
        const pubJwk = await crypto.subtle.exportKey("jwk", signingPair.publicKey);

        const key = await newSymKey();
        const { commitment, signature } = await signKeyEnvelope(key, "space:s1", 1);

        await verifyKeyEnvelope(key, { ctx: "space:s1", version: 1, commitment, signature }, pubJwk);
    });

    test("verifyKeyEnvelope : la clé effectivement reçue ne correspond pas au commitment signé", async () => {
        const signingPair = await newSigningPair();
        privateSignKey.value = signingPair.privateKey;
        const pubJwk = await crypto.subtle.exportKey("jwk", signingPair.publicKey);

        const key = await newSymKey();
        const otherKey = await newSymKey();
        const { commitment, signature } = await signKeyEnvelope(key, "space:s1", 1);

        await expect(
            verifyKeyEnvelope(otherKey, { ctx: "space:s1", version: 1, commitment, signature }, pubJwk)
        ).rejects.toBeInstanceOf(KeyEnvelopeError);
    });

    test("verifyKeyEnvelope : signature invalide pour cette clé publique", async () => {
        const signingPair = await newSigningPair();
        const otherPair = await newSigningPair();
        privateSignKey.value = signingPair.privateKey;
        const otherPubJwk = await crypto.subtle.exportKey("jwk", otherPair.publicKey);

        const key = await newSymKey();
        const { commitment, signature } = await signKeyEnvelope(key, "thread:t1", 1);

        await expect(
            verifyKeyEnvelope(key, { ctx: "thread:t1", version: 1, commitment, signature }, otherPubJwk)
        ).rejects.toBeInstanceOf(KeyEnvelopeError);
    });

    test("verifyKeyEnvelope : un contexte différent de celui signé est refusé (pas de rejeu inter-contexte)", async () => {
        const signingPair = await newSigningPair();
        privateSignKey.value = signingPair.privateKey;
        const pubJwk = await crypto.subtle.exportKey("jwk", signingPair.publicKey);

        const key = await newSymKey();
        const { commitment, signature } = await signKeyEnvelope(key, "space:s1", 1);

        await expect(
            verifyKeyEnvelope(key, { ctx: "space:s2", version: 1, commitment, signature }, pubJwk)
        ).rejects.toBeInstanceOf(KeyEnvelopeError);
    });
});

describe("verifyKeyEnvelopeIfPresent — point d'appel côté réception", () => {
    test("enveloppe absente (compte émetteur pas migré) : ne bloque rien", async () => {
        const key = await newSymKey();
        await verifyKeyEnvelopeIfPresent(key, "space:legacy-sender", 1, {});
        await verifyKeyEnvelopeIfPresent(key, "space:legacy-sender", 1, { creatorId: "bob" }); // commitment/signature manquants
    });

    test("créateur introuvable localement (annuaire pas chargé) : tolère, ne bloque pas", async () => {
        (openedOrg as any).value = { members: [] };
        const signingPair = await newSigningPair();
        privateSignKey.value = signingPair.privateKey;
        const key = await newSymKey();
        const { commitment, signature } = await signKeyEnvelope(key, "space:unknown-creator", 1);

        await verifyKeyEnvelopeIfPresent(key, "space:unknown-creator", 1, { creatorId: "nobody-visible", commitment, signature });
    });

    test("créateur résolu (membre de l'org ouverte), première rencontre : vérifie et épingle", async () => {
        (user as any).value = { id: "me" };
        const signingPair = await newSigningPair();
        privateSignKey.value = signingPair.privateKey;
        const pubJwk = JSON.stringify(await crypto.subtle.exportKey("jwk", signingPair.publicKey));
        (openedOrg as any).value = { members: [{ userId: "erin", user: { publicSignKey: pubJwk } }] };

        const key = await newSymKey();
        const { commitment, signature } = await signKeyEnvelope(key, "space:known-creator", 1);

        await verifyKeyEnvelopeIfPresent(key, "space:known-creator", 1, { creatorId: "erin", commitment, signature });
    });

    test("identité de signature du créateur changée depuis le premier épinglage : refusée", async () => {
        (user as any).value = { id: "me" };
        const firstPair = await newSigningPair();
        const secondPair = await newSigningPair();
        const firstPubJwk = JSON.stringify(await crypto.subtle.exportKey("jwk", firstPair.publicKey));
        const secondPubJwk = JSON.stringify(await crypto.subtle.exportKey("jwk", secondPair.publicKey));

        (openedOrg as any).value = { members: [{ userId: "frank", user: { publicSignKey: firstPubJwk } }] };
        privateSignKey.value = firstPair.privateKey;
        const key = await newSymKey();
        const envelope1 = await signKeyEnvelope(key, "space:frank-ctx", 1);
        await verifyKeyEnvelopeIfPresent(key, "space:frank-ctx", 1, { creatorId: "frank", ...envelope1 });

        // Frank "change" de clé de signature (compte compromis, ou usurpation) :
        // une seconde clé envoyée en son nom doit être refusée, pas acceptée en silence.
        (openedOrg as any).value = { members: [{ userId: "frank", user: { publicSignKey: secondPubJwk } }] };
        privateSignKey.value = secondPair.privateKey;
        const envelope2 = await signKeyEnvelope(key, "space:frank-ctx", 2);
        await expect(
            verifyKeyEnvelopeIfPresent(key, "space:frank-ctx", 2, { creatorId: "frank", ...envelope2 })
        ).rejects.toBeInstanceOf(UntrustedKeyError);
    });
});
