import { get, set } from 'idb-keyval';
import { shallowRef } from 'vue';
import { user } from '@/assets/var';
import type { SupportChannel, SupportStaffKeyInfo } from '@/types/support';
import {
    privateSignKey,
    encryptBufferForPeer, decryptBufferFromPeer,
    encryptThreadKeyForMember, decryptThreadKeyWithRsa, generateThreadKey,
} from './crypto';
import { canonicalRsaJwk, requireTrustedSignKey, UntrustedKeyError } from './keyTrust';
import { signKeyEnvelope, verifyKeyEnvelope } from './keyEnvelope';
import { pinOrCheckKey, type KeyContext } from './keyPinning';
import { registerKeyCache } from './keyCaches';

/**
 * Chiffrement du SAV intégré (SUPPORT_FEATURE.md §2) — uniquement des
 * compositions des primitives existantes, aucune crypto écrite à la main :
 *
 * - clé d'équipe : paire RSA-OAEP 4096/SHA-256 (mêmes paramètres que les
 *   clés utilisateur), signée par le super-admin avec sa clé d'identité
 *   ECDSA (FC4), dont la clé privée pkcs8 est scellée pour chaque membre de
 *   l'équipe par encryptBufferForPeer ;
 * - clés de ticket : une clé AES-GCM par canal (PUBLIC/INTERNAL), scellée en
 *   RSA-OAEP brut (encryptThreadKeyForMember) pour le créateur et/ou la clé
 *   d'équipe, avec l'enveloppe signée FC4 et l'épinglage FC4 §1 comme les
 *   clés de salon.
 *
 * Rien de ce module ne parle au réseau : les appels API sont dans
 * src/services/support/. Rien n'est journalisé hormis des identifiants.
 */

// ---------------------------------------------------------------------------
// Encodage
// ---------------------------------------------------------------------------

const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    // Par blocs : String.fromCharCode(...bytes) dépasse la pile d'appel
    // au-delà de quelques dizaines de Ko (une clé pkcs8 4096 en fait ~2,4).
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
};

const fromB64 = (b64: string): ArrayBuffer => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return bytes.buffer as ArrayBuffer;
};

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export type StaffKeyErrorReason =
    | 'bad-signature'       // signature de la clé d'équipe invalide
    | 'no-signer-key'       // clé de signature du signataire absente
    | 'signer-changed'      // le signataire n'est plus celui épinglé (TOFU)
    | 'signer-key-changed'  // le signataire a changé de clé de signature
    | 'key-mismatch'        // clé privée reçue ≠ clé publique signée
    | 'bad-share';          // copie illisible

export class StaffKeyError extends Error {
    readonly reason: StaffKeyErrorReason;
    constructor(reason: StaffKeyErrorReason, message?: string) {
        super(message ?? STAFF_KEY_ERROR_MESSAGES[reason]);
        this.name = 'StaffKeyError';
        this.reason = reason;
    }
}

const STAFF_KEY_ERROR_MESSAGES: Record<StaffKeyErrorReason, string> = {
    'bad-signature': "La clé de chiffrement du support n'a pas pu être authentifiée : elle n'est pas utilisée.",
    'no-signer-key': "La clé de chiffrement du support ne peut pas être vérifiée (signataire inconnu).",
    'signer-changed': "La clé de chiffrement du support a été signée par une autre personne qu'auparavant : par sécurité, elle n'est pas utilisée.",
    'signer-key-changed': "L'identité de signature de l'administrateur principal a changé : la clé de chiffrement du support n'est pas utilisée.",
    'key-mismatch': "La copie reçue de la clé d'équipe ne correspond pas à la clé publiée : elle est ignorée.",
    'bad-share': "Votre copie de la clé d'équipe du support est illisible.",
};

/**
 * Alertes à présenter (bandeau du panel support / admin) : changement de
 * signataire ou de signature de la clé d'équipe. Même esprit que
 * keyTrustAlerts (keyTrust.ts) — pas de dialogue natif.
 */
export const staffKeyAlert = shallowRef<{ reason: StaffKeyErrorReason; signerId: string } | null>(null);

