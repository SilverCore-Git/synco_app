import { describe, expect, test } from "bun:test";
import { E2eeV4Error, generateAccountKeyBytes, verifyDeviceCertificate } from "../utils/e2eeV4";
import { enrollThisDevice, forgetThisDevice, getLocalDevice, switchVault, unlockAccountKey, type LocalDeviceRecord } from "./localDevice";
import { PinVault } from "./pinVault";
import { KeyringVault } from "./keyringVault";
import { VaultError, type DeviceVault, type KeyValueStore } from "./types";

const U = "user-1";
const memory = () => {
    const m = new Map<string, unknown>();
    const store: KeyValueStore = { get: async <T>(k: string) => m.get(k) as T | undefined, set: async (k, v) => { m.set(k, structuredClone(v)); }, del: async (k) => { m.delete(k); } };
    return { m, store };
};
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return (e as VaultError).code ?? (e as Error).name; } };
async function signing() {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    return { priv: pair.privateKey, pub: await crypto.subtle.exportKey("jwk", pair.publicKey) };
}
const unavailable: DeviceVault = {
    capabilities: { kind: "webauthn-prf", hardwareBacked: true, biometric: true, needsPin: false, rateLimit: "hardware" },
    create: async () => { throw new VaultError("unavailable"); }, load: async () => { throw new VaultError("unavailable"); },
    remove: async () => {}, has: async () => false,
};

