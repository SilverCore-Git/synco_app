import { describe, expect, test } from "bun:test";
import {
    E2eeV4Error, answerLinkRequest, completeLink, createDeviceEnvelope, createLinkRequest, createRecoveryEnvelope,
    formatRecoveryKey, generateAccountKeyBytes, generateDeviceId, generateDeviceKeyBytes, generateDeviceKeyPair, generateRecoveryKeyBytes,
    importAccountKey, generateLinkSecret, formatLinkSecret, parseLinkSecret, signDeviceCertificate, verifyDeviceCertificate, openDeviceEnvelope, openDevicePrivateKey, openIdentityKey, openRecoveryEnvelope, parseRecoveryKey, sealDevicePrivateKey, sealIdentityKey,
} from "./e2eeV4";

const U = "user-1";

describe("e2eeV4 — clés d'identité enveloppées par AK", () => {
    test("aller-retour, mêmes octets PKCS#8 (migration sans perte)", async () => {
        const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
        const ak = await importAccountKey(generateAccountKeyBytes());
        const sealed = await sealIdentityKey(ak, "sign", U, pkcs8);
        expect(new Uint8Array(await openIdentityKey(ak, "sign", U, sealed))).toEqual(new Uint8Array(pkcs8));
    });

    test("liée à l'usage et à l'utilisateur : échange refusé", async () => {
        const ak = await importAccountKey(generateAccountKeyBytes());
        const sealed = await sealIdentityKey(ak, "rsa", U, new Uint8Array([1, 2, 3]));
        await expect(openIdentityKey(ak, "sign", U, sealed)).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(openIdentityKey(ak, "rsa", "autre", sealed)).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(openIdentityKey(await importAccountKey(generateAccountKeyBytes()), "rsa", U, sealed)).rejects.toBeInstanceOf(E2eeV4Error);
    });
});

