/**
 * Pont entre les écrans (L11) et le service runtime de L10 : dépendances partagées, explication des
 * erreurs typées en français, bascule d'une conversation (local <-> runtime). Aucune cryptographie ici :
 * tout passe par `@/services/aiRuntime`.
 */
import { formatRuntimeFingerprint } from '@/assets/utils/runtimeCert';
import {
    AiRuntimeError,
    addMissingEntries,
    createDelegation,
    createDefaultAiRuntimeDeps,
    getDelegationSummary,
    registerRuntimeConversation,
    isKnownRuntimeConversation,
    forgetRuntimeConversation,
    verifyRuntimeForDelegation,
    type AiRuntimeDeps,
    type AiRuntimeErrorCode,
    type DelegationSummary,
} from '@/services/aiRuntime';
import { readRuntimePin } from '@/services/aiRuntime/runtimePin';
import { openConversationMessages, sealConversationMessages } from '@/services/aiRuntime/switchBody';

let shared: AiRuntimeDeps | null = null;
/** Dépendances réelles de L10, créées à la première demande (jamais à l'import : les tests n'ont pas de navigateur). */
export function runtimeDeps(): AiRuntimeDeps {
    shared ??= createDefaultAiRuntimeDeps();
    return shared;
}

// ---------------------------------------------------------------------------
// Erreurs expliquées
// ---------------------------------------------------------------------------

export type ProblemSeverity = 'info' | 'warning' | 'alert';
/** Ce que l'écran propose à la suite de l'erreur. */
export type ProblemAction = 'none' | 'confirm_first_seen' | 'accept_new_key' | 'unlock' | 'renew_delegation';

export interface RuntimeProblem {
    code: AiRuntimeErrorCode | 'unknown';
    severity: ProblemSeverity;
    title: string;
    detail: string;
    action: ProblemAction;
    /** Empreinte présentée par le runtime, déjà formatée. */
    fingerprint?: string;
    /** Empreinte épinglée sur cet appareil (clé changée ou première vue après un désappairage). */
    pinnedFingerprint?: string;
}

const P = (code: RuntimeProblem['code'], severity: ProblemSeverity, title: string, detail: string, action: ProblemAction = 'none'): RuntimeProblem =>
    ({ code, severity, title, detail, action });

/**
 * Traduit une erreur de L10 en message d'écran. `pinnedFingerprint` : ancienne empreinte, à fournir
 * pour `runtime_first_seen` après un désappairage (voir `previousPinnedFingerprint`).
 */
