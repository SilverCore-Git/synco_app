/**
 * Délégation des clés de l'org au runtime (03 §7) : enveloppe de tête vers la `kex` du certificat
 * vérifié, mandat v2 signé (03 §4.1), entrées rechiffrées sous `DK` avec l'AAD de contexte.
 *
 * Invariants :
 * - rien n'est déposé sans `verifyRuntimeForDelegation` réussi (certificat, signataire, épingle, défi) ;
 * - seuls les `kind` de la liste fermée (`thread`, `space`, `conv`) sont délégués, et seulement pour
 *   l'org concernée (annuaire local pour les salons et espaces ; route de l'org pour les `CK`) ;
 * - jamais d'AK, de clé privée d'identité, de clé de DM ou de ticket : ce module ne les lit pas ;
 * - `DK` ne vit qu'en mémoire, en clé AES non extractable, effacée au verrouillage ; les octets bruts
 *   (`DK`, clés de l'org) sont mis à zéro aussitôt après usage.
 */
import { computeKeyFingerprint } from '@/assets/utils/keyTrust';
import { registerKeyCache } from '@/assets/utils/keyCaches';
import { isValidId, toHex, sha256 } from '@/assets/utils/runtimeCert';
import {
    isDelegationEntryKind,
    sealDelegationEntry,
    sealDelegationWrap,
    signMandateV2,
    verifyMandateVersionedOfflineFromWrapHash,
    type DelegationContext,
    type DelegationEntryKind,
    type MandateMode,
    type VerifiedMandate,
} from '@/assets/utils/runtimeDelegation';
import { AiRuntimeError, apiError, fromFormatError } from './errors';
import type { AiRuntimeDeps, KeyRef } from './ports';
import { archiveRuntimePin } from './runtimePin';
import { fetchRuntimeRegistry, requireUserId, verifyRuntimeForDelegation, type VerifiedRuntime, type VerifyOptions } from './runtimeTrust';

/** Durée par défaut (09 §1, option A) et bornes de l'API. */
export const DEFAULT_DELEGATION_SECS = 7 * 86_400;
const MIN_DELEGATION_SECS = 3_600;
const MAX_ENTRIES_PER_REQUEST = 500;
const MAX_ENTRIES_PER_DELEGATION = 5_000;
/** Ajout d'entrées : 3 requêtes / 15 s par utilisateur (09 §4). */
const ENTRY_BURST = 3;
const ENTRY_WINDOW_MS = 15_000;

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const base = (orgId: string) => `/api/orgs/${encodeURIComponent(orgId)}/ai/runtime/delegations`;

// ---------------------------------------------------------------------------
// DK en mémoire (03 §7.1)
// ---------------------------------------------------------------------------

interface HeldDelegation {
    delegationId: string;
    ctx: DelegationContext;
    dk: CryptoKey;
    runtimeId: string;
    mode: MandateMode;
    /** Clés confiées pendant cette session de l'app, par type (résumé des réglages). */
    delegated: Record<DelegationEntryKind, Set<string>>;
}

const held = new Map<string, HeldDelegation>();
/** Clés impossibles à ouvrir sur cet appareil : pas redemandées pendant la session (aucune boucle). */
const unresolvable = new Map<string, Set<string>>();
const slot = (userId: string, orgId: string) => `${userId}:${orgId}`;
const keyId = (k: KeyRef) => `${k.kind}|${k.ref}|${k.version}`;

/** Oublie toutes les `DK` (verrouillage, déconnexion). */
export function clearDelegationKeys(): void {
    held.clear();
    unresolvable.clear();
}
registerKeyCache(clearDelegationKeys);

export function hasDelegationKey(userId: string, orgId: string, delegationId?: string): boolean {
    const h = held.get(slot(userId, orgId));
    return !!h && (delegationId === undefined || h.delegationId === delegationId);
}

// ---------------------------------------------------------------------------
// Préférence locale « mode runtime activé » (donnée non secrète)
// ---------------------------------------------------------------------------

export interface RuntimeModePreference {
    v: 1;
    enabled: boolean;
    mode: MandateMode;
}

const prefSlot = (userId: string, orgId: string) => `rt-mode:${userId}:${orgId}`;

export async function readRuntimeModePreference(deps: AiRuntimeDeps, userId: string, orgId: string): Promise<RuntimeModePreference | null> {
    const v = await deps.store.get(prefSlot(userId, orgId));
    if (!isObj(v) || v.v !== 1 || typeof v.enabled !== 'boolean' || (v.mode !== 'plan' && v.mode !== 'auto')) return null;
    return { v: 1, enabled: v.enabled, mode: v.mode };
}

