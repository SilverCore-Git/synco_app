import { describe, expect, test } from "bun:test";
import {
    E2eeV4Error, answerLinkRequest, completeLink, createDeviceEnvelope, createLinkRequest, createRecoveryEnvelope,
    formatRecoveryKey, generateAccountKeyBytes, generateDeviceId, generateDeviceKeyBytes, generateRecoveryKeyBytes,
    importAccountKey, openDeviceEnvelope, openIdentityKey, openRecoveryEnvelope, parseRecoveryKey, sealIdentityKey,
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

describe("e2eeV4 — enveloppe d'appareil", () => {
    test("aller-retour", async () => {
        const dk = generateDeviceKeyBytes(), ak = generateAccountKeyBytes(), id = generateDeviceId();
        const env = await createDeviceEnvelope(dk, ak, U, id);
        expect(await openDeviceEnvelope(dk, env, U, id)).toEqual(ak);
    });

    test("mauvaise DK, autre appareil, autre utilisateur : refus", async () => {
        const dk = generateDeviceKeyBytes(), ak = generateAccountKeyBytes(), id = generateDeviceId();
        const env = await createDeviceEnvelope(dk, ak, U, id);
        await expect(openDeviceEnvelope(generateDeviceKeyBytes(), env, U, id)).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(openDeviceEnvelope(dk, env, U, generateDeviceId())).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(openDeviceEnvelope(dk, env, "autre", id)).rejects.toBeInstanceOf(E2eeV4Error);
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
        const answer = await answerLinkRequest(request.publicKey, ak, U, request.requestId);
        const done = await completeLink(request, answer, U);
        expect(done.akBytes).toEqual(ak);
        expect(done.sas).toBe(answer.sas);
        expect(done.sas).toMatch(/^\d{3} \d{3}$/);
    });

    test("le serveur substitue sa clé publique de réponse : AK non obtenue", async () => {
        const ak = generateAccountKeyBytes();
        const request = await createLinkRequest();
        await answerLinkRequest(request.publicKey, ak, U, request.requestId);
        const attacker = await createLinkRequest();
        const forged = await answerLinkRequest(request.publicKey, generateAccountKeyBytes(), U, request.requestId);
        // enveloppe de l'attaquant (autre AK) sous SA propre clé éphémère ≠ celle du vrai répondeur
        const swapped = { responderPublicKey: attacker.publicKey, envelope: forged.envelope };
        await expect(completeLink(request, swapped, U)).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("le serveur substitue la clé du nouvel appareil (saisie manuelle) : codes différents", async () => {
        const ak = generateAccountKeyBytes();
        const real = await createLinkRequest();
        const attacker = await createLinkRequest();
        // l'appareil connecté répond à la clé de l'attaquant, le vrai appareil reçoit la réponse
        const answer = await answerLinkRequest(attacker.publicKey, ak, U, real.requestId);
        await expect(completeLink(real, answer, U)).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("relais actif du serveur (saisie manuelle) : il obtient AK mais les deux codes diffèrent", async () => {
        const ak = generateAccountKeyBytes();
        const real = await createLinkRequest();
        const attacker = await createLinkRequest();
        // 1) il remplace la clé du nouvel appareil par la sienne auprès de l'appareil connecté
        const answerToAttacker = await answerLinkRequest(attacker.publicKey, ak, U, real.requestId);
        const stolen = await completeLink({ ...attacker, requestId: real.requestId }, answerToAttacker, U);
        expect(stolen.akBytes).toEqual(ak);
        // 2) il répond au vrai appareil avec sa propre clé éphémère
        const answerToReal = await answerLinkRequest(real.publicKey, stolen.akBytes, U, real.requestId);
        const done = await completeLink(real, answerToReal, U);
        // le code affiché par l'appareil connecté ne correspond pas à celui du nouvel appareil
        expect(done.sas).not.toBe(answerToAttacker.sas);
    });

    test("demande liée à son identifiant et à l'utilisateur", async () => {
        const ak = generateAccountKeyBytes();
        const request = await createLinkRequest();
        const answer = await answerLinkRequest(request.publicKey, ak, U, request.requestId);
        await expect(completeLink(request, answer, "autre")).rejects.toBeInstanceOf(E2eeV4Error);
        await expect(completeLink({ ...request, requestId: crypto.randomUUID() }, answer, U)).rejects.toBeInstanceOf(E2eeV4Error);
    });

    test("clé publique invalide refusée", async () => {
        await expect(answerLinkRequest({ kty: "RSA" } as any, generateAccountKeyBytes(), U, "r")).rejects.toBeInstanceOf(E2eeV4Error);
    });
});