export function explainRuntimeError(e: unknown, extra: { pinnedFingerprint?: string } = {}): RuntimeProblem {
    if (!(e instanceof AiRuntimeError)) return P('unknown', 'warning', 'Une erreur est survenue', "L'opération n'a pas abouti. Réessayez dans un instant.");
    const d = e.details;
    switch (e.code) {
        case 'runtime_unreachable':
            return P(e.code, 'warning', 'Le runtime est hors ligne', 'Il ne répond pas pour le moment. Vos conversations restent disponibles en local ; réessayez quand il sera revenu.');
        case 'runtime_unavailable':
            return P(e.code, 'warning', 'Le runtime est hors ligne', "Le runtime de l'organisation n'est pas joignable. Réessayez plus tard ou restez en local.");
        case 'runtime_key_changed':
            return { ...P(e.code, 'alert', 'La clé du runtime a changé', "Ce n'est pas normal en dehors d'une réinstallation. Rien ne lui est confié tant que vous n'avez pas comparé l'empreinte avec celle donnée par votre administrateur.", 'accept_new_key'), fingerprint: d.fingerprint, pinnedFingerprint: d.pinnedFingerprint };
        case 'runtime_first_seen':
            return d.previouslyPinned
                ? { ...P(e.code, 'alert', 'Un nouveau runtime se présente', "Un autre runtime avait été appairé avant celui-ci. Même alerte qu'un changement de clé : comparez l'empreinte avec votre administrateur avant de lui confier vos clés.", 'confirm_first_seen'), fingerprint: d.fingerprint, pinnedFingerprint: extra.pinnedFingerprint ?? d.pinnedFingerprint }
                : { ...P(e.code, 'warning', 'Nouveau runtime sur cet appareil', "Vérifiez que cette empreinte est bien celle de votre runtime avant de lui confier vos clés.", 'confirm_first_seen'), fingerprint: d.fingerprint };
        case 'delegation_expired':
            return P(e.code, 'warning', 'Votre délégation a expiré', 'Elle se renouvelle à chaque ouverture de l\'app. Renouvelez-la pour que le runtime puisse reprendre vos conversations.', 'renew_delegation');
        case 'delegation_revoked':
            return P(e.code, 'warning', 'Votre délégation a été révoquée', 'Le runtime n\'a plus accès à vos clés. Vos conversations sont revenues en local.', 'renew_delegation');
        case 'delegation_none':
            return P(e.code, 'info', 'Aucune délégation active', 'Le runtime n\'a accès à aucune de vos clés pour le moment.', 'renew_delegation');
        case 'delegation_duration_too_short':
            return P(e.code, 'alert', 'Durée de délégation trop courte', "La durée maximale réglée par votre organisation est inférieure à une heure : aucune délégation n'est possible. Un administrateur doit l'allonger dans Paramètres › Synco AI › Runtime.");
        case 'delegation_not_allowed':
        case 'runtime_not_allowed':
        case 'feature_not_allowed':
            return P(e.code, 'info', "Votre organisation ne l'autorise pas", 'Un administrateur peut vous y donner accès dans Paramètres › Synco AI › Sécurité.');
        case 'e2ee_locked':
            return P(e.code, 'warning', 'Chiffrement verrouillé', 'Déverrouillez le chiffrement de bout en bout sur cet appareil, puis réessayez.', 'unlock');
        case 'no_runtime':
            return P(e.code, 'info', "Votre organisation n'a pas de runtime", "Un administrateur doit d'abord en appairer un.");
        case 'pair_code_mismatch':
            return P(e.code, 'alert', "Le code ne correspond pas", "Le code d'appairage ne correspond pas à l'empreinte de ce runtime. Vérifiez l'adresse et le code affichés par le runtime.");
        case 'pair_code_invalid':
            return P(e.code, 'warning', 'Code illisible', "Recopiez le code d'appairage tel que le runtime l'affiche.");
        case 'url_invalid':
            return P(e.code, 'warning', 'Adresse invalide', "L'adresse doit commencer par https:// et ne contenir ni identifiants ni paramètres.");
        case 'runtime_exists':
            return P(e.code, 'warning', 'Un runtime est déjà appairé', 'Désappairez-le avant d\'en appairer un autre.');
        case 'runtime_already_paired':
            return P(e.code, 'warning', 'Runtime déjà utilisé', 'Ce runtime est appairé à une autre organisation.');
        case 'runtime_id_conflict':
            return P(e.code, 'warning', 'Runtime à réinitialiser', 'Ce runtime a déjà servi ailleurs : il doit régénérer ses clés avant un nouvel appairage.');
        case 'challenge_failed':
        case 'cert_runtime_mismatch':
            return P(e.code, 'alert', 'Le runtime ne prouve pas son identité', "Rien ne lui est confié. Si cela persiste, prévenez votre administrateur.");
        case 'cert_signer_not_admin':
        case 'cert_bad_signature':
        case 'cert_invalid':
            return P(e.code, 'alert', 'Certificat du runtime refusé', "Le certificat n'a pas été signé par un administrateur de l'organisation. Un administrateur doit appairer le runtime à nouveau.");
        case 'rate_limited':
            return P(e.code, 'info', 'Trop de demandes', 'Réessayez dans quelques instants.');
        case 'conversation_key_unavailable':
            return P(e.code, 'warning', 'Clé de la conversation indisponible', "Cet appareil ne peut pas ouvrir la clé de cette conversation. Rien n'a été envoyé au runtime ; la conversation reste en local.");
        case 'history_unreadable':
            return P(e.code, 'warning', 'Historique illisible', "Une partie de l'historique n'a pas pu être relue sur cet appareil. Rien n'a été envoyé au runtime ; la conversation reste en local.");
        case 'history_too_large':
            return P(e.code, 'info', 'Conversation trop longue', "Son historique dépasse la taille admise par le runtime (8 Mio). Commencez une nouvelle conversation sur le runtime.");
        default:
            return P(e.code, 'warning', 'Une erreur est survenue', e.message);
    }
}

