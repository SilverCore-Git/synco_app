/**
 * Identité du Synco AI Runtime — référence TS des formats de synco_ai_runtime/docs/plan/01-appairage-et-certificat.md :
 * empreinte, code d'appairage, URL canonique, certificat signé par un admin, défi de possession.
 *
 * Fonctions pures (WebCrypto, aucune dépendance Vue, réseau ni stockage), rejouées octet pour octet
 * par la crate Rust `synco-e2ee` (vecteurs : scripts/e2ee-vectors/). Réutilisées par le service de
 * délégation (lot L10).
 *
 * Conventions (00 §3) : `b64` = base64 standard avec remplissage (famille E2EE existante), `b64u` =
 * base64 URL sans remplissage, JWK EC canonique RFC 7638 `{"crv","kty","x","y"}`, signatures ECDSA
 * P-256/SHA-256 au format IEEE P1363 (celui de WebCrypto). Chaque champ d'une chaîne signée est
 * validé avant usage : une valeur hors contrainte est refusée, jamais échappée.
 */
import { p256 } from '@noble/curves/nist.js';
import { formatLinkSecret, parseLinkSecret } from './e2eeV4';

const enc = new TextEncoder();

/** Codes machine stables (identiques à `Error::code()` de la crate Rust). */
export type RuntimeFormatErrorCode =
    | 'invalid_input'
    | 'key_invalid'
    | 'url_invalid'
    | 'pair_code_invalid'
    | 'pair_code_mismatch'
    | 'cert_invalid'
    | 'cert_bad_signature'
    | 'challenge_invalid'
    | 'challenge_failed'
    | 'delegation_unusable'
    | 'entry_unusable'
    | 'key_commitment_mismatch'
    | 'key_bad_signature';

export class RuntimeFormatError extends Error {
    readonly code: RuntimeFormatErrorCode;
    constructor(code: RuntimeFormatErrorCode) {
        super(code);
        this.name = 'RuntimeFormatError';
        this.code = code;
    }
}

// ---------------------------------------------------------------------------
// Encodages et contraintes (00 §3.1, §3.2)
// ---------------------------------------------------------------------------

export const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

/** base64 standard strict : remplissage obligatoire, forme canonique (comme la crate). */
export function fromB64(text: string): Uint8Array {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw new RuntimeFormatError('invalid_input');
    const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
    if (toB64(bytes) !== text) throw new RuntimeFormatError('invalid_input');
    return bytes;
}

export const toB64u = (bytes: Uint8Array): string => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** base64 URL strict : sans remplissage, forme canonique (bits de fin nuls). */
export function fromB64u(text: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new RuntimeFormatError('invalid_input');
    const std = text.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(std + '='.repeat((4 - (std.length % 4)) % 4)), c => c.charCodeAt(0));
    if (toB64u(bytes) !== text) throw new RuntimeFormatError('invalid_input');
    return bytes;
}

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/** Identifiant d'une chaîne signée ou d'une AAD : `^[A-Za-z0-9_-]{1,64}$`. */
export const isValidId = (id: string): boolean => /^[A-Za-z0-9_-]{1,64}$/.test(id);

/** Entier décimal sans signe, ≤ 2⁵³ − 1. */
export const isValidUint = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

export const isValidFprHex = (fprHex: string): boolean => /^[0-9a-f]{64}$/.test(fprHex);

export function assertIds(code: RuntimeFormatErrorCode, ...ids: string[]): void {
    for (const id of ids) if (typeof id !== 'string' || !isValidId(id)) throw new RuntimeFormatError(code);
}

export function assertUints(code: RuntimeFormatErrorCode, ...values: number[]): void {
    for (const v of values) if (!isValidUint(v)) throw new RuntimeFormatError(code);
}

export const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));

// ---------------------------------------------------------------------------
// JWK EC canonique (RFC 7638) et primitives P-256
// ---------------------------------------------------------------------------

type EcJwkLike = { kty?: unknown; crv?: unknown; x?: unknown; y?: unknown };

/**
 * Forme canonique `{"crv":"P-256","kty":"EC","x":"…","y":"…"}` d'une JWK EC lue avec tolérance
 * (champs en plus ignorés, ordre quelconque) ; `x` et `y` doivent être des `b64u` de 32 octets d'un
 * point de la courbe. Sinon `key_invalid`.
 */
