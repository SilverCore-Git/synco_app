/**
 * Coffre de la clé locale d'appareil (DK) — E2EE v4, doc/securite/13-e2ee-v4-multi-appareil.md §3.
 *
 * DK (256 bits) ne scelle que la clé privée ECDH de l'appareil ; elle ne quitte jamais l'appareil et
 * n'est jamais envoyée au serveur. Chaque plateforme la protège avec ce que son système offre de
 * mieux. L'interface est la même partout : `create` produit (ou dérive) DK, `load` la restitue après
 * déverrouillage de l'utilisateur.
 */

/**
 * Ajouter un type ne casse aucune lecture : un enregistrement local d'appareil garde le type écrit à
 * son inscription, et un type inconnu de cette version n'a simplement pas de coffre (`unavailable`).
 */
export type VaultKind = 'webauthn-prf' | 'web-pin' | 'native-biometric' | 'os-keyring' | 'extension';

export interface VaultCapabilities {
    kind: VaultKind;
    /** La clé est protégée par du matériel dédié (Secure Enclave, StrongBox/TEE, authentificateur FIDO). */
    hardwareBacked: boolean;
    /** Déverrouillage par empreinte / visage. */
    biometric: boolean;
    /** Le PIN local de l'utilisateur doit être fourni à create() et load(). */
    needsPin: boolean;
    /**
     * Qui limite les essais de déverrouillage : 'hardware' (le matériel les compte, impossible à
     * contourner par copie de disque), 'software' (compteur local, contournable par un attaquant qui
     * copie le profil), 'none' (la session de l'OS est l'unique barrière).
     */
    rateLimit: 'hardware' | 'software' | 'none';
}

export interface VaultContext {
    /** PIN local (coffre web sans PRF uniquement). */
    pin?: string;
    /** Texte affiché dans l'invite biométrique du système (ou dans la fenêtre de l'extension). */
    reason?: string;
    /**
     * Abandon côté page d'une attente longue (coffre de l'extension : fenêtre du PIN). L'opération
     * échoue alors en 'cancelled' ; une réponse tardive est ignorée et ses clés effacées.
     */
    signal?: AbortSignal;
    /**
     * Appelé quand une invite hors de la page vient d'être demandée (fenêtre du PIN de l'extension) :
     * l'interface peut afficher « En attente de votre PIN… ». Ne reçoit aucune donnée. La fonction
     * renvoyée, s'il y en a une, est appelée quand la demande se termine (succès, refus ou annulation).
     */
    onPrompt?: () => void | (() => void);
}

export type VaultErrorCode =
    | 'pin-required'   // un PIN est nécessaire et n'a pas été fourni
    | 'wrong-pin'      // PIN incorrect (retryAfterSeconds peut être posé)
    | 'locked'         // trop d'essais : attendre retryAfterSeconds
    | 'wiped'          // trop d'essais : le coffre a été effacé, l'appareil doit être relié de nouveau
    | 'cancelled'      // l'utilisateur a annulé l'invite du système
    | 'unavailable'    // la plateforme ne peut pas offrir ce coffre (pas de PRF, pas de verrouillage d'écran…)
    | 'missing';       // aucune clé pour cet appareil

export class VaultError extends Error {
    readonly code: VaultErrorCode;
    readonly retryAfterSeconds?: number;
    constructor(code: VaultErrorCode, message?: string, retryAfterSeconds?: number) {
        super(message ?? code);
        this.name = 'VaultError';
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

export interface DeviceVault {
    readonly capabilities: VaultCapabilities;
    /** Produit DK pour cet appareil, la protège et la renvoie (pour sceller la clé privée de l'appareil). */
    create(deviceId: string, ctx?: VaultContext): Promise<Uint8Array>;
    /** Restitue DK après déverrouillage. */
    load(deviceId: string, ctx?: VaultContext): Promise<Uint8Array>;
    remove(deviceId: string): Promise<void>;
    has(deviceId: string): Promise<boolean>;
}

/** Stockage clé / valeur minimal (IndexedDB en production, Map en test). */
export interface KeyValueStore {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    del(key: string): Promise<void>;
}

export const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
export const fromB64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
export const DK_LENGTH = 32;