async function writePreference(deps: AiRuntimeDeps, userId: string, orgId: string, enabled: boolean, mode: MandateMode): Promise<void> {
    await deps.store.set(prefSlot(userId, orgId), { v: 1, enabled, mode } satisfies RuntimeModePreference);
}

// ---------------------------------------------------------------------------
// Résumé (C3 §1.6)
// ---------------------------------------------------------------------------

export interface DelegationView {
    delegationId: string;
    runtimeId: string;
    status: string;
    iat: number;
    exp: number;
    entryCount: number;
    mandateVersion: number;
    /** Mode SERVI par l'API (affichage) ; le mode qui fait foi est celui du mandat vérifié. */
    mode: MandateMode;
}

function readDelegationView(x: unknown): DelegationView | null {
    if (!isObj(x) || typeof x.delegationId !== 'string' || typeof x.runtimeId !== 'string' || typeof x.status !== 'string'
        || typeof x.iat !== 'number' || typeof x.exp !== 'number') return null;
    return {
        delegationId: x.delegationId,
        runtimeId: x.runtimeId,
        status: x.status,
        iat: x.iat,
        exp: x.exp,
        entryCount: typeof x.entryCount === 'number' ? x.entryCount : 0,
        mandateVersion: typeof x.mandateVersion === 'number' ? x.mandateVersion : 1,
        mode: x.mode === 'auto' && x.mandateVersion === 2 ? 'auto' : 'plan',
    };
}

export async function fetchCurrentDelegation(deps: AiRuntimeDeps, orgId: string): Promise<DelegationView | null> {
    const res = await deps.api.request('GET', `${base(orgId)}/current`);
    if (res.status !== 200 || !isObj(res.body)) throw apiError(res.status, res.body);
    return readDelegationView(res.body.delegation);
}

export interface DelegationSummary {
    delegationId: string;
    runtimeId: string;
    status: string;
    mode: MandateMode;
    autonomous: boolean;
    expiresAt: Date;
    /** Renouvelée à chaque ouverture de l'app (03 §7.2). */
    renewOnOpen: true;
    entryCount: number;
    /**
     * Salons, espaces et conversations confiés PENDANT CETTE SESSION de l'app (DK en mémoire) ;
     * `null` si la DK n'est pas en mémoire : l'API n'expose que `entryCount`, sans détail par type.
     */
    threadCount: number | null;
    spaceCount: number | null;
    conversationCount: number | null;
    keysInMemory: boolean;
}

export async function getDelegationSummary(deps: AiRuntimeDeps, orgId: string): Promise<DelegationSummary | null> {
    const userId = requireUserId(deps);
    const view = await fetchCurrentDelegation(deps, orgId);
    if (!view) return null;
    const h = held.get(slot(userId, orgId));
    const mine = h && h.delegationId === view.delegationId ? h : null;
    return {
        delegationId: view.delegationId,
        runtimeId: view.runtimeId,
        status: view.status,
        mode: view.mode,
        autonomous: view.mode === 'auto',
        expiresAt: new Date(view.exp * 1000),
        renewOnOpen: true,
        entryCount: view.entryCount,
        threadCount: mine ? mine.delegated.thread.size : null,
        spaceCount: mine ? new Set([...mine.delegated.space].map(k => k.split('|')[0])).size : null,
        conversationCount: mine ? mine.delegated.conv.size : null,
        keysInMemory: !!mine,
    };
}

// ---------------------------------------------------------------------------
// Identité RSA du propriétaire (03 §4.1, PC27)
// ---------------------------------------------------------------------------

async function rsaSpki(jwk: string): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey('jwk', JSON.parse(jwk) as JsonWebKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
    return new Uint8Array(await crypto.subtle.exportKey('spki', key));
}

/** `ownerRsaSpkiHex` = `hex(SHA-256(SPKI DER))` de la clé RSA locale vérifiée. */
export async function ownerRsaSpkiHexOf(deps: AiRuntimeDeps): Promise<string> {
    const jwk = await deps.identity.verifiedRsaPublicKey();
    if (!jwk) throw new AiRuntimeError('e2ee_locked');
    return toHex(await sha256(await rsaSpki(jwk)));
}

/**
 * Empreinte RFC 7638 de la clé RSA locale du membre (PC27 a), formatée comme `computeKeyFingerprint`,
 * pour la vérification hors bande avec le tableau de bord du runtime. `null` si verrouillé.
 */
