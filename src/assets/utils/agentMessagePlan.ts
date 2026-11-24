/**
 * Kinds de message du plan d'action (12 §4.2, §8.4 point 6, §10.7) : `message.send`, `message.edit`,
 * `dm.send`, `dm.edit`. Fonctions pures, rejouées par le worker (L15-rt) sur les mêmes vecteurs
 * (plan-kinds.json `validationCases`, `executorCases`, `targetDigests` ; text-declaration.json `executorCases`) :
 *
 * - `checkMessageKindArgs` : `args` stricts et bornes du §4.2 ;
 * - `messageKindExecutor` : exécutant conditionnel du mode autonome (PC94 : texte venu par `argsRefs` → appareil) ;
 * - `messageTarget` : cible du condensat `serverDigests[n]` (§8.4 point 6) et de la déclaration ;
 * - `buildTextDeclarationFor` : déclaration du texte final d'une action d'agent, signée à la décision (§10.7).
 *
 * Le validateur général (`validatePlan`, aiActionPlan.ts) doit appeler ces fonctions pour ces kinds :
 * intégration hors du périmètre de L15f (fichier commun), signalée au compte rendu.
 */
import { parseArgRef, type JsonObject, type JsonValue } from './aiActionPlan';
import { isValidId, toHex } from './runtimeCert';
import type { MandateMode } from './runtimeDelegation';
import {
    agentMessageText, isWellFormedText, signTextDeclaration, textCommit, textSalt, type TextDeclaration, type TextDeclarationKind,
} from './agentMessage';

