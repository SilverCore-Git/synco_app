import { user } from '@/assets/var';
import { privateKey, privateSignKey, unwrapFileKey } from '@/assets/utils/crypto';
import { resolveRecipientKey } from '@/assets/utils/keyTrust';
import { registerKeyCache } from '@/assets/utils/keyCaches';
import {
    StaffKeyError,
    cachedStaffKeyVersions,
    decryptStaffKeyShare,
    encryptStaffKeyShare,
    generateStaffKeyPair,
    generateTicketKey,
    getCachedStaffPrivateKey,
    getCachedTicketKey,
    openTicketKey,
    sealTicketKey,
    setCachedStaffPrivateKey,
    setCachedTicketKey,
    signStaffKey,
    signTicketKey,
    verifyStaffKey,
} from '@/assets/utils/supportCrypto';
import {
    isStaffTicket,
    type SupportChannel,
    type SupportStaffKeyIn,
    type SupportStaffKeyInfo,
    type SupportTicketDTO,
    type SupportTicketKeyDTO,
    type SupportTicketStaffDTO,
} from '@/types/support';
import { SupportApiError, supportApi } from './api';
import { loadSupportRole } from './role';

/**
 * Gestion des clés du SAV côté client (SUPPORT_FEATURE.md §2) :
 * clé d'équipe (vérification, déverrouillage des copies, partage aux
 * membres, mise en place et rotation par le super-admin) et clés de ticket
 * (ouverture côté client et côté équipe, création paresseuse de la clé
 * INTERNAL). Le chiffrement lui-même est dans assets/utils/supportCrypto.ts.
 *
 * Toute opération exige l'E2EE déverrouillé (PIN) : comme le reste de
 * l'app, on lève une erreur explicite (SupportLockedError) plutôt que
 * d'ouvrir un dialogue — App.vue n'affiche de toute façon l'application
 * qu'une fois le PIN saisi.
 */

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export class SupportLockedError extends Error {
    constructor() {
        super("Votre session E2EE n'est pas déverrouillée. Veuillez entrer votre code PIN.");
        this.name = 'SupportLockedError';
    }
}

export class SupportNotConfiguredError extends Error {
    constructor() {
        super("Le support n'est pas encore disponible : sa clé de chiffrement n'a pas été mise en place.");
        this.name = 'SupportNotConfiguredError';
    }
}

export class StaffKeyNotSharedError extends Error {
    readonly version: number;
    constructor(version: number) {
        super("La clé de chiffrement de l'équipe support ne vous a pas encore été transmise. Elle le sera dès qu'un membre de l'équipe ouvrira le panel ; réessayez ensuite.");
        this.name = 'StaffKeyNotSharedError';
        this.version = version;
    }
}

export class TicketKeyMissingError extends Error {
    readonly channel: SupportChannel;
    constructor(channel: SupportChannel) {
        super(channel === 'INTERNAL'
            ? "Le fil interne de ce ticket n'a pas encore de clé."
            : "Aucune clé de chiffrement n'est disponible pour ce ticket.");
        this.name = 'TicketKeyMissingError';
        this.channel = channel;
    }
}

export class StaffKeySetupError extends Error {
    /** Membres de l'équipe pour lesquels aucune copie n'a pu être scellée. */
    readonly missing: string[];
    constructor(message: string, missing: string[] = []) {
        super(message);
        this.name = 'StaffKeySetupError';
        this.missing = missing;
    }
}

const requireUnlocked = (): CryptoKey => {
    if (!privateKey.value) throw new SupportLockedError();
    return privateKey.value;
};

// ---------------------------------------------------------------------------
// Clé d'équipe : versions vérifiées
// ---------------------------------------------------------------------------

// Versions dont la signature a déjà été vérifiée pendant la session (la clé
// publique n'est pas secrète, mais refaire la vérification ECDSA à chaque
// création de ticket est inutile). Clé = version, valeur = info vérifiée.
const verifiedStaffKeys = new Map<number, SupportStaffKeyInfo>();

const isSameInfo = (a: SupportStaffKeyInfo, b: SupportStaffKeyInfo) =>
    a.publicKey === b.publicKey && a.signature === b.signature && a.signerId === b.signerId;