// ---------------------------------------------------------------------------
// Clé d'équipe : génération, signature, vérification
// ---------------------------------------------------------------------------

/** Octets signés par le super-admin (§2.1). */
export function staffKeySignedBytes(version: number, publicKeyJwk: string | object): Uint8Array {
    return new TextEncoder().encode(`synco-support-staff-key-v1|${version}|${canonicalRsaJwk(publicKeyJwk)}`);
}

export interface GeneratedStaffKey {
    /** JWK publique (chaîne JSON), telle que publiée. */
    publicKey: string;
    /** Clé privée (extractible : elle doit être re-scellée à chaque nomination). */
    privateKey: CryptoKey;
}

/** Nouvelle paire de clé d'équipe (RSA-OAEP 4096 / SHA-256). */
export async function generateStaffKeyPair(): Promise<GeneratedStaffKey> {
    const pair = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['encrypt', 'decrypt']
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    return { publicKey: JSON.stringify(jwk), privateKey: pair.privateKey };
}

/** Signature (base64) de la version `version` par la clé d'identité déverrouillée. */
export async function signStaffKey(version: number, publicKeyJwk: string): Promise<string> {
    if (!privateSignKey.value) throw new Error('Clé de signature verrouillée');
    const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateSignKey.value,
        staffKeySignedBytes(version, publicKeyJwk) as BufferSource
    );
    return toB64(sig);
}

/** Vérification pure de la signature (aucun épinglage). */
export async function verifyStaffKeySignature(
    version: number,
    publicKeyJwk: string,
    signature: string,
    signerPublicSignKeyJwk: string | object
): Promise<void> {
    const jwk = typeof signerPublicSignKeyJwk === 'string' ? JSON.parse(signerPublicSignKeyJwk) : signerPublicSignKeyJwk;
    let ok = false;
    try {
        const pub = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        ok = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            pub,
            new Uint8Array(fromB64(signature)) as BufferSource,
            staffKeySignedBytes(version, publicKeyJwk) as BufferSource
        );
    } catch {
        ok = false;
    }
    if (!ok) throw new StaffKeyError('bad-signature');
}

const signerSlot = () => `support-staff-signer:${user.value?.id ?? 'anon'}`;

/**
 * Vérifie une version de la clé d'équipe avant tout usage (chiffrement d'une
 * copie de ticket, acceptation d'une copie privée) :
 *  1. le signataire est celui épinglé à la première vue (TOFU, §2.1) ;
 *  2. la signature est valide pour la clé de signature fournie ;
 *  3. cette clé de signature est celle épinglée pour le signataire
 *     (requireTrustedSignKey, FC4 §2) — épinglée à la première vue.
 * Le signataire n'est épinglé qu'après une signature valide : une première
 * réponse falsifiée ne peut pas imposer son signataire.
 */
export async function verifyStaffKey(info: SupportStaffKeyInfo): Promise<void> {
    const pinnedSigner = await get<string>(signerSlot());
    if (pinnedSigner && pinnedSigner !== info.signerId) {
        staffKeyAlert.value = { reason: 'signer-changed', signerId: info.signerId };
        throw new StaffKeyError('signer-changed');
    }
    if (!info.signerPublicSignKey) throw new StaffKeyError('no-signer-key');

    await verifyStaffKeySignature(info.version, info.publicKey, info.signature, info.signerPublicSignKey);

    try {
        await requireTrustedSignKey(info.signerId, info.signerPublicSignKey);
    } catch (e) {
        if (e instanceof UntrustedKeyError) {
            staffKeyAlert.value = { reason: 'signer-key-changed', signerId: info.signerId };
            throw new StaffKeyError('signer-key-changed');
        }
        throw e;
    }
    if (!pinnedSigner) await set(signerSlot(), info.signerId);
}

// ---------------------------------------------------------------------------
// Copies (shares) de la clé privée d'équipe
// ---------------------------------------------------------------------------

const SHARE_PREFIX = 'v1';

