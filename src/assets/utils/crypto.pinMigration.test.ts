import { describe, expect, test } from "bun:test";

// generateSalt() lit window.crypto.
(globalThis as any).window ??= globalThis;
import { deriveMasterKey, rewrapLegacyPrivateKeyV3, unlockSecurityV3, privateKey, SALT_V3_PREFIX } from "./crypto";

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));

/** Compte legacy tel qu'il existe en base : sel sans préfixe, clé privée emballée par PBKDF2(PIN). */
async function legacyAccount(pin: string) {
    const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const pinSalt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const master = await deriveMasterKey(pin, pinSalt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, master, await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    return { pinSalt, iv: b64(iv), encryptedPrivateKey: b64(enc), publicKey: JSON.stringify(await crypto.subtle.exportKey("jwk", pair.publicKey)) };
}

describe("migration PIN legacy → v3 (audit FC2)", () => {
    test("la clé privée ré-emballée se déverrouille en v3 avec le même PIN", async () => {
        const legacy = await legacyAccount("1234");
        expect(legacy.pinSalt.startsWith(SALT_V3_PREFIX)).toBe(false);

        const migrated = await rewrapLegacyPrivateKeyV3("1234", legacy.pinSalt, legacy.encryptedPrivateKey, legacy.iv);
        expect(migrated.pinSalt.startsWith(SALT_V3_PREFIX)).toBe(true);

        privateKey.value = null;
        await unlockSecurityV3("1234", migrated.pinSalt, migrated.encryptedPrivateKey, migrated.iv, async (verifier) => {
            expect(verifier).toBe(migrated.verifier);
            return { wrapSecret: migrated.wrapSecret };
        });
        expect(privateKey.value).not.toBeNull();

        // Même paire de clés : la clé publique legacy chiffre pour la clé privée migrée.
        const pub = await crypto.subtle.importKey("jwk", JSON.parse(legacy.publicKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
        const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, new Uint8Array([1, 2, 3]));
        const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey.value!, ct));
        expect(Array.from(pt)).toEqual([1, 2, 3]);
    }, 60_000);
});
