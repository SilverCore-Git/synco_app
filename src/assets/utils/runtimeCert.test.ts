import { describe, expect, test } from "bun:test";
import {
    RuntimeFormatError, canonicalRuntimeEcJwk, canonicalRuntimeUrl, checkPairingCode, createChallengeRequest, formatPairingCode,
    fromB64u, parseCanonicalRuntimeEcJwk, respondChallenge, runtimeFingerprint, runtimeFingerprintHex, signRuntimeCertificate,
    toB64u, verifyChallengeResponse, verifyRuntimeCertificate, type RuntimeCertificate,
} from "./runtimeCert";

const ecdh = () => crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const ecdsa = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pubJwk = async (k: CryptoKey) => canonicalRuntimeEcJwk(await crypto.subtle.exportKey("jwk", k));

async function runtime() {
    const kex = await ecdh(), csk = await ecdsa();
    const keys = { sig: toB64u(crypto.getRandomValues(new Uint8Array(32))), kex: await pubJwk(kex.publicKey), csk: await pubJwk(csk.publicKey) };
    return { kex, csk, keys, runtimeId: crypto.randomUUID() };
}

const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof RuntimeFormatError ? e.code : "autre"));

describe("runtimeCert — empreinte et code d'appairage (01 §2)", () => {
    test("le code engage l'empreinte ; une autre empreinte est refusée", async () => {
        const a = await runtime(), b = await runtime();
        const fpr = await runtimeFingerprint(a.runtimeId, a.keys);
        const c = await formatPairingCode(fpr);
        expect(await code(checkPairingCode(c.toLowerCase(), fpr))).toBe("ok");
        expect(await code(checkPairingCode(c, await runtimeFingerprint(b.runtimeId, b.keys)))).toBe("pair_code_mismatch");
        expect(await code(checkPairingCode(c.slice(1), fpr))).toBe("pair_code_invalid");
    });

    test("l'empreinte change avec n'importe quelle clé", async () => {
        const a = await runtime(), b = await runtime();
        const base = await runtimeFingerprintHex(a.runtimeId, a.keys);
        expect(await runtimeFingerprintHex(a.runtimeId, { ...a.keys, kex: b.keys.kex })).not.toBe(base);
        expect(await runtimeFingerprintHex(a.runtimeId, { ...a.keys, csk: b.keys.csk })).not.toBe(base);
        expect(await runtimeFingerprintHex(a.runtimeId, { ...a.keys, sig: b.keys.sig })).not.toBe(base);
    });
});

describe("runtimeCert — encodages et URL", () => {
    test("b64u strict et JWK canonique", () => {
        expect(() => fromB64u("AB")).toThrow(RuntimeFormatError);
        expect(() => fromB64u("AA==")).toThrow(RuntimeFormatError);
        const canon = '{"crv":"P-256","kty":"EC","x":"1lqTl3yqPRsIGFL_V6eeRl8WYFdzBLrq1QXdOkhYnPM","y":"UBheiVNy32Ih6joTdVfkc_3bZ1XwW9UHw8Uz_OnJEoU"}';
        expect(parseCanonicalRuntimeEcJwk(canon)).toBe(canon);
        expect(() => parseCanonicalRuntimeEcJwk(JSON.stringify({ kty: "EC", ...JSON.parse(canon) }))).toThrow(RuntimeFormatError);
    });

    test("URL canonique", () => {
        expect(canonicalRuntimeUrl("HTTPS://Runtime.Example.com:443/")).toBe("https://runtime.example.com");
        expect(() => canonicalRuntimeUrl("http://localhost:8080")).toThrow(RuntimeFormatError);
        expect(canonicalRuntimeUrl("http://localhost:8080", { allowDevHttp: true })).toBe("http://localhost:8080");
    });
});

describe("runtimeCert — certificat et défi (01 §5, §6)", () => {
    test("certificat signé par l'admin ; tout champ modifié invalide la signature", async () => {
        const r = await runtime(), admin = await ecdsa(), other = await ecdsa();
        const cert: RuntimeCertificate = { orgId: "org1", runtimeId: r.runtimeId, url: "https://runtime.example.com", keys: r.keys, adminId: "admin1", issuedAt: 1795000000, serial: 1 };
        const sig = await signRuntimeCertificate(admin.privateKey, cert);
        const adminPub = await pubJwk(admin.publicKey);
        expect(await verifyRuntimeCertificate(adminPub, cert, sig)).toBe(true);
        expect(await verifyRuntimeCertificate(await pubJwk(other.publicKey), cert, sig)).toBe(false);
        expect(await verifyRuntimeCertificate(adminPub, { ...cert, url: "https://evil.example.com" }, sig)).toBe(false);
        await expect(verifyRuntimeCertificate(adminPub, { ...cert, serial: 0 }, sig)).rejects.toMatchObject({ code: "cert_invalid" });
    });

    test("défi : prouve kex_priv ET csk_priv", async () => {
        const r = await runtime(), impostor = await runtime();
        const fprHex = await runtimeFingerprintHex(r.runtimeId, r.keys);
        const { request, ephemeralPrivateKey } = await createChallengeRequest("delegate", "org1", "user1");
        const good = await respondChallenge(request, r.runtimeId, fprHex, r.kex.privateKey, r.csk.privateKey);
        expect(await verifyChallengeResponse(request, r.runtimeId, fprHex, ephemeralPrivateKey, r.keys, good)).toBe(true);
        const wrongKex = await respondChallenge(request, r.runtimeId, fprHex, impostor.kex.privateKey, r.csk.privateKey);
        expect(await verifyChallengeResponse(request, r.runtimeId, fprHex, ephemeralPrivateKey, r.keys, wrongKex)).toBe(false);
        const wrongCsk = await respondChallenge(request, r.runtimeId, fprHex, r.kex.privateKey, impostor.csk.privateKey);
        expect(await verifyChallengeResponse(request, r.runtimeId, fprHex, ephemeralPrivateKey, r.keys, wrongCsk)).toBe(false);
    });
});
