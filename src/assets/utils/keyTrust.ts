import { get, set, del } from 'idb-keyval';
import { shallowRef } from 'vue';
import { user } from '@/assets/var';

/**
 * Épinglage des clés publiques E2EE des autres utilisateurs (TOFU).
 *
 * Le serveur n'est pas une source d'autorité sur l'identité des clés : la
 * première clé vue pour un utilisateur est épinglée localement, et toute clé
 * différente ensuite est refusée au lieu d'être utilisée en silence.
 *
 * Audit FC1 (01/10) : ce contrôle n'existait que pour l'envoi d'un DM texte ;
 * tous les autres scellements de clés symétriques (salons, espaces, DM,
 * session IA) utilisaient la clé publique telle que servie. Tout scellement
 * passe désormais par `requireTrustedKey()`. Le magasin est cloisonné par
 * compte local, les clés sont comparées sous forme canonique (RFC 7638) et
 * l'empreinte affichée est complète.
 */

const LEGACY_PREFIX = 'trusted-pubkey:';
const ns = () => `trusted-pubkey:${user.value?.id ?? 'anon'}:`;

type RsaJwk = { kty?: string; n?: string; e?: string };

/** JWK RSA canonique : seuls e, kty, n, dans l'ordre de la RFC 7638. */
export function canonicalRsaJwk(jwk: string | object): string {
    const k = (typeof jwk === 'string' ? JSON.parse(jwk) : jwk) as RsaJwk;
    if (k?.kty !== 'RSA' || typeof k.n !== 'string' || typeof k.e !== 'string') {
        throw new Error('Clé publique RSA invalide');
    }
    return JSON.stringify({ e: k.e, kty: 'RSA', n: k.n });
}

/**
 * Empreinte RFC 7638 complète (SHA-256 du JWK canonique), en groupes de 4
 * caractères pour la comparaison hors bande. Elle était tronquée à 64 bits
 * et calculée sur la chaîne JSON brute (non canonique).
 */
export async function computeKeyFingerprint(publicKeyJWK: string | object): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRsaJwk(publicKeyJWK)));
    const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return hex.match(/.{4}/g)!.join(' ');
}

export type KeyTrustResult = 'new' | 'match' | 'changed';

async function readPinned(userId: string): Promise<string | undefined> {
    const pinned = await get<string>(ns() + userId);
    if (pinned) return pinned;
    // Migration de l'ancien magasin non cloisonné : repris une fois, sous
    // forme canonique, pour ne pas redemander toutes les approbations.
    const legacy = await get<string>(LEGACY_PREFIX + userId);
    if (!legacy) return undefined;
    await del(LEGACY_PREFIX + userId);
    try {
        const canon = canonicalRsaJwk(legacy);
        await set(ns() + userId, canon);
        return canon;
    } catch {
        return undefined;
    }
}

/** État de la clé courante d'un utilisateur, sans rien mémoriser. */
export async function checkKeyTrust(userId: string, currentPublicKeyJWK: string | object): Promise<KeyTrustResult> {
    const canon = canonicalRsaJwk(currentPublicKeyJWK);
    const pinned = await readPinned(userId);
    if (!pinned) return 'new';
    return pinned === canon ? 'match' : 'changed';
}

/** Épingle explicitement une clé (première rencontre, ou changement vérifié hors bande). */
export async function trustKey(userId: string, publicKeyJWK: string | object): Promise<void> {
    await set(ns() + userId, canonicalRsaJwk(publicKeyJWK));
}

export class UntrustedKeyError extends Error {
    readonly userId: string;
    readonly state: KeyTrustResult;
    constructor(userId: string, state: KeyTrustResult) {
        super(`La clé de sécurité de cet utilisateur a changé : vérifiez-la avant de lui partager une clé.`);
        this.name = 'UntrustedKeyError';
        this.userId = userId;
        this.state = state;
    }
}

/**
 * Clés refusées par un chemin automatique, à présenter à l'utilisateur
 * (KeyTrustAlerts.vue) pour vérification de l'empreinte.
 */
export const keyTrustAlerts = shallowRef<Array<{ userId: string; publicKey: string }>>([]);

function reportUntrusted(userId: string, publicKey: string) {
    if (keyTrustAlerts.value.some(a => a.userId === userId)) return;
    keyTrustAlerts.value = [...keyTrustAlerts.value, { userId, publicKey }];
}

export function dismissKeyTrustAlert(userId: string) {
    keyTrustAlerts.value = keyTrustAlerts.value.filter(a => a.userId !== userId);
}

/**
 * Point de passage obligatoire avant tout scellement d'une clé symétrique
 * pour la clé publique d'un autre utilisateur.
 *
 * - 'match' : la clé épinglée, renvoyée telle quelle ;
 * - 'new'   : première rencontre — épinglée (TOFU), comme Signal ;
 * - 'changed' : refus (UntrustedKeyError) et signalement à l'utilisateur.
 *   Une clé substituée par le serveur pour un membre déjà connu ne reçoit
 *   donc plus aucune copie de clé.
 */
export async function requireTrustedKey(userId: string, publicKeyJWK: string | object | null | undefined): Promise<string> {
    if (!publicKeyJWK) throw new Error('Clé publique absente');
    const jwk = typeof publicKeyJWK === 'string' ? publicKeyJWK : JSON.stringify(publicKeyJWK);
    const state = await checkKeyTrust(userId, jwk);
    if (state === 'match') return jwk;
    if (state === 'new') {
        await trustKey(userId, jwk);
        return jwk;
    }
    reportUntrusted(userId, jwk);
    throw new UntrustedKeyError(userId, state);
}

/**
 * Clé publique à utiliser pour sceller une clé à destination de `userId`.
 * Pour soi-même : sa propre clé, vérifiée contre la clé privée au
 * déverrouillage (assertOwnPublicKeyMatches) ; pour un autre : la clé
 * épinglée (requireTrustedKey).
 */
export async function resolveRecipientKey(userId: string, publicKeyJWK: string | object | null | undefined): Promise<string> {
    if (userId === user.value?.id) {
        if (!user.value?.publicKey) throw new Error('Clé publique personnelle absente');
        return user.value.publicKey;
    }
    return requireTrustedKey(userId, publicKeyJWK);
}