/** Ancienne empreinte épinglée (après un désappairage), formatée, pour l'alerte `first_seen_after_change`. */
export async function previousPinnedFingerprint(deps: AiRuntimeDeps, orgId: string): Promise<string | undefined> {
    const userId = deps.identity.userId();
    if (!userId) return undefined;
    const record = await readRuntimePin(deps.store, userId, orgId);
    const last = record ? record.previous[record.previous.length - 1] : undefined;
    return last ? formatRuntimeFingerprint(last.fpr) : undefined;
}

// ---------------------------------------------------------------------------
// Bascule d'une conversation
// ---------------------------------------------------------------------------

/** Corps de `POST …/switch-to-runtime` (04 §5) : historique et titre chiffrés pour la conversation, clé `CK`, entrée `conv`. */
export interface SwitchToRuntimeBody {
    runtimeId: string;
    delegationId: string;
    baseRev: number;
    messages: unknown;
    title: string;
    convKey?: { encryptedKey: string; commitment?: string; signature?: string };
    convEntry: { kind: 'conv'; ref: string; version: 1; ciphertext: string };
}

/**
 * Construit le corps de la bascule : c'est de la cryptographie (rechiffrement de l'historique sous la
 * `CK`, scellement de l'entrée `conv`), donc elle appartient à L10 et n'est jamais écrite ici. Tant que
 * L10 ne l'expose pas, l'écran ne peut pas basculer une conversation EXISTANTE.
 */
export type SwitchBodyBuilder = (args: { orgId: string; sessionId: string; runtimeId: string; delegationId: string }) => Promise<SwitchToRuntimeBody>;

export class SwitchUnavailableError extends Error {
    constructor() {
        super("La bascule d'une conversation existante vers le runtime n'est pas encore disponible dans cette version.");
        this.name = 'SwitchUnavailableError';
    }
}

/** Fournisseur du constructeur de corps (L10) ; `null` tant qu'il n'existe pas. */
let switchBodyBuilder: SwitchBodyBuilder | null = null;
export const setSwitchBodyBuilder = (b: SwitchBodyBuilder | null): void => { switchBodyBuilder = b; };
export const canSwitchExistingConversation = (): boolean => switchBodyBuilder !== null;

const API_CODES: Record<string, AiRuntimeErrorCode> = {
    runtime_unavailable: 'runtime_unavailable',
    delegation_expired: 'delegation_expired',
    delegation_revoked: 'delegation_revoked',
    delegation_not_allowed: 'delegation_not_allowed',
    ai_disabled: 'ai_disabled',
    forbidden: 'forbidden',
    not_found: 'not_found',
    not_runtime: 'not_runtime',
    rate_limited: 'rate_limited',
};

/** Erreurs propres à la bascule (`already_runtime`, `session_busy`, `rev_conflict`…) : texte dédié. */
export class SwitchRefusedError extends Error {
    readonly code: string;
    constructor(code: string) {
        super(code);
        this.name = 'SwitchRefusedError';
        this.code = code;
    }
}
export function explainSwitchRefusal(code: string): string {
    switch (code) {
        case 'already_runtime': return 'Cette conversation tourne déjà sur le runtime.';
        case 'session_busy': return 'Cette conversation attend une réponse de votre part ; terminez-la ou refusez l\'action avant de basculer.';
        case 'rev_conflict': return 'La conversation a changé entre-temps (autre appareil ?). Rouvrez-la puis réessayez.';
        case 'encryption_scheme_conflict': return 'Cette conversation ne peut pas changer de chiffrement.';
        default: return 'La bascule a été refusée.';
    }
}

