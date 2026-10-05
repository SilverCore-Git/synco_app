import { describe, expect, mock, test } from "bun:test";

// IndexedDB n'existe pas sous bun : magasin idb-keyval en mémoire.
const store = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
}));

const { user, openedOrg } = await import("@/assets/var");
const {
    canonicalRsaJwk, computeKeyFingerprint, requireTrustedKey, checkKeyTrust, keyTrustAlerts, UntrustedKeyError,
    canonicalEcJwk, requireTrustedSignKey, lookupCreatorSignKey,
} = await import("./keyTrust");

const keyA = JSON.stringify({ kty: "RSA", n: "aaaa", e: "AQAB", alg: "RSA-OAEP-256", ext: true });
const keyAReordered = JSON.stringify({ e: "AQAB", n: "aaaa", kty: "RSA", key_ops: ["encrypt"] });
const keyB = JSON.stringify({ kty: "RSA", n: "bbbb", e: "AQAB" });

describe("keyTrust (audit FC1)", () => {
    test("JWK canonique : une resérialisation n'est pas un changement", () => {
        expect(canonicalRsaJwk(keyA)).toBe(canonicalRsaJwk(keyAReordered));
        expect(() => canonicalRsaJwk('{"kty":"EC"}')).toThrow();
    });

    test("empreinte complète (256 bits)", async () => {
        const fp = await computeKeyFingerprint(keyA);
        expect(fp.replace(/ /g, "")).toHaveLength(64);
    });

    test("première rencontre épinglée, clé changée refusée et signalée", async () => {
        (user as any).value = { id: "me" };
        expect(await checkKeyTrust("bob", keyA)).toBe("new");
        expect(await checkKeyTrust("bob", keyA)).toBe("new"); // check ne mémorise rien
        await requireTrustedKey("bob", keyA);
        expect(await requireTrustedKey("bob", keyAReordered)).toBe(keyAReordered);
        await expect(requireTrustedKey("bob", keyB)).rejects.toBeInstanceOf(UntrustedKeyError);
        expect(keyTrustAlerts.value.map(a => a.userId)).toContain("bob");
    });

    test("magasin cloisonné par compte local", async () => {
        (user as any).value = { id: "other-account" };
        expect(await checkKeyTrust("bob", keyB)).toBe("new");
    });
});

describe("clé de signature d'identité — TOFU séparé (audit FC4 §2)", () => {
    const ecA = JSON.stringify({ kty: "EC", crv: "P-256", x: "aaaa", y: "bbbb" });
    const ecAReordered = JSON.stringify({ y: "bbbb", crv: "P-256", x: "aaaa", kty: "EC" });
    const ecB = JSON.stringify({ kty: "EC", crv: "P-256", x: "cccc", y: "dddd" });

    test("JWK EC canonique : réordonnée n'est pas un changement, RSA refusée", () => {
        expect(canonicalEcJwk(ecA)).toBe(canonicalEcJwk(ecAReordered));
        expect(() => canonicalEcJwk(keyA)).toThrow();
    });

    test("première rencontre épinglée, clé de signature changée refusée — namespace distinct de la clé de chiffrement", async () => {
        (user as any).value = { id: "sign-test-account" };
        expect(await requireTrustedSignKey("carol", ecA)).toBe(canonicalEcJwk(ecA));
        expect(await requireTrustedSignKey("carol", ecAReordered)).toBe(canonicalEcJwk(ecA));
        await expect(requireTrustedSignKey("carol", ecB)).rejects.toBeInstanceOf(UntrustedKeyError);

        // La clé de CHIFFREMENT de carol reste indépendante : aucune
        // interférence entre les deux magasins.
        expect(await checkKeyTrust("carol", keyA)).toBe("new");
    });

    test("lookupCreatorSignKey : soi-même, un membre de l'org ouverte, ou rien", () => {
        (user as any).value = { id: "me", publicSignKey: ecA };
        expect(lookupCreatorSignKey("me")).toBe(ecA);

        (openedOrg as any).value = { members: [{ userId: "dave", user: { publicSignKey: ecB } }] };
        expect(lookupCreatorSignKey("dave")).toBe(ecB);
        expect(lookupCreatorSignKey("ghost")).toBeNull();
    });
});
