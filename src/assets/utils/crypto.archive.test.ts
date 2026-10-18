import { afterEach, describe, expect, test } from "bun:test";
import { archivedPrivateKeys, decryptThreadKeyWithRsa, lockSecurity, privateKey } from "./crypto";

const rsa = () => crypto.subtle.generateKey({ name: "RSA-OAEP", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, false, ["encrypt", "decrypt"]);
const sealFor = async (pub: CryptoKey) => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, raw))));
};

afterEach(() => lockSecurity());

describe("clés archivées après une rotation d'identité", () => {
    test("une clé scellée pour l'ancienne clé publique s'ouvre via l'archive", async () => {
        const [oldPair, newPair] = await Promise.all([rsa(), rsa()]);
        privateKey.value = newPair.privateKey;
        archivedPrivateKeys.value = [oldPair.privateKey];
        const key = await decryptThreadKeyWithRsa(await sealFor(oldPair.publicKey), privateKey.value);
        expect(key.algorithm.name).toBe("AES-GCM");
    });

    test("pas de repli pour une autre clé que l'identité courante ; verrouillage : archive vidée", async () => {
        const [oldPair, newPair, other] = await Promise.all([rsa(), rsa(), rsa()]);
        privateKey.value = newPair.privateKey;
        archivedPrivateKeys.value = [oldPair.privateKey];
        await expect(decryptThreadKeyWithRsa(await sealFor(oldPair.publicKey), other.privateKey)).rejects.toBeDefined();
        lockSecurity();
        expect(archivedPrivateKeys.value).toEqual([]);
    });
});
