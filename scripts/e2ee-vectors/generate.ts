/**
 * Vecteurs croisés TS → Rust de la crate `synco-e2ee` (synco_ai_runtime/docs/plan/vectors/README.md §3).
 *
 *   export PATH=$HOME/.bun/bin:$PATH
 *   bun scripts/e2ee-vectors/generate.ts <dossier de sortie>
 *   (ex. ../synco_ai_runtime/crates/synco-e2ee/tests/vectors)
 *
 * Lancé avec bun, pas node : le générateur importe le code TS réel de l'app (alias `@/…`, imports
 * sans extension, `vue` via crypto.ts) que bun résout nativement, et n'utilise que WebCrypto
 * standard, comme les tests `bun test` existants.
 *
 * Tout passe par les fonctions de l'app (`e2eeV4.ts`, `keyEnvelope.ts`, `keyPinning.ts`,
 * `crypto.ts`, `runtimeCert.ts`, `runtimeDelegation.ts`) ; seuls IV, nonces et clés éphémères sont
 * figés (fixedRandom.ts). Les signatures ECDSA de WebCrypto ne sont pas déterministes : elles changent
 * à chaque exécution et sont des vecteurs « vérification seulement ». Quelques cas négatifs
 * (enveloppe mal formée, clair de mauvaise longueur, clair non UTF-8) sont fabriqués à la main, faute
 * de fonction de l'app capable de les produire : ils sont marqués `forged`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { assertQueuesDrained, importEcdhPrivate, importEcdsaPrivate, installFixedRandom, p256Jwk, queueEcdhKey, queueRandom } from './fixedRandom';

installFixedRandom();

const { user, openedOrg } = await import('@/assets/var');
const { privateSignKey, encryptAiField, decryptAiField } = await import('@/assets/utils/crypto');
const e2ee = await import('@/assets/utils/e2eeV4');
const { signKeyEnvelope, verifyKeyEnvelope, verifyKeyEnvelopeIfPresent } = await import('@/assets/utils/keyEnvelope');
const { keyCommitment } = await import('@/assets/utils/keyPinning');
const rc = await import('@/assets/utils/runtimeCert');
const rd = await import('@/assets/utils/runtimeDelegation');

type Ctx = import('@/assets/utils/runtimeDelegation').DelegationContext;
type Cert = import('@/assets/utils/runtimeCert').RuntimeCertificate;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const outDir = process.argv[2];
if (!outDir) {
    console.error('usage : bun scripts/e2ee-vectors/generate.ts <dossier de sortie>');
    process.exit(2);
}

const enc = new TextEncoder();
const fill = (byte: number, n = 32) => new Uint8Array(n).fill(byte);
const hex = rc.toHex;
const b64 = rc.toB64;
const b64u = rc.toB64u;

function check(cond: boolean, message: string): void {
    if (!cond) throw new Error(`générateur : ${message}`);
}

/** Code d'un refus (`RuntimeFormatError.code`), `ok` sinon. */
async function outcome(fn: () => Promise<unknown> | unknown): Promise<string> {
    try {
        await fn();
        return 'ok';
    } catch (e) {
        if (e instanceof rc.RuntimeFormatError) return e.code;
        return `exception:${(e as Error).name}`;
    }
}

/** P1363 (64 octets) → DER, pour le cas « signature DER ». */
function p1363ToDer(sig: Uint8Array): Uint8Array {
    const int = (b: Uint8Array) => {
        let i = 0;
        while (i < b.length - 1 && b[i] === 0) i++;
        let v = b.slice(i);
        if (v[0]! & 0x80) v = Uint8Array.from([0, ...v]);
        return Uint8Array.from([0x02, v.length, ...v]);
    };
    const r = int(sig.slice(0, 32)), s = int(sig.slice(32));
    return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}

function write(name: string, data: { [key: string]: Json }): void {
    mkdirSync(outDir!, { recursive: true });
    writeFileSync(join(outDir!, name), JSON.stringify(data, null, 2) + '\n');
    console.log(`écrit ${resolve(outDir!, name)}`);
}

// ---------------------------------------------------------------------------
// Identités et clés de test (valeurs de démonstration, docs/plan/exemples)
// ---------------------------------------------------------------------------

const runtimeId = '7d3f2c1e-8a4b-4c6d-9e0f-1a2b3c4d5e6f';
const orgId = 'cm3orgexample0000000000001';
const adminId = '11111111-2222-4333-8444-555555555555';
const userId = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const url = 'https://runtime.example.com';

const SCALAR = { kex: fill(0x22), csk: fill(0x33), admin: fill(0x44), user: fill(0x55), clientEph: fill(0x66), epk: fill(0x99), otherKex: fill(0x23), otherCsk: fill(0x34), otherUser: fill(0x56) };
const jwk = Object.fromEntries(Object.entries(SCALAR).map(([k, v]) => [k, p256Jwk(v).canonical])) as Record<keyof typeof SCALAR, string>;
const sigSeed = fill(0x11);
/** Clé publique Ed25519 brute d'une graine (comme docs/plan/exemples/exemples.mjs). */
const ed25519Pub = (seed: Uint8Array) => {
    const priv = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
    return String(createPublicKey(priv).export({ format: 'jwk' }).x);
};
const sigPub = ed25519Pub(sigSeed);
const keys = { sig: sigPub, kex: jwk.kex, csk: jwk.csk };
const otherSigPub = ed25519Pub(fill(0x12));

// ---------------------------------------------------------------------------
// 1. runtime-identity.json (01 §2, §3)
// ---------------------------------------------------------------------------

const fprInput = rc.runtimeFingerprintInput(runtimeId, keys);
const fpr = await rc.runtimeFingerprint(runtimeId, keys);
const fprHex = hex(fpr);
const code = await rc.formatPairingCode(fpr);
check(fprHex === 'f605b872881487a9b37f903d997ff879b94c5718856a5e729587b0e39f8faf2b', 'empreinte ≠ exemple de la spec');
check(code === 'YR2V-GWM8-2J3T-KCVZ-J0YS-JZZR-F459', 'code ≠ exemple de la spec');

// Une empreinte dont le code contient « 0 » et « 1 », pour les confusions O/0 et I/L/1.
let fprConfusable = fpr;
let codeConfusable = code;
for (let i = 0; !(codeConfusable.includes('0') && codeConfusable.includes('1')); i++) {
    fprConfusable = await rc.sha256(enc.encode(`synco-vector-${i}`));
    codeConfusable = await rc.formatPairingCode(fprConfusable);
}
const flipLast = (c: string) => c.slice(0, -1) + (c.endsWith('0') ? '2' : '0');

const pairingCases: Array<{ name: string; fprHex: string; input: string; expect: string }> = [
    { name: 'code exact', fprHex, input: code, expect: 'ok' },
    { name: 'minuscules et espaces au lieu des tirets', fprHex, input: code.toLowerCase().replace(/-/g, ' '), expect: 'ok' },
    { name: 'sans séparateur', fprHex, input: code.replace(/-/g, ''), expect: 'ok' },
    { name: 'O pour 0 et I pour 1', fprHex: hex(fprConfusable), input: codeConfusable.replace(/0/g, 'O').replace(/1/g, 'I'), expect: 'ok' },
    { name: 'L minuscule pour 1', fprHex: hex(fprConfusable), input: codeConfusable.replace(/1/g, 'l'), expect: 'ok' },
    { name: 'somme de contrôle fausse', fprHex, input: flipLast(code), expect: 'pair_code_invalid' },
    { name: 'un caractère de moins', fprHex, input: code.slice(0, -1), expect: 'pair_code_invalid' },
    { name: 'un caractère de plus', fprHex, input: code + '0', expect: 'pair_code_invalid' },
    { name: 'caractère hors alphabet (U)', fprHex, input: 'U' + code.slice(1), expect: 'pair_code_invalid' },
    { name: 'vide', fprHex, input: '', expect: 'pair_code_invalid' },
    { name: "code valide d'une autre empreinte", fprHex, input: codeConfusable, expect: 'pair_code_mismatch' },
];
for (const c of pairingCases) {
    const got = await outcome(async () => rc.checkPairingCode(c.input, Uint8Array.from(Buffer.from(c.fprHex, 'hex'))));
    check(got === c.expect, `appairage « ${c.name} » : ${got}`);
}