export async function ownRsaThumbprint(deps: AiRuntimeDeps): Promise<string | null> {
    const jwk = await deps.identity.verifiedRsaPublicKey();
    return jwk ? computeKeyFingerprint(jwk) : null;
}

// ---------------------------------------------------------------------------
// Entrées (03 §5)
// ---------------------------------------------------------------------------

function sleep(deps: AiRuntimeDeps, ms: number): Promise<void> {
    return new Promise(resolve => deps.clock.setTimeout(resolve, ms));
}

/**
 * Filtre de cloisonnement, appliqué à TOUTE clé avant ouverture : `kind` de la liste fermée,
 * identifiant conforme, et appartenance à l'org d'après l'annuaire local (salons, espaces). Une clé de
 * DM, de ticket, `org`, `ai` ou d'une autre org n'est jamais ouverte.
 */
export function isDelegableInOrg(deps: AiRuntimeDeps, orgId: string, k: { kind: string; ref: unknown; version: unknown }): k is KeyRef {
    if (!isDelegationEntryKind(k.kind) || typeof k.ref !== 'string' || !isValidId(k.ref)) return false;
    if (typeof k.version !== 'number' || !Number.isSafeInteger(k.version) || k.version < 1) return false;
    if (k.kind === 'thread') return k.version === 1 && deps.directory.hasThread(orgId, k.ref);
    if (k.kind === 'space') return deps.directory.hasSpace(orgId, k.ref);
    return k.version >= 1;
}

// ---------------------------------------------------------------------------
// Conversations runtime connues localement (cloisonnement des `CK`)
// ---------------------------------------------------------------------------

/**
 * L'enveloppe FC4 d'une `CK` signe `aiconv:<sessionId>` seul : elle n'est liée ni à l'org ni au mode
 * de la conversation (03 §6.2), et elle est optionnelle à la vérification. Elle ne prouve donc pas
 * qu'une conversation appartient à l'org courante. Ce qui fait foi est ce registre LOCAL, alimenté
 * uniquement par une action de l'utilisateur dans l'org (bascule, création ou ouverture d'une
 * conversation runtime, via `registerRuntimeConversation`), jamais par `/current/missing`. Une `conv`
 * absente du registre n'est jamais ouverte ni déléguée (échec fermé).
 */
const MAX_KNOWN_CONVERSATIONS = 20_000;
const convSlot = (userId: string, orgId: string) => `rt-conv:${userId}:${orgId}`;

async function readKnownConversations(deps: AiRuntimeDeps, userId: string, orgId: string): Promise<string[]> {
    const v = await deps.store.get(convSlot(userId, orgId));
    if (!isObj(v) || v.v !== 1 || !Array.isArray(v.ids)) return [];
    return v.ids.filter((x): x is string => typeof x === 'string' && isValidId(x));
}

/** Enregistre une conversation runtime de CETTE org, sur action de l'utilisateur. */
export async function registerRuntimeConversation(deps: AiRuntimeDeps, orgId: string, sessionId: string): Promise<void> {
    const userId = requireUserId(deps);
    if (!isValidId(sessionId)) throw new AiRuntimeError('delegation_invalid');
    const ids = await readKnownConversations(deps, userId, orgId);
    if (ids.includes(sessionId)) return;
    await deps.store.set(convSlot(userId, orgId), { v: 1, ids: [...ids, sessionId].slice(-MAX_KNOWN_CONVERSATIONS) });
}

export async function isKnownRuntimeConversation(deps: AiRuntimeDeps, orgId: string, sessionId: string): Promise<boolean> {
    return (await readKnownConversations(deps, requireUserId(deps), orgId)).includes(sessionId);
}

/** Filtre complet : format et annuaire (`isDelegableInOrg`), puis registre local pour les `conv`. */
async function isDelegable(deps: AiRuntimeDeps, orgId: string, known: Set<string>, k: { kind: string; ref: unknown; version: unknown }): Promise<boolean> {
    if (!isDelegableInOrg(deps, orgId, k)) return false;
    return k.kind !== 'conv' || known.has(k.ref as string);
}

interface SealedEntry {
    kind: DelegationEntryKind;
    ref: string;
    version: number;
    ciphertext: string;
}

