import { describe, expect, test } from "bun:test";
import { decryptFileLocal, encryptFileLocal, unwrapFileKey, wrapFileKey } from "./crypto";

const newKek = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

describe("clé de fichier et format v1", () => {
    test("wrapFileKey / unwrapFileKey aller-retour", async () => {
        const kek = await newKek();
        const raw = crypto.getRandomValues(new Uint8Array(32));
        const wrapped = await wrapFileKey(raw.buffer, kek);
        expect(Array.from(new Uint8Array(await unwrapFileKey(wrapped, kek)))).toEqual(Array.from(raw));
        await expect(unwrapFileKey(wrapped, await newKek())).rejects.toThrow();
    });

    test("encryptFileLocal / decryptFileLocal inchangés", async () => {
        const kek = await newKek();
        const plain = crypto.getRandomValues(new Uint8Array(5000));
        const { encryptedBlob, encryptedFileKey, iv } = await encryptFileLocal(plain.buffer, kek);
        const out = await decryptFileLocal(await encryptedBlob.arrayBuffer(), encryptedFileKey, iv, kek);
        expect(Array.from(new Uint8Array(out))).toEqual(Array.from(plain));
    });

    test("ancienne disposition (clé emballée avec l'iv du fichier) toujours lisible", async () => {
        const kek = await newKek();
        const plain = crypto.getRandomValues(new Uint8Array(300));
        const fileKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, fileKey, plain);
        const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, await crypto.subtle.exportKey("raw", fileKey));
        const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
        const out = await decryptFileLocal(cipher, b64(wrapped), b64(iv), kek);
        expect(Array.from(new Uint8Array(out))).toEqual(Array.from(plain));
    });
});