const long255 = 'https://runtime.example.com/' + 'a'.repeat(255 - 'https://runtime.example.com/'.length);
const urlCases: Array<{ name: string; input: string; allowDevHttp: boolean; expect: string; canonical?: string }> = [
    { name: 'majuscules, port 443 et / final', input: 'HTTPS://Runtime.Example.com:443/', allowDevHttp: false, expect: 'ok', canonical: 'https://runtime.example.com' },
    { name: 'déjà canonique', input: url, allowDevHttp: false, expect: 'ok', canonical: url },
    { name: 'port et chemin', input: 'https://runtime.example.com:8443/synco/', allowDevHttp: false, expect: 'ok', canonical: 'https://runtime.example.com:8443/synco' },
    { name: '255 caractères', input: long255, allowDevHttp: false, expect: 'ok', canonical: long255 },
    { name: '256 caractères', input: long255 + 'a', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'http hors drapeau de développement', input: 'http://runtime.example.com', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'http://localhost sans drapeau', input: 'http://localhost:8080', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'http://localhost avec drapeau', input: 'http://LOCALHOST:8080/', allowDevHttp: true, expect: 'ok', canonical: 'http://localhost:8080' },
    { name: 'http://127.0.0.1 avec drapeau', input: 'http://127.0.0.1:8080', allowDevHttp: true, expect: 'ok', canonical: 'http://127.0.0.1:8080' },
    { name: 'http://localhost sans port avec drapeau', input: 'http://localhost', allowDevHttp: true, expect: 'url_invalid' },
    { name: 'http vers un autre hôte avec drapeau', input: 'http://runtime.example.com:8080', allowDevHttp: true, expect: 'url_invalid' },
    { name: 'identifiants', input: 'https://user:pw@runtime.example.com', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'requête', input: 'https://runtime.example.com/?a=1', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'fragment', input: 'https://runtime.example.com/#x', allowDevHttp: false, expect: 'url_invalid' },
    { name: '| dans le chemin', input: 'https://runtime.example.com/a|b', allowDevHttp: false, expect: 'url_invalid' },
    { name: '% dans le chemin', input: 'https://runtime.example.com/a%20b', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'espace dans le chemin', input: 'https://runtime.example.com/a b', allowDevHttp: false, expect: 'url_invalid' },
    { name: '// dans le chemin', input: 'https://runtime.example.com//x', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'deux / finaux', input: 'https://runtime.example.com/x//', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'schéma ftp', input: 'ftp://runtime.example.com', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'sans schéma', input: 'runtime.example.com', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'label vide', input: 'https://runtime..example.com', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'label commençant par -', input: 'https://-runtime.example.com', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'port 0', input: 'https://runtime.example.com:0', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'port 65536', input: 'https://runtime.example.com:65536', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'port vide', input: 'https://runtime.example.com:', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'hôte vide', input: 'https://:443', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'IPv6', input: 'https://[::1]:443', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'segment . dans le chemin', input: 'https://runtime.example.com/a/./b', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'segment .. dans le chemin', input: 'https://runtime.example.com/a/../b', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'segment .. final', input: 'https://runtime.example.com/a/..', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'segment ... admis (pas un point de chemin)', input: 'https://runtime.example.com/...', allowDevHttp: false, expect: 'ok', canonical: 'https://runtime.example.com/...' },
    { name: 'hôte entier décimal (2130706433)', input: 'https://2130706433', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'dernier label hexadécimal (0x7f.1)', input: 'https://1.0x7f', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'IPv4 abrégée (0x7f.1)', input: 'https://0x7f.1', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'IPv4 avec zéro de tête', input: 'https://127.0.0.01', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'IPv4 à cinq parties', input: 'https://1.2.3.4.5', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'IPv4 octet > 255', input: 'https://1.2.3.256', allowDevHttp: false, expect: 'url_invalid' },
    { name: 'IPv4 décimal pointé canonique', input: 'https://192.0.2.10:8443', allowDevHttp: false, expect: 'ok', canonical: 'https://192.0.2.10:8443' },
    { name: 'TLD composé de lettres hexadécimales (cafe)', input: 'https://runtime.cafe', allowDevHttp: false, expect: 'ok', canonical: 'https://runtime.cafe' },
    { name: 'hôte non ASCII (signe kelvin)', input: 'https://Kelvin.example.com', allowDevHttp: false, expect: 'url_invalid' },
];
for (const c of urlCases) {
    let got: string;
    try {
        const out = rc.canonicalRuntimeUrl(c.input, { allowDevHttp: c.allowDevHttp });
        got = 'ok';
        check(out === c.canonical, `URL « ${c.name} » : ${out}`);
    } catch (e) {
        got = (e as InstanceType<typeof rc.RuntimeFormatError>).code;
    }
    check(got === c.expect, `URL « ${c.name} » : ${got}`);
}

const kexJwk = p256Jwk(SCALAR.kex);
const offCurve = { ...kexJwk.publicJwk, y: b64u(Uint8Array.from(Buffer.from(kexJwk.publicJwk.y!, 'base64url')).map((b, i) => (i === 31 ? b ^ 1 : b))) };
const jwkCases: Array<{ name: string; jwk: Json; expect: string; canonical?: string }> = [
    { name: 'forme canonique', jwk: kexJwk.canonical, expect: 'ok', canonical: kexJwk.canonical },
    { name: 'ordre historique {kty,crv,x,y}', jwk: kexJwk.legacy, expect: 'ok', canonical: kexJwk.canonical },
    { name: 'champs en plus (d, ext, key_ops)', jwk: JSON.stringify({ ...kexJwk.privateJwk, ext: true, key_ops: ['deriveBits'] }), expect: 'ok', canonical: kexJwk.canonical },
    { name: 'point hors courbe', jwk: JSON.stringify(offCurve), expect: 'key_invalid' },
    { name: 'x de 31 octets', jwk: JSON.stringify({ ...kexJwk.publicJwk, x: b64u(fill(1, 31)) }), expect: 'key_invalid' },
    { name: 'x avec remplissage', jwk: JSON.stringify({ ...kexJwk.publicJwk, x: kexJwk.publicJwk.x + '=' }), expect: 'key_invalid' },
    { name: 'courbe P-384', jwk: JSON.stringify({ ...kexJwk.publicJwk, crv: 'P-384' }), expect: 'key_invalid' },
    { name: 'kty RSA', jwk: JSON.stringify({ ...kexJwk.publicJwk, kty: 'RSA' }), expect: 'key_invalid' },
    { name: 'pas du JSON', jwk: 'pas du json', expect: 'key_invalid' },
];
for (const c of jwkCases) {
    let got: string;
    try {
        check(rc.canonicalRuntimeEcJwk(c.jwk as string) === c.canonical, `JWK « ${c.name} »`);
        got = 'ok';
    } catch (e) {
        got = e instanceof rc.RuntimeFormatError ? e.code : 'exception';
    }
    check(got === c.expect, `JWK « ${c.name} » : ${got}`);
}

write('runtime-identity.json', {
    description: "Empreinte, code d'appairage, URL canonique et JWK canonique du runtime (01 §1-§3). Produit par synco_app/scripts/e2ee-vectors/generate.ts.",
    fingerprint: { runtimeId, keys, ed25519SeedHex: hex(sigSeed), kexScalarHex: hex(SCALAR.kex), cskScalarHex: hex(SCALAR.csk), fprInput, fprHex, display: rc.formatRuntimeFingerprint(fprHex), code },
    pairingCases,
    urlCases: urlCases.map(c => ({ ...c, canonical: c.canonical ?? null })),
    jwkCases: jwkCases.map(c => ({ ...c, canonical: c.canonical ?? null })),
});