async function verifyAndRemember(info: SupportStaffKeyInfo): Promise<SupportStaffKeyInfo> {
    const known = verifiedStaffKeys.get(info.version);
    if (known && isSameInfo(known, info)) return known;
    await verifyStaffKey(info);
    verifiedStaffKeys.set(info.version, info);
    return info;
}

/** Version courante de la clé d'équipe, signature vérifiée ; null si aucune n'existe encore. */
export async function fetchCurrentStaffKey(): Promise<SupportStaffKeyInfo | null> {
    const info = await supportApi.getStaffKey();
    if (!info) return null;
    return verifyAndRemember(info);
}

/** Toutes les versions (équipe) ; une version dont la signature est invalide est écartée (et signalée). */
export async function fetchVerifiedStaffKeyVersions(): Promise<SupportStaffKeyInfo[]> {
    const all = await supportApi.getStaffKeyVersions();
    const ok: SupportStaffKeyInfo[] = [];
    for (const info of all) {
        try {
            ok.push(await verifyAndRemember(info));
        } catch (e) {
            console.warn(`[Support] Version ${info.version} de la clé d'équipe rejetée :`, (e as Error).message);
        }
    }
    return ok;
}

// ---------------------------------------------------------------------------
// Clé d'équipe : déverrouillage de ses propres copies
// ---------------------------------------------------------------------------

let unlockInflight: Promise<number[]> | null = null;

/**
 * Déchiffre toutes les copies de la clé d'équipe détenues par l'utilisateur
 * (équipe uniquement) et les garde en mémoire, par version, jusqu'au
 * verrouillage. Chaque clé privée doit correspondre à la clé publique signée
 * de sa version. Renvoie les versions déverrouillées.
 */
export function unlockStaffKeys(force = false): Promise<number[]> {
    if (unlockInflight && !force) return unlockInflight;
    const p = (async () => {
        const mine = requireUnlocked();
        const [versions, shares] = await Promise.all([fetchVerifiedStaffKeyVersions(), supportApi.getMyStaffKeyShares()]);
        const byVersion = new Map(versions.map(v => [v.version, v]));
        for (const share of shares) {
            if (getCachedStaffPrivateKey(share.version)) continue;
            const info = byVersion.get(share.version);
            if (!info) {
                console.warn(`[Support] Copie de la version ${share.version} ignorée : version non vérifiée.`);
                continue;
            }
            try {
                setCachedStaffPrivateKey(share.version, await decryptStaffKeyShare(share.encryptedPrivateKey, mine, info.publicKey));
            } catch (e) {
                console.warn(`[Support] Copie de la version ${share.version} inutilisable :`, (e as Error).message);
            }
        }
        return cachedStaffKeyVersions();
    })().finally(() => { if (unlockInflight === p) unlockInflight = null; });
    unlockInflight = p;
    return p;
}

/** Clé privée d'équipe d'une version (équipe) ; StaffKeyNotSharedError si aucune copie. */
export async function getStaffPrivateKey(version: number): Promise<CryptoKey> {
    const cached = getCachedStaffPrivateKey(version);
    if (cached) return cached;
    await unlockStaffKeys();
    const key = getCachedStaffPrivateKey(version);
    if (!key) throw new StaffKeyNotSharedError(version);
    return key;
}

/**
 * Copies de toutes les versions détenues, scellées pour `recipientPublicKey`
 * (déjà épinglée) — corps `staffKeyShares` d'une nomination.
 */
