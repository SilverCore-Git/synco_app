import { beforeEach, describe, expect, mock, test } from "bun:test";

const store = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
}));

const { user } = await import("@/assets/var");
const { privateSignKey, encryptMessageWithContentKey, decryptMessageWithContentKey } = await import("./crypto");
const { KeyEnvelopeError } = await import("./keyEnvelope");
const { KeyChangedError } = await import("./keyPinning");
const {
    generateStaffKeyPair, signStaffKey, verifyStaffKey, StaffKeyError,
    encryptStaffKeyShare, decryptStaffKeyShare,
    generateTicketKey, sealTicketKey, signTicketKey, openTicketKey, supportKeyContext,
} = await import("./supportCrypto");

const newSigningPair = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
// Clé « utilisateur » : 2048 bits suffisent pour les tests (paramètres
// OAEP/SHA-256 identiques), la clé d'équipe reste en 4096.
const newUserPair = () => crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["encrypt", "decrypt"]
);
const jwkString = async (k: CryptoKey) => JSON.stringify(await crypto.subtle.exportKey("jwk", k));

const asUser = async (id: string) => {
    const sign = await newSigningPair();
    const rsa = await newUserPair();
    const publicSignKey = await jwkString(sign.publicKey);
    const publicKey = await jwkString(rsa.publicKey);
    (user as any).value = { id, publicKey, publicSignKey };
    privateSignKey.value = sign.privateKey;
    return { id, sign, rsa, publicKey, publicSignKey };
};

// Une seule paire 4096 pour tout le fichier : la génération est lente.
const staffPair = await generateStaffKeyPair();

beforeEach(() => store.clear());

describe("clé d'équipe du support", () => {

    test("aller-retour : copie scellée pour un membre, déchiffrement d'une clé de ticket", async () => {
        const member = await asUser("member");

        const share = await encryptStaffKeyShare(staffPair.privateKey, member.publicKey);
        expect(share.startsWith("v1.")).toBe(true);
        expect(share.length).toBeLessThanOrEqual(16384);

        const opened = await decryptStaffKeyShare(share, member.rsa.privateKey, staffPair.publicKey);

        const ticketKey = await generateTicketKey();
        const sealed = await sealTicketKey(ticketKey, staffPair.publicKey);
        const { ciphertext, iv } = await encryptMessageWithContentKey("bonjour", ticketKey);
        const key = await openTicketKey(sealed, opened, "t-roundtrip", "PUBLIC", {}, () => null);
        expect(await decryptMessageWithContentKey(ciphertext, iv, key)).toBe("bonjour");
    });

    test("copie fabriquée avec une autre paire : refusée (key-mismatch)", async () => {
        const member = await asUser("member");
        const other = await newUserPair();
        const share = await encryptStaffKeyShare(other.privateKey, member.publicKey);
        await expect(decryptStaffKeyShare(share, member.rsa.privateKey, staffPair.publicKey))
            .rejects.toMatchObject({ reason: "key-mismatch" });
    });

    test("copie illisible : bad-share", async () => {
        const member = await asUser("member");
        await expect(decryptStaffKeyShare("v1.AAAA.AAAA.AAAA", member.rsa.privateKey))
            .rejects.toBeInstanceOf(StaffKeyError);
    });

    test("signature valide : acceptée, signataire épinglé", async () => {
        const admin = await asUser("super");
        const signature = await signStaffKey(1, staffPair.publicKey);
        const info = { version: 1, publicKey: staffPair.publicKey, signature, signerId: "super", signerPublicSignKey: admin.publicSignKey };
        await verifyStaffKey(info);
        // Seconde vérification : signataire et clé de signature déjà épinglés.
        await verifyStaffKey(info);
    });

    test("signature invalide : version modifiée, ou signée par une autre clé", async () => {
        const admin = await asUser("super");
        const signature = await signStaffKey(1, staffPair.publicKey);
        await expect(verifyStaffKey({ version: 2, publicKey: staffPair.publicKey, signature, signerId: "super", signerPublicSignKey: admin.publicSignKey }))
            .rejects.toMatchObject({ reason: "bad-signature" });

        const intruder = await newSigningPair();
        await expect(verifyStaffKey({ version: 1, publicKey: staffPair.publicKey, signature, signerId: "super", signerPublicSignKey: await jwkString(intruder.publicKey) }))
            .rejects.toMatchObject({ reason: "bad-signature" });
    });

    test("changement de signataire après l'épinglage : alerte", async () => {
        const admin = await asUser("super");
        const signature = await signStaffKey(1, staffPair.publicKey);
        await verifyStaffKey({ version: 1, publicKey: staffPair.publicKey, signature, signerId: "super", signerPublicSignKey: admin.publicSignKey });

        // Même utilisateur local, un autre « super-admin » signe la v2.
        const me = (user as any).value;
        const rogue = await newSigningPair();
        privateSignKey.value = rogue.privateKey;
        const sig2 = await signStaffKey(2, staffPair.publicKey);
        (user as any).value = me;
        await expect(verifyStaffKey({ version: 2, publicKey: staffPair.publicKey, signature: sig2, signerId: "rogue", signerPublicSignKey: await jwkString(rogue.publicKey) }))
            .rejects.toMatchObject({ reason: "signer-changed" });
    });

    test("le signataire épinglé change de clé de signature : refus", async () => {
        const admin = await asUser("super");
        const signature = await signStaffKey(1, staffPair.publicKey);
        await verifyStaffKey({ version: 1, publicKey: staffPair.publicKey, signature, signerId: "super", signerPublicSignKey: admin.publicSignKey });

        const newSign = await newSigningPair();
        privateSignKey.value = newSign.privateKey;
        const sig2 = await signStaffKey(2, staffPair.publicKey);
        await expect(verifyStaffKey({ version: 2, publicKey: staffPair.publicKey, signature: sig2, signerId: "super", signerPublicSignKey: await jwkString(newSign.publicKey) }))
            .rejects.toMatchObject({ reason: "signer-key-changed" });
    });
});

