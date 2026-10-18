import { describe, expect, test } from "bun:test";
import { KeyringVault } from "./keyringVault";
import { NativeVault, type BiometricPlugin, type SecureStoragePlugin } from "./nativeVault";
import { PrfVault } from "./prfVault";
import { VaultError, type KeyValueStore } from "./types";

const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return (e as VaultError).code; } };
const memory = (): KeyValueStore => {
    const m = new Map<string, unknown>();
    return { get: async <T>(k: string) => m.get(k) as T | undefined, set: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); } };
};

describe("KeyringVault (Tauri)", () => {
    const fake = () => {
        const m = new Map<string, string>();
        const calls: Array<[string, any]> = [];
        const invoke = async (cmd: string, args: any) => {
            calls.push([cmd, args]);
            if (cmd === "secure_store_set") { m.set(args.key, args.value); return undefined; }
            if (cmd === "secure_store_get") return m.get(args.key) ?? null;
            if (cmd === "secure_store_delete") { m.delete(args.key); return undefined; }
            throw new Error("unknown");
        };
        return { m, calls, invoke: invoke as any };
    };

    test("aller-retour, clé préfixée, suppression", async () => {
        const f = fake();
        const vault = new KeyringVault(f.invoke);
        const dk = await vault.create("dev1");
        expect([...f.m.keys()]).toEqual(["e2ee-dk:dev1"]);
        expect(await vault.load("dev1")).toEqual(dk);
        expect(await vault.has("dev1")).toBe(true);
        await vault.remove("dev1");
        expect(await code(vault.load("dev1"))).toBe("missing");
    });

    test("trousseau indisponible → unavailable", async () => {
        const vault = new KeyringVault((async () => { throw new Error("no secret service"); }) as any);
        expect(await code(vault.create("d"))).toBe("unavailable");
        expect(await code(vault.load("d"))).toBe("unavailable");
    });
});

describe("NativeVault (Capacitor)", () => {
    const fake = (opts: { secure?: boolean; available?: boolean; authError?: any } = {}) => {
        const m = new Map<string, string>();
        let authCalls = 0;
        const secureStorage: SecureStoragePlugin = {
            set: async (k, v) => { m.set(k, v); },
            get: async (k) => m.get(k) ?? null,
            remove: async (k) => { m.delete(k); },
            setDefaultKeychainAccess: async () => {},
        };
        const biometric: BiometricPlugin = {
            checkBiometry: async () => ({ isAvailable: opts.available ?? true, deviceIsSecure: opts.secure ?? true }),
            authenticate: async () => { authCalls++; if (opts.authError) throw opts.authError; },
        };
        return { m, secureStorage, biometric, authCalls: () => authCalls };
    };

    test("chaque lecture exige une vérification de l'utilisateur", async () => {
        const f = fake();
        const vault = new NativeVault({ secureStorage: f.secureStorage, biometric: f.biometric });
        const dk = await vault.create("d1");
        expect(await vault.load("d1")).toEqual(dk);
        expect(f.authCalls()).toBe(2);
    });

    test("annulation de l'invite → cancelled, la clé n'est pas lue", async () => {
        const f = fake({ authError: { code: "userCancel" } });
        const vault = new NativeVault({ secureStorage: f.secureStorage, biometric: f.biometric });
        expect(await code(vault.create("d1"))).toBe("cancelled");
        expect(f.m.size).toBe(0);
    });

    test("verrouillage biométrique → locked", async () => {
        const f = fake({ authError: { code: "biometryLockout" } });
        const vault = new NativeVault({ secureStorage: f.secureStorage, biometric: f.biometric });
        expect(await code(vault.create("d1"))).toBe("locked");
    });

    test("appareil sans verrouillage d'écran ni biométrie : refusé", async () => {
        const f = fake({ secure: false, available: false });
        const vault = new NativeVault({ secureStorage: f.secureStorage, biometric: f.biometric });
        expect(await code(vault.create("d1"))).toBe("unavailable");
        expect(f.m.size).toBe(0);
    });

    test("clé absente → missing", async () => {
        const f = fake();
        const vault = new NativeVault({ secureStorage: f.secureStorage, biometric: f.biometric });
        expect(await code(vault.load("inconnu"))).toBe("missing");
    });
});

describe("PrfVault (WebAuthn)", () => {
    /** Authentificateur simulé : PRF = HMAC(secret par credential, salt). */
    function authenticator(opts: { prf?: boolean; enabledOnly?: boolean; deny?: boolean } = {}) {
        const secrets = new Map<string, CryptoKey>();
        const hmac = async (secret: CryptoKey, salt: ArrayBuffer) => crypto.subtle.sign("HMAC", secret, salt);
        const credentials = {
            async create(options: any) {
                if (opts.deny) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
                const id = crypto.getRandomValues(new Uint8Array(16));
                const secret = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
                secrets.set(btoa(String.fromCharCode(...id)), secret);
                const salt = options.publicKey.extensions.prf.eval.first;
                return {
                    rawId: id.buffer,
                    getClientExtensionResults: () => opts.prf === false ? {} : opts.enabledOnly ? { prf: { enabled: true } } : { prf: { enabled: true, results: { first: undefined } } },
                    _salt: salt,
                };
            },
            async get(options: any) {
                if (opts.deny) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
                const idKey = btoa(String.fromCharCode(...new Uint8Array(options.publicKey.allowCredentials[0].id)));
                const secret = secrets.get(idKey);
                if (!secret) throw Object.assign(new Error("none"), { name: "NotAllowedError" });
                const first = await hmac(secret, options.publicKey.extensions.prf.eval.first);
                return { getClientExtensionResults: () => ({ prf: { results: { first } } }) };
            },
        };
        return credentials as any;
    }

    test("DK dérivée à la création, retrouvée à l'identique au déverrouillage, aucun secret stocké", async () => {
        const store = memory();
        const vault = new PrfVault({ credentials: authenticator(), store });
        const dk = await vault.create("dev1");
        expect(dk.length).toBe(32);
        expect(await vault.load("dev1")).toEqual(dk);
        const stored = JSON.stringify(await store.get("e4-prfvault:dev1"));
        expect(stored).not.toContain(btoa(String.fromCharCode(...dk)));
    });

    test("DK propre à chaque appareil (salt lié à l'identifiant)", async () => {
        const store = memory();
        const vault = new PrfVault({ credentials: authenticator(), store });
        const a = await vault.create("a");
        const b = await vault.create("b");
        expect(a).not.toEqual(b);
    });

    test("authentificateur sans PRF → unavailable (le repli PIN prend le relais)", async () => {
        const vault = new PrfVault({ credentials: authenticator({ prf: false }), store: memory() });
        expect(await code(vault.create("d"))).toBe("unavailable");
    });

    test("refus de l'utilisateur → cancelled", async () => {
        const vault = new PrfVault({ credentials: authenticator({ deny: true }), store: memory() });
        expect(await code(vault.create("d"))).toBe("cancelled");
    });

    test("coffre inconnu → missing", async () => {
        const vault = new PrfVault({ credentials: authenticator(), store: memory() });
        expect(await code(vault.load("nope"))).toBe("missing");
    });
});