describe("enrollThisDevice / unlockAccountKey", () => {
    test("inscription puis déverrouillage : AK retrouvée, certificat valide", async () => {
        const { store } = memory(), id = await signing(), ak = generateAccountKeyBytes();
        const vault = new PinVault(store, 1000);
        const { payload, record } = await enrollThisDevice({ userId: U, name: "Mon PC", platform: "web", akBytes: ak, identitySignKey: id.priv, vaults: [vault], store, ctx: { pin: "4821" } });

        expect(await verifyDeviceCertificate(id.pub, payload.certificate, U, payload.id, "web", JSON.parse(payload.publicKey))).toBe(true);
        expect(record.vaultKind).toBe("web-pin");

        const { akBytes, deviceId } = await unlockAccountKey({
            userId: U, store, ctx: { pin: "4821" }, vaultFor: () => vault,
            fetchEnvelope: async (d) => { expect(d).toBe(payload.id); return { envelope: payload.envelope, publicKey: payload.publicKey }; },
        });
        expect(akBytes).toEqual(ak);
        expect(deviceId).toBe(payload.id);
    });

    test("mauvais PIN local : AK non obtenue", async () => {
        const { store } = memory(), id = await signing();
        const vault = new PinVault(store, 1000);
        const { payload } = await enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [vault], store, ctx: { pin: "4821" } });
        const attempt = unlockAccountKey({ userId: U, store, ctx: { pin: "0000" }, vaultFor: () => vault, fetchEnvelope: async () => ({ envelope: payload.envelope, publicKey: payload.publicKey }) });
        expect(await code(attempt)).toBe("wrong-pin");
    });

    test("le serveur renvoie une autre clé publique pour cet appareil : refusé", async () => {
        const { store } = memory(), id = await signing();
        const vault = new PinVault(store, 1000);
        const a = await enrollThisDevice({ userId: U, name: "a", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [vault], store, ctx: { pin: "4821" } });
        const other = memory();
        const b = await enrollThisDevice({ userId: U, name: "b", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [new PinVault(other.store, 1000)], store: other.store, ctx: { pin: "1111" } });
        const attempt = unlockAccountKey({ userId: U, store, ctx: { pin: "4821" }, vaultFor: () => vault, fetchEnvelope: async () => ({ envelope: b.payload.envelope, publicKey: b.payload.publicKey }) });
        expect(await code(attempt)).toBe("E2eeV4Error");
        void a;
    });

    test("enveloppe d'un autre appareil servie par le serveur : refusée", async () => {
        const { store } = memory(), id = await signing();
        const vault = new PinVault(store, 1000);
        const a = await enrollThisDevice({ userId: U, name: "a", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [vault], store, ctx: { pin: "4821" } });
        const other = memory();
        const b = await enrollThisDevice({ userId: U, name: "b", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [new PinVault(other.store, 1000)], store: other.store, ctx: { pin: "1111" } });
        // clé publique correcte (celle de a), enveloppe de b
        const attempt = unlockAccountKey({ userId: U, store, ctx: { pin: "4821" }, vaultFor: () => vault, fetchEnvelope: async () => ({ envelope: b.payload.envelope, publicKey: a.payload.publicKey }) });
        expect(await code(attempt)).toBe("E2eeV4Error");
    });

    test("repli : un coffre indisponible laisse la main au suivant", async () => {
        const { store } = memory(), id = await signing();
        const { record } = await enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [unavailable, new PinVault(store, 1000)], store, ctx: { pin: "4821" } });
        expect(record.vaultKind).toBe("web-pin");
    });

    test("repli sans PIN : la demande de PIN remonte, rien n'est enregistré", async () => {
        const { m, store } = memory(), id = await signing();
        const attempt = enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [unavailable, new PinVault(store, 1000)], store });
        expect(await code(attempt)).toBe("pin-required");
        expect(m.size).toBe(0);
    });

    test("annulation de l'utilisateur : pas de repli silencieux", async () => {
        const { store } = memory(), id = await signing();
        const cancel: DeviceVault = { ...unavailable, create: async () => { throw new VaultError("cancelled"); } };
        const attempt = enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [cancel, new PinVault(store, 1000)], store, ctx: { pin: "4821" } });
        expect(await code(attempt)).toBe("cancelled");
        expect(await getLocalDevice(store, U)).toBeUndefined();
    });

    test("échec après la création du coffre : le coffre est vidé", async () => {
        const { store } = memory();
        const removed: string[] = [];
        const spy: DeviceVault = { ...unavailable, create: async () => crypto.getRandomValues(new Uint8Array(32)), remove: async (d) => { removed.push(d); } };
        const bad = { privateKey: {} } as unknown as CryptoKey; // signature impossible
        await expect(enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: bad, vaults: [spy], store })).rejects.toBeDefined();
        expect(removed.length).toBe(1);
        expect(await getLocalDevice(store, U)).toBeUndefined();
    });

    test("appareil non enregistré → missing ; oubli de l'appareil", async () => {
        const { store } = memory(), id = await signing();
        expect(await code(unlockAccountKey({ userId: U, store, vaultFor: () => undefined, fetchEnvelope: async () => { throw new Error("x"); } }))).toBe("missing");

        const vault = new PinVault(store, 1000);
        const { record } = await enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [vault], store, ctx: { pin: "4821" } });
        await forgetThisDevice(U, store, () => vault);
        expect(await getLocalDevice(store, U)).toBeUndefined();
        expect(await vault.has(record.deviceId)).toBe(false);
    });

    test("ce qui est stocké localement ne contient ni DK ni la clé privée en clair", async () => {
        const { m, store } = memory(), id = await signing();
        const ring = new Map<string, string>();
        const vault = new KeyringVault((async (cmd: string, a: any) => cmd === "secure_store_set" ? (ring.set(a.key, a.value), undefined) : cmd === "secure_store_get" ? ring.get(a.key) ?? null : undefined) as any);
        const { record } = await enrollThisDevice({ userId: U, name: "n", platform: "desktop", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [vault], store });
        const dump = JSON.stringify([...m.values()]);
        const dk = [...ring.values()][0]!;
        expect(dump).not.toContain(dk);
        expect((m.get(`e4-device:${U}`) as LocalDeviceRecord).sealedPrivateKey.length).toBeGreaterThan(100);
        expect(record.vaultKind).toBe("os-keyring");
    });

    test("l'identité épinglée est conservée dans l'enregistrement et renvoyée au déverrouillage", async () => {
        const { store } = memory(), id = await signing();
        const vault = new PinVault(store, 1000);
        const identity = { publicKey: '{"e":"AQAB","kty":"RSA","n":"x"}', publicSignKey: '{"crv":"P-256","kty":"EC","x":"a","y":"b"}' };
        const { payload } = await enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [vault], store, ctx: { pin: "4821" }, identity });
        const { record } = await unlockAccountKey({ userId: U, store, ctx: { pin: "4821" }, vaultFor: () => vault, fetchEnvelope: async () => ({ envelope: payload.envelope, publicKey: payload.publicKey }) });
        expect(record.identity).toEqual(identity);
    });
});

