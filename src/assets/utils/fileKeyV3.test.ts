import { describe, expect, test } from "bun:test";
import { createChunkedFileKey, openChunkedFileKey } from "./chunkedCrypto";
import { decryptChunk, encryptChunk } from "./chunkedCryptoCore";
import { FileSubstitutedError, parseFileKeyV3 } from "./fileKeyV3";
import { unwrapFileKey } from "./crypto";

const newKek = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
const manifest = (name: string) => ({ name, mime: "application/pdf", size: 5 });
const data = () => new TextEncoder().encode("hello");

describe("format de fichier v3 (FC11)", () => {
    test("aller-retour : DEK, manifeste et morceau", async () => {
        const kek = await newKek();
        const k = await createChunkedFileKey(kek, manifest("a.pdf"));
        const cipher = await encryptChunk(k.fileKey, k.noncePrefix, 0, true, data(), k.fileUid);
        const opened = await openChunkedFileKey(k.encryptedFileKey, kek, "a.pdf");
        expect(opened.manifest).toEqual({ v: 3, ...manifest("a.pdf") });
        const plain = await decryptChunk(opened.fileKey, k.noncePrefix, 0, true, cipher, opened.fileUid);
        expect(new TextDecoder().decode(plain)).toBe("hello");
    });

    test("un morceau v3 d'un autre fileUid est rejeté", async () => {
        const kek = await newKek();
        const a = await createChunkedFileKey(kek, manifest("a.pdf"));
        const cipher = await encryptChunk(a.fileKey, a.noncePrefix, 0, true, data(), a.fileUid);
        const other = crypto.getRandomValues(new Uint8Array(16));
        await expect(decryptChunk(a.fileKey, a.noncePrefix, 0, true, cipher, other)).rejects.toThrow();
        await expect(decryptChunk(a.fileKey, a.noncePrefix, 0, true, cipher)).rejects.toThrow();
    });

    test("fileUid altéré dans encryptedFileKey : DEK et manifeste refusés", async () => {
        const kek = await newKek();
        const k = await createChunkedFileKey(kek, manifest("a.pdf"));
        const parts = k.encryptedFileKey.split(":");
        const forged = crypto.getRandomValues(new Uint8Array(16));
        parts[1] = btoa(String.fromCharCode(...forged));
        await expect(openChunkedFileKey(parts.join(":"), kek)).rejects.toThrow();
    });

    test("échange de fichiers par le serveur : nom différent → FileSubstitutedError", async () => {
        const kek = await newKek();
        const draft = await createChunkedFileKey(kek, manifest("brouillon.pdf"));
        await expect(openChunkedFileKey(draft.encryptedFileKey, kek, "contrat_signe.pdf")).rejects.toBeInstanceOf(FileSubstitutedError);
    });

    test("mauvaise KEK : refus", async () => {
        const k = await createChunkedFileKey(await newKek(), manifest("a.pdf"));
        await expect(openChunkedFileKey(k.encryptedFileKey, await newKek())).rejects.toThrow();
    });

    test("unwrapFileKey (chemin support) lit aussi le format v3", async () => {
        const kek = await newKek();
        const k = await createChunkedFileKey(kek, manifest("a.pdf"));
        expect((await unwrapFileKey(k.encryptedFileKey, kek)).byteLength).toBe(32);
        expect(parseFileKeyV3(k.encryptedFileKey).fileUid).toEqual(k.fileUid);
    });

    test("fichier ancien format (sans manifeste) toujours lisible", async () => {
        const kek = await newKek();
        const raw = crypto.getRandomValues(new Uint8Array(32));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw));
        const legacy = btoa(String.fromCharCode(...iv, ...ct));
        const opened = await openChunkedFileKey(legacy, kek, "x.pdf");
        expect(opened.manifest).toBeUndefined();
        expect(opened.fileUid).toBeUndefined();
    });
});
