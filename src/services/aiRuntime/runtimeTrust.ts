/**
 * Confiance dans le runtime de l'org (01 §4 à §8) : fiche publique lue en direct, certificat signé par
 * un admin épinglé, épinglage TOFU, défi de possession. Toute délégation passe par
 * `verifyRuntimeForDelegation` ; aucun dépôt n'a lieu si une étape échoue.
 */
import {
    canonicalRuntimeEcJwk,
    canonicalRuntimeUrl,
    createChallengeRequest,
    formatRuntimeFingerprint,
    fromB64u,
    isValidId,
    runtimeCertBytes,
    runtimeFingerprint,
    toHex,
    verifyChallengeResponse,
    verifyRuntimeCertificate,
    type ChallengePurpose,
    type RuntimeCertificate,
    type RuntimePublicKeys,
} from '@/assets/utils/runtimeCert';
import { AiRuntimeError, apiError } from './errors';
import type { AiRuntimeDeps, HttpResult } from './ports';
import { checkRuntimePin, pinRuntime, type RuntimePinState } from './runtimePin';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Clés canoniques ; `null` si l'une est invalide. */
function readKeys(value: unknown): RuntimePublicKeys | null {
    if (!isObj(value) || typeof value.sig !== 'string' || !value.kex || !value.csk) return null;
    try {
        if (fromB64u(value.sig).length !== 32) return null;
        const kex = canonicalRuntimeEcJwk(value.kex as string | object);
        const csk = canonicalRuntimeEcJwk(value.csk as string | object);
        if (kex === csk) return null;
        return { sig: value.sig, kex, csk };
    } catch {
        return null;
    }
}

const sameKeys = (a: RuntimePublicKeys, b: RuntimePublicKeys): boolean => a.sig === b.sig && a.kex === b.kex && a.csk === b.csk;

export function requireUserId(deps: AiRuntimeDeps): string {
    const id = deps.identity.userId();
    if (!id) throw new AiRuntimeError('e2ee_locked');
    return id;
}

// ---------------------------------------------------------------------------
// Fiche publique (01 §4) et défi (01 §5), en direct
// ---------------------------------------------------------------------------

export interface RuntimeIdentity {
    runtimeId: string;
    url: string;
    keys: RuntimePublicKeys;
    /** Empreinte RECALCULÉE par le client (le champ `fingerprint` servi est ignoré). */
    fprHex: string;
    fpr: Uint8Array;
    /** Org appairée selon le runtime, `null` avant appairage. */
    orgId: string | null;
}

export function canonicalUrlOrThrow(deps: AiRuntimeDeps, input: string): string {
    try {
        return canonicalRuntimeUrl(input, { allowDevHttp: deps.allowDevHttp });
    } catch {
        throw new AiRuntimeError('url_invalid');
    }
}

async function direct(call: () => Promise<HttpResult>): Promise<HttpResult> {
    try {
        return await call();
    } catch {
        throw new AiRuntimeError('runtime_unreachable');
    }
}

/** `GET <url>/v1/identity` : forme stricte, empreinte recalculée. Réponse illisible → `cert_runtime_mismatch`. */
export async function fetchRuntimeIdentity(deps: AiRuntimeDeps, url: string): Promise<RuntimeIdentity> {
    const res = await direct(() => deps.runtime.identity(url));
    if (res.status !== 200) throw new AiRuntimeError('runtime_unreachable', { status: res.status });
    const b = res.body;
    const keys = isObj(b) ? readKeys(b.keys) : null;
    if (!isObj(b) || b.v !== 1 || typeof b.runtimeId !== 'string' || !isValidId(b.runtimeId) || !keys
        || !(b.orgId === null || (typeof b.orgId === 'string' && isValidId(b.orgId)))) {
        throw new AiRuntimeError('cert_runtime_mismatch');
    }
    const fpr = await runtimeFingerprint(b.runtimeId, keys);
    return { runtimeId: b.runtimeId, url, keys, fpr, fprHex: toHex(fpr), orgId: b.orgId as string | null };
}

/**
 * Défi de possession (01 §5) : `mac` (clé `kex`) ET `sig` (clé `csk`) vérifiés avec l'empreinte
 * calculée par le client. La clé éphémère n'est jamais extractable et n'est plus référencée ensuite.
 */
