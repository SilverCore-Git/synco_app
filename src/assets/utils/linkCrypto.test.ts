import { describe, expect, test } from "bun:test";
import {
    authHashOf, buildLinkUrl, deriveLinkKeys, derivePasswordKey, fileRefOf, newLinkId, newLinkSecret, newPasswordSalt,
    openItemMeta, parseLinkLocation, publicKeyFingerprint, safeFileName, sealItemMeta, unwrapDekForLink,
    unwrapSecretForRecipient, unwrapSecretFromSpace, wrapDekForLink, wrapSecretForRecipient,
    wrapSecretForSpace, LINK_PASSWORD_ITERATIONS,
} from "./linkCrypto";

const rawDek = () => crypto.getRandomValues(new Uint8Array(32));

async function encryptWith(key: CryptoKey) {
    const iv = new Uint8Array(12);
    return new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("contenu")));
}

async function dekKey(raw: Uint8Array) {
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
}

describe("dérivation", () => {
    test("même secret, même lien : mêmes clés ; autre lien : autres clés", async () => {
        const id = newLinkId();
        const secret = newLinkSecret();
        const a = await deriveLinkKeys(id, secret);
        const b = await deriveLinkKeys(id, secret);
        const other = await deriveLinkKeys(newLinkId(), secret);
        expect(a.auth).toBe(b.auth);
        expect(other.auth).not.toBe(a.auth);
        expect(a.auth).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(await authHashOf(a.auth)).toMatch(/^[0-9a-f]{64}$/);
    });

    test("le mot de passe change la clé et la preuve", async () => {
        const id = newLinkId();
        const secret = newLinkSecret();
        const params = { salt: newPasswordSalt(), iterations: LINK_PASSWORD_ITERATIONS };
        const good = await deriveLinkKeys(id, secret, await derivePasswordKey("correct horse", params));
        const bad = await deriveLinkKeys(id, secret, await derivePasswordKey("wrong horse", params));
        const none = await deriveLinkKeys(id, secret);
        expect(good.auth).not.toBe(bad.auth);
        expect(good.auth).not.toBe(none.auth);

        const raw = rawDek();
        const wrapped = await wrapDekForLink(raw, good.kek, id, "file:x");
        await expect(unwrapDekForLink(wrapped, bad.kek, id, "file:x")).rejects.toThrow();
    });

    test("itérations trop faibles refusées", async () => {
        await expect(derivePasswordKey("x", { salt: newPasswordSalt(), iterations: 1000 })).rejects.toThrow();
    });
});

describe("DEK et métadonnées", () => {
    test("aller-retour : la DEK rouverte déchiffre ce que l'originale chiffre", async () => {
        const id = newLinkId();
        const { kek } = await deriveLinkKeys(id, newLinkSecret());
        const raw = rawDek();
        const ciphertext = await encryptWith(await dekKey(raw));
        const opened = await unwrapDekForLink(await wrapDekForLink(raw, kek, id, "uid-a"), kek, id, "uid-a");
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(12) }, opened, ciphertext);
        expect(new TextDecoder().decode(plain)).toBe("contenu");
    });

    test("une DEK ne se transplante ni sur un autre fichier ni sur un autre lien", async () => {
        const id = newLinkId();
        const secret = newLinkSecret();
        const { kek } = await deriveLinkKeys(id, secret);
        const wrapped = await wrapDekForLink(rawDek(), kek, id, "uid-a");
        await expect(unwrapDekForLink(wrapped, kek, id, "uid-b")).rejects.toThrow();
        const otherId = newLinkId();
        const other = await deriveLinkKeys(otherId, secret);
        await expect(unwrapDekForLink(wrapped, other.kek, otherId, "uid-a")).rejects.toThrow();
    });

    test("métadonnées scellées et liées au fichier", async () => {
        const id = newLinkId();
        const { kek } = await deriveLinkKeys(id, newLinkSecret());
        const meta = { name: "contrat.pdf", mime: "application/pdf", size: 1234, path: "Juridique" };
        const sealed = await sealItemMeta(meta, kek, id, "uid-a");
        expect(await openItemMeta(sealed, kek, id, "uid-a")).toEqual(meta);
        await expect(openItemMeta(sealed, kek, id, "uid-b")).rejects.toThrow();
    });

    test("référence de fichier : fileUid v3, sinon l'identifiant", () => {
        expect(fileRefOf({ id: "f1", encryptedFileKey: "v3:QUJD:x:y" })).toBe("QUJD");
        expect(fileRefOf({ id: "f1", encryptedFileKey: "legacy" })).toBe("file:f1");
    });
});

describe("secret du lien", () => {
    test("espace : S ‖ P rouverts, liés au lien", async () => {
        const spaceKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        const id = newLinkId();
        const secret = newLinkSecret();
        const p = crypto.getRandomValues(new Uint8Array(32));
        const wrapped = await wrapSecretForSpace(spaceKey, id, secret, p);
        const opened = await unwrapSecretFromSpace(wrapped, spaceKey, id);
        expect(Array.from(opened.secret)).toEqual(Array.from(secret));
        expect(Array.from(opened.passwordKey!)).toEqual(Array.from(p));
        await expect(unwrapSecretFromSpace(wrapped, spaceKey, newLinkId())).rejects.toThrow();

        const noPassword = await unwrapSecretFromSpace(await wrapSecretForSpace(spaceKey, id, secret), spaceKey, id);
        expect(noPassword.passwordKey).toBeNull();
    });

    test("destinataire : RSA-OAEP lié au lien et au compte", async () => {
        const pair = await crypto.subtle.generateKey(
            { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
            true,
            ["encrypt", "decrypt"],
        );
        const jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.publicKey));
        const id = newLinkId();
        const secret = newLinkSecret();
        const wrapped = await wrapSecretForRecipient(secret, jwk, id, "user-1");
        expect(Array.from(await unwrapSecretForRecipient(wrapped, pair.privateKey, id, "user-1"))).toEqual(Array.from(secret));
        await expect(unwrapSecretForRecipient(wrapped, pair.privateKey, id, "user-2")).rejects.toThrow();
        await expect(unwrapSecretForRecipient(wrapped, pair.privateKey, newLinkId(), "user-1")).rejects.toThrow();
        expect(await publicKeyFingerprint(jwk)).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("URL", () => {
    test("le secret est dans le fragment et se relit", () => {
        const id = newLinkId();
        const secret = newLinkSecret();
        const url = new URL(buildLinkUrl("https://share.synco.one/", id, secret));
        expect(url.pathname).toBe(`/l/${id}`);
        const parsed = parseLinkLocation(url.pathname, url.hash);
        expect(parsed?.linkId).toBe(id);
        expect(Array.from(parsed!.secret!)).toEqual(Array.from(secret));
        expect(parseLinkLocation(`/l/${id}`, "")?.secret).toBeNull();
        expect(parseLinkLocation("/l/court", "")).toBeNull();
    });

    test("nom de fichier assaini", () => {
        expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
        expect(safeFileName("facture\u202egpj.exe")).toBe("facturegpj.exe");
        expect(safeFileName("CON.txt")).toBe("fichier_CON.txt");
        expect(safeFileName("...")).toBe("fichier_partage");
        expect(safeFileName("rapport final.pdf")).toBe("rapport final.pdf");
    });
});
