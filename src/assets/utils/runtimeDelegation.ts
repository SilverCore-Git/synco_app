/**
 * Délégation des clés au Synco AI Runtime — référence TS des formats de
 * synco_ai_runtime/docs/plan/03-delegation.md : enveloppe de tête `srd1`, mandat signé par
 * l'utilisateur, entrées `sre1`, et enveloppe FC4 `rt1` des clés créées par le runtime.
 *
 * Fonctions pures (WebCrypto), rejouées octet pour octet par la crate Rust `synco-e2ee`
 * (vecteurs : scripts/e2ee-vectors/). Réutilisées par le service de délégation (lot L10).
 *
 * Ce module ne manipule ni AK ni clé privée d'identité au-delà de la signature du mandat : aucune
 * fonction ne transmet l'une ou l'autre au runtime (03 §2).
 */
import { keyCommitment, type KeyContext } from './keyPinning';
import {
    RuntimeFormatError,
    assertIds,
    assertUints,
    canonicalRuntimeEcJwk,
    ecdhSharedSecret,
    ecdsaSign,
    ecdsaVerify,
    fromB64,
    fromB64u,
    hkdf32,
    isValidFprHex,
    parseCanonicalRuntimeEcJwk,
    sha256,
    toB64,
    toB64u,
} from './runtimeCert';

const enc = new TextEncoder();

export const DELEGATION_WRAP_PREFIX = 'srd1';
export const DELEGATION_ENTRY_PREFIX = 'sre1';
export const DELEGATION_WRAP_LABEL = 'synco-rt-delegation-v1';
const KEY_LENGTH = 32;

export type DelegationScope = 'org';

/** Champs communs d'une délégation (tels que déposés à l'API). */
export interface DelegationContext {
    userId: string;
    orgId: string;
    runtimeId: string;
    delegationId: string;
    scope: DelegationScope;
    iat: number;
    exp: number;
}

function assertContext(ctx: DelegationContext, code: 'invalid_input' | 'delegation_unusable' | 'entry_unusable' = 'invalid_input'): void {
    assertIds(code, ctx.userId, ctx.orgId, ctx.runtimeId, ctx.delegationId);
    assertUints(code, ctx.iat, ctx.exp);
    if (ctx.scope !== 'org' || ctx.iat >= ctx.exp) throw new RuntimeFormatError(code);
}

async function aesKey(raw: Uint8Array | CryptoKey, usages: KeyUsage[]): Promise<CryptoKey> {
    if (raw instanceof CryptoKey) return raw;
    if (raw.length !== KEY_LENGTH) throw new RuntimeFormatError('invalid_input');
    return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM', length: 256 }, false, usages);
}

async function gcmSeal(key: CryptoKey, aad: string, plain: Uint8Array): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) }, key, plain as BufferSource));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0);
    out.set(ct, 12);
    return out;
}

async function gcmOpen(key: CryptoKey, aad: string, blob: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12) as BufferSource, additionalData: enc.encode(aad) }, key, blob.slice(12) as BufferSource));
}

// ---------------------------------------------------------------------------
// Enveloppe de tête (03 §3)
// ---------------------------------------------------------------------------

/** `ctx` de l'enveloppe de tête : contexte complet, `kex` du runtime et `epk` en JWK canonique. */
export function delegationWrapContext(ctx: DelegationContext, kex: string | object, epk: string | object): string {
    assertContext(ctx);
    return `${DELEGATION_WRAP_LABEL}|${ctx.userId}|${ctx.orgId}|${ctx.runtimeId}|${ctx.delegationId}|${ctx.scope}|${ctx.iat}|${ctx.exp}|${canonicalRuntimeEcJwk(kex)}|${canonicalRuntimeEcJwk(epk)}`;
}