export async function runChallenge(deps: AiRuntimeDeps, purpose: ChallengePurpose, orgId: string, identity: RuntimeIdentity): Promise<void> {
    const userId = requireUserId(deps);
    let created: Awaited<ReturnType<typeof createChallengeRequest>>;
    try {
        created = await createChallengeRequest(purpose, orgId, userId);
    } catch {
        throw new AiRuntimeError('challenge_failed');
    }
    const { request, ephemeralPrivateKey } = created;
    const res = await direct(() => deps.runtime.challenge(identity.url, { v: 1, ...request, clientEph: JSON.parse(request.clientEph) as object }));
    const b = res.body;
    if (res.status !== 200 || !isObj(b) || b.v !== 1 || b.runtimeId !== identity.runtimeId || typeof b.mac !== 'string' || typeof b.sig !== 'string') {
        throw new AiRuntimeError('challenge_failed');
    }
    const ok = await verifyChallengeResponse(request, identity.runtimeId, identity.fprHex, ephemeralPrivateKey, identity.keys, { mac: b.mac, sig: b.sig });
    if (!ok) throw new AiRuntimeError('challenge_failed');
}

// ---------------------------------------------------------------------------
// Registre de l'org (GET /api/orgs/:orgId/ai/runtime) et certificat (01 §6)
// ---------------------------------------------------------------------------

export interface ServedRuntime {
    runtimeId: string;
    certificate: RuntimeCertificate;
    signature: string;
    certSerial: number;
    online: boolean;
    signer: { adminId: string | null; isAdmin: boolean };
}

export interface RuntimeRegistry {
    runtime: ServedRuntime | null;
    /** Le registre annonce un runtime dont le certificat est illisible. */
    certificateUnreadable: boolean;
    allowedForMe: boolean;
    maxDelegationDays: number | null;
}

/** Forme du certificat (01 §6.2) ; `null` si non conforme. */
function readCertificate(value: unknown): { cert: RuntimeCertificate; signature: string } | null {
    if (!isObj(value) || value.v !== 1) return null;
    const keys = readKeys(value.keys);
    const { orgId, runtimeId, url, adminId, issuedAt, serial, signature } = value;
    if (!keys || typeof orgId !== 'string' || typeof runtimeId !== 'string' || typeof url !== 'string' || typeof adminId !== 'string'
        || typeof issuedAt !== 'number' || typeof serial !== 'number' || typeof signature !== 'string') return null;
    return { cert: { orgId, runtimeId, url, keys, adminId, issuedAt, serial }, signature };
}

export async function fetchRuntimeRegistry(deps: AiRuntimeDeps, orgId: string): Promise<RuntimeRegistry> {
    const res = await deps.api.request('GET', `/api/orgs/${encodeURIComponent(orgId)}/ai/runtime`);
    if (res.status !== 200 || !isObj(res.body)) throw apiError(res.status, res.body);
    const b = res.body;
    const policy = isObj(b.policy) ? b.policy : {};
    const maxDays = typeof policy.maxDelegationDays === 'number' && policy.maxDelegationDays > 0 ? policy.maxDelegationDays : null;
    const base = { allowedForMe: b.allowedForMe === true, maxDelegationDays: maxDays };
    if (!isObj(b.runtime)) return { runtime: null, certificateUnreadable: false, ...base };
    const r = b.runtime;
    const parsed = readCertificate(r.certificate);
    const signer = isObj(r.signer) ? r.signer : {};
    if (!parsed || typeof r.runtimeId !== 'string') return { runtime: null, certificateUnreadable: true, ...base };
    return {
        runtime: {
            runtimeId: r.runtimeId,
            certificate: parsed.cert,
            signature: parsed.signature,
            certSerial: typeof r.certSerial === 'number' ? r.certSerial : parsed.cert.serial,
            online: r.online === true,
            signer: { adminId: typeof signer.adminId === 'string' ? signer.adminId : null, isAdmin: signer.isAdmin === true },
        },
        certificateUnreadable: false,
        ...base,
    };
}

// ---------------------------------------------------------------------------
// Vérification complète (01 §6.3)
// ---------------------------------------------------------------------------

export interface VerifiedRuntime {
    runtimeId: string;
    url: string;
    keys: RuntimePublicKeys;
    fprHex: string;
    /** Empreinte formatée pour l'affichage (groupes de 4, 01 §2.1). */
    fingerprint: string;
    adminId: string;
    serial: number;
    online: boolean;
    pinState: RuntimePinState;
    maxDelegationDays: number | null;
}

