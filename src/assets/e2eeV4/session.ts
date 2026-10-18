import {
    E2eeV4Error, answerLinkRequest, completeLink, createDeviceEnvelope, createLinkRequest, createRecoveryEnvelope,
    formatLinkSecret, formatRecoveryKey, generateAccountKeyBytes, generateRecoveryKeyBytes, importAccountKey,
    openIdentityKey, openRecoveryEnvelope, parseLinkSecret, parseRecoveryKey, sealIdentityKey, verifyDeviceCertificate,
    type LinkRequest,
} from '../utils/e2eeV4';
import {
    enrollThisDevice, forgetThisDevice, getLocalDevice, unlockAccountKey,
    type DevicePayload, type DevicePlatform, type IdentityPin, type LocalDeviceRecord,
} from '../deviceVault/localDevice';
import { VaultError, type DeviceVault, type KeyValueStore, type VaultContext, type VaultKind } from '../deviceVault/types';

/**
 * Orchestration de l'E2EE v4 côté application (doc/securite/13-e2ee-v4-multi-appareil.md, P4) :
 * déverrouillage quotidien, création de compte, liaison d'un appareil (des deux côtés), connexion
 * par clé de récupération, retrait d'appareil avec rotation d'AK, régénération de la récupération.
 *
 * Sans Vue ni réseau (l'API est injectée) : testable de bout en bout. Règles tenues ici :
 * - AK, DK et les clés privées d'identité en PKCS#8 n'existent en clair que pendant une opération
 *   et sont effacées (fill(0)) à la fin, succès ou échec. Aucune n'est renvoyée à l'appelant, hormis
 *   les CryptoKey non extractables du quotidien.
 * - Chaque opération sensible redemande le coffre (biométrie, passkey ou PIN local) : AK n'est pas
 *   gardée en mémoire pendant la session.
 * - L'identité ouverte est comparée à l'identité épinglée localement (et à celle que sert le
 *   serveur) ; les certificats d'appareil sont vérifiés contre la clé de signature épinglée.
 * - Rien de secret ne part vers l'API : ni PIN, ni AK, ni DK, ni RK, ni secret de liaison.
 */

// ---------------------------------------------------------------------------
// API (implémentée par api.ts avec sfetch, simulée dans les tests)
// ---------------------------------------------------------------------------

export interface SealedIdentity {
    encryptedPrivateKey: string;
    keyIv: string;
    encryptedSignPrivateKey: string;
    signKeyIv: string;
}

export interface RemoteDevice {
    id: string;
    name: string;
    platform: DevicePlatform;
    publicKey: string;
    certificate: string;
    createdAt: string;
    lastUsedAt: string | null;
}

export interface PendingLink {
    id: string;
    name: string;
    platform: DevicePlatform;
    publicKey: string;
    createdAt: string;
    expiresAt: string;
}

export interface InitBody {
    device: DevicePayload;
    identity: SealedIdentity & { publicKey: string; publicSignKey: string };
    recoveryEnvelope?: string;
    verifier?: string;
}

export interface RotateBody {
    removeDeviceIds: string[];
    identity: SealedIdentity;
    recoveryEnvelope?: string;
    envelopes: Array<{ deviceId: string; envelope: string }>;
}

/** Erreur HTTP de l'API v4 (status conservé pour distinguer 404 / 409…). */
export class V4ApiError extends Error {
    constructor(readonly status: number, message: string, readonly body?: Record<string, unknown>) {
        super(message);
        this.name = 'V4ApiError';
    }
}