export function canonicalRuntimeEcJwk(jwk: string | object): string {
    let k: EcJwkLike;
    try {
        k = (typeof jwk === 'string' ? JSON.parse(jwk) : jwk) as EcJwkLike;
    } catch {
        throw new RuntimeFormatError('key_invalid');
    }
    if (!k || k.kty !== 'EC' || k.crv !== 'P-256' || typeof k.x !== 'string' || typeof k.y !== 'string') {
        throw new RuntimeFormatError('key_invalid');
    }
    try {
        const x = fromB64u(k.x), y = fromB64u(k.y);
        if (x.length !== 32 || y.length !== 32) throw new Error('length');
        const sec1 = new Uint8Array(65);
        sec1[0] = 4;
        sec1.set(x, 1);
        sec1.set(y, 33);
        p256.Point.fromBytes(sec1).assertValidity();
    } catch {
        throw new RuntimeFormatError('key_invalid');
    }
    return JSON.stringify({ crv: 'P-256', kty: 'EC', x: k.x, y: k.y });
}

/** Lecture stricte : la chaîne doit déjà être exactement la forme canonique. */
export function parseCanonicalRuntimeEcJwk(text: string): string {
    if (canonicalRuntimeEcJwk(text) !== text) throw new RuntimeFormatError('key_invalid');
    return text;
}

export const importEcdhPublic = (jwk: string | object): Promise<CryptoKey> =>
    crypto.subtle.importKey('jwk', JSON.parse(canonicalRuntimeEcJwk(jwk)) as JsonWebKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

export const importEcdsaPublic = (jwk: string | object): Promise<CryptoKey> =>
    crypto.subtle.importKey('jwk', JSON.parse(canonicalRuntimeEcJwk(jwk)) as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

/** Signature ECDSA P-256 / SHA-256, P1363 (64 octets). */
export async function ecdsaSign(privateKey: CryptoKey, message: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(message) as BufferSource));
}

/** Vérifie une signature P1363 ; toute erreur (clé, encodage, DER…) donne `false`. */
export async function ecdsaVerify(publicKey: string | object, message: string, signature: Uint8Array): Promise<boolean> {
    try {
        if (signature.length !== 64) return false;
        return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await importEcdsaPublic(publicKey), signature as BufferSource, enc.encode(message) as BufferSource);
    } catch {
        return false;
    }
}

/** ECDH P-256 : coordonnée x du point commun (32 octets). */
export async function ecdhSharedSecret(privateKey: CryptoKey, peerPublic: string | object): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await importEcdhPublic(peerPublic) }, privateKey, 256));
}

export async function hkdf32(ikm: Uint8Array, salt: string, info: string): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(salt), info: enc.encode(info) }, key, 256));
}

// ---------------------------------------------------------------------------
// Empreinte et code d'appairage (01 §2)
// ---------------------------------------------------------------------------

/** Clés publiques du runtime : `sig` en `b64u` (32 octets), `kex` et `csk` en JWK canonique. */
export interface RuntimePublicKeys {
    sig: string;
    kex: string;
    csk: string;
}

function canonicalKeys(keys: RuntimePublicKeys, code: RuntimeFormatErrorCode): RuntimePublicKeys {
    try {
        if (fromB64u(keys.sig).length !== 32) throw new Error('sig');
        return { sig: keys.sig, kex: canonicalRuntimeEcJwk(keys.kex), csk: canonicalRuntimeEcJwk(keys.csk) };
    } catch {
        throw new RuntimeFormatError(code);
    }
}

export function runtimeFingerprintInput(runtimeId: string, keys: RuntimePublicKeys): string {
    assertIds('invalid_input', runtimeId);
    const k = canonicalKeys(keys, 'key_invalid');
    return `synco-rt-fpr-v1|${runtimeId}|${k.sig}|${k.kex}|${k.csk}`;
}

export const runtimeFingerprint = (runtimeId: string, keys: RuntimePublicKeys): Promise<Uint8Array> =>
    sha256(enc.encode(runtimeFingerprintInput(runtimeId, keys)));

export const runtimeFingerprintHex = async (runtimeId: string, keys: RuntimePublicKeys): Promise<string> =>
    toHex(await runtimeFingerprint(runtimeId, keys));

/** Affichage : majuscules, groupes de 4 séparés par une espace (comme `computeKeyFingerprint`). */
export function formatRuntimeFingerprint(fprHex: string): string {
    if (!isValidFprHex(fprHex)) throw new RuntimeFormatError('invalid_input');
    return fprHex.toUpperCase().match(/.{4}/g)!.join(' ');
}

/** Code d'appairage : `formatLinkSecret` des 128 premiers bits de l'empreinte. */
export async function formatPairingCode(fpr: Uint8Array): Promise<string> {
    if (fpr.length !== 32) throw new RuntimeFormatError('invalid_input');
    return formatLinkSecret(fpr.slice(0, 16));
}

/** Lit un code saisi (tolérances de `parseLinkSecret`). Renvoie les 16 octets engagés. */
export async function parsePairingCode(input: string): Promise<Uint8Array> {
    try {
        return await parseLinkSecret(input);
    } catch {
        throw new RuntimeFormatError('pair_code_invalid');
    }
}

