import { describe, expect, test } from "bun:test";
import { getLocalDevice } from "../deviceVault/localDevice";
import { VaultError, type DeviceVault } from "../deviceVault/types";
import { createDeviceEnvelope, generateAccountKeyBytes } from "../utils/e2eeV4";
import {
    DeviceRevokedError, IdentityMismatchError, V4ApiError, answerLink, checkDevices, linkQrPayload, parseLinkQr,
    prepareV4Account, recoverWithKey, regenerateRecoveryKey, removeDevices, rotateIdentity, startLink, unlockV4,
    type InitBody,
} from "./session";
import { U, device, errName, trustStore, fakeServer, sealedOf, served } from "./testkit";

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

describe("liaison après une rotation d'AK faite ailleurs", () => {
    test("identité scellée relue : la liaison aboutit ; celle chargée avant la rotation ne s'ouvre pas", async () => {
        const { server, a } = await createAccount();
        const b = await link(server, a);
        const bId = (await getLocalDevice(b.dev.store, U))!.deviceId;

        // Le nouvel appareil charge la page (identité scellée lue) ...
        const chargee = sealedOf(server.state);
        // ... puis un autre appareil en retire un : nouvelle AK, identité rescellée, liaisons en attente supprimées.
        await removeDevices(a.dev, [bId], async () => sealedOf(server.state), a.ctx);
        expect(sealedOf(server.state).encryptedPrivateKey).not.toBe(chargee.encryptedPrivateKey);

        // ... enfin un QR est créé (écran resté ouvert, « Nouveau code ») et accepté avec l'AK actuelle.
        const open = async (d: ReturnType<typeof device>) => {
            const started = await startLink(d.dev, "Nouveau", "web");
            const qr = (await parseLinkQr(started.qrPayload))!;
            const pending = (await server.api.pendingLinks()).find(p => p.id === qr.requestId)!;
            await answerLink(a.dev, pending, qr.linkSecret, a.ctx);
            return (await started.poll())!;
        };
        const stale = device(server.api, "5555"), fresh = device(server.api, "6666");

        expect(await errName((await open(stale)).confirm(chargee, served(server.state), stale.opts))).toBe("E2eeV4Error");
        await (await open(fresh)).confirm(sealedOf(server.state), served(server.state), fresh.opts);
        expect(server.state.devices.size).toBe(2); // a + le nouvel appareil
        await unlockV4(fresh.dev, sealedOf(server.state), served(server.state), fresh.ctx);
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

    test("coffre passkey indisponible : pin-required, puis la reprise avec le PIN local aboutit", async () => {
        const server = fakeServer();
        const a = device(server.api);
        const v3 = await v3Identity();
        const unavailable = { capabilities: { kind: "webauthn-prf", needsPin: false }, create: async () => { throw new VaultError("unavailable"); } } as unknown as DeviceVault;
        const opts = { name: "Appareil", platform: "web" as const, vaults: [unavailable, a.vault as DeviceVault] };
        const migrationOf = async () => ({ ...(await v3.source()), verifier: "proof", served: v3.served });
        expect(await errName(prepareV4Account(a.dev, { ...opts, mode: "migrate", migration: await migrationOf() }))).toBe("pin-required");
        const prepared = await prepareV4Account(a.dev, { ...opts, ctx: { pin: "4821" }, mode: "migrate", migration: await migrationOf() });
        await prepared.commit(true);
        expect(server.state.devices.size).toBe(1);
    });

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

describe("rotation d'identité", () => {
    test("nouvelles clés ; l'autre appareil les accepte par la chaîne signée et relit l'historique", async () => {
        const { server, a } = await createAccount();
        const b = await link(server, a);
        const oldPub = await crypto.subtle.importKey("jwk", JSON.parse(server.state.user!.publicKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
        const oldMessage = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, oldPub, new TextEncoder().encode("ancien"));
        const before = server.state.user!.publicKey;

        const result = await rotateIdentity(a.dev, [], async () => sealedOf(server.state), a.ctx);
        expect(server.state.user!.publicKey).not.toBe(before);
        expect(result.keys!.archivedKeys.length).toBe(1);
        expect(server.state.transitions.length).toBe(1);

        // b n'a rien fait : au déverrouillage, l'identité diffère de son pin mais la chaîne la justifie
        const keysB = await unlockV4(b.dev, sealedOf(server.state), served(server.state), b.ctx);
        expect((await getLocalDevice(b.dev.store, U))!.identity!.publicKey).toBe(server.state.user!.publicKey);
        const plain = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, keysB.archivedKeys[0]!, oldMessage);
        expect(new TextDecoder().decode(plain)).toBe("ancien");
        // la clé actuelle ne lit pas l'ancien message : seule l'archive le permet
        await expect(crypto.subtle.decrypt({ name: "RSA-OAEP" }, keysB.privateKey, oldMessage)).rejects.toBeDefined();
    });

    test("rotation d'identité qui retire un appareil, puis rotation d'AK : l'archive suit", async () => {
        const { server, a } = await createAccount();
        const b = await link(server, a);
        const c = await link(server, a, "3333");
        const bId = (await getLocalDevice(b.dev.store, U))!.deviceId;
        await rotateIdentity(a.dev, [bId], async () => sealedOf(server.state), a.ctx);
        expect(await errName(unlockV4(b.dev, sealedOf(server.state), served(server.state), b.ctx))).toBe("DeviceRevokedError");

        const cId = (await getLocalDevice(c.dev.store, U))!.deviceId;
        const d = await link(server, a, "4444");
        await removeDevices(a.dev, [cId], async () => sealedOf(server.state), a.ctx);
        const keysD = await unlockV4(d.dev, sealedOf(server.state), served(server.state), d.ctx);
        expect(keysD.archivedKeys.length).toBe(1);
    });

    test("identité remplacée par le serveur sans transition signée : refusée", async () => {
        const { server, a } = await createAccount();
        const b = await link(server, a);
        // le serveur rejoue une rotation légitime mais efface la chaîne qui la justifie
        await rotateIdentity(a.dev, [], async () => sealedOf(server.state), a.ctx);
        server.state.transitions = [];
        expect(await errName(unlockV4(b.dev, sealedOf(server.state), served(server.state), b.ctx))).toBe("IdentityMismatchError");
    });

    test("appareil retiré par une rotation, puis reconnecté dans le même navigateur : l'ancienne épingle est remplacée via la chaîne", async () => {
        const { server, a } = await createAccount();
        const b = await link(server, a);
        const bId = (await getLocalDevice(b.dev.store, U))!.deviceId;
        const result = await rotateIdentity(a.dev, [bId], async () => sealedOf(server.state), a.ctx);
        // même navigateur (même keyTrust, donc ancienne identité épinglée), stockage d'appareil neuf
        const c = device(server.api, "2222");
        c.dev.trust = b.dev.trust;
        await recoverWithKey(c.dev, result.recoveryKeyText!, sealedOf(server.state), served(server.state), c.opts);
        expect((b.dev.trust as ReturnType<typeof trustStore>).pinned!.publicKey).toBe(server.state.user!.publicKey);
    });

    test("même cas sans chaîne justificative : refusé, aucun appareil n'est enregistré", async () => {
        const { server, a } = await createAccount();
        const b = await link(server, a);
        const bId = (await getLocalDevice(b.dev.store, U))!.deviceId;
        const result = await rotateIdentity(a.dev, [bId], async () => sealedOf(server.state), a.ctx);
        server.state.transitions = [];
        const devicesBefore = server.state.devices.size;
        const c = device(server.api, "2222");
        c.dev.trust = b.dev.trust;
        expect(await errName(recoverWithKey(c.dev, result.recoveryKeyText!, sealedOf(server.state), served(server.state), c.opts))).toBe("IdentityMismatchError");
        expect(server.state.devices.size).toBe(devicesBefore);
        expect(await getLocalDevice(c.dev.store, U)).toBeUndefined();
    });

    test("clé de récupération après rotation : un appareil neuf obtient aussi l'archive", async () => {
        const { server, a } = await createAccount();
        const result = await rotateIdentity(a.dev, [], async () => sealedOf(server.state), a.ctx);
        const c = device(server.api, "2222");
        const keys = await recoverWithKey(c.dev, result.recoveryKeyText!, sealedOf(server.state), served(server.state), c.opts);
        expect(keys.archivedKeys.length).toBe(1);
    });
});

