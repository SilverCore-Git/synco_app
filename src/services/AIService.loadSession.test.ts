import { describe, expect, mock, test } from "bun:test";

// Même stratégie que AiSessionKeyService.test.ts : mock `sfetch` avant tout import, pour éviter
// d'importer keycloak.ts (side effects navigateur) et pour contrôler les réponses HTTP des deux
// endpoints traversés par loadSession() dans ce module : /ai/sessions/:id et /ai/key (via
// ensureAiSessionKey, appelé en interne pour le cas 'gateway-aes-gcm-v1').
let sfetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response(null, { status: 500 });

mock.module("@/assets/utils/sfetch", () => ({
    default: (url: string, init?: any) => sfetchImpl(url, init),
}));

const { loadSession, aiSessionMessages } = await import("./AIService");
const { openedOrg, user } = await import("@/assets/var");
const { privateKey, wrapAiSessionKeyForMember, encryptAiField, encryptForPeer } = await import("@/assets/utils/crypto");

async function generateTestIdentity() {
    const keyPair = await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["encrypt", "decrypt"]
    );
    const publicKeyJWK = JSON.stringify(await crypto.subtle.exportKey("jwk", keyPair.publicKey));
    return { publicKeyJWK, privateKey: keyPair.privateKey };
}

function routeByUrl(routes: Record<string, () => Promise<Response> | Response>) {
    return async (url: string, init?: any) => {
        for (const [suffix, handler] of Object.entries(routes)) {
            if (url.endsWith(suffix) && (!init?.method || init.method === 'GET')) {
                return handler();
            }
        }
        throw new Error(`unexpected sfetch call: ${init?.method || 'GET'} ${url}`);
    };
}

describe("loadSession — the 3 message formats it must distinguish", () => {

    test("case 1 — legacy plain: messages already in clear, passed through untouched", async () => {
        openedOrg.value = { id: "org-plain" } as any;

        const fixture = [{ role: "user", content: "Bonjour" }, { role: "assistant", content: "Salut !" }];
        sfetchImpl = routeByUrl({
            "/ai/sessions/sess-plain": () => new Response(JSON.stringify({ id: "sess-plain", messages: fixture }), { status: 200 }),
        });

        await loadSession("sess-plain");

        expect(aiSessionMessages.value).toEqual(fixture);
    });

    test("case 2 — legacy E2EE envelope (local/custom): self-encrypted via encryptForPeer, decrypted with the private key", async () => {
        const identity = await generateTestIdentity();
        openedOrg.value = { id: "org-legacy-e2ee" } as any;
        user.value = { id: "u1", publicKey: identity.publicKeyJWK } as any;
        privateKey.value = identity.privateKey;

        const original = [{ role: "user", content: "Message confidentiel" }];
        const encrypted = await encryptForPeer(JSON.stringify(original), identity.publicKeyJWK, identity.publicKeyJWK);

        sfetchImpl = routeByUrl({
            "/ai/sessions/sess-legacy": () => new Response(JSON.stringify({
                id: "sess-legacy",
                messages: {
                    isE2EE: true,
                    ciphertext: encrypted.ciphertext,
                    encryptedAesKey: encrypted.selfEncryptedAesKey,
                    iv: encrypted.iv,
                },
            }), { status: 200 }),
        });

        await loadSession("sess-legacy");

        expect(aiSessionMessages.value).toEqual(original);
    });

    test("case 2 fallback — legacy E2EE envelope but private key locked: shows the placeholder instead of crashing", async () => {
        openedOrg.value = { id: "org-legacy-locked" } as any;
        privateKey.value = null;

        sfetchImpl = routeByUrl({
            "/ai/sessions/sess-legacy-locked": () => new Response(JSON.stringify({
                id: "sess-legacy-locked",
                messages: { isE2EE: true, ciphertext: "x", encryptedAesKey: "y", iv: "z" },
            }), { status: 200 }),
        });

        await loadSession("sess-legacy-locked");

        expect(aiSessionMessages.value).toEqual([{ role: 'system', content: '[🔒 Conversation chiffrée. Clé privée manquante.]' }]);
    });

    test("case 3 — new gateway-aes-gcm-v1: opaque gcm1: fields decrypted with the org's AI session key", async () => {
        const identity = await generateTestIdentity();
        openedOrg.value = { id: "org-gateway" } as any;
        user.value = { id: "u2", publicKey: identity.publicKeyJWK } as any;
        privateKey.value = identity.privateKey;

        const sessionKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        const rawKeyBytes = await crypto.subtle.exportKey("raw", sessionKey);
        const encryptedKey = await wrapAiSessionKeyForMember(rawKeyBytes, identity.publicKeyJWK);

        const sessionId = "sess-gateway";
        const encryptedContent = await encryptAiField(sessionKey, sessionId, "m1", "content", "Quel temps fait-il ?");
        const encryptedArgs = await encryptAiField(sessionKey, sessionId, "m2", "tool_call_arguments:call1", JSON.stringify({ city: "Paris" }));
        const encryptedToolResult = await encryptAiField(sessionKey, sessionId, "m3", "tool_result", JSON.stringify({ ok: true, weather: "sunny" }));

        sfetchImpl = routeByUrl({
            "/ai/key": () => new Response(JSON.stringify({ encryptedKey }), { status: 200 }),
            "/ai/sessions/sess-gateway": () => new Response(JSON.stringify({
                id: sessionId,
                encryptionScheme: "gateway-aes-gcm-v1",
                // Ordre chronologique réel : user -> assistant (propose le tool call) -> tool (résultat).
                messages: [
                    { id: "m1", role: "user", content: encryptedContent },
                    { id: "m2", role: "assistant", content: null, toolCalls: [{ id: "call1", name: "get_weather", arguments: encryptedArgs, status: "pending" }] },
                    { id: "m3", role: "tool", toolCallId: "call1", toolResult: encryptedToolResult },
                ],
            }), { status: 200 }),
        });

        await loadSession("sess-gateway");

        // isStructuredAgentTranscript() détecte le rôle 'tool'/toolCalls et reconstruit des "turns" —
        // on vérifie donc le contenu déchiffré à travers la structure reconstruite par
        // convertStoredMessagesToChatMessages, pas les StoredMessage bruts.
        const messages = aiSessionMessages.value as any[];
        expect(messages[0]).toEqual({ role: "user", content: "Quel temps fait-il ?" });

        const assistantTurn = messages[1];
        expect(assistantTurn.role).toBe("assistant");
        const toolPart = assistantTurn.parts.find((p: any) => p.type === "tool");
        expect(toolPart.tool.args).toEqual({ city: "Paris" });
        expect(toolPart.tool.result).toEqual({ ok: true, weather: "sunny" });
    });

    test("case 3 fallback — gateway session but private key locked: shows the placeholder instead of crashing", async () => {
        openedOrg.value = { id: "org-gateway-locked" } as any;
        privateKey.value = null;

        sfetchImpl = routeByUrl({
            "/ai/sessions/sess-gateway-locked": () => new Response(JSON.stringify({
                id: "sess-gateway-locked",
                encryptionScheme: "gateway-aes-gcm-v1",
                messages: [{ id: "m1", role: "user", content: "gcm1:doesnotmatter" }],
            }), { status: 200 }),
        });

        await loadSession("sess-gateway-locked");

        expect(aiSessionMessages.value).toEqual([{ role: 'system', content: '[🔒 Conversation chiffrée. Clé privée manquante.]' }]);
    });

});
