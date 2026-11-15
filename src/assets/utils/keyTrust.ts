import { get, set, del } from 'idb-keyval';
import { shallowRef } from 'vue';
import { user, openedOrg } from '@/assets/var';
import sfetch from './sfetch';
import { identityChainPath, predecessorSignKeys, type IdentityTransition } from './e2eeV4';

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
    if (await acceptedByTransitionChain(userId, { rsa: jwk })) return jwk;
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

// ---------------------------------------------------------------------------
// Clé d'identité de signature (FC4 §2) — TOFU séparé de la clé de
// chiffrement ci-dessus : namespace, épingle et alerte distincts, pour ne
// rien changer au comportement déjà audité de requireTrustedKey ci-dessus.
// ---------------------------------------------------------------------------

type EcJwk = { kty?: string; crv?: string; x?: string; y?: string };

/** JWK EC canonique : seuls crv, kty, x, y, dans l'ordre (même esprit que canonicalRsaJwk). */
export function canonicalEcJwk(jwk: string | object): string {
    const k = (typeof jwk === 'string' ? JSON.parse(jwk) : jwk) as EcJwk;
    if (k?.kty !== 'EC' || k.crv !== 'P-256' || typeof k.x !== 'string' || typeof k.y !== 'string') {
        throw new Error('Clé de signature EC invalide');
    }
    return JSON.stringify({ crv: k.crv, kty: k.kty, x: k.x, y: k.y });
}

const signNs = () => `trusted-signkey:${user.value?.id ?? 'anon'}:`;

/** Clé de signature déjà épinglée (TOFU) pour `userId`, si elle existe. */
export async function readPinnedSignKey(userId: string): Promise<string | undefined> {
    return await get<string>(signNs() + userId);
}

/**
 * Épingle explicitement une clé de signature. Réservé à sa propre identité E2EE v4 (création,
 * liaison, réinitialisation de dernier recours), dont la clé publique est dérivée de la clé privée
 * ouverte : jamais une valeur servie par le serveur.
 */
export async function trustSignKey(userId: string, publicSignKeyJWK: string | object): Promise<void> {
    const jwk = canonicalEcJwk(publicSignKeyJWK);
    const previous = await readPinnedSignKey(userId);
    // Sa propre clé précédente (renouvellement des clés) : ce qu'elle a signé reste vérifiable.
    if (previous && previous !== jwk) await addSignKeyHistory(userId, [previous]);
    await set(signNs() + userId, jwk);
}

// Anciennes clés de signature d'un utilisateur, prouvées : épinglées ici avant d'être remplacées par
// une chaîne de transitions valide (ou par sa propre identité renouvelée). Elles ne servent qu'à
// vérifier ce qui a été signé AVANT le renouvellement (messages, enveloppes de clés).
const signHistoryNs = () => `trusted-signkey-history:${user.value?.id ?? 'anon'}:`;

async function readSignKeyHistory(userId: string): Promise<string[]> {
    return (await get<string[]>(signHistoryNs() + userId)) ?? [];
}

async function addSignKeyHistory(userId: string, keys: string[]): Promise<void> {
    const history = await readSignKeyHistory(userId);
    const added = keys.filter(k => !history.includes(k));
    if (added.length) await set(signHistoryNs() + userId, [...history, ...added]);
}

// Chaîne de transitions servie par l'API, mise en cache brièvement : un salon déchiffre ses messages
// en parallèle et chacun peut avoir besoin de la chaîne de son expéditeur.
const TRANSITIONS_TTL_MS = 30_000;
const transitionsCache = new Map<string, { at: number; chain: Promise<IdentityTransition[]> }>();

function isTransitionsCached(userId: string): boolean {
    const hit = transitionsCache.get(userId);
    return !!hit && Date.now() - hit.at < TRANSITIONS_TTL_MS;
}

async function fetchTransitions(userId: string, fresh = false): Promise<IdentityTransition[]> {
    const hit = transitionsCache.get(userId);
    if (!fresh && hit && Date.now() - hit.at < TRANSITIONS_TTL_MS) return hit.chain;
    const chain = (async () => {
        const res = await sfetch(`/api/e2ee/v4/users/${encodeURIComponent(userId)}/transitions`);
        if (!res.ok) throw new Error(`transitions HTTP ${res.status}`);
        const body = await res.json();
        return Array.isArray(body) ? (body as IdentityTransition[]) : [];
    })();
    transitionsCache.set(userId, { at: Date.now(), chain });
    chain.catch(() => transitionsCache.delete(userId));
    return chain;
}

/**
 * Point de passage avant de faire confiance à la signature d'une enveloppe
 * de clé (keyEnvelope.ts) au nom de `userId` :
 * - 'match'   : la clé épinglée, renvoyée telle quelle ;
 * - 'new'     : première rencontre — épinglée (TOFU) ;
 * - 'changed' : refus. Un créateur qui change de clé de signature sans
 *   préavis est un signal plus sérieux qu'un simple changement de clé de
 *   chiffrement (cf. requireTrustedKey) : pas de session de rattrapage
 *   automatique ici, seulement un refus.
 */
export async function requireTrustedSignKey(userId: string, publicSignKeyJWK: string | object | null | undefined): Promise<string> {
    if (!publicSignKeyJWK) throw new Error('Clé de signature absente');
    const jwk = canonicalEcJwk(publicSignKeyJWK);
    const pinned = await readPinnedSignKey(userId);
    if (!pinned) {
        await set(signNs() + userId, jwk);
        return jwk;
    }
    if (pinned !== jwk && !(await acceptedByTransitionChain(userId, { sign: jwk }))) throw new UntrustedKeyError(userId, 'changed');
    return jwk;
}

