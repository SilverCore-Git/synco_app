import { describe, expect, test } from "bun:test";
import { generateAccountKeyBytes } from "../utils/e2eeV4";
import { enrollThisDevice } from "./localDevice";
import { PinVault } from "./pinVault";
import { PrfVault, passkeySupport, type PasskeySupport } from "./prfVault";
import { switchTargets, webVaultsInOrder } from "./selection";
import { VaultError, type DeviceVault, type KeyValueStore } from "./types";

const memory = (): KeyValueStore => {
    const m = new Map<string, unknown>();
    return { get: async <T>(k: string) => m.get(k) as T | undefined, set: async (k, v) => { m.set(k, structuredClone(v)); }, del: async (k) => { m.delete(k); } };
};
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return (e as VaultError).code ?? (e as Error).name; } };

/** Passkey PRF réelle (PrfVault) sur un authentificateur simulé ; `prompts` compte les invites WebAuthn. */
function prf(opts: { platform: boolean; prfSupported?: boolean }) {
    const prompts = { n: 0 };
    const out = () => crypto.getRandomValues(new Uint8Array(32)).buffer;
    const credentials = {
        async create() {
            prompts.n++;
            return { rawId: crypto.getRandomValues(new Uint8Array(16)).buffer, getClientExtensionResults: () => opts.prfSupported === false ? {} : { prf: { enabled: true, results: { first: out() } } } };
        },
        async get() {
            prompts.n++;
            return { getClientExtensionResults: () => opts.prfSupported === false ? {} : { prf: { results: { first: out() } } } };
        },
    } as never;
    const vault = new PrfVault({ credentials, store: memory(), platformAuthenticatorAvailable: async () => opts.platform });
    return { vault, prompts };
}

/** Coffre d'extension simulé : seul `detect` et `create` comptent ici. */
function extension(detected: boolean | "error") {
    const calls = { detect: 0, create: 0 };
    const vault = {
        capabilities: { kind: "extension", hardwareBacked: false, biometric: false, needsPin: false, rateLimit: "software" } as const,
        detect: async () => { calls.detect++; if (detected === "error") throw new Error("x"); return detected; },
        create: async () => { calls.create++; return crypto.getRandomValues(new Uint8Array(32)); },
        load: async () => new Uint8Array(32), remove: async () => {}, has: async () => true,
    };
    return { vault, calls };
}

async function enroll(vaults: DeviceVault[], pin?: string) {
    const sign = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const store = memory();
    return enrollThisDevice({ userId: "u", name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: sign.privateKey, vaults, store, ...(pin ? { ctx: { pin } } : {}) });
}

describe("webVaultsInOrder : ordre des coffres sur le web", () => {
    test("ordre : passkey, extension détectée, PIN local", async () => {
        const list = await webVaultsInOrder({ prf: () => prf({ platform: true }).vault, prfSupport: async () => "yes", extension: () => extension(true).vault, pin: () => new PinVault(memory(), 1000) });
        expect(list.map(v => v.capabilities.kind)).toEqual(["webauthn-prf", "extension", "web-pin"]);
    });

    test.each([
        ["absente", false],
        ["détection en erreur", "error"],
    ] as const)("extension %s : non proposée", async (_label, detected) => {
        const list = await webVaultsInOrder({ prf: () => prf({ platform: true }).vault, extension: () => extension(detected).vault, pin: () => new PinVault(memory(), 1000) });
        expect(list.map(v => v.capabilities.kind)).toEqual(["webauthn-prf", "web-pin"]);
    });

    test("sans WebAuthn ni fenêtre : PIN local seul", async () => {
        const list = await webVaultsInOrder({ prf: () => undefined, extension: () => undefined, pin: () => new PinVault(memory(), 1000) });
        expect(list.map(v => v.capabilities.kind)).toEqual(["web-pin"]);
    });
});

describe("coffre retenu à l'inscription", () => {
    const pin = () => new PinVault(memory(), 1000);

    test("passkey annoncée comme prise en charge + extension : la passkey l'emporte, l'extension n'est pas sollicitée", async () => {
        const p = prf({ platform: true }), e = extension(true);
        const { record } = await enroll(await webVaultsInOrder({ prf: () => p.vault, prfSupport: async () => "yes", extension: () => e.vault, pin }));
        expect(record.vaultKind).toBe("webauthn-prf");
        expect(e.calls.create).toBe(0);
    });

    test("sans authentificateur + extension : l'extension, sans aucune invite WebAuthn", async () => {
        const p = prf({ platform: false }), e = extension(true);
        const { record } = await enroll(await webVaultsInOrder({ prf: () => p.vault, extension: () => e.vault, pin }));
        expect(record.vaultKind).toBe("extension");
        expect(p.prompts.n).toBe(0);
        expect(e.calls.create).toBe(1);
    });

    test("authentificateur sans PRF (gestionnaire incompatible) + extension : l'extension", async () => {
        const p = prf({ platform: true, prfSupported: false }), e = extension(true);
        const { record } = await enroll(await webVaultsInOrder({ prf: () => p.vault, extension: () => e.vault, pin }));
        expect(record.vaultKind).toBe("extension");
    });

    test("sans authentificateur ni extension : PIN local demandé, puis retenu", async () => {
        const p = prf({ platform: false }), e = extension(false);
        const vaults = await webVaultsInOrder({ prf: () => p.vault, extension: () => e.vault, pin });
        expect(await code(enroll(vaults))).toBe("pin-required");
        expect(e.calls.create).toBe(0);
        const { record } = await enroll(vaults, "4821");
        expect(record.vaultKind).toBe("web-pin");
    });

    test("authentificateur, sans extension : la passkey", async () => {
        const p = prf({ platform: true }), e = extension(false);
        const { record } = await enroll(await webVaultsInOrder({ prf: () => p.vault, extension: () => e.vault, pin }));
        expect(record.vaultKind).toBe("webauthn-prf");
    });
});

