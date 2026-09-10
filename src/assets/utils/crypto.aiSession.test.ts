import { describe, expect, test } from "bun:test";
import { decryptAiField, encryptAiField } from "./crypto";

/**
 * Vecteur de test partagé avec `Synco_AI_Gateway`/E2EE_PLAN.md et `synco_api`/E2EE_PLAN.md §2 —
 * vérifie l'interopérabilité du wire format sans faire tourner les 2 autres implémentations.
 *
 * NB: la ligne `key (hex, 32 octets)` du document E2EE_PLAN.md est tronquée d'un nibble
 * ("...4081d791" au lieu de "...4081d7911", 63 caractères hex au lieu de 64) — on part donc de la
 * valeur `key (base64)` du même document, qui elle décode bien en 32 octets et produit le
 * `wire_value` attendu.
 */
const KEY_BASE64 = "2C8mRtERMnD1j6Pa9k3n6fZCUxI6Dsf9uqJONAgdeRE=";
const NONCE_HEX = "1024c8c26840d416f50b5072";
const SESSION_ID = "sess_test0000000000000000000001";
const MESSAGE_ID = "msg_test00000000000000000000001";
const FIELD_NAME = "content";
const PLAINTEXT = "Bonjour, ceci est un message de test pour Synco AI.";
const EXPECTED_WIRE = "gcm1:ECTIwmhA1Bb1C1ByL8IECZj8SkBl2TYmk9665e/jnrCQNjYdR+CMirRU75qIq5pxnrallgkaWQtrQreT8eCSCf6JAzUrY5mTb/Ez42WxSw==";

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return bytes;
}

async function importTestKey(): Promise<CryptoKey> {
    const rawKey = Uint8Array.from(atob(KEY_BASE64), c => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

describe("AI session field wire format (gcm1)", () => {

    test("decrypts the fixed wire_value from the plan into the expected plaintext", async () => {
        const key = await importTestKey();
        const decrypted = await decryptAiField(key, SESSION_ID, MESSAGE_ID, FIELD_NAME, EXPECTED_WIRE);
        expect(decrypted).toBe(PLAINTEXT);
    });

    test("encrypting with the vector's nonce reproduces the exact fixed wire_value", async () => {
        const key = await importTestKey();

        // encryptAiField génère son propre nonce aléatoire ; on reproduit ici le format à la main
        // avec le nonce fixe du vecteur pour vérifier l'égalité byte-à-byte avec `wire_value`.
        const iv = hexToBytes(NONCE_HEX);
        const aad = new TextEncoder().encode(`${SESSION_ID}:${MESSAGE_ID}:${FIELD_NAME}`);
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
            key,
            new TextEncoder().encode(PLAINTEXT)
        );
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);
        const wire = "gcm1:" + btoa(String.fromCharCode(...combined));

        expect(wire).toBe(EXPECTED_WIRE);
    });

    test("round-trips arbitrary plaintext through encryptAiField/decryptAiField", async () => {
        const key = await importTestKey();
        const text = "Un message plus long, avec des caractères accentués éàç et un peu de JSON: {\"a\":1}";
        const wire = await encryptAiField(key, SESSION_ID, MESSAGE_ID, "tool_result", text);

        expect(wire.startsWith("gcm1:")).toBe(true);

        const decrypted = await decryptAiField(key, SESSION_ID, MESSAGE_ID, "tool_result", wire);
        expect(decrypted).toBe(text);
    });

    test("fails to decrypt when the AAD (field_name) doesn't match — binds ciphertext to its field", async () => {
        const key = await importTestKey();
        const wire = await encryptAiField(key, SESSION_ID, MESSAGE_ID, "content", "secret");

        await expect(
            decryptAiField(key, SESSION_ID, MESSAGE_ID, "title", wire)
        ).rejects.toThrow();
    });

});