export interface VerifyOptions {
    /**
     * L'utilisateur a vu l'empreinte et le signataire et confirme explicitement la première vue
     * (01 §8). Sans elle, une première vue lève `runtime_first_seen` (avec l'empreinte à afficher).
     */
    confirmFirstSeen?: boolean;
    /**
     * Empreinte (formatée) affichée à l'utilisateur au moment de confirmer. Si elle est fournie et que le
     * runtime en présente une autre maintenant, la confirmation est refusée (`runtime_first_seen` avec la
     * nouvelle empreinte) : on ne confirme que ce qu'on a vu. Les écrans la fournissent toujours.
     */
    confirmedFingerprint?: string;
    /** Défi de possession (étape 6). `false` seulement pour l'affichage (`inspectRuntime`). */
    challenge?: boolean;
    /**
     * Interne à `acceptNewRuntimeKey` : empreinte affichée (formatée) que l'utilisateur accepte. Un
     * état `changed` n'est alors pas refusé si le runtime présenté a exactement cette empreinte ;
     * toutes les autres vérifications (certificat, signataire, fiche directe) restent appliquées.
     */
    accepting?: string;
}

/**
 * Étapes 1 à 6 de 01 §6.3, dans l'ordre ; chaque échec lève le code indiqué par la spec. L'épingle
 * d'une première vue confirmée n'est écrite qu'après le défi réussi.
 */
export async function verifyRuntimeForDelegation(deps: AiRuntimeDeps, orgId: string, options: VerifyOptions = {}): Promise<VerifiedRuntime> {
    const userId = requireUserId(deps);
    const registry = await fetchRuntimeRegistry(deps, orgId);
    if (registry.certificateUnreadable) throw new AiRuntimeError('cert_invalid');
    const served = registry.runtime;
    if (!served) throw new AiRuntimeError('no_runtime');
    if (!registry.allowedForMe) throw new AiRuntimeError('runtime_not_allowed');
    const { certificate: cert, signature } = served;

    // 1. Forme, org courante, runtime annoncé par l'API.
    if (cert.orgId !== orgId || cert.runtimeId !== served.runtimeId) throw new AiRuntimeError('cert_invalid');
    try {
        runtimeCertBytes(cert, { allowDevHttp: deps.allowDevHttp });
    } catch {
        throw new AiRuntimeError('cert_invalid');
    }

    // 2. Signataire actuellement admin (parole de l'API, 00 §6 Q2).
    if (served.signer.adminId !== cert.adminId || !served.signer.isAdmin) throw new AiRuntimeError('cert_signer_not_admin', { adminId: cert.adminId });

    // 3. Signature par une clé de l'admin, résultat `trusted` uniquement.
    let trust: string;
    try {
        trust = await deps.signTrust.verify(cert.adminId, deps.directory.signKeyOf(orgId, cert.adminId), jwk =>
            verifyRuntimeCertificate(jwk, cert, signature, { allowDevHttp: deps.allowDevHttp }));
    } catch {
        throw new AiRuntimeError('cert_bad_signature', { adminId: cert.adminId });
    }
    if (trust !== 'trusted') throw new AiRuntimeError('cert_bad_signature', { adminId: cert.adminId });

    // 4. Fiche publique en direct : mêmes identifiant et clés.
    const identity = await fetchRuntimeIdentity(deps, cert.url);
    if (identity.runtimeId !== cert.runtimeId || identity.orgId !== orgId || !sameKeys(identity.keys, cert.keys)) throw new AiRuntimeError('cert_runtime_mismatch');

    // 5. Épinglage TOFU.
    const fingerprint = formatRuntimeFingerprint(identity.fprHex);
    const pin = await checkRuntimePin(deps.store, userId, orgId, identity.runtimeId, identity.fprHex);
    if (pin.state === 'changed' && options.accepting !== fingerprint) {
        throw new AiRuntimeError('runtime_key_changed', { fingerprint, pinnedFingerprint: pin.pinnedFpr ? formatRuntimeFingerprint(pin.pinnedFpr) : undefined, adminId: cert.adminId });
    }
    const firstSeen = pin.state === 'first_seen' || pin.state === 'first_seen_after_change';
    if (firstSeen && options.confirmFirstSeen && options.confirmedFingerprint !== undefined
        && options.confirmedFingerprint !== fingerprint && options.challenge !== false) {
        throw new AiRuntimeError('runtime_first_seen', { fingerprint, adminId: cert.adminId, previouslyPinned: pin.state === 'first_seen_after_change' });
    }
    if (firstSeen && !options.confirmFirstSeen && options.challenge !== false) {
        throw new AiRuntimeError('runtime_first_seen', { fingerprint, adminId: cert.adminId, previouslyPinned: pin.state === 'first_seen_after_change' });
    }

    // 6. Défi de possession.
    if (options.challenge !== false) {
        await runChallenge(deps, 'delegate', orgId, identity);
        if (firstSeen) await pinRuntime(deps.store, userId, orgId, identity.runtimeId, identity.fprHex, deps.clock.now());
    }

    return {
        runtimeId: identity.runtimeId,
        url: cert.url,
        keys: identity.keys,
        fprHex: identity.fprHex,
        fingerprint,
        adminId: cert.adminId,
        serial: cert.serial,
        online: served.online,
        pinState: firstSeen && options.challenge !== false ? 'match' : pin.state,
        maxDelegationDays: registry.maxDelegationDays,
    };
}

