import { describe, expect, test } from "bun:test";
import { canonicalRuntimeEcJwk } from "./runtimeCert";
import {
    delegationWrapHash, openDelegationEntry, openDelegationWrap, parseRt1Creator, rt1CreatorId, sealDelegationEntry,
    sealDelegationWrap, signMandate, signRt1Envelope, verifyMandate, verifyMandateOfflineFromWrapHash, verifyRt1Envelope, type DelegationContext,
} from "./runtimeDelegation";

const ctx: DelegationContext = {
    userId: "66666666-7777-4888-9999-aaaaaaaaaaaa", orgId: "cm3orgexample0000000000001", runtimeId: "7d3f2c1e-8a4b-4c6d-9e0f-1a2b3c4d5e6f",
    delegationId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", scope: "org", iat: 1795000000, exp: 1795604800,
};
const fprHex = "f605b872881487a9b37f903d997ff879b94c5718856a5e729587b0e39f8faf2b";
const ecdh = () => crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const ecdsa = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pubJwk = async (k: CryptoKey) => canonicalRuntimeEcJwk(await crypto.subtle.exportKey("jwk", k));
const rand = () => crypto.getRandomValues(new Uint8Array(32));

describe("runtimeDelegation — enveloppe de tête et mandat (03 §3, §4)", () => {
    test("seul le runtime visé, avec le même contexte, ouvre l'enveloppe", async () => {
        const kex = await ecdh(), other = await ecdh();
        const dk = rand();
        const wrap = await sealDelegationWrap(ctx, await pubJwk(kex.publicKey), dk);
        expect(await openDelegationWrap(ctx, kex.privateKey, await pubJwk(kex.publicKey), wrap)).toEqual(dk);
        await expect(openDelegationWrap(ctx, other.privateKey, await pubJwk(other.publicKey), wrap)).rejects.toMatchObject({ code: "delegation_unusable" });
        for (const patch of [{ userId: "u2" }, { orgId: "o2" }, { runtimeId: "r2" }, { exp: ctx.exp + 1 }]) {
            await expect(openDelegationWrap({ ...ctx, ...patch }, kex.privateKey, await pubJwk(kex.publicKey), wrap)).rejects.toMatchObject({ code: "delegation_unusable" });
        }
    });

    test("le mandat engage l'enveloppe, l'empreinte et la clé de l'utilisateur", async () => {
        const kex = await ecdh(), user = await ecdsa(), other = await ecdsa();
        const wrap = await sealDelegationWrap(ctx, await pubJwk(kex.publicKey), rand());
        const sig = await signMandate(user.privateKey, ctx, fprHex, wrap);
        const hash = await delegationWrapHash(wrap);
        expect(await verifyMandate(await pubJwk(user.publicKey), ctx, fprHex, wrap, sig)).toBe(true);
        expect(await verifyMandateOfflineFromWrapHash(await pubJwk(user.publicKey), ctx, fprHex, hash, sig)).toBe(true);
        expect(await verifyMandate(await pubJwk(other.publicKey), ctx, fprHex, wrap, sig)).toBe(false);
        expect(await verifyMandate(await pubJwk(user.publicKey), ctx, "0".repeat(64), wrap, sig)).toBe(false);
        // Enveloppe forgée par l'API vers kex (DK' connue) avec le mandat authentique : refusée.
        const forged = await sealDelegationWrap(ctx, await pubJwk(kex.publicKey), rand());
        expect(await verifyMandate(await pubJwk(user.publicKey), ctx, fprHex, forged, sig)).toBe(false);
    });
});

describe("runtimeDelegation — entrées et rt1 (03 §5, §10)", () => {
    test("entrée liée à DK, à la délégation et à ses métadonnées ; kinds hors liste refusés", async () => {
        const dk = rand(), key = rand();
        const meta = { kind: "thread" as const, ref: "cm3thread", version: 1 };
        const ciphertext = await sealDelegationEntry(dk, ctx, meta, key);
        expect(await openDelegationEntry(dk, ctx, { ...meta, ciphertext })).toEqual(key);
        await expect(openDelegationEntry(rand(), ctx, { ...meta, ciphertext })).rejects.toMatchObject({ code: "entry_unusable" });
        await expect(openDelegationEntry(dk, { ...ctx, delegationId: "d2" }, { ...meta, ciphertext })).rejects.toMatchObject({ code: "entry_unusable" });
        for (const kind of ["dm", "support", "ai", "org", "account"]) {
            await expect(openDelegationEntry(dk, ctx, { ...meta, kind, ciphertext })).rejects.toMatchObject({ code: "entry_unusable" });
        }
    });

    test("rt1 : créateur, commitment et signature csk", async () => {
        const csk = await ecdsa(), raw = rand();
        expect(parseRt1Creator(rt1CreatorId(ctx.delegationId))).toBe(ctx.delegationId);
        expect(parseRt1Creator("user-1")).toBeNull();
        const env = await signRt1Envelope(csk.privateKey, raw.slice().buffer, "thread:t1", 1, ctx.delegationId);
        await verifyRt1Envelope(await pubJwk(csk.publicKey), raw.slice().buffer, { ctx: "thread:t1", version: 1, ...env }, ctx.delegationId);
        await expect(verifyRt1Envelope(await pubJwk(csk.publicKey), rand().buffer, { ctx: "thread:t1", version: 1, ...env }, ctx.delegationId)).rejects.toMatchObject({ code: "key_commitment_mismatch" });
        await expect(verifyRt1Envelope(await pubJwk(csk.publicKey), raw.slice().buffer, { ctx: "thread:t1", version: 1, ...env }, "d2")).rejects.toMatchObject({ code: "key_bad_signature" });
    });
});