// ---------------------------------------------------------------------------
// 2. runtime-cert.json (01 §6)
// ---------------------------------------------------------------------------

const adminKey = await importEcdsaPrivate(SCALAR.admin);
const otherAdminKey = await importEcdsaPrivate(SCALAR.otherUser);
const cert: Cert = { orgId, runtimeId, url, keys, adminId, issuedAt: 1795000000, serial: 1 };
const certBytes = rc.runtimeCertBytes(cert);
const certSig = await rc.signRuntimeCertificate(adminKey, cert);
const certJson = (c: Cert): Json => ({ ...c, keys: { ...c.keys } });

const certCases: Array<{ name: string; certificate: Json; signature: string; expect: string; allowDevHttp: boolean }> = [];
const addCert = async (name: string, c: Cert, signature: string, expect: string, allowDevHttp = false) => {
    let got: string;
    try {
        got = (await rc.verifyRuntimeCertificate(jwk.admin, c, signature, { allowDevHttp })) ? 'ok' : 'cert_bad_signature';
    } catch (e) {
        got = e instanceof rc.RuntimeFormatError ? e.code : 'exception';
    }
    check(got === expect, `certificat « ${name} » : ${got}`);
    certCases.push({ name, certificate: certJson(c), signature, expect, allowDevHttp });
};
await addCert('certificat valide', cert, certSig, 'ok');
const modified: Array<[string, Partial<Cert>]> = [
    ['orgId', { orgId: 'cm3orgexample0000000000002' }],
    ['runtimeId', { runtimeId: '7d3f2c1e-8a4b-4c6d-9e0f-1a2b3c4d5e70' }],
    ['url', { url: 'https://runtime2.example.com' }],
    ['sig', { keys: { ...keys, sig: otherSigPub } }],
    ['kex', { keys: { ...keys, kex: jwk.otherKex } }],
    ['csk', { keys: { ...keys, csk: jwk.otherCsk } }],
    ['adminId', { adminId: '11111111-2222-4333-8444-555555555556' }],
    ['issuedAt', { issuedAt: 1795000001 }],
    ['serial', { serial: 2 }],
];
for (const [field, patch] of modified) await addCert(`${field} modifié`, { ...cert, ...patch }, certSig, 'cert_bad_signature');
await addCert('signé par une autre clé', cert, await rc.signRuntimeCertificate(otherAdminKey, cert), 'cert_bad_signature');
await addCert('signature DER au lieu de P1363', cert, b64(p1363ToDer(rc.fromB64(certSig))), 'cert_bad_signature');
await addCert('signature tronquée', cert, b64(rc.fromB64(certSig).slice(0, 63)), 'cert_bad_signature');
await addCert('URL non canonique', { ...cert, url: 'https://Runtime.example.com/' }, certSig, 'cert_invalid');
await addCert('serial 0', { ...cert, serial: 0 }, certSig, 'cert_invalid');
await addCert('orgId avec |', { ...cert, orgId: 'a|b' }, certSig, 'cert_invalid');
const devCert = { ...cert, url: 'http://127.0.0.1:8080' };
const devSig = await rc.signRuntimeCertificate(adminKey, devCert, { allowDevHttp: true });
await addCert('URL http://127.0.0.1 hors mode développement', devCert, devSig, 'cert_invalid');
await addCert('URL http://127.0.0.1 avec le drapeau de développement', devCert, devSig, 'ok', true);

write('runtime-cert.json', {
    description: "Certificat de runtime signé par la clé de signature d'identité d'un admin (01 §6). Signatures ECDSA : vérification seulement.",
    adminSignKey: jwk.admin,
    certificate: certJson(cert),
    certBytes,
    signature: certSig,
    // Forme stockée et servie par l'API (01 §6.2) : kex et csk en objets JWK.
    storedJson: JSON.stringify({ v: 1, ...cert, keys: { sig: keys.sig, kex: JSON.parse(keys.kex), csk: JSON.parse(keys.csk) }, signature: certSig }),
    cases: certCases,
});

// ---------------------------------------------------------------------------
// 3. challenge.json (01 §5)
// ---------------------------------------------------------------------------

const kexKey = await importEcdhPrivate(SCALAR.kex);
const otherKexKey = await importEcdhPrivate(SCALAR.otherKex);
const cskKey = await importEcdsaPrivate(SCALAR.csk);
const otherCskKey = await importEcdsaPrivate(SCALAR.otherCsk);
const clientEphKey = await importEcdhPrivate(SCALAR.clientEph);

queueEcdhKey(SCALAR.clientEph);
queueRandom(fill(0x77));
const { request, ephemeralPrivateKey } = await rc.createChallengeRequest('delegate', orgId, userId);
check(request.clientEph === jwk.clientEph && request.nonce === b64u(fill(0x77)), 'défi : aléa figé non appliqué');
const transcript = rc.challengeTranscript(request, runtimeId, fprHex);
const shared = await rc.ecdhSharedSecret(kexKey, request.clientEph);
const kch = await rc.hkdf32(shared, rc.CHALLENGE_LABEL, transcript);
const response = await rc.respondChallenge(request, runtimeId, fprHex, kexKey, cskKey);
check(response.mac === 'E_55ulgpiziGl-NFRH2ucQoVkkijIthDy9xh7cXl9rg', 'mac ≠ exemple de la spec');
check(await rc.verifyChallengeResponse(request, runtimeId, fprHex, ephemeralPrivateKey, keys, response), 'défi valide refusé');

const challengeCases: Array<{ name: string; request: Json; fprHex: string; mac: string; sig: string; expect: string }> = [];
const addChallenge = async (name: string, req: typeof request, fh: string, resp: typeof response, expect: string) => {
    const got = (await rc.verifyChallengeResponse(req, runtimeId, fh, clientEphKey, keys, resp)) ? 'ok' : 'challenge_failed';
    check(got === expect, `défi « ${name} » : ${got}`);
    challengeCases.push({ name, request: { ...req }, fprHex: fh, mac: resp.mac, sig: resp.sig, expect });
};
await addChallenge('réponse valide', request, fprHex, response, 'ok');
const withOtherKex = await rc.respondChallenge(request, runtimeId, fprHex, otherKexKey, cskKey);
await addChallenge("mac calculé avec une autre kex", request, fprHex, withOtherKex, 'challenge_failed');
const withOtherCsk = await rc.respondChallenge(request, runtimeId, fprHex, kexKey, otherCskKey);
await addChallenge("sig d'une autre clé", request, fprHex, withOtherCsk, 'challenge_failed');
await addChallenge('purpose différent chez le vérificateur', { ...request, purpose: 'pair' }, fprHex, response, 'challenge_failed');
await addChallenge('orgId différent chez le vérificateur', { ...request, orgId: 'cm3orgexample0000000000002' }, fprHex, response, 'challenge_failed');
await addChallenge('userId différent chez le vérificateur', { ...request, userId: '66666666-7777-4888-9999-aaaaaaaaaaab' }, fprHex, response, 'challenge_failed');
await addChallenge('nonce différent chez le vérificateur', { ...request, nonce: b64u(fill(0x78)) }, fprHex, response, 'challenge_failed');
await addChallenge("fprHex d'un autre runtime chez le vérificateur", request, hex(fprConfusable), response, 'challenge_failed');
await addChallenge('mac tronqué', request, fprHex, { ...response, mac: response.mac.slice(0, -2) }, 'challenge_failed');

write('challenge.json', {
    description: 'Défi de possession (01 §5). transcript, shared, K_ch et mac exacts ; sig : vérification seulement.',
    runtimeId,
    keys,
    fprHex,
    kexScalarHex: hex(SCALAR.kex),
    cskScalarHex: hex(SCALAR.csk),
    clientEphScalarHex: hex(SCALAR.clientEph),
    request: { ...request },
    requestJson: JSON.stringify({ v: 1, ...request, clientEph: JSON.parse(request.clientEph) }),
    transcript,
    sharedHex: hex(shared),
    kchHex: hex(kch),
    mac: response.mac,
    sig: response.sig,
    cases: challengeCases,
});