describe("e2eeV4 — appareil : paire ECDH, DK et enveloppe d'AK", () => {
    async function newDevice() {
        const dk = generateDeviceKeyBytes(), id = generateDeviceId();
        const pair = await generateDeviceKeyPair();
        const sealed = await sealDevicePrivateKey(dk, id, pair.privateKeyPkcs8);
        return { dk, id, publicKey: pair.publicKey, sealed };
    }

    test("n'importe quel appareil enveloppe AK pour un autre ; seul celui-ci l'ouvre (rotation sans DK)", async () => {
        const dev = await newDevice(), ak = generateAccountKeyBytes();
        const env = await createDeviceEnvelope(dev.publicKey, ak, U, dev.id);
        const priv = await openDevicePrivateKey(dev.dk, dev.id, dev.sealed);
        expect(await openDeviceEnvelope(priv, dev.publicKey, env, U, dev.id)).toEqual(ak);
    });

    test("clé privée scellée sous DK : mauvaise DK ou autre appareil refusés", async () => {
        const dev = await newDevice();
        await expect(openDevicePrivateKey(generateDeviceKeyBytes(), dev.id, dev.sealed)).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(openDevicePrivateKey(dev.dk, generateDeviceId(), dev.sealed)).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("enveloppe d'un autre appareil, d'un autre utilisateur ou altérée : refus", async () => {
        const a = await newDevice(), b = await newDevice(), ak = generateAccountKeyBytes();
        const env = await createDeviceEnvelope(a.publicKey, ak, U, a.id);
        const privA = await openDevicePrivateKey(a.dk, a.id, a.sealed);
        const privB = await openDevicePrivateKey(b.dk, b.id, b.sealed);
        await expect(openDeviceEnvelope(privB, b.publicKey, env, U, b.id)).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(openDeviceEnvelope(privA, a.publicKey, env, "autre", a.id)).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(openDeviceEnvelope(privA, a.publicKey, env, U, b.id)).rejects.toBeInstanceOf(E2eeV4Error);
        const [eph, blob] = env.split(".");
        const flipped = blob.slice(0, -4) + (blob.endsWith("AAAA") ? "BBBB" : "AAAA");
        await expect(openDeviceEnvelope(privA, a.publicKey, `${eph}.${flipped}`, U, a.id)).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(openDeviceEnvelope(privA, a.publicKey, "x", U, a.id)).rejects.toBeInstanceOf(E2eeV4Error);
    });
});

describe("e2eeV4 — clé de récupération", () => {
    test("format lisible, aller-retour, tolérant à la saisie", async () => {
        const rk = generateRecoveryKeyBytes();
        const text = await formatRecoveryKey(rk);
        expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){13}[0-9A-HJKMNP-TV-Z]{4}$/);
        expect(await parseRecoveryKey(text)).toEqual(rk);
        expect(await parseRecoveryKey(text.toLowerCase().replace(/-/g, " "))).toEqual(rk);
        expect(await parseRecoveryKey(text.replace(/0/g, "o").replace(/1/g, "l"))).toEqual(rk);
    });

    test("faute de frappe détectée par la somme de contrôle", async () => {
        const text = await formatRecoveryKey(generateRecoveryKeyBytes());
        const alt = text[0] === "2" ? "3" : "2";
        await expect(parseRecoveryKey(alt + text.slice(1))).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(parseRecoveryKey(text.slice(0, -2))).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("enveloppe de récupération : bonne clé seulement, liée à l'utilisateur", async () => {
        const rk = generateRecoveryKeyBytes(), ak = generateAccountKeyBytes();
        const env = await createRecoveryEnvelope(rk, ak, U);
        expect(await openRecoveryEnvelope(rk, env, U)).toEqual(ak);
        await expect(openRecoveryEnvelope(generateRecoveryKeyBytes(), env, U)).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(openRecoveryEnvelope(rk, env, "autre")).rejects.toBeInstanceOf(E2eeV4Error);
    });
});

describe("e2eeV4 — liaison d'un nouvel appareil", () => {
    test("AK transmise, même code de vérification des deux côtés", async () => {
        const ak = generateAccountKeyBytes();
        const request = await createLinkRequest();
        const answer = await answerLinkRequest(request.publicKey, ak, U, request.requestId, request.linkSecret);
        const done = await completeLink(request, answer, U);
        expect(done.akBytes).toEqual(ak);
        expect(done.sas).toBe(answer.sas);
        expect(done.sas).toMatch(/^\d{3} \d{3}$/);
    });

    test("secret de liaison : format lisible, aller-retour, tolérant à la saisie, faute détectée", async () => {
        const secret = generateLinkSecret();
        const text = await formatLinkSecret(secret);
        expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);
        expect(await parseLinkSecret(text)).toEqual(secret);
        expect(await parseLinkSecret(text.toLowerCase().replace(/-/g, " "))).toEqual(secret);
        const alt = text[0] === "2" ? "3" : "2";
        await expect(parseLinkSecret(alt + text.slice(1))).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(parseLinkSecret(text.slice(0, -4))).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("serveur actif SANS le secret : ne peut ni fabriquer une enveloppe acceptée ni ouvrir celle d'un autre", async () => {
        const request = await createLinkRequest();
        // il connaît les deux clés publiques et l'identifiant, mais pas le secret
        const forged = await answerLinkRequest(request.publicKey, generateAccountKeyBytes(), U, request.requestId, generateLinkSecret());
        await expect(completeLink(request, forged, U)).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("serveur qui substitue la clé du nouvel appareil : l'appareil connecté chiffre pour lui, mais sans le secret il n'obtient pas AK", async () => {
        const ak = generateAccountKeyBytes();
        const real = await createLinkRequest();
        const attacker = await createLinkRequest(); // sa propre paire, son propre secret
        const answer = await answerLinkRequest(attacker.publicKey, ak, U, real.requestId, real.linkSecret);
        // l'attaquant tente d'ouvrir avec sa clé privée mais un secret deviné
        await expect(completeLink({ ...attacker, requestId: real.requestId }, answer, U)).rejects.toBeInstanceOf(E2eeV4Error);
        // et le vrai appareil ne peut pas l'ouvrir non plus (mauvaise clé)
        await expect(completeLink(real, answer, U)).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("secret erroné côté appareil connecté : enveloppe refusée", async () => {
        const request = await createLinkRequest();
        const answer = await answerLinkRequest(request.publicKey, generateAccountKeyBytes(), U, request.requestId, generateLinkSecret());
        await expect(completeLink(request, answer, U)).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("demande liée à son identifiant et à l'utilisateur", async () => {
        const ak = generateAccountKeyBytes();
        const request = await createLinkRequest();
        const answer = await answerLinkRequest(request.publicKey, ak, U, request.requestId, request.linkSecret);
        await expect(completeLink(request, answer, "autre")).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(completeLink({ ...request, requestId: crypto.randomUUID() }, answer, U)).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("clé publique ou secret invalides refusés", async () => {
        const secret = generateLinkSecret();
        await expect(answerLinkRequest({ kty: "RSA" } as any, generateAccountKeyBytes(), U, "r", secret)).rejects.toBeInstanceOf(E2eeV4Error);
        const request = await createLinkRequest();
        await expect(answerLinkRequest(request.publicKey, generateAccountKeyBytes(), U, "r", new Uint8Array(4))).rejects.toBeInstanceOf(E2eeV4Error);
    });
});

describe("e2eeV4 — certificat d'appareil", () => {
    async function identity() {
        const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        return { priv: pair.privateKey, pub: await crypto.subtle.exportKey("jwk", pair.publicKey) };
    }

    test("signé par l'identité, vérifié avec sa clé publique", async () => {
        const id = await identity(), dev = await generateDeviceKeyPair(), deviceId = generateDeviceId();
        const cert = await signDeviceCertificate(id.priv, U, deviceId, "ios", dev.publicKey);
        expect(await verifyDeviceCertificate(id.pub, cert, U, deviceId, "ios", dev.publicKey)).toBe(true);
    });

    test("clé d'appareil substituée par le serveur, autre appareil, autre plateforme ou autre utilisateur : refusés", async () => {
        const id = await identity(), dev = await generateDeviceKeyPair(), evil = await generateDeviceKeyPair(), deviceId = generateDeviceId();
        const cert = await signDeviceCertificate(id.priv, U, deviceId, "ios", dev.publicKey);
        expect(await verifyDeviceCertificate(id.pub, cert, U, deviceId, "ios", evil.publicKey)).toBe(false);
        expect(await verifyDeviceCertificate(id.pub, cert, U, generateDeviceId(), "ios", dev.publicKey)).toBe(false);
        expect(await verifyDeviceCertificate(id.pub, cert, U, deviceId, "android", dev.publicKey)).toBe(false);
        expect(await verifyDeviceCertificate(id.pub, cert, "autre", deviceId, "ios", dev.publicKey)).toBe(false);
    });

    test("certificat d'une autre identité, ou illisible : refusé", async () => {
        const id = await identity(), other = await identity(), dev = await generateDeviceKeyPair(), deviceId = generateDeviceId();
        const forged = await signDeviceCertificate(other.priv, U, deviceId, "web", dev.publicKey);
        expect(await verifyDeviceCertificate(id.pub, forged, U, deviceId, "web", dev.publicKey)).toBe(false);
        expect(await verifyDeviceCertificate(id.pub, "!!!", U, deviceId, "web", dev.publicKey)).toBe(false);
    });
});
