import { describe, expect, mock, test } from "bun:test";

// `@/assets/utils/sfetch` transitively imports keycloak.ts (Keycloak client, Capacitor/Tauri
// plugins) which has browser-only import-time side effects — mock it out before anything else
// imports it, and dynamically import the modules under test afterwards so they pick up the mock.
let sfetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response(null, { status: 500 });

mock.module("@/assets/utils/sfetch", () => ({
    default: (url: string, init?: any) => sfetchImpl(url, init),
}));

const { ensureAiSessionKey, getAiSessionKeyRawBase64, AiSessionKeyUnavailableError } = await import("./AiSessionKeyService");
const { user } = await import("@/assets/var");
const { privateKey, wrapAiSessionKeyForMember } = await import("@/assets/utils/crypto");

async function generateTestIdentity() {
    const keyPair = await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["encrypt", "decrypt"]
    );
    const publicKeyJWK = JSON.stringify(await crypto.subtle.exportKey("jwk", keyPair.publicKey));
    return { publicKeyJWK, privateKey: keyPair.privateKey };
}

describe("ensureAiSessionKey", () => {

    test("bootstrap (404): generates a new key, wraps it for self, and POSTs it", async () => {
        const identity = await generateTestIdentity();
        user.value = { id: "u1", publicKey: identity.publicKeyJWK } as any;
        privateKey.value = identity.privateKey;

        let getCalls = 0;
        let postBody: any = null;
        sfetchImpl = async (_url, init) => {
            if (!init?.method) {
                getCalls++;
                return new Response(null, { status: 404 });
            }
            if (init.method === "POST") {
                postBody = JSON.parse(init.body);
                return new Response(JSON.stringify({ ok: true }), { status: 200 });
            }
            throw new Error(`unexpected method: ${init.method}`);
        };

        const orgId = "org-bootstrap";
        const key = await ensureAiSessionKey(orgId);

        expect(key).toBeDefined();
        expect(typeof postBody.encryptedKey).toBe("string");
        expect(postBody.encryptedKey.length).toBeGreaterThan(0);

        // Cache hit: a second call must not re-fetch.
        getCalls = 0;
        await ensureAiSessionKey(orgId);
        expect(getCalls).toBe(0);
    });

    test("normal path (found): fetches, unwraps with the private key, and caches the raw key", async () => {
        const identity = await generateTestIdentity();
        user.value = { id: "u2", publicKey: identity.publicKeyJWK } as any;
        privateKey.value = identity.privateKey;

        const rawKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        const rawBytes = await crypto.subtle.exportKey("raw", rawKey);
        const encryptedKey = await wrapAiSessionKeyForMember(rawBytes, identity.publicKeyJWK);
        const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(rawBytes)));

        sfetchImpl = async (_url, init) => {
            if (!init?.method) {
                return new Response(JSON.stringify({ encryptedKey }), { status: 200 });
            }
            throw new Error(`unexpected method: ${init.method}`);
        };

        const orgId = "org-normal";
        await ensureAiSessionKey(orgId);
        const rawB64 = await getAiSessionKeyRawBase64(orgId);

        expect(rawB64).toBe(expectedB64);
    });

    test("throws AiSessionKeyUnavailableError when the private key is locked (PIN not entered)", async () => {
        privateKey.value = null;
        sfetchImpl = async () => new Response(null, { status: 404 });

        let caught: unknown = null;
        try {
            await ensureAiSessionKey("org-locked");
        } catch (e) {
            caught = e;
        }

        expect(caught).toBeInstanceOf(AiSessionKeyUnavailableError);
    });

    test("concurrent calls for the same org only trigger a single GET", async () => {
        const identity = await generateTestIdentity();
        user.value = { id: "u3", publicKey: identity.publicKeyJWK } as any;
        privateKey.value = identity.privateKey;

        let getCalls = 0;
        sfetchImpl = async (_url, init) => {
            if (!init?.method) {
                getCalls++;
                await new Promise((r) => setTimeout(r, 10));
                return new Response(null, { status: 404 });
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        };

        const orgId = "org-concurrent";
        await Promise.all([ensureAiSessionKey(orgId), ensureAiSessionKey(orgId), ensureAiSessionKey(orgId)]);

        expect(getCalls).toBe(1);
    });

});
