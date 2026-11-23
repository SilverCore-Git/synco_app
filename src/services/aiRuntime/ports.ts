/**
 * Dépendances du service runtime (lot L10), injectées pour que toute la logique soit testable sans
 * Vue, réseau ni IndexedDB. Le câblage réel est dans `defaults.ts`.
 */
import type { SignatureTrust } from '@/assets/utils/keyTrust';
import type { DelegationEntryKind } from '@/assets/utils/runtimeDelegation';

export interface HttpResult {
    status: number;
    body: unknown;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** API Synco (`/api/...`), authentifiée. */
export interface ApiPort {
    request(method: HttpMethod, path: string, body?: unknown): Promise<HttpResult>;
}

/** Appels DIRECTS au runtime (01 §4, §5), sans passer par l'API. */
export interface RuntimeDirectPort {
    /** `GET <url>/v1/identity`. */
    identity(url: string): Promise<HttpResult>;
    /** `POST <url>/v1/challenge`. */
    challenge(url: string, body: unknown): Promise<HttpResult>;
}

/** Magasin local (IndexedDB) des épingles et préférences : données publiques seulement. */
export interface LocalStorePort {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
}

/** Identité locale déverrouillée. Rien de ce qui sort d'ici n'est envoyé en clair. */
export interface IdentityPort {
    userId(): string | null;
    /** Clé privée de signature d'identité (ECDSA P-256), `null` si verrouillé. */
    signKey(): CryptoKey | null;
    /** Clé publique de signature servie par l'annuaire pour soi-même (JWK). */
    publicSignKey(): string | null;
    /**
     * Clé publique RSA d'identité (JWK) dont la correspondance avec la clé privée locale est vérifiée
     * (`assertOwnPublicKeyMatches`) ; `null` si verrouillé ou si elle ne correspond pas.
     */
    verifiedRsaPublicKey(): Promise<string | null>;
}

/** Vérification d'une signature d'identité d'un membre (`verifyWithSignKeys`, keyTrust.ts). */
export interface SignTrustPort {
    verify(userId: string, servedSignKey: string | null, verify: (canonicalJwk: string) => Promise<boolean>): Promise<SignatureTrust>;
}

/** Annuaire local de l'org ouverte (règle de cloisonnement : rien hors de l'org concernée). */
export interface OrgDirectoryPort {
    /** Clé publique de signature servie pour ce membre, `null` si inconnu. */
    signKeyOf(orgId: string, userId: string): string | null;
    /** Le salon appartient-il à cette org (accueil ou espace) d'après l'annuaire local ? */
    hasThread(orgId: string, threadId: string): boolean;
    /** L'espace appartient-il à cette org d'après l'annuaire local ? */
    hasSpace(orgId: string, spaceId: string): boolean;
}

export interface KeyRef {
    kind: DelegationEntryKind;
    ref: string;
    version: number;
}

/**
 * Ouverture locale d'une clé détenue par l'utilisateur (scellé RSA, enveloppe FC4, épinglage FC4).
 * Rend les 32 octets, que l'appelant efface aussitôt après usage, ou `null` si la clé n'est pas
 * disponible sur cet appareil (version ancienne non servie, clé non partagée…).
 */
export interface KeySourcePort {
    open(orgId: string, key: KeyRef): Promise<Uint8Array | null>;
}

/** Horloge (secondes Unix) et minuteries, remplaçables dans les tests. */
export interface ClockPort {
    now(): number;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}

export interface AiRuntimeDeps {
    api: ApiPort;
    runtime: RuntimeDirectPort;
    store: LocalStorePort;
    identity: IdentityPort;
    signTrust: SignTrustPort;
    directory: OrgDirectoryPort;
    keys: KeySourcePort;
    clock: ClockPort;
    /** Build de dev : `http://localhost|127.0.0.1` admis pour l'URL du runtime. */
    allowDevHttp: boolean;
}
