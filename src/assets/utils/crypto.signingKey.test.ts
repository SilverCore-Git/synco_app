import { describe, expect, test } from "bun:test";

(globalThis as any).window ??= globalThis;
import {
    deriveMasterKey, generateSigningKeypair, unlockSigningKey, generateSigningKeypairForMigration,
    privateSignKey, SALT_V3_PREFIX,
} from "./crypto";

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));

describe("clé d'identité de signature (audit FC4 §2)", () => {
    test("génère, arme privateSignKey.value, et se redéchiffre avec le même master key", async () => {
        const masterKey = await deriveMasterKey("1234", b64(crypto.getRandomValues(new Uint8Array(16))));
        const envelope = await generateSigningKeypair(masterKey);

        expect(JSON.parse(envelope.publicSignKey).kty).toBe("EC");
        expect(JSON.parse(envelope.publicSignKey).crv).toBe("P-256");
        const firstKey = privateSignKey.value;
        expect(firstKey).not.toBeNull();

        // Signe quelque chose avec la clé juste générée, pour la comparer
        // plus bas à la clé redéchiffrée.
        const data = new TextEncoder().encode("probe");
        const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, firstKey!, data);

        privateSignKey.value = null;
        await unlockSigningKey(envelope.encryptedSignPrivateKey, envelope.signKeyIv, masterKey);
        expect(privateSignKey.value).not.toBeNull();

        const pub = await crypto.subtle.importKey(
            "jwk", JSON.parse(envelope.publicSignKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
        );
        const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, data);
        expect(ok).toBe(true);
    });

    test("deux comptes différents produisent des clés de signature différentes (pas de réutilisation)", async () => {
        const masterA = await deriveMasterKey("1111", b64(crypto.getRandomValues(new Uint8Array(16))));
        const masterB = await deriveMasterKey("2222", b64(crypto.getRandomValues(new Uint8Array(16))));
        const a = await generateSigningKeypair(masterA);
        const b = await generateSigningKeypair(masterB);
        expect(a.publicSignKey).not.toBe(b.publicSignKey);
    });

    test("migration v2/legacy : dérive directement, pas de round-trip wrapSecret", async () => {
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
        const envelope = await generateSigningKeypairForMigration("1234", salt);
        expect(JSON.parse(envelope.publicSignKey).kty).toBe("EC");
    });

    test("migration v3 : exige doFetchWrapSecret, l'appelle avec le bon verifier", async () => {
        const salt = SALT_V3_PREFIX + b64(crypto.getRandomValues(new Uint8Array(16)));
        await expect(generateSigningKeypairForMigration("1234", salt)).rejects.toThrow();

        let calledWithVerifier: string | null = null;
        const envelope = await generateSigningKeypairForMigration("1234", salt, async (verifier) => {
            calledWithVerifier = verifier;
            return { wrapSecret: b64(crypto.getRandomValues(new Uint8Array(32))) };
        });
        expect(calledWithVerifier).not.toBeNull();
        expect(JSON.parse(envelope.publicSignKey).kty).toBe("EC");
    });
});