// ---------------------------------------------------------------------------
// 4. delegation.json (03 §3-§5)
// ---------------------------------------------------------------------------

const delegationId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ctx: Ctx = { userId, orgId, runtimeId, delegationId, scope: 'org', iat: 1795000000, exp: 1795000000 + 7 * 86400 };
const dk = fill(0x88);
const userKey = await importEcdsaPrivate(SCALAR.user);
const otherUserKey = await importEcdsaPrivate(SCALAR.otherUser);

const sealWrap = async (c: Ctx, kex: string, epkScalar: Uint8Array, ivByte: number, key: Uint8Array = dk) => {
    queueEcdhKey(epkScalar);
    queueRandom(fill(ivByte, 12));
    return rd.sealDelegationWrap(c, kex, key);
};
const wrap = await sealWrap(ctx, jwk.kex, SCALAR.epk, 0xaa);
const wrapCtx = rd.delegationWrapContext(ctx, jwk.kex, jwk.epk);
const wrapShared = await rc.ecdhSharedSecret(kexKey, jwk.epk);
const kek = await rc.hkdf32(wrapShared, rd.DELEGATION_WRAP_LABEL, wrapCtx);
check(hex(kek) === '4dd1d7892a2e12cd4df4d7c7be87af3505a38ca39d8c94a7a31016745727e8ad', 'KEK ≠ exemple de la spec');
check(wrap === 'srd1.eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6IjNjSjExaU1CdHpRMC02LWQ3enhDeFAxWXo1OXBFY0hmOHpWWFowdWcyVVkiLCJ5IjoiSXpScFJGYi11QTgtWlpWY3lxRHVYczhwalNoSFFrcGdnN0FTNW9GcUthYyJ9.qqqqqqqqqqqqqqqqzDr7_Z6KQv9PsHxFxSeZg6mHTfkMLim3ongsZxyfPQJG_ZsPjHxpnoKtZFmNynO8', 'wrap ≠ exemple de la spec');
const wrapHash = await rd.delegationWrapHash(wrap);
const mandate = rd.mandateBytes(ctx, fprHex, wrapHash);
const mandateSignature = await rd.signMandate(userKey, ctx, fprHex, wrap);

/** Enveloppe fabriquée à la main (cas mal formés) : même construction que sealDelegationWrap. */
async function forgeWrap(c: Ctx, plain: Uint8Array, epkJsonOverride?: string, contextOverride?: string): Promise<string> {
    const context = contextOverride ?? rd.delegationWrapContext(c, jwk.kex, jwk.epk);
    const k = await crypto.subtle.importKey('raw', (await rc.hkdf32(wrapShared, rd.DELEGATION_WRAP_LABEL, context)) as BufferSource, 'AES-GCM', false, ['encrypt']);
    const iv = fill(0xab, 12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(context) }, k, plain as BufferSource));
    return `srd1.${b64u(enc.encode(epkJsonOverride ?? jwk.epk))}.${b64u(Uint8Array.from([...iv, ...ct]))}`;
}

