import { describe, expect, test } from "bun:test";
import {
    clearInstallPending, extensionBrowser, extensionStoreUrl, isInstallPending, isSuggestionSnoozed,
    markInstallPending, PENDING_TTL_MS, SNOOZE_MS, snoozeSuggestion, type SimpleStorage,
} from "./extensionInstall";

const UA = {
    chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
    firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
    safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0",
    chromeAndroid: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

const memory = (): SimpleStorage & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
};

describe("navigateur et boutique", () => {
    test("bureau : Chrome, Edge, Firefox reconnus", () => {
        expect(extensionBrowser(UA.chrome)).toBe("chrome");
        expect(extensionBrowser(UA.edge)).toBe("edge");
        expect(extensionBrowser(UA.firefox)).toBe("firefox");
    });

    test("Safari et mobiles : aucune extension proposée", () => {
        for (const ua of [UA.safari, UA.firefoxAndroid, UA.chromeAndroid, UA.iphone]) expect(extensionBrowser(ua)).toBeUndefined();
    });

    test("lien de la boutique du navigateur, seulement s'il est publié et en https", () => {
        const urls = { chrome: "https://chromewebstore.google.com/detail/x", firefox: "https://addons.mozilla.org/x", edge: "" };
        expect(extensionStoreUrl(UA.chrome, urls)).toBe(urls.chrome);
        expect(extensionStoreUrl(UA.firefox, urls)).toBe(urls.firefox);
        expect(extensionStoreUrl(UA.edge, urls)).toBeUndefined();
        expect(extensionStoreUrl(UA.safari, urls)).toBeUndefined();
        expect(extensionStoreUrl(UA.chrome, { chrome: "javascript:alert(1)" })).toBeUndefined();
        expect(extensionStoreUrl(UA.chrome, {})).toBeUndefined();
    });
});

describe("marqueur d'installation en cours", () => {
    test("posé pour un utilisateur, valable un temps limité, effaçable", () => {
        const s = memory();
        markInstallPending(s, "u1", 1000);
        expect(isInstallPending(s, "u1", 1000 + 60_000)).toBe(true);
        expect(isInstallPending(s, "u2", 1000 + 60_000)).toBe(false);
        expect(isInstallPending(s, "u1", 1000 + PENDING_TTL_MS)).toBe(false);
        clearInstallPending(s);
        expect(isInstallPending(s, "u1", 1000)).toBe(false);
    });

    test("valeur corrompue ou stockage indisponible : jamais d'erreur", () => {
        const s = memory();
        s.m.set("synco:ext-install-pending", "{pas du json");
        expect(isInstallPending(s, "u1")).toBe(false);
        const broken: SimpleStorage = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
        expect(() => markInstallPending(broken, "u1")).not.toThrow();
        expect(isInstallPending(broken, "u1")).toBe(false);
        expect(() => clearInstallPending(broken)).not.toThrow();
    });
});

describe("« Plus tard »", () => {
    test("masque la suggestion pendant SNOOZE_MS", () => {
        const s = memory();
        expect(isSuggestionSnoozed(s, 0)).toBe(false);
        snoozeSuggestion(s, 1000);
        expect(isSuggestionSnoozed(s, 1000 + SNOOZE_MS - 1)).toBe(true);
        expect(isSuggestionSnoozed(s, 1000 + SNOOZE_MS)).toBe(false);
    });
});
