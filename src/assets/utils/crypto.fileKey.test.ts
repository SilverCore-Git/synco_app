import { describe, expect, test } from "bun:test";
import { unwrapFileKey, wrapFileKey } from "./crypto";

const newKek = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

describe("clé de fichier", () => {
    test("wrapFileKey / unwrapFileKey aller-retour", async () => {
        const kek = await newKek();
        const raw = crypto.getRandomValues(new Uint8Array(32));
        const wrapped = await wrapFileKey(raw.buffer, kek);
        expect(Array.from(new Uint8Array(await unwrapFileKey(wrapped, kek)))).toEqual(Array.from(raw));
        await expect(unwrapFileKey(wrapped, await newKek())).rejects.toThrow();
    });
});