const wrapCases: Array<{ name: string; context: Json; kexScalarHex: string; wrap: string; expect: string; forged?: boolean }> = [];
const addWrap = async (name: string, c: Ctx, kexScalar: Uint8Array, w: string, expect: string, forged = false) => {
    const k = await importEcdhPrivate(kexScalar);
    const got = await outcome(async () => {
        const out = await rd.openDelegationWrap(c, k, p256Jwk(kexScalar).canonical, w);
        if (hex(out) !== hex(dk)) throw new Error('DK');
    });
    check(got === expect, `enveloppe « ${name} » : ${got}`);
    wrapCases.push({ name, context: { ...c }, kexScalarHex: hex(kexScalar), wrap: w, expect, ...(forged ? { forged } : {}) });
};
await addWrap('enveloppe valide', ctx, SCALAR.kex, wrap, 'ok');
await addWrap('ouverte par un autre runtime (autre kex_priv)', ctx, SCALAR.otherKex, wrap, 'delegation_unusable');
await addWrap("scellée pour la kex d'un autre runtime", ctx, SCALAR.kex, await sealWrap(ctx, jwk.otherKex, SCALAR.epk, 0xaa), 'delegation_unusable');
for (const [field, patch] of [
    ['userId', { userId: '66666666-7777-4888-9999-aaaaaaaaaaab' }],
    ['orgId', { orgId: 'cm3orgexample0000000000002' }],
    ['runtimeId', { runtimeId: '7d3f2c1e-8a4b-4c6d-9e0f-1a2b3c4d5e70' }],
    ['delegationId', { delegationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e' }],
    ['scope', { scope: 'all' }],
    ['iat', { iat: ctx.iat + 1 }],
    ['exp', { exp: ctx.exp + 1 }],
] as Array<[string, Partial<Ctx>]>) {
    await addWrap(`${field} différent à l'ouverture`, { ...ctx, ...patch } as Ctx, SCALAR.kex, wrap, 'delegation_unusable');
}
await addWrap('enveloppe tronquée', ctx, SCALAR.kex, wrap.slice(0, -4), 'delegation_unusable');
await addWrap('préfixe srd2', ctx, SCALAR.kex, wrap.replace(/^srd1/, 'srd2'), 'delegation_unusable');
await addWrap('quatre parties', ctx, SCALAR.kex, wrap + '.AAAA', 'delegation_unusable');
await addWrap('blob vide', ctx, SCALAR.kex, wrap.split('.').slice(0, 2).join('.') + '.', 'delegation_unusable');
const epkOff = JSON.stringify({ ...JSON.parse(jwk.epk), y: JSON.parse(jwk.kex).y });
await addWrap('epk hors courbe', ctx, SCALAR.kex, await forgeWrap(ctx, dk, epkOff), 'delegation_unusable', true);
await addWrap('epk non canonique (ordre historique)', ctx, SCALAR.kex, await forgeWrap(ctx, dk, p256Jwk(SCALAR.epk).legacy), 'delegation_unusable', true);
await addWrap('epk canonique refabriquée (témoin)', ctx, SCALAR.kex, await forgeWrap(ctx, dk), 'ok', true);
// Scope : enveloppe réellement scellée sous un autre scope (« all »), le contexte de l'ouverture
// restant valide (« org ») : le refus vient de l'AAD/HKDF, pas d'une validation de forme.
const otherScopeCtx = wrapCtx.replace('|org|', '|all|');
check(otherScopeCtx !== wrapCtx, 'contexte scope all');
await addWrap('enveloppe scellée sous un autre scope (all), ouverte en org', ctx, SCALAR.kex, await forgeWrap(ctx, dk, undefined, otherScopeCtx), 'delegation_unusable', true);
await addWrap('clair de 31 octets', ctx, SCALAR.kex, await forgeWrap(ctx, fill(0x88, 31)), 'delegation_unusable', true);
await addWrap('clair de 33 octets', ctx, SCALAR.kex, await forgeWrap(ctx, fill(0x88, 33)), 'delegation_unusable', true);

const mandateCases: Array<{ name: string; context: Json; fprHex: string; wrap: string; wrapHash: string; signature: string; userSignKey: string; expect: string }> = [];
const addMandate = async (name: string, c: Ctx, fh: string, w: string, sig: string, key: string, expect: string) => {
    const got = (await rd.verifyMandate(key, c, fh, w, sig)) ? 'ok' : 'delegation_unusable';
    check(got === expect, `mandat « ${name} » : ${got}`);
    mandateCases.push({ name, context: { ...c }, fprHex: fh, wrap: w, wrapHash: await rd.delegationWrapHash(w), signature: sig, userSignKey: key, expect });
};
await addMandate('mandat valide', ctx, fprHex, wrap, mandateSignature, jwk.user, 'ok');
const otherWrap = await sealWrap({ ...ctx, delegationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e' }, jwk.kex, SCALAR.epk, 0xaa);
await addMandate("wrap d'une autre délégation", ctx, fprHex, otherWrap, mandateSignature, jwk.user, 'delegation_unusable');
// Revue L01 : l'API garde le mandat authentique et sert une enveloppe forgée vers kex avec une DK' qu'elle connaît.
const forgedByApi = await sealWrap(ctx, jwk.kex, fill(0x9b), 0xac, fill(0x66));
await addMandate("enveloppe forgée par l'API (DK' connue) sous le mandat authentique", ctx, fprHex, forgedByApi, mandateSignature, jwk.user, 'delegation_unusable');
await addMandate("fprHex d'un autre runtime", ctx, hex(fprConfusable), wrap, mandateSignature, jwk.user, 'delegation_unusable');
await addMandate('signé par une autre clé', ctx, fprHex, wrap, await rd.signMandate(otherUserKey, ctx, fprHex, wrap), jwk.user, 'delegation_unusable');
await addMandate('vérifié avec une autre clé utilisateur', ctx, fprHex, wrap, mandateSignature, jwk.otherUser, 'delegation_unusable');
await addMandate('exp prolongée', { ...ctx, exp: ctx.exp + 86400 }, fprHex, wrap, mandateSignature, jwk.user, 'delegation_unusable');
await addMandate('signature DER', ctx, fprHex, wrap, b64(p1363ToDer(rc.fromB64(mandateSignature))), jwk.user, 'delegation_unusable');
check(await rd.verifyMandateOfflineFromWrapHash(jwk.user, ctx, fprHex, wrapHash, mandateSignature), 'vérification hors ligne du mandat');

const entryDefs: Array<{ name: string; kind: 'thread' | 'space' | 'conv'; ref: string; version: number; keyByte: number; ivByte: number }> = [
    { name: 'clé de salon', kind: 'thread', ref: 'cm3threadexample000000001', version: 1, keyByte: 0xbb, ivByte: 0xcc },
    { name: "clé d'espace version 3", kind: 'space', ref: 'cm3spaceexample0000000001', version: 3, keyByte: 0xbc, ivByte: 0xcd },
    { name: 'clé de conversation', kind: 'conv', ref: '0f0e0d0c-0b0a-4908-8706-050403020100', version: 1, keyByte: 0xdd, ivByte: 0xce },
];
const entries: Array<{ name: string; kind: string; ref: string; version: number; keyHex: string; ivHex: string; aad: string; ciphertext: string }> = [];
for (const e of entryDefs) {
    queueRandom(fill(e.ivByte, 12));
    const ciphertext = await rd.sealDelegationEntry(dk, ctx, e, fill(e.keyByte));
    entries.push({ name: e.name, kind: e.kind, ref: e.ref, version: e.version, keyHex: hex(fill(e.keyByte)), ivHex: hex(fill(e.ivByte, 12)), aad: rd.delegationEntryAad(ctx, e), ciphertext });
}
check(entries[0]!.ciphertext === 'sre1.zMzMzMzMzMzMzMzMct41NxlNMdx0P1wYKg4xPQP0ww2YrjkRT_thUzsofrcl7XtxD5j8XMqpb3Xd21OX', 'entrée ≠ exemple de la spec');

const thread = entries[0]!;
const entryCases: Array<{ name: string; dkHex: string; context: Json; kind: string; ref: string; version: number; ciphertext: string; expect: string; forgedAad?: string }> = [];
const addEntry = async (name: string, dkBytes: Uint8Array, c: Ctx, kind: string, ref: string, version: number, ciphertext: string, expect: string) => {
    const got = await outcome(() => rd.openDelegationEntry(dkBytes, c, { kind, ref, version, ciphertext }));
    check(got === expect, `entrée « ${name} » : ${got}`);
    entryCases.push({ name, dkHex: hex(dkBytes), context: { ...c }, kind, ref, version, ciphertext, expect });
};
for (const e of entries) await addEntry(`${e.name} valide`, dk, ctx, e.kind, e.ref, e.version, e.ciphertext, 'ok');
await addEntry("entrée d'une autre délégation (autre DK)", fill(0x87), ctx, thread.kind, thread.ref, thread.version, thread.ciphertext, 'entry_unusable');
await addEntry('kind changé', dk, ctx, 'space', thread.ref, thread.version, thread.ciphertext, 'entry_unusable');
await addEntry('ref changée', dk, ctx, thread.kind, 'cm3threadexample000000002', thread.version, thread.ciphertext, 'entry_unusable');
await addEntry('version changée', dk, ctx, thread.kind, thread.ref, 2, thread.ciphertext, 'entry_unusable');
await addEntry('AAD avec un autre userId', dk, { ...ctx, userId: '66666666-7777-4888-9999-aaaaaaaaaaab' }, thread.kind, thread.ref, thread.version, thread.ciphertext, 'entry_unusable');
await addEntry("AAD d'une autre délégation (même DK)", dk, { ...ctx, delegationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e' }, thread.kind, thread.ref, thread.version, thread.ciphertext, 'entry_unusable');
// Kinds hors liste : entrées RÉELLEMENT scellées sous DK avec l'AAD « …|<kind>|… » (fabriquées : l'app
// refuse de les produire). Elles se déchiffreraient : le refus prouve le contrôle avant déchiffrement.
for (const kind of ['dm', 'support', 'ai', 'org', 'account', 'identity']) {
    const aad = thread.aad.replace('|thread|', `|${kind}|`);
    const k = await crypto.subtle.importKey('raw', dk as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const iv = fill(0xcf, 12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) }, k, fill(0xbb) as BufferSource));
    const blob = Uint8Array.from([...iv, ...ct]);
    check(hex(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) }, k, ct as BufferSource))) === hex(fill(0xbb)), 'entrée forgée déchiffrable');
    const name = `kind ${kind} refusé (entrée réellement scellée sous DK avec cette AAD)`;
    await addEntry(name, dk, ctx, kind, thread.ref, thread.version, `sre1.${b64u(blob)}`, 'entry_unusable');
    entryCases[entryCases.length - 1]!.forgedAad = aad;
}
await addEntry('version 0', dk, ctx, thread.kind, thread.ref, 0, thread.ciphertext, 'entry_unusable');
await addEntry('préfixe sre2', dk, ctx, thread.kind, thread.ref, thread.version, thread.ciphertext.replace(/^sre1/, 'sre2'), 'entry_unusable');
await addEntry('entrée tronquée', dk, ctx, thread.kind, thread.ref, thread.version, thread.ciphertext.slice(0, -6), 'entry_unusable');

write('delegation.json', {
    description: 'Délégation (03 §3-§5) : enveloppe de tête srd1, mandat, entrées sre1. Valeurs exactes sauf signatures ECDSA (vérification seulement).',
    context: { ...ctx },
    kexScalarHex: hex(SCALAR.kex),
    kex: jwk.kex,
    epkScalarHex: hex(SCALAR.epk),
    epk: jwk.epk,
    dkHex: hex(dk),
    ivHex: hex(fill(0xaa, 12)),
    fprHex,
    userSignKey: jwk.user,
    ctx: wrapCtx,
    sharedHex: hex(wrapShared),
    kekHex: hex(kek),
    wrap,
    wrapHash,
    mandateBytes: mandate,
    mandateSignature,
    wrapCases,
    mandateCases,
    entries,
    entryCases,
});

// ---------------------------------------------------------------------------
// 5. conversation-fields.json (03 §6.3, 05 §4)
// ---------------------------------------------------------------------------