export const MESSAGE_KINDS = ['message.send', 'message.edit', 'dm.send', 'dm.edit'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export const isMessageKind = (k: unknown): k is MessageKind => typeof k === 'string' && (MESSAGE_KINDS as readonly string[]).includes(k);

/** Risque fixe de chaque kind (12 §4.2, plan-kinds.json `kindRisk`). */
export const MESSAGE_KIND_RISK: Record<MessageKind, 'R1' | 'R2'> = { 'message.send': 'R1', 'message.edit': 'R2', 'dm.send': 'R1', 'dm.edit': 'R2' };

/** Champs exportés (12 §4.2). */
export const MESSAGE_KIND_EXPORTS: Record<MessageKind, readonly string[]> = {
    'message.send': ['id', 'threadId'], 'message.edit': ['id', 'threadId'], 'dm.send': ['id', 'peerId'], 'dm.edit': ['id'],
};

const MAX_TEXT = 8000;
const MAX_FORWARD_COMMENT = 2000;
const isObj = (v: JsonValue | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const chars = (s: string): number => Array.from(s).length;

type FieldRule = 'id' | 'text' | 'ids50' | 'ids10';
const FIELDS: Record<MessageKind, Record<string, { rule: FieldRule; required: boolean }>> = {
    'message.send': {
        threadId: { rule: 'id', required: true }, text: { rule: 'text', required: true }, replyTo: { rule: 'id', required: false },
        mentionUserIds: { rule: 'ids50', required: false }, fileIds: { rule: 'ids10', required: false }, forwardOf: { rule: 'id', required: false },
    },
    'message.edit': { messageId: { rule: 'id', required: true }, text: { rule: 'text', required: true } },
    'dm.send': { peerId: { rule: 'id', required: true }, text: { rule: 'text', required: true }, fileIds: { rule: 'ids10', required: false } },
    'dm.edit': { dmMessageId: { rule: 'id', required: true }, text: { rule: 'text', required: true } },
};

const distinctIds = (v: JsonValue, max: number): boolean =>
    Array.isArray(v) && v.length <= max && v.every(x => typeof x === 'string' && isValidId(x)) && new Set(v).size === v.length;

/**
 * `args` stricts d'une action de message (12 §4.2) : champ inconnu, type, bornes (texte 1 à 8 000 ; 0 à 2 000 avec
 * `forwardOf`), listes d'identifiants distincts. Un champ fourni par `argsRefs` est absent d'`args` mais compte
 * comme présent ; `argsRefs` ne vise qu'un champ d'identifiant du kind. `tool` est interdit hors `server.call`.
 */
export function checkMessageKindArgs(action: JsonObject): boolean {
    const kind = action.kind;
    if (!isMessageKind(kind) || has(action, 'tool') || !isObj(action.args)) return false;
    const fields = FIELDS[kind];
    const args = action.args;
    const refs = has(action, 'argsRefs') ? action.argsRefs : {};
    if (!isObj(refs)) return false;
    for (const [k, v] of Object.entries(refs)) {
        if (fields[k]?.rule !== 'id' || has(args, k) || typeof v !== 'string' || !parseArgRef(v)) return false;
    }
    for (const [k, spec] of Object.entries(fields)) if (spec.required && !has(args, k) && !has(refs, k)) return false;
    const forward = has(args, 'forwardOf') || has(refs, 'forwardOf');
    for (const [k, v] of Object.entries(args)) {
        const spec = fields[k];
        if (!spec) return false;
        switch (spec.rule) {
            case 'id': if (typeof v !== 'string' || !isValidId(v)) return false; break;
            case 'ids50': if (!distinctIds(v, 50)) return false; break;
            case 'ids10': if (!distinctIds(v, 10)) return false; break;
            case 'text': {
                if (typeof v !== 'string' || !isWellFormedText(v)) return false;
                const n = chars(v);
                if (forward ? n > MAX_FORWARD_COMMENT : n < 1 || n > MAX_TEXT) return false;
                break;
            }
        }
    }
    return true;
}

/** Ce que l'exécutant conditionnel lit hors de l'action (connu du worker ET de l'appareil, 12 §4.2). */
export interface MessageExecutorContext {
    mode: MandateMode;
    /**
     * `message.edit` : le message visé est un `m3` d'auteur `rt1:` d'une délégation du MÊME utilisateur vers CE
     * runtime dans CETTE org (en-tête `iv` signé du message, §4.3).
     */
    targetAuthorSameUserRuntime?: boolean;
    /** Exécutant et kind des actions visées par `argsRefs` (`"$m.x"` → action `m`). */
    refExecutors?: Readonly<Record<string, 'device' | 'agent'>>;
    refKinds?: Readonly<Record<string, string>>;
}

/** Champs de cible du texte (PC94) : un `argsRefs` qui porte autre chose (ex. `text`) → appareil. */
const TARGET_REF_FIELDS: Record<'message.send' | 'message.edit', readonly string[]> = { 'message.send': ['threadId', 'replyTo'], 'message.edit': ['messageId'] };

/**
 * Exécutant d'une action de message (12 §4.2, §10.7) ; même fonction côté worker (règle 8 du §5). MP : toujours
 * l'appareil (EX-13). `message.send` en mode autonome : runtime sans fichier (non vide) ni transfert, et `argsRefs`
 * limité à `threadId` / `replyTo`. `message.edit` : runtime si le message visé est de l'agent (auteur `rt1:` de la
 * même délégation) ou vient par `argsRefs` d'un `message.send` d'exécutant agent, et `argsRefs` limité à `messageId`.
 */
export function messageKindExecutor(action: JsonObject, ctx: MessageExecutorContext): 'device' | 'agent' {
    const kind = action.kind;
    if (ctx.mode !== 'auto' || (kind !== 'message.send' && kind !== 'message.edit')) return 'device';
    const args = isObj(action.args) ? action.args : {};
    const refs = isObj(action.argsRefs) ? action.argsRefs : {};
    if (Object.keys(refs).some(k => !TARGET_REF_FIELDS[kind].includes(k))) return 'device';
    if (kind === 'message.send') {
        const files = args.fileIds;
        if (Array.isArray(files) && files.length > 0) return 'device';
        if (has(args, 'forwardOf')) return 'device';
        return 'agent';
    }
    const ref = typeof refs.messageId === 'string' ? parseArgRef(refs.messageId) : null;
    if (ref) {
        const m = String(ref.m);
        return ref.field === 'id' && ctx.refExecutors?.[m] === 'agent' && ctx.refKinds?.[m] === 'message.send' ? 'agent' : 'device';
    }
    return ctx.targetAuthorSameUserRuntime === true ? 'agent' : 'device';
}

/**
 * Cible d'une action de message d'agent (12 §8.4 point 6) : `{ threadId, replyTo? }` ou `{ messageId }`, sans les
 * champs fournis par `argsRefs`. `null` pour un kind sans cible.
 */
export function messageTarget(action: JsonObject): { kind: TextDeclarationKind; target: Record<string, string>; argsRefs?: Record<string, string> } | null {
    const kind = action.kind;
    if (kind !== 'message.send' && kind !== 'message.edit') return null;
    const args = isObj(action.args) ? action.args : {};
    const target: Record<string, string> = {};
    for (const f of TARGET_REF_FIELDS[kind]) {
        const v = args[f];
        if (typeof v === 'string') target[f] = v;
    }
    let argsRefs: Record<string, string> | undefined;
    if (isObj(action.argsRefs)) {
        argsRefs = {};
        for (const [k, v] of Object.entries(action.argsRefs)) if (typeof v === 'string') argsRefs[k] = v;
    }
    return argsRefs === undefined ? { kind, target } : { kind, target, argsRefs };
}

export interface DeclarationInput {
    ck: Uint8Array;
    sessionId: string;
    planId: string;
    orgId: string;
    userId: string;
    userSignKey: CryptoKey;
}

/**
 * Déclaration signée (`td1:…`) du texte final de l'action `n` (12 §10.7, étape 2 du déroulé), calculée depuis le
 * plan DÉCHIFFRÉ. Lève si l'action n'est pas un `message.send` / `message.edit` dont le texte est dans `args`.
 */
export async function buildTextDeclarationFor(action: JsonObject, input: DeclarationInput): Promise<string> {
    const n = action.n;
    const t = messageTarget(action);
    const args = isObj(action.args) ? action.args : {};
    if (!t || typeof n !== 'number' || typeof args.text !== 'string') throw new Error('text_declaration_unavailable');
    const mentions = Array.isArray(args.mentionUserIds) ? args.mentionUserIds.filter((x): x is string => typeof x === 'string') : undefined;
    const text = agentMessageText({ text: args.text, mentionUserIds: mentions });
    const salt = await textSalt(input.ck, input.sessionId, input.planId, n);
    try {
        const decl: TextDeclaration = {
            v: 1, orgId: input.orgId, userId: input.userId, planId: input.planId, n, kind: t.kind, target: t.target,
            textCommit: await textCommit(salt, text),
            ...(t.argsRefs !== undefined ? { argsRefs: t.argsRefs } : {}),
        };
        return await signTextDeclaration(input.userSignKey, decl);
    } finally {
        salt.fill(0);
    }
}

/** Sel en hexadécimal (enveloppe `{ salt, text }`), pour le worker et les tests ; à ne jamais journaliser. */
export const saltHexFor = async (ck: Uint8Array, sessionId: string, planId: string, n: number): Promise<string> =>
    toHex(await textSalt(ck, sessionId, planId, n));
