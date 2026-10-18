import { describe, expect, test } from "bun:test";
import { followIdentityChain, generateAccountKeyBytes, importAccountKey, openIdentityArchive, sealIdentityArchive, signIdentityTransition, type IdentityTransition } from "./e2eeV4";

const U = "user-1";
const ec = async () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const rsa = async () => (await crypto.subtle.generateKey({ name: "RSA-OAEP", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["encrypt", "decrypt"]));
const jwk = async (k: CryptoKey) => crypto.subtle.exportKey("jwk", k);

async function step(from: CryptoKeyPair, seq: number, signer = from.privateKey) {
    const next = await ec();
    const pub = (await rsa()).publicKey;
    const t = await signIdentityTransition(signer, U, seq, await jwk(from.publicKey), await jwk(pub), await jwk(next.publicKey));
    return { next, t };
}

describe("chaîne de transitions d'identité", () => {
    test("suivie depuis la clé épinglée jusqu'à la dernière identité", async () => {
        const k0 = await ec();
        const a = await step(k0, 0);
        const b = await step(a.next, 1);
        const end = await followIdentityChain(U, await jwk(k0.publicKey), [b.t, a.t]);
        expect(end).toEqual({ publicKey: b.t.newPublicKey, publicSignKey: b.t.newPublicSignKey });
    });

    test("maillon signé par une autre clé, autre utilisateur ou rang modifié : ignoré", async () => {
        const k0 = await ec();
        const intruder = await ec();
        const forged = await step(k0, 0, intruder.privateKey);
        expect(await followIdentityChain(U, await jwk(k0.publicKey), [forged.t])).toBeNull();
        const good = await step(k0, 0);
        expect(await followIdentityChain("user-2", await jwk(k0.publicKey), [good.t])).toBeNull();
        expect(await followIdentityChain(U, await jwk(k0.publicKey), [{ ...good.t, seq: 3 } as IdentityTransition])).toBeNull();
        // chaîne ne partant pas de la clé épinglée
        expect(await followIdentityChain(U, await jwk(intruder.publicKey), [good.t])).toBeNull();
    });

    test("archive : aller-retour sous AK, liée à l'utilisateur", async () => {
        const ak = await importAccountKey(generateAccountKeyBytes());
        const items = [crypto.getRandomValues(new Uint8Array(50)), crypto.getRandomValues(new Uint8Array(60))];
        const sealed = await sealIdentityArchive(ak, U, items);
        expect(await openIdentityArchive(ak, U, sealed)).toEqual(items);
        await expect(openIdentityArchive(ak, "user-2", sealed)).rejects.toThrow();
    });
});

import { actionProofMessage, stableStringify } from "./e2eeV4";

describe("preuve de possession de l'identité (V4A1)", () => {
    test("JSON stable et message identiques à synco_api (vecteur figé)", async () => {
        expect(stableStringify({ b: [2, { d: 1, c: undefined, a: "x" }], a: null, proof: "p" })).toBe('{"a":null,"b":[2,{"a":"x","d":1}],"proof":"p"}');
        // Même vecteur que synco_api (security/v4-proof-vector.test.ts) : toute divergence casse l'interopérabilité.
        expect(await actionProofMessage("u1", "rotate", "SEALED", { z: 1, a: [1, 2], proof: "ignored" }))
            .toBe("synco-e4-proof|u1|rotate|2OKD2VnXWQNiCehoyksY+wMGu+nwTBNSZ+ARMa2lZsw=|YDtxW4uHng0daBbeos3jsiQvIUkytfn+YGxT46AdEEI=");
    });
});