const fieldKeys = { ck: fill(0xdd), aiSessionKey: fill(0x5c), gateway: Uint8Array.from(Buffer.from('d82f2646d1113270f58fa3daf64de7e9f64253123a0ec7fdbaa24e34081d7911', 'hex')) };
type FieldKeyName = keyof typeof fieldKeys;
const aesFor = (name: FieldKeyName) => crypto.subtle.importKey('raw', fieldKeys[name] as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
const sessionId = '0f0e0d0c-0b0a-4908-8706-050403020100';
const messageId = '3c2b1a09-8f7e-4d6c-9b5a-493827161504';

type FieldCase = { name: string; keyName: FieldKeyName; sessionId: string; messageId: string; fieldName: string; value: string; expect: string; plaintext?: string; ivHex?: string; mode?: 'strict' | 'tolerant'; forged?: boolean };
const fieldCases: FieldCase[] = [];
const encField = async (keyName: FieldKeyName, sid: string, mid: string, field: string, plain: string, ivByte: number) => {
    queueRandom(fill(ivByte, 12));
    return encryptAiField(await aesFor(keyName), sid, mid, field, plain);
};
const addField = async (c: FieldCase) => {
    let got: string;
    try {
        // Lecture tolérante côté TS : détection du préfixe avant decryptAiField (hasEncryptedGatewayFields, AIService.ts).
        const plain = c.mode === 'tolerant' && !c.value.startsWith('gcm1:') ? c.value : await decryptAiField(await aesFor(c.keyName), c.sessionId, c.messageId, c.fieldName, c.value);
        got = 'ok';
        check(plain === c.plaintext, `champ « ${c.name} » : clair différent`);
    } catch {
        got = 'error';
    }
    // L'implémentation TS n'a pas de codes d'erreur ; elle doit seulement refuser (sauf non-UTF-8, cf. compte rendu).
    check(c.expect === 'ok' ? got === 'ok' : (got === 'error' || c.expect === 'field_invalid_utf8'), `champ « ${c.name} » : ${got}`);
    fieldCases.push(c);
};

const historic = 'gcm1:ECTIwmhA1Bb1C1ByL8IECZj8SkBl2TYmk9665e/jnrCQNjYdR+CMirRU75qIq5pxnrallgkaWQtrQreT8eCSCf6JAzUrY5mTb/Ez42WxSw==';
await addField({ name: 'vecteur historique de la passerelle (crypto.rs)', keyName: 'gateway', sessionId: 'sess_test0000000000000000000001', messageId: 'msg_test00000000000000000000001', fieldName: 'content', value: historic, plaintext: 'Bonjour, ceci est un message de test pour Synco AI.', ivHex: '1024c8c26840d416f50b5072', expect: 'ok' });

const specExample = await encField('ck', sessionId, messageId, 'content', 'Bonjour depuis le runtime.', 0xee);
check(specExample === 'gcm1:7u7u7u7u7u7u7u7uKvSAEGi4hwHvKh4YX23/vX8rHCEAG0FLuXQ7RghH2/+UqVU04hUCcbW8', 'gcm1 ≠ exemple de la spec');
const wsExample = await encField('ck', sessionId, messageId, 'ws:text:2:42', 'Bonjour', 0xef);
check(wsExample === 'gcm1:7+/v7+/v7+/v7+/vz06FC0lBPxpIkGJG6F0dJbtwRzSPLvs=', 'gcm1 ws ≠ exemple de la spec');

const fieldDefs: Array<[string, string, string, string]> = [
    ['content', messageId, 'content', 'Bonjour depuis le runtime.'],
    ['thinking', messageId, 'thinking', 'Je réfléchis… ✓'],
    ['tool_result (JSON)', messageId, 'tool_result', JSON.stringify({ ok: true, items: [1, 2, 3] })],
    ['arguments d’un appel d’outil', messageId, 'tool_call_arguments:call_1', JSON.stringify({ title: 'Créer une tâche' })],
    ['pendingToolCall.args', '__pending__', 'pending_tool_call_args', JSON.stringify({ id: 42 })],
    ['titre de la session', '__session_title__', 'title', 'Préparer la réunion'],
    ['delta de texte', messageId, 'ws:text:2:42', 'Bonjour'],
    ['delta de réflexion', messageId, 'ws:thinking:2:43', 'Hmm'],
    ['snapshot (JSON)', '__snapshot__', 'snapshot:3:1', JSON.stringify({ messages: [], status: 'idle', pendingToolCall: null })],
    ["détail d'erreur", '__error__', 'error:2:44', 'quota dépassé'],
    ['réponse à ask_question', '__answer__', 'answer:call_2', 'Oui, mardi.'],
    ['clair vide', messageId, 'content', ''],
];
let ivByte = 0x10;
for (const keyName of ['ck', 'aiSessionKey'] as const) {
    for (const [label, mid, field, plain] of fieldDefs) {
        ivByte++;
        await addField({ name: `${label} (${keyName})`, keyName, sessionId, messageId: mid, fieldName: field, value: await encField(keyName, sessionId, mid, field, plain, ivByte), plaintext: plain, ivHex: hex(fill(ivByte, 12)), expect: 'ok' });
    }
}
const base = fieldCases.find(c => c.name === 'content (ck)')!;
const delta = fieldCases.find(c => c.name === 'delta de texte (ck)')!;
const tamper = (v: string) => {
    const raw = rc.fromB64(v.slice(5));
    raw[raw.length - 1]! ^= 1;
    return 'gcm1:' + b64(raw);
};
await addField({ ...base, name: 'autre sessionId dans l’AAD', sessionId: '0f0e0d0c-0b0a-4908-8706-050403020101', expect: 'field_authentication_failed' });
await addField({ ...base, name: 'autre messageId dans l’AAD', messageId: '3c2b1a09-8f7e-4d6c-9b5a-493827161505', expect: 'field_authentication_failed' });
await addField({ ...base, name: 'autre fieldName dans l’AAD', fieldName: 'thinking', expect: 'field_authentication_failed' });
await addField({ ...delta, name: 'delta rejoué avec un autre seq', fieldName: 'ws:text:2:43', expect: 'field_authentication_failed' });
await addField({ ...delta, name: 'delta déplacé vers une autre époque', fieldName: 'ws:text:3:42', expect: 'field_authentication_failed' });
await addField({ ...base, name: 'séparateur | au lieu de :', sessionId: `${sessionId}|${messageId}|content`, messageId: '', fieldName: '', expect: 'field_authentication_failed' });
await addField({ ...base, name: 'mauvaise clé (AiSessionKey au lieu de CK)', keyName: 'aiSessionKey', expect: 'field_authentication_failed' });
await addField({ ...base, name: 'tag altéré', value: tamper(base.value), expect: 'field_authentication_failed' });
await addField({ ...base, name: 'base64 invalide', value: 'gcm1:@@@@', expect: 'field_invalid_base64' });
await addField({ ...base, name: 'préfixe gcm2:', value: base.value.replace(/^gcm1:/, 'gcm2:'), expect: 'field_unknown_version' });
await addField({ ...base, name: 'longueur < 28 octets', value: 'gcm1:' + b64(fill(0, 27)), expect: 'field_invalid_length' });
await addField({ ...base, name: 'valeur en clair (lecture stricte)', value: 'texte en clair', expect: 'field_unknown_version' });
await addField({ ...base, name: 'valeur en clair (lecture tolérante)', value: 'texte en clair', plaintext: 'texte en clair', expect: 'ok', mode: 'tolerant' });
{
    // Clair non UTF-8 : encryptAiField ne chiffre que des chaînes, cas fabriqué avec la même construction.
    const iv = fill(0x7f, 12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(`${sessionId}:${messageId}:content`) }, await aesFor('ck'), Uint8Array.from([0xff, 0xfe, 0x41]) as BufferSource));
    await addField({ ...base, name: 'clair non UTF-8', value: 'gcm1:' + b64(Uint8Array.from([...iv, ...ct])), plaintext: undefined, ivHex: hex(iv), expect: 'field_invalid_utf8', forged: true });
}