async function sealEntries(deps: AiRuntimeDeps, orgId: string, h: HeldDelegation, refs: readonly KeyRef[]): Promise<{ entries: SealedEntry[]; skipped: number }> {
    const userId = requireUserId(deps);
    const known = new Set(await readKnownConversations(deps, userId, orgId));
    const bad = unresolvable.get(slot(userId, orgId)) ?? new Set<string>();
    unresolvable.set(slot(userId, orgId), bad);
    const entries: SealedEntry[] = [];
    let skipped = 0;
    const seen = new Set<string>();
    for (const k of refs) {
        const id = keyId(k);
        if (seen.has(id) || bad.has(id) || !(await isDelegable(deps, orgId, known, k))) {
            skipped++;
            continue;
        }
        seen.add(id);
        let raw: Uint8Array | null = null;
        try {
            raw = await deps.keys.open(orgId, { kind: k.kind, ref: k.ref, version: k.version });
            if (!raw || raw.length !== 32) {
                bad.add(id);
                skipped++;
                continue;
            }
            entries.push({ kind: k.kind, ref: k.ref, version: k.version, ciphertext: await sealDelegationEntry(h.dk, h.ctx, k, raw) });
        } catch {
            bad.add(id);
            skipped++;
        } finally {
            raw?.fill(0);
        }
    }
    return { entries, skipped };
}

/** Dépôt par lots de 500 au plus, au rythme de l'API (3 requêtes / 15 s). */
async function postEntries(deps: AiRuntimeDeps, orgId: string, h: HeldDelegation, entries: SealedEntry[]): Promise<number> {
    let added = 0;
    for (let i = 0, sent = 0; i < entries.length; i += MAX_ENTRIES_PER_REQUEST, sent++) {
        if (sent > 0 && sent % ENTRY_BURST === 0) await sleep(deps, ENTRY_WINDOW_MS);
        const batch = entries.slice(i, i + MAX_ENTRIES_PER_REQUEST);
        const res = await deps.api.request('POST', `${base(orgId)}/${encodeURIComponent(h.delegationId)}/entries`, { entries: batch });
        if (res.status !== 201) {
            if (res.status === 403 || res.status === 404) held.delete(slot(h.ctx.userId, orgId));
            throw apiError(res.status, res.body);
        }
        const n = isObj(res.body) && typeof res.body.added === 'number' ? res.body.added : 0;
        added += n;
        for (const e of batch) h.delegated[e.kind].add(e.kind === 'space' ? `${e.ref}|${e.version}` : e.ref);
    }
    return added;
}

async function fetchMissing(deps: AiRuntimeDeps, orgId: string): Promise<KeyRef[]> {
    const res = await deps.api.request('GET', `${base(orgId)}/current/missing`);
    if (res.status === 404) throw new AiRuntimeError('delegation_none');
    if (res.status !== 200 || !Array.isArray(res.body)) throw apiError(res.status, res.body);
    const known = new Set(await readKnownConversations(deps, requireUserId(deps), orgId));
    const out: KeyRef[] = [];
    for (const x of res.body) {
        if (isObj(x) && typeof x.kind === 'string' && await isDelegable(deps, orgId, known, x as { kind: string; ref: unknown; version: unknown })) out.push(x as unknown as KeyRef);
    }
    return out;
}

/**
 * P11 (03 §7.2) : demande les clés manquantes de la délégation active et les ajoute sous la `DK` en
 * mémoire. `delegation_none` si aucune délégation active, `delegation_unusable` si la `DK` n'est pas
 * en mémoire (nouvelle session de l'app : il faut une nouvelle délégation complète).
 */
export async function addMissingEntries(deps: AiRuntimeDeps, orgId: string): Promise<{ added: number; skipped: number }> {
    const userId = requireUserId(deps);
    const h = held.get(slot(userId, orgId));
    if (!h) throw new AiRuntimeError('delegation_unusable');
    const missing = await fetchMissing(deps, orgId);
    if (missing.length === 0) return { added: 0, skipped: 0 };
    const { entries, skipped } = await sealEntries(deps, orgId, h, missing.slice(0, MAX_ENTRIES_PER_DELEGATION));
    return { added: entries.length ? await postEntries(deps, orgId, h, entries) : 0, skipped };
}

// ---------------------------------------------------------------------------
// Création (03 §7.1) : délégation v2
// ---------------------------------------------------------------------------

export interface CreateDelegationOptions extends Pick<VerifyOptions, 'confirmFirstSeen'> {
    mode: MandateMode;
    /** Durée souhaitée (bornée par 1 h et `maxDelegationDays` de l'org). */
    durationSecs?: number;
    /** Runtime déjà vérifié dans la même opération (évite un second défi). */
    verified?: VerifiedRuntime;
}