/** Vue des réglages (C3 §1.6) : runtime, empreinte et état de l'épingle. */
export type RuntimeInspection =
    | { state: 'none' }
    | { state: 'not_allowed' }
    | { state: 'error'; code: AiRuntimeError['code'] }
    | { state: 'ok'; runtime: VerifiedRuntime };

/**
 * Étapes 1 à 5 sans défi ni écriture d'épingle : pour afficher l'empreinte et « identique à celle
 * épinglée » ou « changée ». Ne lève pas : l'état est rendu typé.
 */
export async function inspectRuntime(deps: AiRuntimeDeps, orgId: string): Promise<RuntimeInspection> {
    try {
        return { state: 'ok', runtime: await verifyRuntimeForDelegation(deps, orgId, { challenge: false }) };
    } catch (e) {
        if (e instanceof AiRuntimeError) {
            if (e.code === 'no_runtime') return { state: 'none' };
            if (e.code === 'runtime_not_allowed') return { state: 'not_allowed' };
            return { state: 'error', code: e.code };
        }
        return { state: 'error', code: 'api_error' };
    }
}

/**
 * Acceptation EXPLICITE d'une nouvelle clé du runtime (01 §8), après affichage de l'ancienne et de la
 * nouvelle empreinte : refait la vérification complète (certificat, signataire, défi) puis épingle ;
 * l'ancienne épingle passe dans `previous`. `expectedFingerprint` = l'empreinte que l'utilisateur a
 * vue : si le runtime présenté a encore changé entre-temps, refus.
 */
export async function acceptNewRuntimeKey(deps: AiRuntimeDeps, orgId: string, expectedFingerprint: string): Promise<VerifiedRuntime> {
    const userId = requireUserId(deps);
    // Étapes 1 à 5 complètes (certificat, signataire, fiche directe), l'épingle étant tolérée uniquement
    // pour l'empreinte que l'utilisateur a vue ; rien n'est écrit tant que tout n'a pas réussi.
    const seen = await verifyRuntimeForDelegation(deps, orgId, { challenge: false, accepting: expectedFingerprint });
    if (seen.fingerprint !== expectedFingerprint) throw new AiRuntimeError('runtime_key_changed', { fingerprint: seen.fingerprint });
    const registry = await fetchRuntimeRegistry(deps, orgId);
    if (!registry.runtime) throw new AiRuntimeError('no_runtime');
    const identity = await fetchRuntimeIdentity(deps, registry.runtime.certificate.url);
    if (formatRuntimeFingerprint(identity.fprHex) !== expectedFingerprint) throw new AiRuntimeError('runtime_key_changed');
    await runChallenge(deps, 'delegate', orgId, identity);
    // Dernière vérification complète, puis seulement l'épinglage.
    const final = await verifyRuntimeForDelegation(deps, orgId, { challenge: false, accepting: expectedFingerprint });
    if (final.fprHex !== identity.fprHex || final.runtimeId !== identity.runtimeId) throw new AiRuntimeError('runtime_key_changed', { fingerprint: final.fingerprint });
    await pinRuntime(deps.store, userId, orgId, identity.runtimeId, identity.fprHex, deps.clock.now());
    return verifyRuntimeForDelegation(deps, orgId, { challenge: false });
}