write('conversation-fields.json', {
    description: "Champs gcm1 des conversations (03 §6.3, 05 §4), AAD sessionId:messageId:fieldName. Produits par encryptAiField (crypto.ts) à IV figés. mode absent = lecture stricte.",
    keys: { ckHex: hex(fieldKeys.ck), aiSessionKeyHex: hex(fieldKeys.aiSessionKey), gatewayKeyHex: hex(fieldKeys.gateway) },
    cases: fieldCases.map(c => ({ ...c, mode: c.mode ?? 'strict', plaintext: c.plaintext ?? null, ivHex: c.ivHex ?? null })),
});

// ---------------------------------------------------------------------------
// 6. rt1-envelope.json (03 §10)
// ---------------------------------------------------------------------------

const threadId = 'cm3threadexample000000001';
const threadKey = fill(0xbb);
const kctx = `thread:${threadId}` as const;
const rt1 = await rd.signRt1Envelope(cskKey, threadKey.buffer, kctx, 1, delegationId);
check(rt1.commitment === (await keyCommitment(threadKey.buffer, kctx, 1)), 'commitment rt1');
const rt1Cases: Array<{ name: string; ctx: string; version: number; delegationId: string; keyHex: string; commitment: string; signature: string; verifyKey: string; expect: string }> = [];
const addRt1 = async (name: string, c: { ctx: string; version: number; delegationId: string; key: Uint8Array; commitment: string; signature: string; verifyKey: string }, expect: string) => {
    const got = await outcome(() => rd.verifyRt1Envelope(c.verifyKey, c.key.slice().buffer, { ctx: c.ctx as typeof kctx, version: c.version, commitment: c.commitment, signature: c.signature }, c.delegationId));
    check(got === expect, `rt1 « ${name} » : ${got}`);
    rt1Cases.push({ name, ctx: c.ctx, version: c.version, delegationId: c.delegationId, keyHex: hex(c.key), commitment: c.commitment, signature: c.signature, verifyKey: c.verifyKey, expect });
};
const rt1Base = { ctx: kctx as string, version: 1, delegationId, key: threadKey, commitment: rt1.commitment, signature: rt1.signature, verifyKey: jwk.csk };
await addRt1('enveloppe valide', rt1Base, 'ok');
await addRt1('ctx différent', { ...rt1Base, ctx: 'thread:cm3threadexample000000002' }, 'key_commitment_mismatch');
await addRt1('version différente', { ...rt1Base, version: 2 }, 'key_commitment_mismatch');
await addRt1('delegationId différent', { ...rt1Base, delegationId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e' }, 'key_bad_signature');
await addRt1("commitment d'une autre clé", { ...rt1Base, key: fill(0xbc) }, 'key_commitment_mismatch');
await addRt1('vérifiée avec kex (mauvaise clé)', { ...rt1Base, verifyKey: jwk.kex }, 'key_bad_signature');
await addRt1('signée par une autre csk', { ...rt1Base, signature: (await rd.signRt1Envelope(otherCskKey, threadKey.buffer, kctx, 1, delegationId)).signature }, 'key_bad_signature');
await addRt1('signature FC4 v1 présentée comme rt1', { ...rt1Base, signature: b64(await rc.ecdsaSign(cskKey, `synco-key-envelope-v1|${kctx}|1|${rt1.commitment}`)) }, 'key_bad_signature');
// La signature couvre ctx et version : commitment juste pour le nouveau ctx/version, signature de l'ancien.
await addRt1('commitment recalculé pour un autre ctx, signature de l’ancien', { ...rt1Base, ctx: 'thread:cm3threadexample000000002', commitment: await keyCommitment(threadKey.buffer, 'thread:cm3threadexample000000002', 1) }, 'key_bad_signature');
await addRt1('commitment recalculé pour une autre version, signature de l’ancienne', { ...rt1Base, version: 2, commitment: await keyCommitment(threadKey.buffer, kctx, 2) }, 'key_bad_signature');
await addRt1('contexte dm refusé', { ...rt1Base, ctx: 'dm:cm3dmexample0000000000001' }, 'key_bad_signature');

// Compatibilité des clients actuels (03 §10) : créateur rt1 inconnu de l'annuaire → accepté sans vérification.
(user as { value: unknown }).value = { id: userId };
(openedOrg as { value: unknown }).value = { members: [] };
const compat = await outcome(() => verifyKeyEnvelopeIfPresent(threadKey.buffer, kctx, 1, { creatorId: rd.rt1CreatorId(delegationId), commitment: rt1.commitment, signature: rt1.signature }));
check(compat === 'ok', 'compatibilité rt1 des clients actuels');

write('rt1-envelope.json', {
    description: "Enveloppe FC4 rt1 d'une clé créée par le runtime (03 §10). commitment et octets exacts ; signature : vérification seulement.",
    csk: jwk.csk,
    kex: jwk.kex,
    threadKeyHex: hex(threadKey),
    ctx: kctx,
    version: 1,
    delegationId,
    creatorId: rd.rt1CreatorId(delegationId),
    commitment: rt1.commitment,
    bytes: rd.rt1EnvelopeBytes(kctx, 1, rt1.commitment, delegationId),
    signature: rt1.signature,
    mandate: { context: { ...ctx }, fprHex, wrapHash, signature: mandateSignature, userSignKey: jwk.user, otherUserSignKey: jwk.otherUser },
    cases: rt1Cases,
    compat: { description: 'verifyKeyEnvelopeIfPresent (clients actuels) avec un annuaire qui ne connaît pas le créateur rt1:…', creatorId: rd.rt1CreatorId(delegationId), result: 'accepted_unverified' },
});

// ---------------------------------------------------------------------------
// 7. e2ee-v4.json : formats existants (rétrocompatibilité, P8)
// ---------------------------------------------------------------------------

const v4User = 'user-v4-0000000000000001';
const deviceId = '0b7a2d8e-5b1f-4f55-8a33-2e4f5a6b7c8d';
const ak = fill(0x42);
const akKey = await e2ee.importAccountKey(ak);
const signPkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', await importEcdsaPrivate(SCALAR.user, true)));
queueRandom(fill(0x31, 12));
const sealedIdentity = await e2ee.sealIdentityKey(akKey, 'sign', v4User, signPkcs8);
const identityCases = [
    { name: 'clé de signature scellée', purpose: 'sign', userId: v4User, akHex: hex(ak), expect: 'ok' },
    { name: 'autre usage (rsa)', purpose: 'rsa', userId: v4User, akHex: hex(ak), expect: 'envelope_unusable' },
    { name: 'autre utilisateur', purpose: 'sign', userId: 'user-v4-0000000000000002', akHex: hex(ak), expect: 'envelope_unusable' },
    { name: 'autre AK', purpose: 'sign', userId: v4User, akHex: hex(fill(0x43)), expect: 'envelope_unusable' },
];
for (const c of identityCases) {
    const got = await outcome(async () => e2ee.openIdentityKey(await e2ee.importAccountKey(Uint8Array.from(Buffer.from(c.akHex, 'hex'))), c.purpose as 'sign' | 'rsa', c.userId, sealedIdentity));
    check((got === 'ok') === (c.expect === 'ok'), `identité « ${c.name} » : ${got}`);
}

const deviceScalar = fill(0x61);
const devicePublic = p256Jwk(deviceScalar).publicJwk;
queueEcdhKey(fill(0x62));
queueRandom(fill(0x32, 12));
const deviceEnvelope = await e2ee.createDeviceEnvelope(devicePublic, ak, v4User, deviceId);
const deviceKey = await importEcdhPrivate(deviceScalar);
const deviceCases = [
    { name: 'enveloppe valide', deviceScalarHex: hex(deviceScalar), userId: v4User, deviceId, envelope: deviceEnvelope, expect: 'ok' },
    { name: 'autre utilisateur', deviceScalarHex: hex(deviceScalar), userId: 'user-v4-0000000000000002', deviceId, envelope: deviceEnvelope, expect: 'envelope_unusable' },
    { name: 'autre appareil', deviceScalarHex: hex(deviceScalar), userId: v4User, deviceId: '0b7a2d8e-5b1f-4f55-8a33-2e4f5a6b7c8e', envelope: deviceEnvelope, expect: 'envelope_unusable' },
    { name: 'mauvais destinataire (autre clé d’appareil)', deviceScalarHex: hex(fill(0x63)), userId: v4User, deviceId, envelope: deviceEnvelope, expect: 'envelope_unusable' },
    { name: 'enveloppe tronquée', deviceScalarHex: hex(deviceScalar), userId: v4User, deviceId, envelope: deviceEnvelope.slice(0, -8) + '====', expect: 'envelope_unusable' },
    { name: 'trois parties', deviceScalarHex: hex(deviceScalar), userId: v4User, deviceId, envelope: deviceEnvelope + '.AAAA', expect: 'envelope_unusable' },
];
for (const c of deviceCases) {
    const priv = await importEcdhPrivate(Uint8Array.from(Buffer.from(c.deviceScalarHex, 'hex')));
    const got = await outcome(() => e2ee.openDeviceEnvelope(priv, p256Jwk(Uint8Array.from(Buffer.from(c.deviceScalarHex, 'hex'))).publicJwk, c.envelope, c.userId, c.deviceId));
    check((got === 'ok') === (c.expect === 'ok'), `appareil « ${c.name} » : ${got}`);
}
check(hex(await e2ee.openDeviceEnvelope(deviceKey, devicePublic, deviceEnvelope, v4User, deviceId)) === hex(ak), 'AK de l’enveloppe');

const identitySignKey = await importEcdsaPrivate(SCALAR.user);
const deviceCert = await e2ee.signDeviceCertificate(identitySignKey, v4User, deviceId, 'web', devicePublic);
const deviceCertCases = [
    { name: 'certificat valide', platform: 'web', signKey: jwk.user, certificate: deviceCert, expect: 'ok' },
    { name: 'autre plateforme', platform: 'ios', signKey: jwk.user, certificate: deviceCert, expect: 'bad_signature' },
    { name: 'autre clé d’identité', platform: 'web', signKey: jwk.otherUser, certificate: deviceCert, expect: 'bad_signature' },
    { name: 'signature DER', platform: 'web', signKey: jwk.user, certificate: b64(p1363ToDer(rc.fromB64(deviceCert))), expect: 'bad_signature' },
];
for (const c of deviceCertCases) {
    const ok = await e2ee.verifyDeviceCertificate(JSON.parse(c.signKey), c.certificate, v4User, deviceId, c.platform, devicePublic);
    check(ok === (c.expect === 'ok'), `certificat d'appareil « ${c.name} »`);
}

privateSignKey.value = identitySignKey;
const keyEnvelopes: Array<{ name: string; ctx: string; version: number; keyHex: string; commitment: string; signature: string; creatorSignKey: string; expect: string }> = [];
for (const [name, kc, version, byte] of [['salon', 'thread:cm3threadexample000000001', 1, 0xbb], ['espace v3', 'space:cm3spaceexample0000000001', 3, 0xbc], ['session IA', 'ai:cm3orgexample0000000000001', 1, 0x5c], ['DM', 'dm:cm3dmexample0000000000001', 1, 0xd0]] as const) {
    const raw = fill(byte);
    const env = await signKeyEnvelope(raw.buffer, kc, version);
    await verifyKeyEnvelope(raw.buffer, { ctx: kc, version, ...env }, JSON.parse(jwk.user));
    keyEnvelopes.push({ name, ctx: kc, version, keyHex: hex(raw), ...env, creatorSignKey: jwk.user, expect: 'ok' });
}
const ke = keyEnvelopes[0]!;
keyEnvelopes.push({ ...ke, name: 'clé différente du commitment', keyHex: hex(fill(0xbd)), expect: 'key_commitment_mismatch' });
keyEnvelopes.push({ ...ke, name: 'contexte différent', ctx: 'thread:cm3threadexample000000002', expect: 'key_commitment_mismatch' });
keyEnvelopes.push({ ...ke, name: 'autre clé de créateur', creatorSignKey: jwk.otherUser, expect: 'key_bad_signature' });
keyEnvelopes.push({ ...ke, name: 'signature altérée', signature: b64(rc.fromB64(ke.signature).map((b, i) => (i === 5 ? b ^ 1 : b))), expect: 'key_bad_signature' });

// Chaîne de transitions d'identité (identityChainPath, porté dans la crate pour le runtime, 03 §4).
const rsa = (n: string) => JSON.stringify({ kty: 'RSA', n, e: 'AQAB', alg: 'RSA-OAEP-256' });
const signA = await importEcdsaPrivate(fill(0x71));
const signB = await importEcdsaPrivate(fill(0x72));
const signC = await importEcdsaPrivate(fill(0x73));
const mallory = await importEcdsaPrivate(fill(0x74));
const pub = (b: number) => p256Jwk(fill(b));
const t1 = await e2ee.signIdentityTransition(signA, v4User, 1, pub(0x71).legacy, rsa('bkI'), pub(0x72).publicJwk);
const t2 = await e2ee.signIdentityTransition(signB, v4User, 2, pub(0x72).canonical, rsa('bkII'), pub(0x73).legacy);
const forged = await e2ee.signIdentityTransition(mallory, v4User, 3, pub(0x74).canonical, rsa('bkX'), pub(0x74).canonical);
const forgedFromC = { ...forged, oldPublicSignKey: pub(0x73).canonical };
const t3 = await e2ee.signIdentityTransition(signC, v4User, 5, pub(0x73).canonical, rsa('bkIII'), pub(0x75).canonical);
const branch = await e2ee.signIdentityTransition(signA, v4User, 4, pub(0x71).canonical, rsa('bkY'), pub(0x76).canonical);
const chain = [t3, branch, forgedFromC, t2, t1];
const path = await e2ee.identityChainPath(v4User, pub(0x71).canonical, chain);
check(path.length === 3, `chaîne : ${path.length} maillons`);
const pathFromB = await e2ee.identityChainPath(v4User, pub(0x72).legacy, chain);
const pathOther = await e2ee.identityChainPath('user-v4-0000000000000002', pub(0x71).canonical, chain);

write('e2ee-v4.json', {
    description: "Formats E2EE v4 existants rejoués par la crate (P8) : clé d'identité scellée par AK, enveloppe et certificat d'appareil (ordre JSON historique {kty,crv,x,y}), enveloppes FC4, chaîne de transitions. Signatures : vérification seulement.",
    userId: v4User,
    deviceId,
    identity: { akHex: hex(ak), pkcs8Hex: hex(signPkcs8), sealed: sealedIdentity, cases: identityCases },
    deviceEnvelope: { deviceScalarHex: hex(deviceScalar), devicePublic: JSON.stringify(devicePublic), ephScalarHex: hex(fill(0x62)), ivHex: hex(fill(0x32, 12)), akHex: hex(ak), envelope: deviceEnvelope, cases: deviceCases },
    deviceCertificate: { devicePublic: JSON.stringify(devicePublic), certBytes: `synco-e4-device-cert|${v4User}|${deviceId}|web|${JSON.stringify(devicePublic)}`, cases: deviceCertCases },
    keyEnvelopes,
    identityChain: {
        chain: chain.map(t => ({ ...t })),
        paths: [
            { name: 'depuis la clé épinglée A (maillon falsifié et branche ignorés)', userId: v4User, pinned: pub(0x71).canonical, path: path.map(p => ({ ...p })) },
            { name: 'depuis B, épinglée sous la forme historique', userId: v4User, pinned: pub(0x72).legacy, path: pathFromB.map(p => ({ ...p })) },
            { name: 'autre utilisateur : aucune transition valide', userId: 'user-v4-0000000000000002', pinned: pub(0x71).canonical, path: pathOther.map(p => ({ ...p })) },
        ],
    },
});

assertQueuesDrained('fin du générateur');
console.log('vecteurs générés.');