/**
 * Nouvelle délégation complète : vérification du runtime, `DK` neuve, enveloppe de tête, mandat v2,
 * dépôt sans entrée, puis ajout des clés manquantes (la liste des clés détenues vient de l'API,
 * filtrée localement). Remplace la délégation active (`superseded` côté API).
 */
export async function createDelegation(deps: AiRuntimeDeps, orgId: string, options: CreateDelegationOptions): Promise<DelegationSummary> {
    const userId = requireUserId(deps);
    const signKey = deps.identity.signKey();
    if (!signKey) throw new AiRuntimeError('e2ee_locked');
    const runtime = options.verified ?? (await verifyRuntimeForDelegation(deps, orgId, { confirmFirstSeen: options.confirmFirstSeen }));
    const owner = await ownerRsaSpkiHexOf(deps);

    const maxSecs = runtime.maxDelegationDays ? runtime.maxDelegationDays * 86_400 : DEFAULT_DELEGATION_SECS;
    const duration = Math.max(MIN_DELEGATION_SECS, Math.min(options.durationSecs ?? DEFAULT_DELEGATION_SECS, maxSecs));
    const iat = deps.clock.now();
    const ctx: DelegationContext = { userId, orgId, runtimeId: runtime.runtimeId, delegationId: crypto.randomUUID(), scope: 'org', iat, exp: iat + duration };

    const dkRaw = crypto.getRandomValues(new Uint8Array(32));
    let wrap: string;
    let dk: CryptoKey;
    try {
        wrap = await sealDelegationWrap(ctx, runtime.keys.kex, dkRaw);
        dk = await crypto.subtle.importKey('raw', dkRaw as BufferSource, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    } catch (e) {
        throw fromFormatError(e, 'delegation_invalid');
    } finally {
        dkRaw.fill(0);
    }
    let mandateSignature: string;
    try {
        mandateSignature = await signMandateV2(signKey, ctx, runtime.fprHex, wrap, owner, options.mode);
    } catch (e) {
        throw fromFormatError(e, 'delegation_invalid');
    }

    const res = await deps.api.request('POST', base(orgId), {
        mandateVersion: 2,
        mode: options.mode,
        ownerRsaSpkiHex: owner,
        delegationId: ctx.delegationId,
        runtimeId: ctx.runtimeId,
        scope: ctx.scope,
        iat: ctx.iat,
        exp: ctx.exp,
        wrap,
        mandateSignature,
        entries: [],
    });
    if (res.status !== 201) throw apiError(res.status, res.body);

    const h: HeldDelegation = {
        delegationId: ctx.delegationId, ctx, dk, runtimeId: ctx.runtimeId, mode: options.mode,
        delegated: { thread: new Set(), space: new Set(), conv: new Set() },
    };
    held.set(slot(userId, orgId), h);
    unresolvable.delete(slot(userId, orgId));
    await writePreference(deps, userId, orgId, true, options.mode);
    try {
        await addMissingEntries(deps, orgId);
    } catch {
        // Délégation déposée : les clés manquantes seront reprises par la synchro (backoff).
    }
    const summary = await getDelegationSummary(deps, orgId);
    if (!summary) throw new AiRuntimeError('delegation_none');
    return summary;
}

// ---------------------------------------------------------------------------
// Mandat vérifié (12 §10, PlanContext.mode)
// ---------------------------------------------------------------------------

/**
 * Relit le mandat d'une délégation de l'utilisateur et le vérifie avec SA clé de signature (v1 lu
 * comme `plan`). Seule source du mode retenu pour l'exécutant des actions (12 §5 règle 8).
 */
export async function readVerifiedMandate(deps: AiRuntimeDeps, orgId: string, delegationId: string, runtime: VerifiedRuntime): Promise<VerifiedMandate> {
    const userId = requireUserId(deps);
    const res = await deps.api.request('GET', `${base(orgId)}/${encodeURIComponent(delegationId)}/mandate`);
    if (res.status !== 200 || !isObj(res.body)) throw apiError(res.status, res.body);
    const m = res.body;
    if (m.userId !== userId || m.orgId !== orgId || m.runtimeId !== runtime.runtimeId || m.delegationId !== delegationId
        || m.scope !== 'org' || typeof m.iat !== 'number' || typeof m.exp !== 'number' || typeof m.wrapHash !== 'string' || typeof m.signature !== 'string') {
        throw new AiRuntimeError('delegation_unusable');
    }
    const ctx: DelegationContext = { userId, orgId, runtimeId: runtime.runtimeId, delegationId, scope: 'org', iat: m.iat, exp: m.exp };
    const served = {
        mandateVersion: typeof m.version === 'number' ? m.version : undefined,
        mode: typeof m.mode === 'string' ? m.mode : undefined,
        ownerRsaSpkiHex: typeof m.ownerRsaSpkiHex === 'string' ? m.ownerRsaSpkiHex : undefined,
    };
    const wrapHash = m.wrapHash;
    const signature = m.signature;
    const out: { verified: VerifiedMandate | null } = { verified: null };
    const trust = await deps.signTrust.verify(userId, deps.identity.publicSignKey(), async jwk => {
        try {
            out.verified = await verifyMandateVersionedOfflineFromWrapHash(jwk, ctx, runtime.fprHex, wrapHash, signature, served);
            return true;
        } catch {
            return false;
        }
    }).catch(() => 'none' as const);
    if (trust !== 'trusted' || !out.verified) throw new AiRuntimeError('delegation_unusable');
    return out.verified;
}

// ---------------------------------------------------------------------------
// Révocation, désappairage, mode autonome
// ---------------------------------------------------------------------------

/** Révocation par l'utilisateur (03 §7.3) : `DK` effacée, mode runtime désactivé localement. */
export async function revokeMyDelegation(deps: AiRuntimeDeps, orgId: string): Promise<string[]> {
    const userId = requireUserId(deps);
    const res = await deps.api.request('DELETE', `${base(orgId)}/current`);
    held.delete(slot(userId, orgId));
    if (res.status !== 200) throw apiError(res.status, res.body);
    const pref = await readRuntimeModePreference(deps, userId, orgId);
    await writePreference(deps, userId, orgId, false, pref?.mode ?? 'plan');
    const revoked = isObj(res.body) && Array.isArray(res.body.revoked) ? res.body.revoked : [];
    return revoked.filter((x): x is string => typeof x === 'string');
}

/**
 * Désappairage signalé (`ai:runtime-changed`, `change = unpaired`) : CONFIRMÉ par une relecture du
 * registre (plus de runtime, ou un autre `runtimeId`) avant d'archiver l'épingle (01 §8, §9) et
 * d'oublier la `DK`. Rend `true` si le désappairage est confirmé.
 */
export async function onRuntimeUnpaired(deps: AiRuntimeDeps, orgId: string, runtimeId: string): Promise<boolean> {
    const userId = requireUserId(deps);
    const registry = await fetchRuntimeRegistry(deps, orgId);
    if (registry.runtime && registry.runtime.runtimeId === runtimeId) return false;
    held.delete(slot(userId, orgId));
    await archiveRuntimePin(deps.store, userId, orgId, deps.clock.now());
    return true;
}

const featureBase = (orgId: string) => `/api/orgs/${encodeURIComponent(orgId)}/ai/feature-policies/me/autonomous_mode/opt-in`;

/**
 * Activation du mode autonome (12 §11.3, étapes 2 et 3), après l'avertissement accepté dans l'UI :
 * opt-in, puis délégation v2 `auto` (nouvel identifiant). `feature_not_allowed` si l'org ne l'autorise pas.
 */
export async function enableAutonomousMode(deps: AiRuntimeDeps, orgId: string, warningVersion: number, options: Omit<CreateDelegationOptions, 'mode'> = {}): Promise<DelegationSummary> {
    if (!Number.isSafeInteger(warningVersion) || warningVersion < 1) throw new AiRuntimeError('feature_not_allowed');
    const res = await deps.api.request('PUT', featureBase(orgId), { warningVersion });
    if (res.status !== 200) throw apiError(res.status, res.body);
    return createDelegation(deps, orgId, { ...options, mode: 'auto' });
}

/** Désactivation (12 §11.3, étape 4) : délégation v2 `plan`, puis retrait de l'opt-in. */
export async function disableAutonomousMode(deps: AiRuntimeDeps, orgId: string, options: Omit<CreateDelegationOptions, 'mode'> = {}): Promise<DelegationSummary> {
    const summary = await createDelegation(deps, orgId, { ...options, mode: 'plan' });
    const res = await deps.api.request('DELETE', featureBase(orgId));
    if (res.status !== 200 && res.status !== 404) throw apiError(res.status, res.body);
    return summary;
}