/**
 * Scelle la clé privée d'équipe (pkcs8) pour un membre : hybride AES/RSA
 * d'encryptBufferForPeer. Chaîne opaque `v1.<clé AES scellée>.<iv>.<chiffré>`
 * (~4 Ko pour une clé 4096, sous la borne de 16 384 caractères de l'API).
 * `recipientPublicKey` doit déjà être la clé épinglée (resolveRecipientKey).
 */
export async function encryptStaffKeyShare(privateKey: CryptoKey, recipientPublicKey: string): Promise<string> {
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
    try {
        const { ciphertext, encryptedAesKey, iv } = await encryptBufferForPeer(pkcs8, recipientPublicKey);
        return [SHARE_PREFIX, toB64(encryptedAesKey), toB64(iv), toB64(ciphertext)].join('.');
    } finally {
        new Uint8Array(pkcs8).fill(0);
    }
}

/**
 * Ouvre sa propre copie et importe la clé privée d'équipe. Si
 * `expectedPublicKey` (la clé publique signée de cette version) est fournie,
 * la clé privée doit lui correspondre (module et exposant identiques) :
 * une copie fabriquée par un tiers à partir d'une autre paire est refusée.
 */
export async function decryptStaffKeyShare(
    share: string,
    myPrivateKey: CryptoKey,
    expectedPublicKey?: string
): Promise<CryptoKey> {
    const parts = share.split('.');
    if (parts.length !== 4 || parts[0] !== SHARE_PREFIX) throw new StaffKeyError('bad-share');

    let pkcs8: ArrayBuffer;
    try {
        pkcs8 = await decryptBufferFromPeer(fromB64(parts[3]!), fromB64(parts[1]!), fromB64(parts[2]!), myPrivateKey);
    } catch {
        throw new StaffKeyError('bad-share');
    }

    try {
        const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt'])
            .catch(() => { throw new StaffKeyError('bad-share'); });
        if (expectedPublicKey) {
            const jwk = await crypto.subtle.exportKey('jwk', key);
            const mine = canonicalRsaJwk({ kty: jwk.kty, n: jwk.n, e: jwk.e });
            if (mine !== canonicalRsaJwk(expectedPublicKey)) throw new StaffKeyError('key-mismatch');
        }
        return key;
    } finally {
        new Uint8Array(pkcs8).fill(0);
    }
}

// ---------------------------------------------------------------------------
// Clés de ticket (PUBLIC / INTERNAL)
// ---------------------------------------------------------------------------

/** Contexte FC4 d'une clé de ticket (§2.2) ; version toujours 1. */
export const supportKeyContext = (ticketId: string, channel: SupportChannel): KeyContext =>
    `support:${ticketId}:${channel === 'PUBLIC' ? 'public' : 'internal'}`;

export const SUPPORT_KEY_VERSION = 1;

/** Nouvelle clé de canal (AES-GCM 256, comme une clé de salon). */
export const generateTicketKey = (): Promise<CryptoKey> => generateThreadKey();

/** Scelle une clé de canal pour une clé publique RSA (créateur ou clé d'équipe). */
export const sealTicketKey = (key: CryptoKey, publicKeyJwk: string | object): Promise<string> =>
    encryptThreadKeyForMember(key, publicKeyJwk);

/**
 * Enveloppe FC4 du créateur de la clé. `null` si la clé d'identité n'est pas
 * déverrouillée (compte pas encore migré) : la clé part alors sans
 * enveloppe, comme ailleurs dans l'app (verifyKeyEnvelopeIfPresent la
 * traitera comme non vérifiable, pas comme invalide).
 */
export async function signTicketKey(key: CryptoKey, ticketId: string, channel: SupportChannel): Promise<{ commitment: string; signature: string } | null> {
    if (!privateSignKey.value) return null;
    return signKeyEnvelope(key, supportKeyContext(ticketId, channel), SUPPORT_KEY_VERSION);
}

export interface TicketKeyEnvelopeData {
    creatorId?: string | null;
    commitment?: string | null;
    signature?: string | null;
}

