/**
 * Erreurs typées du service runtime (lot L10) : l'UI (L11 à L13) ne lit que `code`, jamais un message
 * brut de l'API ni d'une primitive. Les messages sont fixes : aucune valeur reçue, aucune clé, aucun
 * identifiant n'y figure. `details` ne porte que des données publiques utiles à l'affichage
 * (empreintes, identifiant de l'admin signataire).
 */
import { RuntimeFormatError } from '@/assets/utils/runtimeCert';

export const AI_RUNTIME_ERROR_CODES = [
    // État local
    'e2ee_locked',
    // Registre et politique
    'no_runtime',
    'runtime_not_allowed',
    'runtime_unreachable',
    'runtime_exists',
    'runtime_already_paired',
    'runtime_id_conflict',
    'url_invalid',
    'pair_code_invalid',
    'pair_code_mismatch',
    // Vérification du certificat (01 §6.3), dans l'ordre
    'cert_invalid',
    'cert_signer_not_admin',
    'cert_bad_signature',
    'cert_runtime_mismatch',
    'runtime_first_seen',
    'runtime_key_changed',
    'challenge_failed',
    // Délégation (03)
    'delegation_none',
    'delegation_expired',
    'delegation_revoked',
    'delegation_invalid',
    'delegation_unusable',
    'delegation_entry_forbidden',
    'delegation_not_allowed',
    'delegation_duration_too_short',
    'runtime_unavailable',
    'feature_not_allowed',
    // Plan d'action (12)
    'plan_invalid',
    'plan_digest_mismatch',
    'plan_not_pending',
    'not_runtime',
    // Bascule d'une conversation existante (03 §6.4, 04 §5)
    'conversation_key_unavailable',
    'history_unreadable',
    'history_too_large',
    // Communs
    'ai_disabled',
    'rate_limited',
    'forbidden',
    'not_found',
    'api_error',
] as const;
export type AiRuntimeErrorCode = (typeof AI_RUNTIME_ERROR_CODES)[number];

const MESSAGES: Record<AiRuntimeErrorCode, string> = {
    e2ee_locked: 'Le chiffrement de bout en bout est verrouillé sur cet appareil.',
    no_runtime: "Aucun runtime n'est appairé à cette organisation.",
    runtime_not_allowed: "Votre organisation ne vous autorise pas à utiliser le runtime.",
    runtime_unreachable: 'Le runtime ne répond pas.',
    runtime_exists: 'Un runtime est déjà appairé à cette organisation.',
    runtime_already_paired: 'Ce runtime est déjà appairé à une autre organisation.',
    runtime_id_conflict: 'Ce runtime a déjà servi ailleurs : il doit régénérer ses clés.',
    url_invalid: "L'adresse du runtime n'est pas valide.",
    pair_code_invalid: "Le code d'appairage est illisible.",
    pair_code_mismatch: "Le code d'appairage ne correspond pas à ce runtime.",
    cert_invalid: 'Le certificat du runtime est invalide.',
    cert_signer_not_admin: "Le certificat du runtime n'a pas été signé par un administrateur de l'organisation.",
    cert_bad_signature: "La signature du certificat du runtime n'a pas pu être vérifiée.",
    cert_runtime_mismatch: 'Le runtime joint ne correspond pas à son certificat.',
    runtime_first_seen: 'Nouveau runtime : vérifiez son empreinte avant de lui confier vos clés.',
    runtime_key_changed: 'La clé du runtime a changé. Par sécurité, rien ne lui est confié.',
    challenge_failed: "Le runtime n'a pas prouvé qu'il détient ses clés.",
    delegation_none: "Aucune délégation active vers le runtime.",
    delegation_expired: 'La délégation vers le runtime a expiré.',
    delegation_revoked: 'La délégation vers le runtime a été révoquée.',
    delegation_invalid: 'La délégation a été refusée.',
    delegation_unusable: 'La délégation est illisible.',
    delegation_entry_forbidden: 'Une clé ne peut pas être confiée au runtime.',
    delegation_not_allowed: "Votre organisation ne vous autorise pas à déléguer vos clés.",
    delegation_duration_too_short: "La durée maximale de délégation de votre organisation est inférieure à une heure.",
    runtime_unavailable: "Le runtime de l'organisation n'est pas disponible.",
    feature_not_allowed: "Votre organisation n'autorise pas cette fonctionnalité.",
    plan_invalid: "Le plan d'action est invalide.",
    plan_digest_mismatch: "Le plan d'action ne correspond pas à ce que le runtime a annoncé.",
    plan_not_pending: "Ce plan d'action n'attend plus de décision.",
    not_runtime: "Cette conversation ne tourne pas sur le runtime.",
    conversation_key_unavailable: "La clé de cette conversation n'est pas disponible sur cet appareil.",
    history_unreadable: "L'historique de cette conversation n'a pas pu être relu sur cet appareil.",
    history_too_large: "L'historique de cette conversation est trop volumineux pour le runtime.",
    ai_disabled: "Le module IA est désactivé pour cette organisation.",
    rate_limited: 'Trop de requêtes, nouvel essai plus tard.',
    forbidden: 'Action non autorisée.',
    not_found: 'Introuvable.',
    api_error: 'Erreur du serveur.',
};

/** Données publiques jointes à une erreur, pour l'écran (jamais de clé ni de secret). */
export interface AiRuntimeErrorDetails {
    /** Empreinte du runtime présenté (01 §2.1), formatée pour l'affichage. */
    fingerprint?: string;
    /** Empreinte épinglée sur cet appareil, formatée (clé changée). */
    pinnedFingerprint?: string;
    /** Un runtime avait déjà été épinglé pour cette org (première vue après un changement, 01 §8). */
    previouslyPinned?: boolean;
    /** Admin signataire du certificat. */
    adminId?: string;
    /** Statut HTTP d'une erreur d'API. */
    status?: number;
}

export class AiRuntimeError extends Error {
    readonly code: AiRuntimeErrorCode;
    readonly details: AiRuntimeErrorDetails;
    constructor(code: AiRuntimeErrorCode, details: AiRuntimeErrorDetails = {}) {
        super(MESSAGES[code]);
        this.name = 'AiRuntimeError';
        this.code = code;
        this.details = details;
    }
}

export const isAiRuntimeErrorCode = (code: unknown): code is AiRuntimeErrorCode =>
    typeof code === 'string' && (AI_RUNTIME_ERROR_CODES as readonly string[]).includes(code);

/** Erreur d'une réponse d'API `{ error: <code> }` : code connu repris, sinon `api_error`. */
export function apiError(status: number, body: unknown): AiRuntimeError {
    const code = body && typeof body === 'object' && !Array.isArray(body) ? (body as { error?: unknown }).error : undefined;
    return new AiRuntimeError(isAiRuntimeErrorCode(code) ? code : 'api_error', { status });
}

/** Traduit une erreur de format des fonctions pures, sans reprendre son texte. */
export function fromFormatError(e: unknown, fallback: AiRuntimeErrorCode): AiRuntimeError {
    if (e instanceof AiRuntimeError) return e;
    if (e instanceof RuntimeFormatError && isAiRuntimeErrorCode(e.code)) return new AiRuntimeError(e.code);
    return new AiRuntimeError(fallback);
}
