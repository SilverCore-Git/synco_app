import { describe, expect, test } from "bun:test";
import { PinVault } from "../deviceVault/pinVault";
import { getLocalDevice } from "../deviceVault/localDevice";
import { VaultError, type DeviceVault, type KeyValueStore } from "../deviceVault/types";
import { createDeviceEnvelope, generateAccountKeyBytes } from "../utils/e2eeV4";
import {
    DeviceRevokedError, IdentityMismatchError, V4ApiError, answerLink, checkDevices, linkQrPayload, parseLinkQr,
    prepareV4Account, recoverWithKey, regenerateRecoveryKey, removeDevices, startLink, unlockV4,
    type DeviceContext, type InitBody, type OwnIdentityTrust, type PendingLink, type RemoteDevice, type SealedIdentity, type V4Api,
} from "./session";

const U = "user-1";

const memory = (): KeyValueStore => {
    const m = new Map<string, unknown>();
    return { get: async <T>(k: string) => m.get(k) as T | undefined, set: async (k, v) => { m.set(k, structuredClone(v)); }, del: async (k) => { m.delete(k); } };
};

/** Serveur simulé : mêmes règles de couverture et d'usage unique que synco_api. */
function fakeServer() {
    const state = {
        user: null as null | (SealedIdentity & { publicKey: string; publicSignKey: string }),
        devices: new Map<string, RemoteDevice & { envelope: string }>(),
        recovery: null as string | null,
        links: new Map<string, PendingLink & { responderPublicKey?: string; envelope?: string }>(),
        calls: [] as Array<{ route: string; body: unknown }>,
    };
    const addDev = (d: InitBody["device"]) => state.devices.set(d.id, { id: d.id, name: d.name, platform: d.platform, publicKey: d.publicKey, certificate: d.certificate, envelope: d.envelope, createdAt: new Date().toISOString(), lastUsedAt: null });
    const api: V4Api = {
        async init(body) { state.calls.push({ route: "init", body }); state.user = body.identity; addDev(body.device); state.recovery = body.recoveryEnvelope ?? null; },
        async reset(body) { state.calls.push({ route: "reset", body }); state.devices.clear(); state.user = body.identity; addDev(body.device); state.recovery = body.recoveryEnvelope ?? null; },
        async listDevices() { return [...state.devices.values()].map(({ envelope: _e, ...d }) => d); },
        async getEnvelope(id) { const d = state.devices.get(id); if (!d) throw new V4ApiError(404, "absent"); return { envelope: d.envelope, publicKey: d.publicKey, certificate: d.certificate }; },
        async renameDevice(id, name) { state.devices.get(id)!.name = name; },
        async addDevice(body) {
            state.calls.push({ route: "addDevice", body });
            if (body.linkRequestId) { const l = state.links.get(body.linkRequestId); if (!l?.envelope) throw new V4ApiError(409, "pas de liaison"); state.links.delete(body.linkRequestId); }
            addDev(body.device);
        },
        async rotate(body) {
            state.calls.push({ route: "rotate", body });
            const remaining = [...state.devices.keys()].filter(id => !body.removeDeviceIds.includes(id)).sort();
            const provided = body.envelopes.map(e => e.deviceId).sort();
            if (JSON.stringify(remaining) !== JSON.stringify(provided)) throw new V4ApiError(409, "couverture");
            if (state.recovery && !body.recoveryEnvelope) throw new V4ApiError(400, "récupération requise");
            Object.assign(state.user!, body.identity);
            for (const e of body.envelopes) state.devices.get(e.deviceId)!.envelope = e.envelope;
            if (body.recoveryEnvelope && state.recovery) state.recovery = body.recoveryEnvelope;
            for (const id of body.removeDeviceIds) state.devices.delete(id);
            state.links.clear();
        },
        async getRecovery() { return state.recovery; },
        async putRecovery(env) { state.recovery = env; },
        async deleteRecovery() { state.recovery = null; },
        async createLink(body) { state.links.set(body.id, { ...body, createdAt: "", expiresAt: "" }); return { expiresAt: "" }; },
        async pendingLinks() { return [...state.links.values()].filter(l => !l.envelope); },
        async answerLink(id, body) { const l = state.links.get(id); if (!l || l.envelope) throw new V4ApiError(404, "x"); Object.assign(l, body); },
        async getLink(id) { const l = state.links.get(id); return l ? { answered: !!l.envelope, responderPublicKey: l.responderPublicKey ?? null, envelope: l.envelope ?? null } : null; },
        async cancelLink(id) { state.links.delete(id); },
    };
    return { api, state };
}