export async function buildStaffKeySharesFor(recipientPublicKey: string): Promise<{ version: number; encryptedPrivateKey: string }[]> {
    await unlockStaffKeys();
    const out: { version: number; encryptedPrivateKey: string }[] = [];
    for (const version of cachedStaffKeyVersions()) {
        const key = getCachedStaffPrivateKey(version)!;
        out.push({ version, encryptedPrivateKey: await encryptStaffKeyShare(key, recipientPublicKey) });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Partage aux membres qui n'ont pas encore de copie (missing-shares)
// ---------------------------------------------------------------------------

const MISSING_SHARES_INTERVAL_MS = 2 * 60 * 1000;
let lastMissingSharesAttempt = 0;

/**
 * Comble les copies manquantes (§2.1) : pour chaque membre listé par
 * GET /staff-key/missing-shares, scelle toutes les versions que l'on détient
 * (pas seulement la courante : un membre nommé après une rotation doit
 * aussi lire les anciens tickets) et les dépose — création seulement,
 * l'API ignore les doublons. Une clé publique qui a changé depuis son
 * épinglage ne reçoit rien (resolveRecipientKey, audit FC1).
 * Au plus une tentative par intervalle sauf `force`. Renvoie le nombre de
 * copies créées.
 */
export async function fillMissingStaffKeyShares(force = false): Promise<number> {
    const now = Date.now();
    if (!force && now - lastMissingSharesAttempt < MISSING_SHARES_INTERVAL_MS) return 0;
    lastMissingSharesAttempt = now;
    requireUnlocked();

    const missing = await supportApi.getMissingShares();
    if (missing.length === 0) return 0;
    const held = await unlockStaffKeys();
    if (held.length === 0) return 0;

    const shares: { version: number; userId: string; encryptedPrivateKey: string }[] = [];
    const seen = new Set<string>();
    for (const m of missing) {
        if (seen.has(m.userId)) continue;
        seen.add(m.userId);
        let pk: string;
        try {
            pk = await resolveRecipientKey(m.userId, m.publicKey);
        } catch {
            console.warn(`[Support] Clé publique de ${m.userId} non vérifiée : copie de la clé d'équipe non transmise.`);
            continue;
        }
        for (const version of held) {
            shares.push({ version, userId: m.userId, encryptedPrivateKey: await encryptStaffKeyShare(getCachedStaffPrivateKey(version)!, pk) });
        }
    }
    if (shares.length === 0) return 0;
    // L'API borne à 200 copies par requête.
    let created = 0;
    for (let i = 0; i < shares.length; i += 200) {
        created += (await supportApi.createShares(shares.slice(i, i + 200))).created;
    }
    return created;
}

// ---------------------------------------------------------------------------
// Mise en place et rotation (super-admin)
// ---------------------------------------------------------------------------

/**
 * Clés publiques des membres de l'équipe (GET /staff/public-keys). Les clés
 * de signature apprises au passage servent aux enveloppes FC4.
 */
async function fetchStaffPublicKeys(): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    for (const row of await supportApi.getStaffPublicKeys()) {
        out.set(row.userId, row.publicKey);
        rememberSignKey(row.userId, row.publicSignKey);
    }
    return out;
}

/**
 * Crée la version suivante de la clé d'équipe (super-admin) et la partage à
 * toute l'équipe ayant une clé publique : mise en place (v1) ou rotation
 * après un retrait (§2.1). La nouvelle clé privée reste en mémoire pour
 * être partagée aux prochaines nominations.
 */
export async function createStaffKeyVersion(): Promise<SupportStaffKeyInfo> {
    requireUnlocked();
    if (!privateSignKey.value) throw new SupportLockedError();
    if (!user.value?.id || !user.value.publicKey) throw new StaffKeySetupError("Votre clé de chiffrement n'est pas configurée.");

    const current = await supportApi.getStaffKey();
    const version = (current?.version ?? 0) + 1;

    const keys = await fetchStaffPublicKeys();

    const pair = await generateStaffKeyPair();
    const signature = await signStaffKey(version, pair.publicKey);

    const shares: { userId: string; encryptedPrivateKey: string }[] = [];
    const unverified: string[] = [];
    const recipients = new Set([user.value.id, ...keys.keys()]);
    for (const id of recipients) {
        const raw = id === user.value.id ? user.value.publicKey : keys.get(id);
        if (!raw) continue;
        try {
            const pk = await resolveRecipientKey(id, raw);
            shares.push({ userId: id, encryptedPrivateKey: await encryptStaffKeyShare(pair.privateKey, pk) });
        } catch {
            unverified.push(id);
        }
    }

    try {
        await supportApi.createStaffKey({ version, publicKey: pair.publicKey, signature, shares });
    } catch (e) {
        if (e instanceof SupportApiError && e.status === 400 && Array.isArray(e.body?.missing)) {
            const missing = (e.body!.missing as unknown[]).filter((x): x is string => typeof x === 'string');
            throw new StaffKeySetupError(
                `Impossible de partager la clé du support à ${missing.length} membre(s) de l'équipe : `
                + (unverified.length ? "clé de sécurité modifiée depuis sa vérification." : "clé publique indisponible."),
                missing,
            );
        }
        if (e instanceof SupportApiError && e.status === 409) {
            throw new StaffKeySetupError("Une autre version de la clé du support vient d'être créée. Rechargez la page.");
        }
        throw e;
    }

    const info: SupportStaffKeyInfo = {
        version, publicKey: pair.publicKey, signature,
        signerId: user.value.id, signerPublicSignKey: user.value.publicSignKey ?? null,
    };
    // Passe par la vérification complète : épingle le signataire (soi) au
    // même titre qu'un autre membre de l'équipe.
    await verifyAndRemember(info);
    setCachedStaffPrivateKey(version, pair.privateKey);
    return info;
}

/** Mise en place : crée la v1 si aucune clé d'équipe n'existe. Renvoie la version créée, ou null. */
export async function ensureStaffKeyExists(): Promise<SupportStaffKeyInfo | null> {
    const current = await supportApi.getStaffKey();
    if (current) return null;
    return createStaffKeyVersion();
}

// ---------------------------------------------------------------------------
// Annuaire des clés de signature (enveloppes FC4 des clés de ticket)
// ---------------------------------------------------------------------------

// Le créateur d'un ticket (ou le membre qui a créé la clé INTERNAL) n'est en
// général pas membre de l'organisation ouverte : on garde ici les clés de
// signature apprises (DTO équipe, liste de l'équipe, annuaire des clés).
// `null` : déjà cherchée, introuvable (pas de nouvelle requête).
const signKeys = new Map<string, string | null>();
registerKeyCache(() => signKeys.clear());

export function rememberSignKey(userId: string, publicSignKey: string | null | undefined): void {
    if (publicSignKey) signKeys.set(userId, publicSignKey);
}

const signKeyOf = (userId: string) => signKeys.get(userId) ?? null;

/**
 * Clé de signature d'un membre de l'équipe (créateur d'une clé INTERNAL) :
 * apprise via GET /staff/members, chargé une fois. Le créateur d'un ticket,
 * lui, arrive avec le DTO équipe (creator.publicSignKey).
 */
async function primeSignKey(userId: string | null | undefined): Promise<void> {
    if (!userId || userId === user.value?.id || signKeys.has(userId)) return;
    try {
        for (const m of await supportApi.listStaffMembers()) rememberSignKey(m.id, m.publicSignKey);
    } catch { /* pas membre de l'équipe : rien à apprendre ici */ }
    if (!signKeys.has(userId)) signKeys.set(userId, null);
}

// ---------------------------------------------------------------------------
// Clés de ticket
// ---------------------------------------------------------------------------

async function openKeyDTO(ticketId: string, channel: SupportChannel, dto: SupportTicketKeyDTO, rsa: CryptoKey): Promise<CryptoKey> {
    const cached = getCachedTicketKey(ticketId, channel, dto.encryptedKey);
    if (cached) return cached;
    await primeSignKey(dto.creatorId);
    const key = await openTicketKey(dto.encryptedKey, rsa, ticketId, channel, dto, signKeyOf);
    setCachedTicketKey(ticketId, channel, dto.encryptedKey, key);
    return key;
}

/**
 * Clé d'un canal du ticket, depuis le DTO tel que servi :
 * - client : sa copie PUBLIC (`myKey`) avec sa clé personnelle ;
 * - équipe : la copie pour la clé d'équipe de la version indiquée.
 * Enveloppe vérifiée et clé épinglée (FC4) ; mise en cache par ticket/canal.
 * INTERNAL absente : TicketKeyMissingError (cf. ensureInternalKey).
 */
export async function getTicketChannelKey(ticket: SupportTicketDTO, channel: SupportChannel): Promise<CryptoKey> {
    const mine = requireUnlocked();
    if (!isStaffTicket(ticket)) {
        if (channel !== 'PUBLIC' || !ticket.myKey) throw new TicketKeyMissingError(channel);
        return openKeyDTO(ticket.id, channel, ticket.myKey, mine);
    }
    rememberSignKey(ticket.creator.id, ticket.creator.publicSignKey);
    const dto = channel === 'PUBLIC' ? ticket.publicStaffKey : ticket.internalStaffKey;
    if (!dto || dto.staffKeyVersion == null) throw new TicketKeyMissingError(channel);
    return openKeyDTO(ticket.id, channel, dto, await getStaffPrivateKey(dto.staffKeyVersion));
}

/** Nouvelle clé de canal scellée pour la clé d'équipe courante (+ enveloppe). */
async function newStaffSealedKey(ticketId: string, channel: SupportChannel): Promise<{ key: CryptoKey; keyIn: SupportStaffKeyIn }> {
    const staff = await fetchCurrentStaffKey();
    if (!staff) throw new SupportNotConfiguredError();
    const key = await generateTicketKey();
    const envelope = await signTicketKey(key, ticketId, channel);
    const keyIn: SupportStaffKeyIn = {
        encryptedKey: await sealTicketKey(key, staff.publicKey),
        staffKeyVersion: staff.version,
        ...(envelope ?? {}),
    };
    return { key, keyIn };
}

/** Clé INTERNAL à joindre à un claim (null si le ticket en a déjà une). */
export async function prepareInternalKeyForClaim(ticket: SupportTicketStaffDTO): Promise<SupportStaffKeyIn | null> {
    requireUnlocked();
    if (ticket.internalStaffKey) return null;
    return (await newStaffSealedKey(ticket.id, 'INTERNAL')).keyIn;
}

/**
 * Clé INTERNAL d'un ticket (équipe), créée paresseusement si absente
 * (POST /tickets/:id/internal-key, création seulement). Si un autre membre
 * l'a créée entre-temps, c'est la sienne qui fait foi : on relit le ticket.
 * Renvoie la clé et le ticket à jour.
 */
export async function ensureInternalKey(ticket: SupportTicketStaffDTO): Promise<{ key: CryptoKey; ticket: SupportTicketStaffDTO }> {
    requireUnlocked();
    if (ticket.internalStaffKey) return { key: await getTicketChannelKey(ticket, 'INTERNAL'), ticket };

    const { keyIn } = await newStaffSealedKey(ticket.id, 'INTERNAL');
    await supportApi.createInternalKey(ticket.id, keyIn);
    // Relu dans tous les cas : la copie serveur (la nôtre ou une concurrente)
    // passe par la même ouverture/vérification que toute autre.
    const fresh = await supportApi.getTicket(ticket.id);
    if (!isStaffTicket(fresh)) throw new TicketKeyMissingError('INTERNAL');
    return { key: await getTicketChannelKey(fresh, 'INTERNAL'), ticket: fresh };
}

/**
 * Clé d'un canal pour un ticket connu seulement par son id (pièces jointes) :
 * cache de session, sinon lecture du ticket.
 */
export async function resolveSupportTicketKey(ticketId: string, channel: SupportChannel): Promise<CryptoKey> {
    const cached = getCachedTicketKey(ticketId, channel);
    if (cached) return cached;
    return getTicketChannelKey(await supportApi.getTicket(ticketId), channel);
}

/**
 * KEK d'une pièce jointe de support existante. Les métadonnées du fichier
 * (GET /api/cdn/meta/:id) ne disent pas de quel canal il vient : on essaie
 * la clé PUBLIC, puis — pour l'équipe — la clé INTERNAL, et on garde celle
 * qui désemballe effectivement la DEK (AES-GCM authentifié : une mauvaise
 * clé échoue, elle ne produit jamais une fausse DEK).
 */
export async function resolveSupportFileKek(ticketId: string, encryptedFileKey: string): Promise<CryptoKey> {
    const channels: SupportChannel[] = (await loadSupportRole().catch(() => null)) ? ['PUBLIC', 'INTERNAL'] : ['PUBLIC'];
    let lastError: unknown = new TicketKeyMissingError('PUBLIC');
    for (const channel of channels) {
        try {
            const key = await resolveSupportTicketKey(ticketId, channel);
            const raw = await unwrapFileKey(encryptedFileKey, key);
            new Uint8Array(raw).fill(0);
            return key;
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError;
}

export { StaffKeyError };