describe("clés de ticket", () => {

    test("copie créateur et copie équipe : même clé, enveloppe vérifiée des deux côtés", async () => {
        const client = await asUser("client");
        const ticketId = "11111111-1111-4111-8111-111111111111";
        const key = await generateTicketKey();
        const envelope = await signTicketKey(key, ticketId, "PUBLIC");
        expect(envelope).not.toBeNull();

        const forCreator = await sealTicketKey(key, client.publicKey);
        const forStaff = await sealTicketKey(key, staffPair.publicKey);
        const data = { creatorId: "client", ...envelope! };

        // Côté client (sa propre clé de signature, lue sur `user`).
        const k1 = await openTicketKey(forCreator, client.rsa.privateKey, ticketId, "PUBLIC", data, () => null);

        // Côté équipe : autre utilisateur local, signataire résolu par l'annuaire.
        (user as any).value = { id: "moderator" };
        const k2 = await openTicketKey(forStaff, staffPair.privateKey, ticketId, "PUBLIC", data, (id) => id === "client" ? client.publicSignKey : null);

        const raw = async (k: CryptoKey) => Array.from(new Uint8Array(await crypto.subtle.exportKey("raw", k)));
        expect(await raw(k1)).toEqual(await raw(k2));
    });

    test("enveloppe falsifiée (autre clé, autre canal) : refusée", async () => {
        const client = await asUser("client");
        const ticketId = "22222222-2222-4222-8222-222222222222";
        const key = await generateTicketKey();
        const envelope = (await signTicketKey(key, ticketId, "PUBLIC"))!;

        // Le serveur substitue une autre clé en gardant l'enveloppe d'origine.
        const forged = await generateTicketKey();
        const sealedForged = await sealTicketKey(forged, client.publicKey);
        await expect(openTicketKey(sealedForged, client.rsa.privateKey, ticketId, "PUBLIC", { creatorId: "client", ...envelope }, () => null))
            .rejects.toBeInstanceOf(KeyEnvelopeError);

        // Rejeu de l'enveloppe PUBLIC sur le canal INTERNAL.
        const sealed = await sealTicketKey(key, client.publicKey);
        await expect(openTicketKey(sealed, client.rsa.privateKey, ticketId, "INTERNAL", { creatorId: "client", ...envelope }, () => null))
            .rejects.toBeInstanceOf(KeyEnvelopeError);
    });

    test("clé remplacée après épinglage (sans enveloppe) : KeyChangedError", async () => {
        const client = await asUser("client");
        const ticketId = "33333333-3333-4333-8333-333333333333";
        await openTicketKey(await sealTicketKey(await generateTicketKey(), client.publicKey), client.rsa.privateKey, ticketId, "PUBLIC", {}, () => null);
        await expect(openTicketKey(await sealTicketKey(await generateTicketKey(), client.publicKey), client.rsa.privateKey, ticketId, "PUBLIC", {}, () => null))
            .rejects.toBeInstanceOf(KeyChangedError);
    });

    test("contexte FC4 conforme à la spec §2.2", () => {
        expect(supportKeyContext("abc", "PUBLIC")).toBe("support:abc:public");
        expect(supportKeyContext("abc", "INTERNAL")).toBe("support:abc:internal");
    });
});
