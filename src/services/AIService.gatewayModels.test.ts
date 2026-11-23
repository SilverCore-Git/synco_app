import { afterEach, describe, expect, mock, test } from "bun:test";

// Liste des modèles de la passerelle : ticket `sgt1` de l'API, jamais le jeton Keycloak (revue L11, point 1).
let sfetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response(null, { status: 500 });
mock.module("idb-keyval", () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }));
mock.module("@/assets/utils/sfetch", () => ({ default: (url: string, init?: any) => sfetchImpl(url, init) }));

const { listGatewayModels } = await import("./AIService");
const { user } = await import("@/assets/var");
const { keycloak } = await import("@/assets/keycloak");

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const store = new Map<string, string>([["ai-gateway-consent:u1:org1", "https://gw.example"]]);
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };

describe("listGatewayModels", () => {
    test("présente le ticket sgt1 à la passerelle, jamais le jeton Keycloak", async () => {
        user.value = { id: "u1" } as any;
        (keycloak as any).token = "KEYCLOAK-SECRET";
        const seen: Array<{ url: string; auth: string | undefined }> = [];
        sfetchImpl = async () => new Response(JSON.stringify({ ticket: "sgt1.abc", url: "https://gw.example" }), { status: 200 });
        globalThis.fetch = (async (url: string, init?: any) => {
            seen.push({ url, auth: init?.headers?.Authorization });
            return new Response(JSON.stringify({ models: ["m1"] }), { status: 200 });
        }) as typeof fetch;
        expect(await listGatewayModels("https://gw.example", "org1")).toEqual(["m1"]);
        expect(seen).toEqual([{ url: "https://gw.example/models", auth: "Bearer sgt1.abc" }]);
        expect(JSON.stringify(seen)).not.toContain("KEYCLOAK-SECRET");
    });

    test("URL en cours de saisie différente de celle enregistrée : le ticket n'est pas envoyé", async () => {
        user.value = { id: "u1" } as any;
        store.set("ai-gateway-consent:u1:org1", "https://autre.example");
        sfetchImpl = async () => new Response(JSON.stringify({ ticket: "sgt1.abc", url: "https://gw.example" }), { status: 200 });
        let called = false;
        globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
        await expect(listGatewayModels("https://autre.example", "org1")).rejects.toThrow();
        expect(called).toBe(false);
    });
});