function trustStore(): OwnIdentityTrust & { pinned?: { publicKey: string; publicSignKey: string } } {
    const t: OwnIdentityTrust & { pinned?: { publicKey: string; publicSignKey: string } } = {
        async pin(identity, opts) {
            if (t.pinned && !opts?.replace && (t.pinned.publicKey !== identity.publicKey || t.pinned.publicSignKey !== identity.publicSignKey)) throw new IdentityMismatchError("pinned");
            t.pinned = identity;
        },
        async pinnedSignKey() { return t.pinned?.publicSignKey; },
    };
    return t;
}

/** Un « appareil » : son stockage, son coffre (PIN local, rapide en test), sa confiance. */
function device(api: V4Api, pin = "4821") {
    const store = memory();
    const vault = new PinVault(store, 1000);
    const dev: DeviceContext = { userId: U, store, vaultFor: () => vault, api, trust: trustStore() };
    return { dev, vault, ctx: { pin }, opts: { name: "Appareil", platform: "web" as const, vaults: [vault as DeviceVault], ctx: { pin } } };
}

const sealedOf = (s: ReturnType<typeof fakeServer>["state"]): SealedIdentity => ({ ...s.user! });
const served = (s: ReturnType<typeof fakeServer>["state"]) => ({ publicKey: s.user!.publicKey, publicSignKey: s.user!.publicSignKey });
const errName = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return (e as VaultError).code ?? (e as Error).name; } };

async function createAccount(withRecovery = true) {
    const server = fakeServer();
    const a = device(server.api);
    const prepared = await prepareV4Account(a.dev, { ...a.opts, mode: "create" });
    await prepared.commit(withRecovery);
    return { server, a, prepared };
}

/** Lie un second appareil depuis `from`. */
async function link(server: ReturnType<typeof fakeServer>, from: ReturnType<typeof device>, pin = "1111") {
    const b = device(server.api, pin);
    const started = await startLink(b.dev, "Nouveau", "web");
    const fromQr = await parseLinkQr(started.qrPayload);
    const pending = (await server.api.pendingLinks()).find(p => p.id === fromQr!.requestId)!;
    const { sas } = await answerLink(from.dev, pending, fromQr!.linkSecret, from.ctx);
    const opened = (await started.poll())!;
    expect(opened.sas).toBe(sas);
    await opened.confirm(sealedOf(server.state), served(server.state), b.opts);
    return b;
}

describe("création de compte", () => {
    test("rien de secret n'est envoyé ; l'identité se rouvre et correspond", async () => {
        const { server, a, prepared } = await createAccount();
        const sent = JSON.stringify(server.state.calls);
        expect(sent).not.toContain("4821");
        expect(sent).not.toContain(prepared.recoveryKeyText);
        expect(sent).not.toContain(prepared.recoveryKeyText.replace(/-/g, ""));
        expect(server.state.recovery).not.toBeNull();

        const keys = await unlockV4(a.dev, sealedOf(server.state), served(server.state), a.ctx);
        expect(keys.privateKey.extractable).toBe(false);
        expect(keys.privateSignKey.extractable).toBe(false);
        expect(keys.privateKey.usages).toEqual(["decrypt"]);
        expect((await getLocalDevice(a.dev.store, U))!.identity).toEqual(prepared.identity);
    });

    test("clé de récupération non conservée : aucune enveloppe enregistrée", async () => {
        const { server } = await createAccount(false);
        expect(server.state.recovery).toBeNull();
    });

    test("échec de l'envoi : l'appareil est oublié localement", async () => {
        const server = fakeServer();
        server.api.init = async () => { throw new V4ApiError(500, "x"); };
        const a = device(server.api);
        const prepared = await prepareV4Account(a.dev, { ...a.opts, mode: "create" });
        expect(await errName(prepared.commit(true))).toBe("V4ApiError");
        expect(await getLocalDevice(a.dev.store, U)).toBeUndefined();
    });

    test("coffre de repli sans PIN : pin-required, rien n'est créé", async () => {
        const server = fakeServer();
        const a = device(server.api);
        expect(await errName(prepareV4Account(a.dev, { ...a.opts, ctx: undefined, mode: "create" }))).toBe("pin-required");
        expect(server.state.calls.length).toBe(0);
    });
});