async function post(deps: AiRuntimeDeps, orgId: string, sessionId: string, action: 'switch-to-runtime' | 'switch-to-local', body?: unknown): Promise<void> {
    const path = `/api/orgs/${encodeURIComponent(orgId)}/ai/sessions/${encodeURIComponent(sessionId)}/${action}`;
    const res = await deps.api.request('POST', path, body ?? {});
    if (res.status === 200) return;
    const code = res.body && typeof res.body === 'object' && typeof (res.body as { error?: unknown }).error === 'string' ? (res.body as { error: string }).error : 'api_error';
    const known = API_CODES[code];
    if (known) throw new AiRuntimeError(known, { status: res.status });
    throw new SwitchRefusedError(code);
}

export interface SwitchOptions {
    confirmFirstSeen?: boolean;
    builder?: SwitchBodyBuilder | null;
}

/**
 * « Faire tourner sur le runtime ». S'assure d'une délégation active (en crée une sinon), appelle la
 * bascule, puis ENREGISTRE la conversation (PC81) : une conversation non enregistrée n'est jamais déléguée.
 */
export async function switchConversationToRuntime(deps: AiRuntimeDeps, orgId: string, sessionId: string, options: SwitchOptions = {}): Promise<DelegationSummary> {
    const builder = options.builder === undefined ? switchBodyBuilder : options.builder;
    if (!builder) throw new SwitchUnavailableError();
    let summary = await getDelegationSummary(deps, orgId);
    // DK absente de la mémoire (nouvelle session de l'app) : l'entrée `conv` ne peut pas être scellée,
    // il faut une délégation neuve (03 §7.2).
    if (!summary || summary.status !== 'active' || !summary.keysInMemory || summary.expiresAt.getTime() <= deps.clock.now() * 1000) {
        summary = await createDelegation(deps, orgId, { mode: summary?.mode ?? 'plan', confirmFirstSeen: options.confirmFirstSeen });
    }
    // PC81 : le constructeur enregistre la conversation AVANT de sceller son entrée `conv` ; si la
    // bascule échoue, une conversation qui n'était pas déjà connue est retirée du registre.
    const wasKnown = await isKnownRuntimeConversation(deps, orgId, sessionId);
    try {
        const body = await builder({ orgId, sessionId, runtimeId: summary.runtimeId, delegationId: summary.delegationId });
        await post(deps, orgId, sessionId, 'switch-to-runtime', body);
    } catch (e) {
        if (!wasKnown) await forgetRuntimeConversation(deps, orgId, sessionId).catch(() => undefined);
        throw e;
    }
    await registerRuntimeConversation(deps, orgId, sessionId);
    await addMissingEntries(deps, orgId).catch(() => undefined);
    return summary;
}

/**
 * « Revenir en local » : l'API révoque l'autorisation et retire l'entrée `conv`. `reload` (après un succès
 * seulement) recharge la conversation affichée : sans lui, messages et régime affichés resteraient périmés.
 */
export async function switchConversationToLocal(deps: AiRuntimeDeps, orgId: string, sessionId: string, reload?: (sessionId: string) => Promise<void>): Promise<void> {
    await post(deps, orgId, sessionId, 'switch-to-local');
    if (reload) await reload(sessionId);
}

/**
 * Ouverture d'une conversation runtime de l'org (PC81) : l'enregistre pour que la synchro la délègue.
 * Ne lève jamais : une conversation non enregistrée reste simplement non déléguée.
 */
export async function registerOpenedRuntimeConversation(deps: AiRuntimeDeps, orgId: string, sessionId: string): Promise<boolean> {
    try {
        await registerRuntimeConversation(deps, orgId, sessionId);
        return true;
    } catch {
        return false;
    }
}

/** Lecture et écriture des conversations `conv-gcm1-v1` (clé `CK` de l'appareil), pour `AIService`. */
export const conversationHistory = {
    open: (orgId: string, sessionId: string, raw: unknown) => openConversationMessages(runtimeDeps(), orgId, sessionId, raw),
    seal: (orgId: string, sessionId: string, display: readonly unknown[]) => sealConversationMessages(runtimeDeps(), orgId, sessionId, display),
};