/**
 * E2EE v4, rotation d'identité : une clé changée est acceptée sans alerte seulement si une chaîne de
 * transitions, chacune signée par la clé de signature précédente, part de la clé de signature
 * ÉPINGLÉE ici pour cet utilisateur et aboutit exactement à la clé présentée. Le serveur fournit la
 * chaîne mais ne peut pas la forger. Sans clé de signature épinglée, rien n'est vérifiable : le
 * comportement reste celui d'avant (alerte / refus).
 */
async function acceptedByTransitionChain(userId: string, presented: { rsa?: string; sign?: string }): Promise<boolean> {
    try {
        const pinnedSign = await readPinnedSignKey(userId);
        if (!pinnedSign) return false;
        // Cache d'abord, puis une relecture fraîche : la clé présentée peut venir d'un renouvellement
        // plus récent que la chaîne en cache.
        for (const fresh of [false, true]) {
            const path = await identityChainPath(userId, pinnedSign, await fetchTransitions(userId, fresh));
            const end = path[path.length - 1];
            if (!end) continue;
            if (presented.rsa && canonicalRsaJwk(presented.rsa) !== end.publicKey) continue;
            if (presented.sign && canonicalEcJwk(presented.sign) !== end.publicSignKey) continue;
            // Toutes les clés de signature traversées restent valables pour ce qu'elles ont signé avant.
            await addSignKeyHistory(userId, [pinnedSign, ...path.slice(0, -1).map(p => p.publicSignKey)]);
            await trustKey(userId, end.publicKey);
            await set(signNs() + userId, end.publicSignKey);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Niveau de confiance d'une signature produite au nom de `userId` :
 * - 'trusted' : par sa clé épinglée, ou par une de ses anciennes clés prouvées (cf. addSignKeyHistory) ;
 * - 'history' : par une clé que la chaîne de transitions désigne comme antérieure à sa clé actuelle,
 *   sans preuve locale (appareil qui n'a connu que la nouvelle clé). À traiter comme « sans
 *   signature » : affiché, jamais présenté comme vérifié (cf. predecessorSignKeys) ;
 * - 'unknown' : aucune clé de signature connue pour lui (ni épinglée ni servie) ;
 * - 'none'    : aucune des clés ci-dessus ne valide la signature.
 */
export type SignatureTrust = 'trusted' | 'history' | 'unknown' | 'none';

/**
 * Point de passage unique pour vérifier une signature d'identité (messages, enveloppes de clés).
 * `servedSignKey` : la clé annoncée par le serveur (annuaire des membres), suivie par la chaîne de
 * transitions si elle diffère de la clé épinglée. `verify` teste une clé JWK canonique.
 *
 * Avant : seule la clé ACTUELLE était essayée. Après « Renouveler mes clés », tout ce que la personne
 * avait signé avant (messages, clés de salon, d'espace, de fichier) était rejeté comme une usurpation.
 *
 * Lève UntrustedKeyError si la clé servie a changé sans chaîne valide ET qu'aucune clé connue ne
 * valide la signature (comportement inchangé pour une vraie substitution de clé).
 */
export async function verifyWithSignKeys(
    userId: string,
    servedSignKey: string | object | null | undefined,
    verify: (canonicalJwk: string) => Promise<boolean>,
): Promise<SignatureTrust> {
    let current = await readPinnedSignKey(userId);
    let untrusted: unknown = null;
    if (servedSignKey) {
        try {
            current = await requireTrustedSignKey(userId, servedSignKey);
        } catch (e) {
            if (!(e instanceof UntrustedKeyError)) throw e;
            untrusted = e; // clé servie refusée : on reste sur la clé épinglée
        }
    }
    if (!current) return 'unknown';

    const tried = new Set<string>();
    const attempt = async (k: string) => {
        if (tried.has(k)) return false;
        tried.add(k);
        try { return await verify(k); } catch { return false; }
    };

    const history = await readSignKeyHistory(userId);
    for (const k of [current, ...[...history].reverse()]) {
        if (await attempt(k)) return 'trusted';
    }
    // Repli à rebours seulement sans aucune ancienne clé prouvée : cet appareil ne connaît que la clé
    // actuelle, épinglée en TOFU sur la parole du serveur, qui n'y gagne donc aucun pouvoir. Un appareil
    // qui a suivi la chaîne s'en tient à ses clés prouvées.
    if (history.length === 0) {
        // Chaîne en cache d'abord ; relue une fois si elle venait du cache (renouvellement tout récent).
        const fromCache = isTransitionsCached(userId);
        for (const fresh of fromCache ? [false, true] : [false]) {
            try {
                for (const k of await predecessorSignKeys(userId, current, await fetchTransitions(userId, fresh))) {
                    if (await attempt(k)) return 'history';
                }
            } catch { /* chaîne indisponible : rien de plus à essayer */ }
        }
    }

    if (untrusted) throw untrusted;
    return 'none';
}

/**
 * Résout la clé de signature publique de `creatorId` depuis l'annuaire des
 * membres de l'organisation ouverte (déjà chargé pour l'affichage des noms/
 * avatars) — pas de requête réseau dédiée. `null` si `creatorId` n'est
 * membre d'aucun espace/salon visible localement (enveloppe non vérifiable,
 * à traiter comme absente par l'appelant).
 */
export function lookupCreatorSignKey(creatorId: string): string | null {
    if (creatorId === user.value?.id) return user.value?.publicSignKey ?? null;
    const member = openedOrg.value?.members?.find((m: any) => m.userId === creatorId);
    return member?.user?.publicSignKey ?? null;
}