export interface V4Api {
    init(body: InitBody): Promise<void>;
    reset(body: Omit<InitBody, 'verifier'>): Promise<void>;
    listDevices(): Promise<RemoteDevice[]>;
    getEnvelope(deviceId: string): Promise<{ envelope: string; publicKey: string; certificate: string }>;
    renameDevice(deviceId: string, name: string): Promise<void>;
    addDevice(body: { device: DevicePayload; linkRequestId?: string }): Promise<void>;
    rotate(body: RotateBody): Promise<void>;
    getRecovery(): Promise<string | null>;
    putRecovery(recoveryEnvelope: string): Promise<void>;
    deleteRecovery(): Promise<void>;
    createLink(body: { id: string; publicKey: string; name: string; platform: DevicePlatform }): Promise<{ expiresAt: string }>;
    pendingLinks(): Promise<PendingLink[]>;
    answerLink(id: string, body: { responderPublicKey: string; envelope: string }): Promise<void>;
    getLink(id: string): Promise<{ answered: boolean; responderPublicKey: string | null; envelope: string | null } | null>;
    cancelLink(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Erreurs propres à la session
// ---------------------------------------------------------------------------

/**
 * L'identité ouverte ne correspond pas à celle attendue :
 * - 'pinned' : différente de celle épinglée sur cet appareil (fausse enveloppe ET fausses clés
 *   d'identité servies par le serveur) ;
 * - 'served' : la clé publique servie par le serveur n'est pas celle de la clé privée.
 */
export class IdentityMismatchError extends Error {
    constructor(readonly kind: 'pinned' | 'served') {
        super(kind === 'pinned'
            ? "Les clés de chiffrement reçues ne sont pas celles de votre compte sur cet appareil."
            : "La clé publique fournie par le serveur ne correspond pas à votre clé privée.");
        this.name = 'IdentityMismatchError';
    }
}

/** Cet appareil n'existe plus côté serveur (retiré depuis un autre appareil). */
export class DeviceRevokedError extends Error {
    constructor() {
        super("Cet appareil a été déconnecté de votre compte.");
        this.name = 'DeviceRevokedError';
    }
}

// ---------------------------------------------------------------------------
// Identité : génération, enveloppe sous AK, ouverture, vérification
// ---------------------------------------------------------------------------

const RSA_PARAMS = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;
const EC_SIGN = { name: 'ECDSA', namedCurve: 'P-256' } as const;

/** JWK RSA canonique (RFC 7638 : e, kty, n) — même forme que keyTrust.canonicalRsaJwk. */
export function canonicalRsa(jwk: string | JsonWebKey): string {
    const k = (typeof jwk === 'string' ? JSON.parse(jwk) : jwk) as JsonWebKey;
    if (k?.kty !== 'RSA' || typeof k.n !== 'string' || typeof k.e !== 'string') throw new E2eeV4Error('Invalid RSA public key');
    return JSON.stringify({ e: k.e, kty: 'RSA', n: k.n });
}

/** JWK EC canonique (crv, kty, x, y) — même forme que keyTrust.canonicalEcJwk. */
export function canonicalEc(jwk: string | JsonWebKey): string {
    const k = (typeof jwk === 'string' ? JSON.parse(jwk) : jwk) as JsonWebKey;
    if (k?.kty !== 'EC' || k.crv !== 'P-256' || typeof k.x !== 'string' || typeof k.y !== 'string') throw new E2eeV4Error('Invalid EC public key');
    return JSON.stringify({ crv: 'P-256', kty: 'EC', x: k.x, y: k.y });
}

interface IdentityBytes {
    rsaPkcs8: Uint8Array;
    signPkcs8: Uint8Array;
}

const wipeIdentity = (b?: IdentityBytes) => { b?.rsaPkcs8.fill(0); b?.signPkcs8.fill(0); };

/** Nouvelle identité (RSA-OAEP 4096 + ECDSA P-256), mêmes paramètres qu'en v3. */
async function generateIdentity(): Promise<IdentityBytes & IdentityPin> {
    const [rsa, sign] = await Promise.all([
        crypto.subtle.generateKey({ ...RSA_PARAMS, modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']),
        crypto.subtle.generateKey(EC_SIGN, true, ['sign', 'verify']),
    ]);
    return {
        rsaPkcs8: new Uint8Array(await crypto.subtle.exportKey('pkcs8', rsa.privateKey)),
        signPkcs8: new Uint8Array(await crypto.subtle.exportKey('pkcs8', sign.privateKey)),
        publicKey: canonicalRsa(await crypto.subtle.exportKey('jwk', rsa.publicKey)),
        publicSignKey: canonicalEc(await crypto.subtle.exportKey('jwk', sign.publicKey)),
    };
}

async function sealIdentity(akBytes: Uint8Array, userId: string, id: IdentityBytes): Promise<SealedIdentity> {
    const ak = await importAccountKey(akBytes);
    const [rsa, sign] = await Promise.all([
        sealIdentityKey(ak, 'rsa', userId, id.rsaPkcs8 as BufferSource),
        sealIdentityKey(ak, 'sign', userId, id.signPkcs8 as BufferSource),
    ]);
    return { encryptedPrivateKey: rsa.ciphertext, keyIv: rsa.iv, encryptedSignPrivateKey: sign.ciphertext, signKeyIv: sign.iv };
}

async function openIdentity(akBytes: Uint8Array, userId: string, sealed: SealedIdentity): Promise<IdentityBytes> {
    const ak = await importAccountKey(akBytes);
    const rsaPkcs8 = new Uint8Array(await openIdentityKey(ak, 'rsa', userId, { ciphertext: sealed.encryptedPrivateKey, iv: sealed.keyIv }));
    try {
        const signPkcs8 = new Uint8Array(await openIdentityKey(ak, 'sign', userId, { ciphertext: sealed.encryptedSignPrivateKey, iv: sealed.signKeyIv }));
        return { rsaPkcs8, signPkcs8 };
    } catch (e) {
        rsaPkcs8.fill(0);
        throw e;
    }
}

/** Clés publiques dérivées des clés privées (les seules qui fassent foi). */
async function derivePublic(id: IdentityBytes): Promise<IdentityPin> {
    const rsa = await crypto.subtle.importKey('pkcs8', id.rsaPkcs8 as BufferSource, RSA_PARAMS, true, ['decrypt']);
    const sign = await crypto.subtle.importKey('pkcs8', id.signPkcs8 as BufferSource, EC_SIGN, true, ['sign']);
    return {
        publicKey: canonicalRsa(await crypto.subtle.exportKey('jwk', rsa)),
        publicSignKey: canonicalEc(await crypto.subtle.exportKey('jwk', sign)),
    };
}

export interface IdentityKeys {
    /** RSA-OAEP, non extractable, `decrypt` seulement (comme unlockSecurity*). */
    privateKey: CryptoKey;
    /** ECDSA, non extractable, `sign` seulement. */
    privateSignKey: CryptoKey;
}

async function importIdentity(id: IdentityBytes): Promise<IdentityKeys> {
    return {
        privateKey: await crypto.subtle.importKey('pkcs8', id.rsaPkcs8 as BufferSource, RSA_PARAMS, false, ['decrypt']),
        privateSignKey: await crypto.subtle.importKey('pkcs8', id.signPkcs8 as BufferSource, EC_SIGN, false, ['sign']),
    };
}

/** Ce que le serveur annonce (user.publicKey / publicSignKey) : comparé, jamais cru. */
export interface ServedIdentity {
    publicKey?: string | null;
    publicSignKey?: string | null;
}

function assertServed(derived: IdentityPin, served: ServedIdentity) {
    try {
        if (!served.publicKey || canonicalRsa(served.publicKey) !== derived.publicKey) throw 0;
        if (!served.publicSignKey || canonicalEc(served.publicSignKey) !== derived.publicSignKey) throw 0;
    } catch {
        throw new IdentityMismatchError('served');
    }
}

// ---------------------------------------------------------------------------
// Confiance dans sa propre identité (keyTrust en production)
// ---------------------------------------------------------------------------

export interface OwnIdentityTrust {
    /**
     * Épingle sa propre identité. Sans `replace`, lève si une identité différente est déjà épinglée.
     * `replace` ne sert qu'à la réinitialisation de dernier recours (nouvelle identité voulue).
     */
    pin(identity: IdentityPin, opts?: { replace?: boolean }): Promise<void>;
    /** Clé de signature épinglée pour soi, si elle existe. */
    pinnedSignKey(): Promise<string | undefined>;
}

/** Clé de signature d'identité de référence : celle de l'enregistrement local, sinon keyTrust. */
async function referenceSignKey(record: LocalDeviceRecord | undefined, trust: OwnIdentityTrust): Promise<string> {
    const pinned = record?.identity?.publicSignKey ?? await trust.pinnedSignKey();
    if (!pinned) throw new IdentityMismatchError('pinned');
    return canonicalEc(pinned);
}

// ---------------------------------------------------------------------------
// Contexte commun
// ---------------------------------------------------------------------------

export interface DeviceContext {
    userId: string;
    store: KeyValueStore;
    vaultFor: (kind: VaultKind) => DeviceVault | undefined;
    api: V4Api;
    trust: OwnIdentityTrust;
}

/** Charge l'enveloppe de cet appareil ; un 404 signifie qu'il a été retiré. */
const envelopeFetcher = (api: V4Api) => async (deviceId: string) => {
    try {
        return await api.getEnvelope(deviceId);
    } catch (e) {
        if (e instanceof V4ApiError && e.status === 404) throw new DeviceRevokedError();
        throw e;
    }
};

/**
 * Exécute `fn` avec AK en clair, obtenue en déverrouillant le coffre de cet appareil, puis l'efface.
 * C'est la « confirmation » des opérations sensibles : biométrie, passkey ou PIN local.
 */
export async function withAccountKey<T>(
    dev: DeviceContext,
    ctx: VaultContext | undefined,
    fn: (akBytes: Uint8Array, record: LocalDeviceRecord) => Promise<T>,
): Promise<T> {
    const { akBytes, record } = await unlockAccountKey({ userId: dev.userId, store: dev.store, vaultFor: dev.vaultFor, ctx, fetchEnvelope: envelopeFetcher(dev.api) });
    try {
        return await fn(akBytes, record);
    } finally {
        akBytes.fill(0);
    }
}

// ---------------------------------------------------------------------------
// Déverrouillage quotidien
// ---------------------------------------------------------------------------

export interface UnlockResult extends IdentityKeys {
    deviceId: string;
}

/**
 * Coffre → DK → clé privée de l'appareil → AK → identité. Vérifie l'identité ouverte contre
 * l'identité épinglée localement puis contre celle que sert le serveur.
 */
export async function unlockV4(dev: DeviceContext, sealed: SealedIdentity, served: ServedIdentity, ctx?: VaultContext): Promise<UnlockResult> {
    let id: IdentityBytes | undefined;
    try {
        const record = await withAccountKey(dev, ctx, async (akBytes, rec) => {
            id = await openIdentity(akBytes, dev.userId, sealed);
            return rec;
        });
        const derived = await derivePublic(id!);
        const pinned = record.identity;
        if (pinned) {
            if (canonicalRsa(pinned.publicKey) !== derived.publicKey || canonicalEc(pinned.publicSignKey) !== derived.publicSignKey) {
                throw new IdentityMismatchError('pinned');
            }
        } else {
            // Enregistrement antérieur à P4 : keyTrust sert de référence (et refuse un changement).
            await dev.trust.pin(derived);
        }
        assertServed(derived, served);
        return { ...(await importIdentity(id!)), deviceId: record.deviceId };
    } finally {
        wipeIdentity(id);
    }
}

/** Le coffre de cet appareil exige-t-il le PIN local ? `null` : appareil non enregistré ici. */
export async function localVaultInfo(dev: Pick<DeviceContext, 'userId' | 'store' | 'vaultFor'>): Promise<{ record: LocalDeviceRecord; vault: DeviceVault | undefined } | null> {
    const record = await getLocalDevice(dev.store, dev.userId);
    if (!record) return null;
    return { record, vault: dev.vaultFor(record.vaultKind) };
}

// ---------------------------------------------------------------------------
// Inscription de cet appareil (commune à la création, la liaison et la récupération)
// ---------------------------------------------------------------------------

export interface EnrollOptions {
    name: string;
    platform: DevicePlatform;
    /** Coffres par ordre de préférence (preferredVaults()). */
    vaults: DeviceVault[];
    /** PIN local, quand le coffre retenu l'exige. */
    ctx?: VaultContext;
}

/**
 * Inscrit l'appareil. Si le meilleur coffre est indisponible et que le repli exige un PIN local, lève
 * VaultError('pin-required') : l'appelant demande un PIN puis rappelle avec `ctx.pin`. Les coffres
 * déjà constatés indisponibles ne sont pas réessayés (pas de seconde invite système inutile).
 */
async function enroll(
    userId: string,
    store: KeyValueStore,
    akBytes: Uint8Array,
    signPkcs8: Uint8Array,
    identity: IdentityPin,
    opts: EnrollOptions,
) {
    const identitySignKey = await crypto.subtle.importKey('pkcs8', signPkcs8 as BufferSource, EC_SIGN, false, ['sign']);
    const vaults = opts.ctx?.pin ? opts.vaults.filter(v => v.capabilities.needsPin) : opts.vaults;
    return enrollThisDevice({ userId, name: opts.name, platform: opts.platform, akBytes, identitySignKey, vaults, store, ctx: opts.ctx, identity });
}

// ---------------------------------------------------------------------------
// Création de compte (et réinitialisation de dernier recours)
// ---------------------------------------------------------------------------

/**
 * Compte préparé localement, pas encore envoyé : l'utilisateur lit sa clé de récupération avant
 * que l'on décide d'enregistrer ou non son enveloppe. AK est déjà effacée à ce stade.
 */
export interface PreparedAccount {
    recoveryKeyText: string;
    keys: IdentityKeys;
    identity: IdentityPin;
    /** Envoie le compte. `withRecovery` : l'utilisateur a conservé sa clé de récupération. */
    commit(withRecovery: boolean): Promise<void>;
    /** Abandon : l'appareil est oublié localement. */
    discard(): Promise<void>;
}

export async function prepareV4Account(
    dev: DeviceContext,
    opts: EnrollOptions & { mode: 'create' | 'reset' },
): Promise<PreparedAccount> {
    const id = await generateIdentity();
    const akBytes = generateAccountKeyBytes();
    const rk = generateRecoveryKeyBytes();
    try {
        const pin: IdentityPin = { publicKey: id.publicKey, publicSignKey: id.publicSignKey };
        const sealed = await sealIdentity(akBytes, dev.userId, id);
        const { payload } = await enroll(dev.userId, dev.store, akBytes, id.signPkcs8, pin, opts);
        const recoveryEnvelope = await createRecoveryEnvelope(rk, akBytes, dev.userId);
        const recoveryKeyText = await formatRecoveryKey(rk);
        const keys = await importIdentity(id);

        const discard = () => forgetThisDevice(dev.userId, dev.store, dev.vaultFor);
        return {
            recoveryKeyText, keys, identity: pin, discard,
            async commit(withRecovery: boolean) {
                const body = {
                    device: payload,
                    identity: { ...sealed, publicKey: pin.publicKey, publicSignKey: pin.publicSignKey },
                    ...(withRecovery ? { recoveryEnvelope } : {}),
                };
                try {
                    if (opts.mode === 'reset') await dev.api.reset(body);
                    else await dev.api.init(body);
                } catch (e) {
                    await discard();
                    throw e;
                }
                await dev.trust.pin(pin, { replace: opts.mode === 'reset' });
            },
        };
    } finally {
        akBytes.fill(0);
        rk.fill(0);
        wipeIdentity(id);
    }
}

// ---------------------------------------------------------------------------
// Nouvel appareil : ouverture d'AK (liaison ou récupération), puis inscription
// ---------------------------------------------------------------------------

/**
 * AK authentique en main (liaison authentifiée par le secret, ou clé de récupération) : ouvre
 * l'identité, compare à ce que sert le serveur, épingle, inscrit l'appareil puis l'enregistre.
 */
async function enrollWithAccountKey(
    dev: DeviceContext,
    akBytes: Uint8Array,
    sealed: SealedIdentity,
    served: ServedIdentity,
    opts: EnrollOptions,
    linkRequestId?: string,
): Promise<IdentityKeys> {
    const id = await openIdentity(akBytes, dev.userId, sealed);
    try {
        const derived = await derivePublic(id);
        assertServed(derived, served);
        const { payload } = await enroll(dev.userId, dev.store, akBytes, id.signPkcs8, derived, opts);
        try {
            await dev.api.addDevice({ device: payload, ...(linkRequestId ? { linkRequestId } : {}) });
        } catch (e) {
            await forgetThisDevice(dev.userId, dev.store, dev.vaultFor);
            throw e;
        }
        await dev.trust.pin(derived);
        return await importIdentity(id);
    } finally {
        wipeIdentity(id);
    }
}

/** Connexion d'un appareil par la clé de récupération (aucun autre appareil disponible). */
export async function recoverWithKey(
    dev: DeviceContext,
    keyText: string,
    sealed: SealedIdentity,
    served: ServedIdentity,
    opts: EnrollOptions,
): Promise<IdentityKeys> {
    const rk = await parseRecoveryKey(keyText);
    let akBytes: Uint8Array | undefined;
    try {
        const envelope = await dev.api.getRecovery();
        if (!envelope) throw new V4ApiError(404, "Aucune clé de récupération n'est enregistrée pour ce compte.");
        akBytes = await openRecoveryEnvelope(rk, envelope, dev.userId);
        return await enrollWithAccountKey(dev, akBytes, sealed, served, opts);
    } finally {
        rk.fill(0);
        akBytes?.fill(0);
    }
}

// --- Liaison : côté nouvel appareil ---------------------------------------

const QR_PREFIX = 'synco-link:1:';

/** Contenu du QR code : identifiant de la demande + secret de liaison (jamais envoyé à l'API). */
export async function linkQrPayload(requestId: string, linkSecret: Uint8Array): Promise<string> {
    return `${QR_PREFIX}${requestId}:${(await formatLinkSecret(linkSecret)).replace(/-/g, '')}`;
}

/** Lit un QR code de liaison. `null` si ce n'en est pas un. */
export async function parseLinkQr(text: string): Promise<{ requestId: string; linkSecret: Uint8Array } | null> {
    const t = text.trim();
    if (!t.startsWith(QR_PREFIX)) return null;
    const [requestId, secret, extra] = t.slice(QR_PREFIX.length).split(':');
    if (!requestId || !secret || extra !== undefined || !/^[0-9a-f-]{36}$/i.test(requestId)) return null;
    try {
        return { requestId, linkSecret: await parseLinkSecret(secret) };
    } catch {
        return null;
    }
}

export interface StartedLink {
    requestId: string;
    qrPayload: string;
    /** Le même secret, à recopier à la main (28 caractères). */
    codeText: string;
    expiresAt: string;
    /** Attend la réponse de l'appareil connecté ; renvoie le code à comparer et la suite. */
    poll(): Promise<OpenedLink | null>;
    cancel(): Promise<void>;
}

export interface OpenedLink {
    /** Code à 6 chiffres : confirme l'intention, ce n'est pas une défense. */
    sas: string;
    /** L'utilisateur a constaté le même code des deux côtés : inscription de l'appareil. */
    confirm(sealed: SealedIdentity, served: ServedIdentity, opts: EnrollOptions): Promise<IdentityKeys>;
    /** Abandon : AK est effacée, la demande annulée. */
    dispose(): Promise<void>;
}

export async function startLink(dev: DeviceContext, name: string, platform: DevicePlatform): Promise<StartedLink> {
    const request: LinkRequest = await createLinkRequest();
    const { expiresAt } = await dev.api.createLink({ id: request.requestId, publicKey: JSON.stringify(request.publicKey), name, platform });
    const qrPayload = await linkQrPayload(request.requestId, request.linkSecret);
    const codeText = await formatLinkSecret(request.linkSecret);

    const cancel = async () => {
        request.linkSecret.fill(0);
        await dev.api.cancelLink(request.requestId).catch(() => {});
    };

    return {
        requestId: request.requestId, qrPayload, codeText, expiresAt, cancel,
        async poll() {
            const state = await dev.api.getLink(request.requestId);
            if (!state) throw new V4ApiError(404, 'La demande de liaison a expiré.');
            if (!state.answered || !state.envelope || !state.responderPublicKey) return null;
            const { akBytes, sas } = await completeLink(request, { responderPublicKey: JSON.parse(state.responderPublicKey), envelope: state.envelope }, dev.userId);
            request.linkSecret.fill(0);
            let done = false;
            return {
                sas,
                async confirm(sealed, served, opts) {
                    if (done) throw new E2eeV4Error('Link already used');
                    try {
                        const keys = await enrollWithAccountKey(dev, akBytes, sealed, served, opts, request.requestId);
                        done = true;
                        akBytes.fill(0);
                        return keys;
                    } catch (e) {
                        // PIN local à choisir, ou invite système annulée : on garde AK le temps de
                        // réessayer (dispose() l'efface en cas d'abandon) ; sinon on efface.
                        if (!(e instanceof VaultError && (e.code === 'pin-required' || e.code === 'cancelled'))) { done = true; akBytes.fill(0); }
                        throw e;
                    }
                },
                async dispose() {
                    done = true;
                    akBytes.fill(0);
                    await dev.api.cancelLink(request.requestId).catch(() => {});
                },
            };
        },
    };
}

// --- Liaison : côté appareil déjà connecté --------------------------------

/**
 * Répond à une demande de liaison après confirmation explicite de l'utilisateur. Le secret vient du
 * QR code ou de la saisie ; la clé publique du nouvel appareil vient du serveur, ce qui est sans
 * danger : sans le secret, une substitution ne permet pas de dériver la clé d'enveloppe.
 */
export async function answerLink(
    dev: DeviceContext,
    pending: PendingLink,
    linkSecret: Uint8Array,
    ctx?: VaultContext,
): Promise<{ sas: string }> {
    try {
        return await withAccountKey(dev, ctx, async (akBytes) => {
            const answer = await answerLinkRequest(JSON.parse(pending.publicKey), akBytes, dev.userId, pending.id, linkSecret);
            await dev.api.answerLink(pending.id, { responderPublicKey: JSON.stringify(answer.responderPublicKey), envelope: answer.envelope });
            return { sas: answer.sas };
        });
    } finally {
        linkSecret.fill(0);
    }
}

// ---------------------------------------------------------------------------
// Appareils : certificats, retrait avec rotation d'AK
// ---------------------------------------------------------------------------

export interface CheckedDevice extends RemoteDevice {
    /** Certificat valide pour la clé de signature d'identité épinglée. */
    certified: boolean;
    isThisDevice: boolean;
}

export async function checkDevices(dev: DeviceContext, devices?: RemoteDevice[]): Promise<CheckedDevice[]> {
    const list = devices ?? await dev.api.listDevices();
    const record = await getLocalDevice(dev.store, dev.userId);
    const signKey = await referenceSignKey(record, dev.trust).catch(() => undefined);
    return Promise.all(list.map(async d => {
        let certified = false;
        if (signKey) {
            try {
                certified = await verifyDeviceCertificate(JSON.parse(signKey), d.certificate, dev.userId, d.id, d.platform, JSON.parse(d.publicKey));
            } catch { certified = false; }
        }
        return { ...d, certified, isThisDevice: d.id === record?.deviceId };
    }));
}

export interface RotationResult {
    /** Appareils effectivement retirés (demandés + non certifiés purgés). */
    removed: string[];
    /** Nouvelle clé de récupération (l'ancienne enveloppait l'ancienne AK et ne fonctionne plus). */
    recoveryKeyText?: string;
    /** Cet appareil a été retiré : il est oublié localement, l'appelant doit verrouiller. */
    removedThisDevice: boolean;
}

const MAX_ROTATION_ATTEMPTS = 3;

/**
 * Retire des appareils : nouvelle AK, identité rescellée, une enveloppe par appareil restant
 * **certifié** (certificat vérifié contre la clé de signature épinglée, jamais contre une valeur du
 * serveur). Les appareils non certifiés sont retirés avec les autres : aucune enveloppe ne leur est
 * jamais produite. Si un appareil est ajouté entre-temps (409), on recommence avec la liste à jour.
 *
 * Limite (spec §7) : un appareil retiré qui était déverrouillé connaît encore l'identité ; seule une
 * rotation d'identité (hors périmètre) l'en priverait.
 */
export async function removeDevices(
    dev: DeviceContext,
    removeIds: string[],
    fetchSealed: () => Promise<SealedIdentity>,
    ctx?: VaultContext,
): Promise<RotationResult> {
    let id: IdentityBytes | undefined;
    let thisDeviceId = '';
    let signKey = '';
    try {
        // Une seule confirmation (coffre) pour toute l'opération, reprises comprises.
        await withAccountKey(dev, ctx, async (akBytes, record) => {
            thisDeviceId = record.deviceId;
            signKey = await referenceSignKey(record, dev.trust);
            id = await openIdentity(akBytes, dev.userId, await fetchSealed());
            const derived = await derivePublic(id);
            if (record.identity && canonicalEc(record.identity.publicSignKey) !== derived.publicSignKey) throw new IdentityMismatchError('pinned');
        });

        for (let attempt = 1; ; attempt++) {
            const checked = await checkDevices(dev, await dev.api.listDevices());
            const signJwk = JSON.parse(signKey) as JsonWebKey;
            const remove = new Set(removeIds.filter(rid => checked.some(d => d.id === rid)));
            const keep: CheckedDevice[] = [];
            for (const d of checked) {
                if (remove.has(d.id)) continue;
                const ok = await verifyDeviceCertificate(signJwk, d.certificate, dev.userId, d.id, d.platform, JSON.parse(d.publicKey)).catch(() => false);
                if (ok) keep.push(d); else remove.add(d.id);
            }
            if (keep.length === 0) throw new E2eeV4Error('At least one device must remain');

            const newAk = generateAccountKeyBytes();
            const rk = generateRecoveryKeyBytes();
            try {
                const identity = await sealIdentity(newAk, dev.userId, id!);
                const envelopes = await Promise.all(keep.map(async d => ({
                    deviceId: d.id,
                    envelope: await createDeviceEnvelope(JSON.parse(d.publicKey), newAk, dev.userId, d.id),
                })));
                const hasRecovery = (await dev.api.getRecovery()) !== null;
                const recoveryEnvelope = hasRecovery ? await createRecoveryEnvelope(rk, newAk, dev.userId) : undefined;
                try {
                    await dev.api.rotate({ removeDeviceIds: [...remove], identity, envelopes, ...(recoveryEnvelope ? { recoveryEnvelope } : {}) });
                } catch (e) {
                    if (e instanceof V4ApiError && e.status === 409 && attempt < MAX_ROTATION_ATTEMPTS) continue;
                    throw e;
                }
                const removedThisDevice = remove.has(thisDeviceId);
                if (removedThisDevice) await forgetThisDevice(dev.userId, dev.store, dev.vaultFor);
                return {
                    removed: [...remove],
                    removedThisDevice,
                    ...(hasRecovery ? { recoveryKeyText: await formatRecoveryKey(rk) } : {}),
                };
            } finally {
                newAk.fill(0);
                rk.fill(0);
            }
        }
    } finally {
        wipeIdentity(id);
    }
}

// ---------------------------------------------------------------------------
// Clé de récupération
// ---------------------------------------------------------------------------

/** Nouvelle clé de récupération ; la précédente cesse aussitôt de fonctionner. */
export async function regenerateRecoveryKey(dev: DeviceContext, ctx?: VaultContext): Promise<string> {
    return withAccountKey(dev, ctx, async (akBytes) => {
        const rk = generateRecoveryKeyBytes();
        try {
            await dev.api.putRecovery(await createRecoveryEnvelope(rk, akBytes, dev.userId));
            return await formatRecoveryKey(rk);
        } finally {
            rk.fill(0);
        }
    });
}

/** Contenu du fichier proposé au téléchargement. */
export function recoveryKeyFile(keyText: string, accountLabel: string, date = new Date()): string {
    return [
        'Synco — clé de récupération',
        '',
        `Compte : ${accountLabel}`,
        `Créée le : ${date.toLocaleDateString('fr-FR')}`,
        '',
        keyText,
        '',
        "Cette clé permet de retrouver vos messages chiffrés sur un nouvel appareil si vous n'avez",
        "plus accès à aucun de vos appareils. Conservez-la hors ligne (papier, gestionnaire de mots de",
        "passe). Quiconque la possède, avec l'accès à votre compte, peut lire vos messages.",
        "Une nouvelle clé générée depuis les paramètres rend celle-ci inutilisable.",
        '',
    ].join('\n');
}