describe("déverrouillage", () => {
    test("mauvais PIN local : refusé", async () => {
        const { server, a } = await createAccount();
        expect(await errName(unlockV4(a.dev, sealedOf(server.state), served(server.state), { pin: "0000" }))).toBe("wrong-pin");
    });

    test("serveur malveillant : fausse enveloppe + fausses clés d'identité → refusé (identité épinglée)", async () => {
        const { server, a } = await createAccount();
        // Le serveur connaît la clé publique de l'appareil : il fabrique une enveloppe d'une AK à lui,
        // et une identité à lui scellée sous cette AK.
        const record = (await getLocalDevice(a.dev.store, U))!;
        const fakeAk = generateAccountKeyBytes();
        const { importAccountKey, sealIdentityKey } = await import("../utils/e2eeV4");
        const rsa = await crypto.subtle.generateKey({ name: "RSA-OAEP", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["encrypt", "decrypt"]);
        const sig = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const ak = await importAccountKey(fakeAk);
        const r = await sealIdentityKey(ak, "rsa", U, await crypto.subtle.exportKey("pkcs8", rsa.privateKey));
        const s = await sealIdentityKey(ak, "sign", U, await crypto.subtle.exportKey("pkcs8", sig.privateKey));
        server.state.devices.get(record.deviceId)!.envelope = await createDeviceEnvelope(record.publicKey, fakeAk, U, record.deviceId);
        const fakeSealed = { encryptedPrivateKey: r.ciphertext, keyIv: r.iv, encryptedSignPrivateKey: s.ciphertext, signKeyIv: s.iv };
        const fakeServed = { publicKey: JSON.stringify(await crypto.subtle.exportKey("jwk", rsa.publicKey)), publicSignKey: JSON.stringify(await crypto.subtle.exportKey("jwk", sig.publicKey)) };
        expect(await errName(unlockV4(a.dev, fakeSealed, fakeServed, a.ctx))).toBe("IdentityMismatchError");
    });

    test("clé publique servie différente de la clé privée : refusé", async () => {
        const { server, a } = await createAccount();
        const other = await crypto.subtle.generateKey({ name: "RSA-OAEP", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["encrypt", "decrypt"]);
        const lie = { ...served(server.state), publicKey: JSON.stringify(await crypto.subtle.exportKey("jwk", other.publicKey)) };
        const e = await unlockV4(a.dev, sealedOf(server.state), lie, a.ctx).catch(x => x);
        expect(e).toBeInstanceOf(IdentityMismatchError);
        expect((e as IdentityMismatchError).kind).toBe("served");
    });

    test("appareil retiré côté serveur : DeviceRevokedError", async () => {
        const { server, a } = await createAccount();
        server.state.devices.clear();
        expect(await errName(unlockV4(a.dev, sealedOf(server.state), served(server.state), a.ctx))).toBe("DeviceRevokedError");
        expect(new DeviceRevokedError().message).toContain("déconnecté");
    });
});

describe("liaison d'un appareil", () => {
    test("QR → réponse → même code des deux côtés → l'appareil s'ouvre seul ensuite", async () => {
        const { server, a } = await createAccount();
        const b = await link(server, a);
        expect(server.state.devices.size).toBe(2);
        expect(server.state.links.size).toBe(0);
        const keys = await unlockV4(b.dev, sealedOf(server.state), served(server.state), b.ctx);
        expect(keys.privateSignKey.usages).toEqual(["sign"]);
        // le secret de liaison n'est jamais parti vers l'API
        const started = JSON.stringify(server.state.calls);
        expect(started).not.toContain("synco-link:1:");
    });

    test("QR : format strict ; secret faux → l'enveloppe ne s'ouvre pas", async () => {
        expect(await parseLinkQr("https://exemple.test")).toBeNull();
        expect(await parseLinkQr("synco-link:1:pas-un-uuid:ABCD")).toBeNull();
        const payload = await linkQrPayload(crypto.randomUUID(), crypto.getRandomValues(new Uint8Array(16)));
        expect((await parseLinkQr(payload))!.linkSecret.length).toBe(16);

        const { server, a } = await createAccount();
        const b = device(server.api, "1111");
        const started = await startLink(b.dev, "Nouveau", "web");
        const pending = (await server.api.pendingLinks())[0]!;
        await answerLink(a.dev, pending, crypto.getRandomValues(new Uint8Array(16)), a.ctx);
        expect(await errName(started.poll())).toBe("E2eeV4Error");
    });

    test("nouvel appareil sans PIN local choisi : pin-required, puis réussite avec un PIN", async () => {
        const { server, a } = await createAccount();
        const b = device(server.api, "1111");
        const started = await startLink(b.dev, "Nouveau", "web");
        const qr = (await parseLinkQr(started.qrPayload))!;
        await answerLink(a.dev, (await server.api.pendingLinks())[0]!, qr.linkSecret, a.ctx);
        const opened = (await started.poll())!;
        expect(await errName(opened.confirm(sealedOf(server.state), served(server.state), { ...b.opts, ctx: undefined }))).toBe("pin-required");
        await opened.confirm(sealedOf(server.state), served(server.state), b.opts);
        expect(server.state.devices.size).toBe(2);
    });
});

describe("clé de récupération", () => {
    test("connexion d'un appareil neuf, puis régénération : l'ancienne clé ne marche plus", async () => {
        const { server, a, prepared } = await createAccount();
        const c = device(server.api, "2222");
        await recoverWithKey(c.dev, prepared.recoveryKeyText.toLowerCase(), sealedOf(server.state), served(server.state), c.opts);
        expect(server.state.devices.size).toBe(2);

        const fresh = await regenerateRecoveryKey(a.dev, a.ctx);
        expect(fresh).not.toBe(prepared.recoveryKeyText);
        const d = device(server.api, "3333");
        expect(await errName(recoverWithKey(d.dev, prepared.recoveryKeyText, sealedOf(server.state), served(server.state), d.opts))).toBe("E2eeV4Error");
        await recoverWithKey(d.dev, fresh, sealedOf(server.state), served(server.state), d.opts);
    });

    test("faute de frappe : détectée par la somme de contrôle, rien n'est envoyé", async () => {
        const { server, prepared } = await createAccount();
        const c = device(server.api, "2222");
        const typo = prepared.recoveryKeyText.slice(0, -1) + (prepared.recoveryKeyText.endsWith("0") ? "1" : "0");
        const before = server.state.calls.length;
        expect(await errName(recoverWithKey(c.dev, typo, sealedOf(server.state), served(server.state), c.opts))).toBe("E2eeV4Error");
        expect(server.state.calls.length).toBe(before);
    });
});

describe("retrait d'appareil (rotation d'AK)", () => {
    test("l'appareil retiré perd l'accès, les autres continuent, nouvelle clé de récupération", async () => {
        const { server, a, prepared } = await createAccount();
        const b = await link(server, a);
        const c = await link(server, a, "3333");
        const bId = (await getLocalDevice(b.dev.store, U))!.deviceId;

        const result = await removeDevices(a.dev, [bId], async () => sealedOf(server.state), a.ctx);
        expect(result.removed).toEqual([bId]);
        expect(result.removedThisDevice).toBe(false);
        expect(result.recoveryKeyText).toBeDefined();

        expect(await errName(unlockV4(b.dev, sealedOf(server.state), served(server.state), b.ctx))).toBe("DeviceRevokedError");
        await unlockV4(a.dev, sealedOf(server.state), served(server.state), a.ctx);
        await unlockV4(c.dev, sealedOf(server.state), served(server.state), c.ctx);

        const d = device(server.api, "4444");
        expect(await errName(recoverWithKey(d.dev, prepared.recoveryKeyText, sealedOf(server.state), served(server.state), d.opts))).toBe("E2eeV4Error");
        await recoverWithKey(d.dev, result.recoveryKeyText!, sealedOf(server.state), served(server.state), d.opts);
    });

    test("appareil glissé par le serveur (non certifié) : jamais enveloppé, retiré avec les autres", async () => {
        const { server, a } = await createAccount();
        const b = await link(server, a);
        const evilPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
        const evilId = crypto.randomUUID();
        server.state.devices.set(evilId, {
            id: evilId, name: "Pirate", platform: "web", publicKey: JSON.stringify(await crypto.subtle.exportKey("jwk", evilPair.publicKey)),
            certificate: btoa("x".repeat(64)), envelope: "e", createdAt: "", lastUsedAt: null,
        });
        const listed = await checkDevices(a.dev);
        expect(listed.find(d => d.id === evilId)!.certified).toBe(false);
        expect(listed.filter(d => d.certified).length).toBe(2);
        expect(listed.filter(d => d.isThisDevice).length).toBe(1);

        const bId = (await getLocalDevice(b.dev.store, U))!.deviceId;
        const result = await removeDevices(a.dev, [bId], async () => sealedOf(server.state), a.ctx);
        expect(result.removed.sort()).toEqual([bId, evilId].sort());
        const rotate = server.state.calls.filter(c => c.route === "rotate").at(-1)!.body as { envelopes: Array<{ deviceId: string }> };
        expect(rotate.envelopes.map(e => e.deviceId)).not.toContain(evilId);
    });

    test("appareil ajouté pendant la rotation (409) : on recommence avec la liste à jour", async () => {
        const { server, a } = await createAccount();
        const b = await link(server, a);
        const bId = (await getLocalDevice(b.dev.store, U))!.deviceId;
        const realRotate = server.api.rotate;
        let raced = false;
        let c: ReturnType<typeof device> | undefined;
        server.api.rotate = async (body) => {
            if (!raced) { raced = true; server.api.rotate = realRotate; c = await link(server, a, "5555"); }
            return server.api.rotate(body);
        };
        await removeDevices(a.dev, [bId], async () => sealedOf(server.state), a.ctx);
        expect(server.state.calls.filter(x => x.route === "rotate").length).toBe(2);
        await unlockV4(c!.dev, sealedOf(server.state), served(server.state), c!.ctx);
    });

    test("se retirer soi-même : oublié localement ; dernier appareil : refusé", async () => {
        const { server, a } = await createAccount();
        const aId = (await getLocalDevice(a.dev.store, U))!.deviceId;
        expect(await errName(removeDevices(a.dev, [aId], async () => sealedOf(server.state), a.ctx))).toBe("E2eeV4Error");

        const b = await link(server, a);
        const result = await removeDevices(a.dev, [aId], async () => sealedOf(server.state), a.ctx);
        expect(result.removedThisDevice).toBe(true);
        expect(await getLocalDevice(a.dev.store, U)).toBeUndefined();
        await unlockV4(b.dev, sealedOf(server.state), served(server.state), b.ctx);
    });
});

describe("réinitialisation de dernier recours", () => {
    test("nouvelle identité acceptée par la confiance locale (replace)", async () => {
        const { server, a } = await createAccount();
        const before = server.state.user!.publicKey;
        const prepared = await prepareV4Account(a.dev, { ...a.opts, mode: "reset" });
        await prepared.commit(false);
        expect(server.state.user!.publicKey).not.toBe(before);
        expect(server.state.devices.size).toBe(1);
        await unlockV4(a.dev, sealedOf(server.state), served(server.state), a.ctx);
    });
});

describe("migration v3 → v4", () => {
    async function v3Identity() {
        const rsa = await crypto.subtle.generateKey({ name: "RSA-OAEP", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["encrypt", "decrypt"]);
        const sig = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        return {
            rsa, sig,
            // Comme crypto.ts en v3 : JWK complet (alg, ext, key_ops), pas la forme canonique.
            served: { publicKey: JSON.stringify(await crypto.subtle.exportKey("jwk", rsa.publicKey)), publicSignKey: JSON.stringify(await crypto.subtle.exportKey("jwk", sig.publicKey)) },
            source: async () => ({
                rsaPkcs8: new Uint8Array(await crypto.subtle.exportKey("pkcs8", rsa.privateKey)),
                signPkcs8: new Uint8Array(await crypto.subtle.exportKey("pkcs8", sig.privateKey)),
            }),
        };
    }

    test("mêmes clés d'identité, clés publiques renvoyées à l'identique, preuve du PIN jointe", async () => {
        const server = fakeServer();
        const a = device(server.api);
        const v3 = await v3Identity();
        const bytes = await v3.source();
        const prepared = await prepareV4Account(a.dev, { ...a.opts, mode: "migrate", migration: { ...bytes, verifier: "proof", served: v3.served } });
        // les octets PKCS#8 fournis sont effacés une fois scellés
        expect(bytes.rsaPkcs8.every(b => b === 0)).toBe(true);
        await prepared.commit(true);

        const init = server.state.calls.find(c => c.route === "init")!.body as InitBody;
        expect(init.verifier).toBe("proof");
        expect(init.identity.publicKey).toBe(v3.served.publicKey);
        expect(init.identity.publicSignKey).toBe(v3.served.publicSignKey);

        // un ancien message chiffré pour la clé publique v3 reste lisible avec la clé v4
        const old = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, v3.rsa.publicKey, new TextEncoder().encode("historique"));
        const keys = await unlockV4(a.dev, sealedOf(server.state), served(server.state), a.ctx);
        expect(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, keys.privateKey, old))).toBe("historique");
    });

    test("clé publique servie qui ne correspond pas : refusé avant tout envoi", async () => {
        const server = fakeServer();
        const a = device(server.api);
        const v3 = await v3Identity();
        const other = await v3Identity();
        const attempt = prepareV4Account(a.dev, { ...a.opts, mode: "migrate", migration: { ...(await v3.source()), verifier: "proof", served: other.served } });
        expect(await errName(attempt)).toBe("IdentityMismatchError");
        expect(server.state.calls.length).toBe(0);
        expect(await getLocalDevice(a.dev.store, U)).toBeUndefined();
    });
});