/**
 * Vérifie l'enveloppe d'une clé de ticket, sur le modèle de
 * verifyKeyEnvelopeIfPresent (keyEnvelope.ts) mais avec un annuaire fourni
 * par l'appelant : le créateur d'un ticket n'est pas membre de
 * l'organisation ouverte, lookupCreatorSignKey ne le trouverait pas.
 * - pas d'enveloppe : toléré (TOFU simple via pinOrCheckKey) ;
 * - signataire inconnu localement : toléré, journalisé ;
 * - enveloppe présente mais fausse : KeyEnvelopeError.
 */
export async function verifyTicketKeyEnvelope(
    key: CryptoKey,
    ticketId: string,
    channel: SupportChannel,
    data: TicketKeyEnvelopeData,
    signKeyOf: (userId: string) => string | null | undefined
): Promise<void> {
    if (!data.creatorId || !data.commitment || !data.signature) return;
    const signKey = data.creatorId === user.value?.id ? user.value?.publicSignKey : signKeyOf(data.creatorId);
    if (!signKey) {
        console.warn(`[E2EE] Clé de signature de ${data.creatorId} introuvable : enveloppe du ticket ${ticketId} non vérifiée.`);
        return;
    }
    const trusted = await requireTrustedSignKey(data.creatorId, signKey);
    await verifyKeyEnvelope(
        key,
        { ctx: supportKeyContext(ticketId, channel), version: SUPPORT_KEY_VERSION, commitment: data.commitment, signature: data.signature },
        trusted
    );
}

/**
 * Ouvre une copie de clé de ticket avec la clé RSA qui la déchiffre (clé
 * personnelle pour le créateur, clé d'équipe de la bonne version pour
 * l'équipe), vérifie son enveloppe puis l'épingle (FC4 §1) : une clé
 * différente servie plus tard pour le même ticket et canal est refusée
 * (KeyChangedError).
 */
export async function openTicketKey(
    encryptedKey: string,
    rsaPrivateKey: CryptoKey,
    ticketId: string,
    channel: SupportChannel,
    envelope: TicketKeyEnvelopeData,
    signKeyOf: (userId: string) => string | null | undefined
): Promise<CryptoKey> {
    const key = await decryptThreadKeyWithRsa(encryptedKey, rsaPrivateKey);
    await verifyTicketKeyEnvelope(key, ticketId, channel, envelope, signKeyOf);
    await pinOrCheckKey(key, supportKeyContext(ticketId, channel), SUPPORT_KEY_VERSION);
    return key;
}

// ---------------------------------------------------------------------------
// Caches mémoire (vidés au verrouillage, cf. keyCaches.ts)
// ---------------------------------------------------------------------------

const staffPrivateKeys = new Map<number, CryptoKey>();
const ticketKeys = new Map<string, { encryptedKey: string; key: CryptoKey }>();

registerKeyCache(() => {
    staffPrivateKeys.clear();
    ticketKeys.clear();
});

export const getCachedStaffPrivateKey = (version: number) => staffPrivateKeys.get(version);
export const setCachedStaffPrivateKey = (version: number, key: CryptoKey) => { staffPrivateKeys.set(version, key); };
export const cachedStaffKeyVersions = (): number[] => [...staffPrivateKeys.keys()].sort((a, b) => a - b);

const ticketSlot = (ticketId: string, channel: SupportChannel) => `${ticketId}:${channel}`;

/** Clé de canal en cache, si la copie chiffrée n'a pas changé depuis (ou sans contrôle si `encryptedKey` omis). */
export function getCachedTicketKey(ticketId: string, channel: SupportChannel, encryptedKey?: string): CryptoKey | undefined {
    const entry = ticketKeys.get(ticketSlot(ticketId, channel));
    if (!entry) return undefined;
    if (encryptedKey !== undefined && entry.encryptedKey !== encryptedKey) return undefined;
    return entry.key;
}

export function setCachedTicketKey(ticketId: string, channel: SupportChannel, encryptedKey: string, key: CryptoKey): void {
    ticketKeys.set(ticketSlot(ticketId, channel), { encryptedKey, key });
}