const wrapKek = async (shared: Uint8Array, context: string) =>
    crypto.subtle.importKey('raw', (await hkdf32(shared, DELEGATION_WRAP_LABEL, context)) as BufferSource, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

/**
 * Chiffre `DK` (32 octets) vers la clé `kex` du runtime (celle du certificat vérifié) :
 * `srd1.<b64u(epk)>.<b64u(iv ‖ GCM(KEK, DK))>`.
 */
export async function sealDelegationWrap(ctx: DelegationContext, runtimeKex: string | object, dk: Uint8Array): Promise<string> {
    if (dk.length !== KEY_LENGTH) throw new RuntimeFormatError('invalid_input');
    const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const epk = canonicalRuntimeEcJwk(await crypto.subtle.exportKey('jwk', eph.publicKey));
    const context = delegationWrapContext(ctx, runtimeKex, epk);
    const kek = await wrapKek(await ecdhSharedSecret(eph.privateKey, runtimeKex), context);
    const blob = await gcmSeal(kek, context, dk);
    return `${DELEGATION_WRAP_PREFIX}.${toB64u(enc.encode(epk))}.${toB64u(blob)}`;
}

/**
 * Ouvre l'enveloppe de tête avec la clé privée `kex` (côté runtime ; ici pour les vecteurs Rust → TS).
 * Tout refus : `delegation_unusable`. Renvoie `DK` (à effacer après usage).
 */
export async function openDelegationWrap(ctx: DelegationContext, kexPrivateKey: CryptoKey, kexPublic: string | object, wrap: string): Promise<Uint8Array> {
    try {
        const parts = wrap.split('.');
        if (parts.length !== 3 || parts[0] !== DELEGATION_WRAP_PREFIX) throw new Error('forme');
        const epk = parseCanonicalRuntimeEcJwk(new TextDecoder('utf-8', { fatal: true }).decode(fromB64u(parts[1]!)));
        const blob = fromB64u(parts[2]!);
        if (blob.length < 12 + KEY_LENGTH + 16) throw new Error('longueur');
        const context = delegationWrapContext(ctx, kexPublic, epk);
        const kek = await wrapKek(await ecdhSharedSecret(kexPrivateKey, epk), context);
        const dk = await gcmOpen(kek, context, blob);
        if (dk.length !== KEY_LENGTH) throw new Error('longueur');
        return dk;
    } catch {
        throw new RuntimeFormatError('delegation_unusable');
    }
}

/** `wrapHash` = `b64u(SHA-256(utf8(wrap)))`. */
export const delegationWrapHash = async (wrap: string): Promise<string> => toB64u(await sha256(enc.encode(wrap)));

// ---------------------------------------------------------------------------
// Mandat (03 §4)
// ---------------------------------------------------------------------------

export function mandateBytes(ctx: DelegationContext, fprHex: string, wrapHash: string): string {
    assertContext(ctx);
    if (!isValidFprHex(fprHex)) throw new RuntimeFormatError('invalid_input');
    try {
        if (fromB64u(wrapHash).length !== 32) throw new Error('wrapHash');
    } catch {
        throw new RuntimeFormatError('invalid_input');
    }
    return `synco-rt-mandate-v1|${ctx.userId}|${ctx.orgId}|${ctx.runtimeId}|${ctx.delegationId}|${ctx.scope}|${ctx.iat}|${ctx.exp}|${fprHex}|${wrapHash}`;
}

/** Signe le mandat avec la clé de signature d'identité de l'utilisateur (`privateSignKey`), `b64`. */
export async function signMandate(userSignKey: CryptoKey, ctx: DelegationContext, fprHex: string, wrap: string): Promise<string> {
    return toB64(await ecdsaSign(userSignKey, mandateBytes(ctx, fprHex, await delegationWrapHash(wrap))));
}

/** Vérifie un mandat avec UNE clé de l'utilisateur (rappel de `verifyWithSignKeys`) ; `false` au moindre écart. */
export async function verifyMandate(userPublicSignKey: string | object, ctx: DelegationContext, fprHex: string, wrapHash: string, signature: string): Promise<boolean> {
    try {
        return await ecdsaVerify(userPublicSignKey, mandateBytes(ctx, fprHex, wrapHash), fromB64(signature));
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Entrées (03 §5)
// ---------------------------------------------------------------------------

/** Liste FERMÉE des clés délégables (03 §2). */
export const DELEGATION_ENTRY_KINDS = ['thread', 'space', 'conv'] as const;
export type DelegationEntryKind = (typeof DELEGATION_ENTRY_KINDS)[number];

export const isDelegationEntryKind = (kind: string): kind is DelegationEntryKind =>
    (DELEGATION_ENTRY_KINDS as readonly string[]).includes(kind);

export interface DelegationEntryMeta {
    kind: DelegationEntryKind;
    ref: string;
    version: number;
}

export function delegationEntryAad(ctx: DelegationContext, meta: DelegationEntryMeta, code: 'invalid_input' | 'entry_unusable' = 'invalid_input'): string {
    assertContext(ctx, code);
    if (!isDelegationEntryKind(meta.kind)) throw new RuntimeFormatError(code);
    assertIds(code, meta.ref);
    assertUints(code, meta.version);
    if (meta.version < 1) throw new RuntimeFormatError(code);
    return `synco-rt-entry-v1|${ctx.delegationId}|${ctx.userId}|${ctx.orgId}|${ctx.runtimeId}|${meta.kind}|${meta.ref}|${meta.version}`;
}

/** Chiffre une clé de l'org (32 octets) sous `DK` : `sre1.<b64u(iv ‖ GCM(DK, clé))>`. */
export async function sealDelegationEntry(dk: Uint8Array | CryptoKey, ctx: DelegationContext, meta: DelegationEntryMeta, key: Uint8Array): Promise<string> {
    if (key.length !== KEY_LENGTH) throw new RuntimeFormatError('invalid_input');
    const aad = delegationEntryAad(ctx, meta);
    return `${DELEGATION_ENTRY_PREFIX}.${toB64u(await gcmSeal(await aesKey(dk, ['encrypt']), aad, key))}`;
}

/**
 * Ouvre une entrée à partir de ses métadonnées en clair ; un `kind` hors liste est refusé AVANT
 * tout déchiffrement. Tout refus : `entry_unusable`.
 */
export async function openDelegationEntry(
    dk: Uint8Array | CryptoKey,
    ctx: DelegationContext,
    entry: { kind: string; ref: string; version: number; ciphertext: string },
): Promise<Uint8Array> {
    if (!isDelegationEntryKind(entry.kind)) throw new RuntimeFormatError('entry_unusable');
    const aad = delegationEntryAad(ctx, { kind: entry.kind, ref: entry.ref, version: entry.version }, 'entry_unusable');
    try {
        const parts = entry.ciphertext.split('.');
        if (parts.length !== 2 || parts[0] !== DELEGATION_ENTRY_PREFIX) throw new Error('forme');
        const blob = fromB64u(parts[1]!);
        if (blob.length < 12 + 16) throw new Error('longueur');
        const key = await gcmOpen(await aesKey(dk, ['decrypt']), aad, blob);
        if (key.length !== KEY_LENGTH) throw new Error('longueur');
        return key;
    } catch {
        throw new RuntimeFormatError('entry_unusable');
    }
}

// ---------------------------------------------------------------------------
// Enveloppe rt1 des clés créées par le runtime (03 §10)
// ---------------------------------------------------------------------------

export const RT1_CREATOR_PREFIX = 'rt1:';

export function rt1CreatorId(delegationId: string): string {
    assertIds('invalid_input', delegationId);
    return `${RT1_CREATOR_PREFIX}${delegationId}`;
}

/** `delegationId` d'un `creatorId` `rt1:…`, ou `null` pour un créateur ordinaire. */
export function parseRt1Creator(creatorId: string): string | null {
    if (!creatorId.startsWith(RT1_CREATOR_PREFIX)) return null;
    const id = creatorId.slice(RT1_CREATOR_PREFIX.length);
    return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/** Contexte accepté : salon ou espace (`thread:<id>`, `space:<id>`). */
export type Rt1KeyContext = Extract<KeyContext, `thread:${string}` | `space:${string}`>;

export function rt1EnvelopeBytes(ctx: Rt1KeyContext, version: number, commitment: string, delegationId: string): string {
    const m = /^(thread|space):([A-Za-z0-9_-]{1,64})$/.exec(ctx);
    if (!m) throw new RuntimeFormatError('invalid_input');
    assertUints('invalid_input', version);
    assertIds('invalid_input', delegationId);
    return `synco-key-envelope-rt-v1|${ctx}|${version}|${commitment}|${delegationId}`;
}

/** Côté runtime (référence pour les vecteurs) : signature `csk` de l'enveloppe. */
export async function signRt1Envelope(cskPrivateKey: CryptoKey, rawKey: ArrayBuffer, ctx: Rt1KeyContext, version: number, delegationId: string): Promise<{ commitment: string; signature: string }> {
    const commitment = await keyCommitment(rawKey, ctx, version);
    return { commitment, signature: toB64(await ecdsaSign(cskPrivateKey, rt1EnvelopeBytes(ctx, version, commitment, delegationId))) };
}

/**
 * Vérifie l'enveloppe `rt1` avec la `csk` du certificat (03 §10 étape 5) : commitment
 * (`key_commitment_mismatch`) puis signature (`key_bad_signature`). Le mandat se vérifie à part
 * (`verifyMandate`, étape 3).
 */
export async function verifyRt1Envelope(
    cskPublic: string | object,
    rawKey: ArrayBuffer,
    envelope: { ctx: Rt1KeyContext; version: number; commitment: string; signature: string },
    delegationId: string,
): Promise<void> {
    let bytes: string;
    try {
        bytes = rt1EnvelopeBytes(envelope.ctx, envelope.version, envelope.commitment, delegationId);
    } catch {
        throw new RuntimeFormatError('key_bad_signature');
    }
    if ((await keyCommitment(rawKey, envelope.ctx, envelope.version)) !== envelope.commitment) throw new RuntimeFormatError('key_commitment_mismatch');
    let sig: Uint8Array;
    try {
        sig = fromB64(envelope.signature);
    } catch {
        throw new RuntimeFormatError('key_bad_signature');
    }
    if (!(await ecdsaVerify(cskPublic, bytes, sig))) throw new RuntimeFormatError('key_bad_signature');
}