/** `pair_code_invalid` si illisible, `pair_code_mismatch` s'il désigne une autre empreinte. */
export async function checkPairingCode(input: string, fpr: Uint8Array): Promise<void> {
    const head = await parsePairingCode(input);
    if (fpr.length !== 32 || head.some((b, i) => b !== fpr[i])) throw new RuntimeFormatError('pair_code_mismatch');
}

// ---------------------------------------------------------------------------
// URL canonique (01 §3)
// ---------------------------------------------------------------------------

export const MAX_RUNTIME_URL_LENGTH = 255;

const asciiLower = (s: string) => s.replace(/[A-Z]/g, c => c.toLowerCase());
const isHostLabel = (label: string) => /^[a-z0-9-]{1,63}$/.test(label) && !label.startsWith('-') && !label.endsWith('-');

/**
 * `https` seulement (sauf `http://localhost:<port>` / `http://127.0.0.1:<port>` si `allowDevHttp`),
 * sans identifiants, requête ni fragment ; hôte en minuscules ; port 443 omis ; chemin sans `/` final,
 * limité à `[A-Za-z0-9-._~/]` ; ≤ 255 caractères. Sinon `url_invalid`.
 */
export function canonicalRuntimeUrl(input: string, options: { allowDevHttp?: boolean } = {}): string {
    const fail = () => new RuntimeFormatError('url_invalid');
    if (input.length > 2048 || /[?#@\\]/.test(input) || /\s/.test(input)) throw fail();
    const sep = input.indexOf('://');
    if (sep < 0) throw fail();
    const scheme = asciiLower(input.slice(0, sep));
    const rest = input.slice(sep + 3);
    const slash = rest.indexOf('/');
    const authority = slash < 0 ? rest : rest.slice(0, slash);
    let path = slash < 0 ? '' : rest.slice(slash);
    let host = authority;
    let port: number | null = null;
    const colon = authority.lastIndexOf(':');
    if (colon >= 0) {
        const p = authority.slice(colon + 1);
        if (!/^[0-9]{1,5}$/.test(p)) throw fail();
        port = Number(p);
        if (port === 0 || port > 65535) throw fail();
        host = authority.slice(0, colon);
    }
    host = asciiLower(host);
    if (host.length === 0 || host.length > 253 || !host.split('.').every(isHostLabel)) throw fail();
    if (scheme === 'https') {
        if (port === 443) port = null;
    } else if (!(scheme === 'http' && options.allowDevHttp && port !== null && (host === 'localhost' || host === '127.0.0.1'))) {
        throw fail();
    }
    if (path.endsWith('/')) path = path.slice(0, -1);
    if (!/^[A-Za-z0-9\-._~/]*$/.test(path) || path.endsWith('/') || path.includes('//')) throw fail();
    const url = `${scheme}://${host}${port === null ? '' : `:${port}`}${path}`;
    if (url.length > MAX_RUNTIME_URL_LENGTH) throw fail();
    return url;
}

function isCanonicalUrl(url: string): boolean {
    for (const allowDevHttp of [false, true]) {
        try {
            if (canonicalRuntimeUrl(url, { allowDevHttp }) === url) return true;
        } catch { /* essai suivant */ }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Certificat (01 §6)
// ---------------------------------------------------------------------------

export interface RuntimeCertificate {
    orgId: string;
    runtimeId: string;
    url: string;
    keys: RuntimePublicKeys;
    adminId: string;
    issuedAt: number;
    serial: number;
}

/** `certBytes` ; forme invalide → `cert_invalid`. */
export function runtimeCertBytes(cert: RuntimeCertificate): string {
    assertIds('cert_invalid', cert.orgId, cert.runtimeId, cert.adminId);
    assertUints('cert_invalid', cert.issuedAt, cert.serial);
    if (cert.serial < 1 || !isCanonicalUrl(cert.url)) throw new RuntimeFormatError('cert_invalid');
    const k = canonicalKeys(cert.keys, 'cert_invalid');
    return `synco-rt-cert-v1|${cert.orgId}|${cert.runtimeId}|${cert.url}|${k.sig}|${k.kex}|${k.csk}|${cert.adminId}|${cert.issuedAt}|${cert.serial}`;
}

/** Signature de l'admin (clé de signature d'identité, `privateSignKey`), `b64`. */
export async function signRuntimeCertificate(adminSignKey: CryptoKey, cert: RuntimeCertificate): Promise<string> {
    return toB64(await ecdsaSign(adminSignKey, runtimeCertBytes(cert)));
}

/**
 * Vérifie la signature avec UNE clé de l'admin (à passer comme rappel de `verifyWithSignKeys`).
 * Forme invalide → `cert_invalid` levée ; signature invalide → `false`.
 */
export async function verifyRuntimeCertificate(adminPublicSignKey: string | object, cert: RuntimeCertificate, signature: string): Promise<boolean> {
    const bytes = runtimeCertBytes(cert);
    let sig: Uint8Array;
    try {
        sig = fromB64(signature);
    } catch {
        return false;
    }
    return ecdsaVerify(adminPublicSignKey, bytes, sig);
}

// ---------------------------------------------------------------------------
// Défi de possession (01 §5)
// ---------------------------------------------------------------------------

export const CHALLENGE_LABEL = 'synco-rt-challenge-v1';

export type ChallengePurpose = 'pair' | 'delegate';

export interface ChallengeRequest {
    purpose: ChallengePurpose;
    orgId: string;
    userId: string;
    /** `b64u` de 32 octets. */
    nonce: string;
    /** JWK canonique de la clé éphémère du client. */
    clientEph: string;
}

export interface ChallengeResponse {
    /** `b64u` de 32 octets. */
    mac: string;
    /** `b64u` de 64 octets (P1363). */
    sig: string;
}

export function challengeTranscript(request: ChallengeRequest, runtimeId: string, fprHex: string): string {
    if (request.purpose !== 'pair' && request.purpose !== 'delegate') throw new RuntimeFormatError('challenge_invalid');
    assertIds('challenge_invalid', request.orgId, request.userId, runtimeId);
    if (!isValidFprHex(fprHex)) throw new RuntimeFormatError('challenge_invalid');
    let eph: string;
    try {
        if (fromB64u(request.nonce).length !== 32) throw new Error('nonce');
        eph = canonicalRuntimeEcJwk(request.clientEph);
    } catch {
        throw new RuntimeFormatError('challenge_invalid');
    }
    return `${CHALLENGE_LABEL}|${request.purpose}|${runtimeId}|${request.orgId}|${request.userId}|${request.nonce}|${eph}|${fprHex}`;
}

const challengeKey = async (shared: Uint8Array, transcript: string) =>
    crypto.subtle.importKey('raw', (await hkdf32(shared, CHALLENGE_LABEL, transcript)) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

/** Côté client : nonce aléatoire et paire ECDH éphémère (clé privée à oublier après le défi). */
export async function createChallengeRequest(purpose: ChallengePurpose, orgId: string, userId: string): Promise<{ request: ChallengeRequest; ephemeralPrivateKey: CryptoKey }> {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const clientEph = canonicalRuntimeEcJwk(await crypto.subtle.exportKey('jwk', pair.publicKey));
    const nonce = toB64u(crypto.getRandomValues(new Uint8Array(32)));
    assertIds('challenge_invalid', orgId, userId);
    if (purpose !== 'pair' && purpose !== 'delegate') throw new RuntimeFormatError('challenge_invalid');
    return { request: { purpose, orgId, userId, nonce, clientEph }, ephemeralPrivateKey: pair.privateKey };
}

/** Côté runtime (référence pour les vecteurs) : `mac` avec `kex_priv`, `sig` avec `csk_priv`. */
export async function respondChallenge(request: ChallengeRequest, runtimeId: string, fprHex: string, kexPrivateKey: CryptoKey, cskPrivateKey: CryptoKey): Promise<ChallengeResponse> {
    const transcript = challengeTranscript(request, runtimeId, fprHex);
    const key = await challengeKey(await ecdhSharedSecret(kexPrivateKey, request.clientEph), transcript);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(transcript) as BufferSource));
    return { mac: toB64u(mac), sig: toB64u(await ecdsaSign(cskPrivateKey, transcript)) };
}

/**
 * Côté client : vérifie `mac` (clé éphémère + `kex` certifiée) ET `sig` (`csk` certifiée), avec
 * l'empreinte `fprHex` calculée par le client. `false` au moindre écart.
 */
export async function verifyChallengeResponse(
    request: ChallengeRequest,
    runtimeId: string,
    fprHex: string,
    ephemeralPrivateKey: CryptoKey,
    keys: Pick<RuntimePublicKeys, 'kex' | 'csk'>,
    response: ChallengeResponse,
): Promise<boolean> {
    try {
        const transcript = challengeTranscript(request, runtimeId, fprHex);
        const key = await challengeKey(await ecdhSharedSecret(ephemeralPrivateKey, keys.kex), transcript);
        const macOk = await crypto.subtle.verify('HMAC', key, fromB64u(response.mac) as BufferSource, enc.encode(transcript) as BufferSource);
        const sigOk = await ecdsaVerify(keys.csk, transcript, fromB64u(response.sig));
        return macOk && sigOk;
    } catch {
        return false;
    }
}