describe("switchVault", () => {
    test("PIN local → trousseau : même appareil, même AK, l'ancien coffre est vidé", async () => {
        const { store } = memory(), id = await signing(), ak = generateAccountKeyBytes();
        const pinVault = new PinVault(store, 1000);
        const ring = new Map<string, string>();
        const keyring = new KeyringVault((async (cmd: string, a: any) => cmd === "secure_store_set" ? (ring.set(a.key, a.value), undefined) : cmd === "secure_store_get" ? ring.get(a.key) ?? null : (ring.delete(a.key), undefined)) as any);
        const { payload } = await enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: ak, identitySignKey: id.priv, vaults: [pinVault], store, ctx: { pin: "4821" } });

        const next = await switchVault({ userId: U, store, from: pinVault, to: keyring, fromCtx: { pin: "4821" } });
        expect(next.vaultKind).toBe("os-keyring");
        expect(next.deviceId).toBe(payload.id);
        expect(await pinVault.has(payload.id)).toBe(false);

        const vaultFor = (k: string) => (k === "os-keyring" ? keyring : pinVault) as DeviceVault;
        const { akBytes } = await unlockAccountKey({ userId: U, store, vaultFor, fetchEnvelope: async () => ({ envelope: payload.envelope, publicKey: payload.publicKey }) });
        expect(akBytes).toEqual(ak);
    });

    test("mauvais PIN : rien ne change", async () => {
        const { store } = memory(), id = await signing();
        const pinVault = new PinVault(store, 1000);
        const created: string[] = [];
        const spy: DeviceVault = { ...unavailable, capabilities: { ...unavailable.capabilities, kind: "os-keyring" }, create: async (d) => { created.push(d); return crypto.getRandomValues(new Uint8Array(32)); } };
        await enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [pinVault], store, ctx: { pin: "4821" } });
        const before = await getLocalDevice(store, U);
        expect(await code(switchVault({ userId: U, store, from: pinVault, to: spy, fromCtx: { pin: "0000" } }))).toBe("wrong-pin");
        expect(created.length).toBe(0);
        expect((await getLocalDevice(store, U))!.sealedPrivateKey).toBe(before!.sealedPrivateKey);
    });

    test("échec du nouveau coffre après création : il est vidé, l'ancien reste utilisable", async () => {
        const { store } = memory(), id = await signing();
        const pinVault = new PinVault(store, 1000);
        const removed: string[] = [];
        const bad: DeviceVault = { ...unavailable, capabilities: { ...unavailable.capabilities, kind: "os-keyring" }, create: async () => new Uint8Array(5), remove: async (d) => { removed.push(d); } };
        const { payload } = await enrollThisDevice({ userId: U, name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: id.priv, vaults: [pinVault], store, ctx: { pin: "4821" } });
        await expect(switchVault({ userId: U, store, from: pinVault, to: bad, fromCtx: { pin: "4821" } })).rejects.toBeDefined();
        expect(removed).toEqual([payload.id]);
        expect((await getLocalDevice(store, U))!.vaultKind).toBe("web-pin");
        expect(await code(pinVault.load(payload.id, { pin: "4821" }))).toBe("ok");
    });
});