describe("passkey et extension : aucune invite du navigateur inutile", () => {
    const pin = () => new PinVault(memory(), 1000);
    const kinds = async (support: PasskeySupport | "absent" | "error", detected: boolean) => (await webVaultsInOrder({
        prf: () => prf({ platform: true }).vault,
        ...(support === "absent" ? {} : { prfSupport: async () => { if (support === "error") throw new Error("x"); return support; } }),
        extension: () => extension(detected).vault,
        pin,
    })).map(v => v.capabilities.kind);

    test.each([
        ["yes", true, ["webauthn-prf", "extension", "web-pin"]],
        ["yes", false, ["webauthn-prf", "web-pin"]],
        ["no", true, ["extension", "web-pin"]],
        ["no", false, ["web-pin"]],
        ["unknown", true, ["extension", "web-pin"]],   // pas de pari quand le bon verrou existe
        ["unknown", false, ["webauthn-prf", "web-pin"]], // comme avant : sans extension, PrfVault tranche
        ["absent", true, ["extension", "web-pin"]],
        ["error", true, ["extension", "web-pin"]],
    ] as const)("prise en charge %s, extension détectée : %s", async (support, detected, expected) => {
        expect(await kinds(support, detected)).toEqual([...expected]);
    });

    test("navigateur dont la passkey échoue sans le dire (authentificateur de plateforme, pas de PRF) : l'extension, zéro invite", async () => {
        // Le cas rapporté : Firefox + gestionnaire de mots de passe. Création puis lecture = deux invites à annuler.
        const p = prf({ platform: true, prfSupported: false }), e = extension(true);
        const vaults = await webVaultsInOrder({ prf: () => p.vault, prfSupport: async () => "unknown", extension: () => e.vault, pin });
        const { record } = await enroll(vaults);
        expect(record.vaultKind).toBe("extension");
        expect(p.prompts.n).toBe(0);
    });
});

describe("passkeySupport : détection sans invite", () => {
    const withNavigator = async <T>(credentials: unknown, run: () => Promise<T>): Promise<T> => {
        const had = Object.getOwnPropertyDescriptor(globalThis, "navigator");
        Object.defineProperty(globalThis, "navigator", { value: { credentials }, configurable: true });
        try { return await run(); } finally { if (had) Object.defineProperty(globalThis, "navigator", had); else delete (globalThis as { navigator?: unknown }).navigator; }
    };
    const pkc = (caps: unknown) => ({ getClientCapabilities: async () => caps });

    test("WebAuthn absent : non", async () => {
        expect(await withNavigator({}, () => passkeySupport(undefined))).toBe("no");
        expect(await withNavigator(undefined, () => passkeySupport(pkc({})))).toBe("no");
    });

    test("getClientCapabilities absente ou en échec : inconnu (jamais une invite pour le savoir)", async () => {
        expect(await withNavigator({}, () => passkeySupport({}))).toBe("unknown");
        expect(await withNavigator({}, () => passkeySupport({ getClientCapabilities: async () => { throw new Error("x"); } }))).toBe("unknown");
        expect(await withNavigator({}, () => passkeySupport(pkc(undefined)))).toBe("unknown");
    });

    test.each([
        [{ userVerifyingPlatformAuthenticator: true, "extension:prf": true }, "yes"],
        [{ userVerifyingPlatformAuthenticator: false, "extension:prf": true }, "no"],
        [{ userVerifyingPlatformAuthenticator: true, "extension:prf": false }, "no"],
        [{ userVerifyingPlatformAuthenticator: true }, "unknown"],
        [{ "extension:prf": true }, "unknown"],
        [{}, "unknown"],
    ] as const)("capacités %j : %s", async (caps, expected) => {
        expect(await withNavigator({}, () => passkeySupport(pkc(caps)))).toBe(expected);
    });
});

describe("switchTargets : verrous proposés au changement", () => {
    const all = { prf: true, extension: true };

    test("depuis chaque verrou web : les deux autres, dans l'ordre de préférence", () => {
        expect(switchTargets("web-pin", all)).toEqual(["webauthn-prf", "extension"]);
        expect(switchTargets("extension", all)).toEqual(["webauthn-prf", "web-pin"]);
        expect(switchTargets("webauthn-prf", all)).toEqual(["extension", "web-pin"]);
    });

    test("extension non détectée : jamais proposée ; sans WebAuthn : pas de passkey ; le PIN local toujours", () => {
        expect(switchTargets("web-pin", { prf: true, extension: false })).toEqual(["webauthn-prf"]);
        expect(switchTargets("webauthn-prf", { prf: true, extension: false })).toEqual(["web-pin"]);
        expect(switchTargets("extension", { prf: false, extension: false })).toEqual(["web-pin"]);
        expect(switchTargets("web-pin", { prf: false, extension: false })).toEqual([]);
    });

    test("desktop, mobile, appareil inconnu : aucun changement proposé", () => {
        expect(switchTargets("os-keyring", all)).toEqual([]);
        expect(switchTargets("native-biometric", all)).toEqual([]);
        expect(switchTargets(null, all)).toEqual([]);
    });
});