// ---------------------------------------------------------------------------
// Vue d'administration du runtime (Paramètres de l'org › Synco AI › Runtime)
// ---------------------------------------------------------------------------

export type ToolPolicyValue = 'auto' | 'ask' | 'deny';

export interface RuntimeAdminView {
    runtime: {
        runtimeId: string;
        url: string;
        online: boolean;
        lastSeenAt: string | null;
        softwareVersion: string | null;
        signerId: string | null;
        /** Empreinte formatée de la clé du runtime (celle qu'il présente), `null` si la vérification a échoué. */
        fingerprint: string | null;
        /** État de l'épingle sur cet appareil (`null` si la vérification a échoué avant l'épinglage). */
        pinState: 'match' | 'first_seen' | 'first_seen_after_change' | 'changed' | null;
    } | null;
    policy: { enabled: boolean; maxDelegationDays: number; toolPolicy: Record<string, ToolPolicyValue> };
    /** Problème de vérification à afficher en bandeau (clé changée, certificat refusé…). */
    problem: RuntimeProblem | null;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Lit le registre, vérifie le runtime SANS défi ni écriture d'épingle (`challenge: false`). */
export async function loadRuntimeAdminView(deps: AiRuntimeDeps, orgId: string): Promise<RuntimeAdminView> {
    const res = await deps.api.request('GET', `/api/orgs/${encodeURIComponent(orgId)}/ai/runtime`);
    if (res.status !== 200 || !isRec(res.body)) throw new AiRuntimeError(res.status === 403 ? 'forbidden' : 'api_error', { status: res.status });
    const policyRaw = isRec(res.body.policy) ? res.body.policy : {};
    const toolPolicy: Record<string, ToolPolicyValue> = {};
    if (isRec(policyRaw.toolPolicy)) {
        for (const [k, v] of Object.entries(policyRaw.toolPolicy)) if (v === 'auto' || v === 'ask' || v === 'deny') toolPolicy[k] = v;
    }
    const policy = {
        enabled: policyRaw.enabled === true,
        maxDelegationDays: typeof policyRaw.maxDelegationDays === 'number' && policyRaw.maxDelegationDays > 0 ? policyRaw.maxDelegationDays : 7,
        toolPolicy,
    };
    const r = isRec(res.body.runtime) ? res.body.runtime : null;
    if (!r || typeof r.runtimeId !== 'string') return { runtime: null, policy, problem: null };

    let fingerprint: string | null = null;
    let pinState: NonNullable<RuntimeAdminView['runtime']>['pinState'] = null;
    let problem: RuntimeProblem | null = null;
    try {
        const v = await verifyRuntimeForDelegation(deps, orgId, { challenge: false });
        fingerprint = v.fingerprint;
        pinState = v.pinState;
    } catch (e) {
        problem = explainRuntimeError(e, { pinnedFingerprint: await previousPinnedFingerprint(deps, orgId) });
        fingerprint = problem.fingerprint ?? null;
        if (problem.code === 'runtime_key_changed') pinState = 'changed';
    }
    const signer = isRec(r.signer) ? r.signer : {};
    return {
        runtime: {
            runtimeId: r.runtimeId,
            url: str(r.url) ?? '',
            online: r.online === true,
            lastSeenAt: str(r.lastSeenAt),
            softwareVersion: str(r.softwareVersion),
            signerId: str(signer.adminId),
            fingerprint,
            pinState,
        },
        policy,
        problem,
    };
}

/** Le runtime de l'org est-il utilisable par moi ? Lecture légère du registre, sans vérification cryptographique. */
export async function runtimeAvailability(deps: AiRuntimeDeps, orgId: string): Promise<{ available: boolean; online: boolean }> {
    try {
        const res = await deps.api.request('GET', `/api/orgs/${encodeURIComponent(orgId)}/ai/runtime`);
        if (res.status !== 200 || !isRec(res.body) || !isRec(res.body.runtime)) return { available: false, online: false };
        return { available: res.body.allowedForMe === true, online: res.body.runtime.online === true };
    } catch {
        return { available: false, online: false };
    }
}
