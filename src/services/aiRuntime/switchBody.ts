/**
 * Corps de `POST /api/orgs/:orgId/ai/sessions/:sessionId/switch-to-runtime` (04 §5) pour une
 * conversation EXISTANTE (lot L10b) : `CK` tirée ou réutilisée (03 §6.2), historique et titre
 * rechiffrés sous `CK` (03 §6.3, §6.4), entrée `conv` de la délégation active (03 §2).
 *
 * Bornes de l'API (`switchToRuntimeSchema`, `conversationValidation.ts`) appliquées AVANT l'envoi :
 * identifiants `[A-Za-z0-9_-]{1,64}`, 20 000 messages, 64 appels d'outil par message, nom d'outil
 * ≤ 64, `createdAt` ≤ 40, historique sérialisé ≤ 8 Mio, titre `gcm1:` ≤ 1024.
 *
 * Échec fermé : toute valeur illisible, toute clé incertaine, toute délégation absente arrête la
 * bascule avant le moindre envoi. Aucun clair ne sort du corps chiffré ; les erreurs ne portent que
 * des codes (`AiRuntimeError`), jamais une valeur, une clé ni un identifiant.
 */
import { wrapAiSessionKeyForMember, decryptAiField } from '@/assets/utils/crypto';
import { signKeyEnvelope } from '@/assets/utils/keyEnvelope';
import { decryptAiFieldStrict, encryptAiFieldStrict, type JsonValue } from '@/assets/utils/aiActionPlan';
import { isValidId } from '@/assets/utils/runtimeCert';
import { AiRuntimeError, apiError } from './errors';
import type { AiRuntimeDeps } from './ports';
import { hasDelegationKey, registerRuntimeConversation, sealConversationEntry } from './delegation';
import { requireUserId } from './runtimeTrust';

// ---------------------------------------------------------------------------
// Bornes (synco_api `conversationValidation.ts`, 09 §4)
// ---------------------------------------------------------------------------

export const SWITCH_MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;
export const SWITCH_MAX_MESSAGES = 20_000;
export const SWITCH_MAX_TOOL_CALLS = 64;
export const SWITCH_MAX_TOOL_NAME = 64;
export const SWITCH_MAX_CREATED_AT = 40;
/** 03 §6.3 : titre ≤ 60 caractères en clair ; l'API borne la valeur chiffrée à 1024. */
export const SWITCH_MAX_TITLE_CHARS = 60;
export const SWITCH_MAX_TITLE_WIRE = 1024;
export const CONV_SCHEME = 'conv-gcm1-v1';
const TITLE_MESSAGE_ID = '__session_title__';

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

export type ToolCallStatus = 'pending' | 'accepted' | 'rejected' | 'executing' | 'done' | 'error';
const TOOL_STATUSES: readonly ToolCallStatus[] = ['pending', 'accepted', 'rejected', 'executing', 'done', 'error'];

export interface Usage {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
}

/** `StoredMessage` en clair (03 §6.3), identifiants déjà conformes. */
export interface PlainToolCall {
    id: string;
    name: string;
    arguments: JsonValue;
    category: 'server' | 'client';
    mutating: boolean;
    status: ToolCallStatus;
}
export interface PlainStoredMessage {
    id: string;
    role: 'user' | 'assistant' | 'tool';
    content: string | null;
    thinking?: string;
    toolCalls?: PlainToolCall[];
    toolCallId?: string;
    toolResult?: JsonValue;
    createdAt: string;
    usage?: Usage;
}

/** `StoredMessage` chiffré, exactement `encryptedStoredMessageSchema` de l'API. */
export interface EncryptedToolCall {
    id: string;
    name: string;
    arguments: string;
    category: 'server' | 'client';
    mutating: boolean;
    status: ToolCallStatus;
}
export interface EncryptedStoredMessage {
    id: string;
    role: 'user' | 'assistant' | 'tool';
    content: string | null;
    thinking?: string;
    toolCalls?: EncryptedToolCall[];
    toolCallId?: string;
    toolResult?: string;
    createdAt: string;
    usage?: Usage;
}

export interface SwitchToRuntimeBody {
    runtimeId: string;
    delegationId: string;
    baseRev: number;
    messages: EncryptedStoredMessage[];
    title: string;
    convKey?: { encryptedKey: string; commitment?: string; signature?: string };
    convEntry: { kind: 'conv'; ref: string; version: 1; ciphertext: string };
}

/** Ce que l'app fournit en plus de l'API : clé de l'ancien format et historique affiché. */
export interface SwitchHistorySource {
    /** `AiSessionKey` de l'org (`ai:<orgId>`), pour relire l'ancien format `gateway-aes-gcm-v1`. */
    gatewayKey(orgId: string): Promise<CryptoKey>;
    /**
     * Historique AFFICHÉ sur cet appareil (format d'affichage d'OrgAI), `null` si la conversation n'y
     * est pas ouverte. Ne sert que si l'API ne rend aucun message (blob `isE2EE` du régime `client`,
     * que `GET /ai/sessions/:id` rend vide).
     */
    displayedMessages(orgId: string, sessionId: string): readonly unknown[] | null;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const unreadable = () => new AiRuntimeError('history_unreadable');
const isGcm1 = (v: unknown): v is string => typeof v === 'string' && v.startsWith('gcm1:');

/** Valeur JSON propre (sans `undefined`, fonctions ni cycles) ; illisible sinon. */
function toJson(v: unknown): JsonValue {
    if (v === undefined) return null;
    try {
        return JSON.parse(JSON.stringify(v)) as JsonValue;
    } catch {
        throw unreadable();
    }
}

function parseJsonText(text: string): JsonValue {
    try {
        return JSON.parse(text) as JsonValue;
    } catch {
        throw unreadable();
    }
}

function readUsage(v: unknown): Usage | undefined {
    if (!isRec(v)) return undefined;
    const out: Usage = {};
    for (const k of ['promptTokens', 'completionTokens', 'totalTokens', 'reasoningTokens'] as const) {
        const n = v[k];
        if (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0) out[k] = n;
    }
    return Object.keys(out).length ? out : undefined;
}

const readStatus = (v: unknown): ToolCallStatus => (TOOL_STATUSES as readonly unknown[]).includes(v) ? v as ToolCallStatus : 'done';
const readCategory = (v: unknown): 'server' | 'client' => (v === 'server' ? 'server' : 'client');

/** Tronque à `max` points de code (jamais au milieu d'une paire de substitution). */
const truncateChars = (s: string, max: number): string => Array.from(s).slice(0, max).join('');

/**
 * Identifiants réécrits à la conversion (00 §3.2) : un identifiant non conforme ou en double reçoit un
 * UUID ; les `toolCallId` suivent la même table pour rester liés à leur appel.
 */
class IdMap {
    private readonly used = new Set<string>();
    private readonly calls = new Map<string, string>();
    message(id: unknown): string {
        const out = typeof id === 'string' && isValidId(id) && !this.used.has(id) ? id : crypto.randomUUID();
        this.used.add(out);
        return out;
    }
    call(id: unknown): string {
        if (typeof id === 'string' && this.calls.has(id)) return this.calls.get(id)!;
        const out = typeof id === 'string' && isValidId(id) && !this.used.has(id) ? id : crypto.randomUUID();
        this.used.add(out);
        if (typeof id === 'string') this.calls.set(id, out);
        return out;
    }
    callRef(id: unknown): string | undefined {
        if (typeof id !== 'string') return undefined;
        return this.calls.get(id) ?? (isValidId(id) ? id : undefined);
    }
}

// ---------------------------------------------------------------------------
// Chiffrement / déchiffrement d'un historique sous une clé (03 §6.3)
// ---------------------------------------------------------------------------

/** Chiffre chaque champ de contenu sous `CK` ; identifiants supposés conformes (refus sinon). */
export async function encryptConversationHistory(ck: CryptoKey | Uint8Array, sessionId: string, messages: readonly PlainStoredMessage[]): Promise<EncryptedStoredMessage[]> {
    const seal = (messageId: string, field: string, plain: string) => encryptAiFieldStrict(ck, sessionId, messageId, field, plain);
    const out: EncryptedStoredMessage[] = [];
    for (const m of messages) {
        const e: EncryptedStoredMessage = {
            id: m.id,
            role: m.role,
            content: m.content === null ? null : await seal(m.id, 'content', m.content),
            createdAt: m.createdAt,
        };
        if (m.thinking !== undefined) e.thinking = await seal(m.id, 'thinking', m.thinking);
        if (m.toolCalls?.length) {
            e.toolCalls = [];
            for (const tc of m.toolCalls) {
                e.toolCalls.push({
                    id: tc.id, name: tc.name, category: tc.category, mutating: tc.mutating, status: tc.status,
                    arguments: await seal(m.id, `tool_call_arguments:${tc.id}`, JSON.stringify(tc.arguments)),
                });
            }
        }
        if (m.toolCallId !== undefined) e.toolCallId = m.toolCallId;
        if (m.toolResult !== undefined) e.toolResult = await seal(m.id, 'tool_result', JSON.stringify(m.toolResult));
        if (m.usage) e.usage = { ...m.usage };
        out.push(e);
    }
    return out;
}

/**
 * Lecture d'un `StoredMessage[]` dont les champs `gcm1:` sont sous `key`. `strict` (CK) : tout champ
 * de contenu DOIT être chiffré et se lire en lecture stricte (`decryptAiFieldStrict`) ; sinon (ancien
 * format `gateway`) un champ peut être en clair et se lit comme `decryptGatewaySessionMessages`, mais
 * sans aucun placeholder : un échec arrête la bascule.
 */
export async function decryptConversationHistory(key: CryptoKey | Uint8Array | null, sessionId: string, raw: readonly unknown[], strict: boolean): Promise<PlainStoredMessage[]> {
    const open = async (messageId: string, field: string, v: string): Promise<string> => {
        if (!key) throw unreadable();
        try {
            if (strict) return await decryptAiFieldStrict(key, sessionId, messageId, field, v);
            if (!(key instanceof CryptoKey)) throw unreadable();
            return await decryptAiField(key, sessionId, messageId, field, v);
        } catch {
            throw unreadable();
        }
    };
    const text = async (messageId: string, field: string, v: unknown): Promise<string> => {
        if (isGcm1(v)) return open(messageId, field, v);
        if (strict || typeof v !== 'string') throw unreadable();
        return v;
    };
    const json = async (messageId: string, field: string, v: unknown): Promise<JsonValue> => {
        if (isGcm1(v)) return parseJsonText(await open(messageId, field, v));
        if (strict) throw unreadable();
        return toJson(v);
    };
    const ids = new IdMap();
    const out: PlainStoredMessage[] = [];
    for (const m of raw) {
        if (!isRec(m) || typeof m.id !== 'string') throw unreadable();
        if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'tool') {
            if (strict) throw unreadable();
            continue;
        }
        const origId = m.id;
        const p: PlainStoredMessage = {
            id: strict ? origId : ids.message(origId),
            role: m.role,
            content: m.content === null || m.content === undefined ? null : await text(origId, 'content', m.content),
            createdAt: typeof m.createdAt === 'string' ? m.createdAt : '',
        };
        if (m.thinking !== undefined && m.thinking !== null) p.thinking = await text(origId, 'thinking', m.thinking);
        if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
            p.toolCalls = [];
            for (const tc of m.toolCalls) {
                if (!isRec(tc) || typeof tc.id !== 'string' || typeof tc.name !== 'string') throw unreadable();
                p.toolCalls.push({
                    id: strict ? tc.id : ids.call(tc.id),
                    name: tc.name,
                    arguments: await json(origId, `tool_call_arguments:${tc.id}`, tc.arguments),
                    category: readCategory(tc.category),
                    mutating: tc.mutating === true,
                    status: readStatus(tc.status),
                });
            }
        }
        if (m.toolCallId !== undefined && m.toolCallId !== null) {
            const ref = strict ? (typeof m.toolCallId === 'string' ? m.toolCallId : undefined) : ids.callRef(m.toolCallId);
            if (ref !== undefined) p.toolCallId = ref;
        }
        if (m.toolResult !== undefined) p.toolResult = await json(origId, 'tool_result', m.toolResult);
        const usage = readUsage(m.usage);
        if (usage) p.usage = usage;
        out.push(p);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Format d'affichage (OrgAI, régime `client`) -> StoredMessage[] (03 §6.4, 2e ligne)
// ---------------------------------------------------------------------------

/**
 * Conversion provisoire du format d'affichage (`ChatMessage` d'OrgAI) en `StoredMessage[]`, inverse de
 * `convertStoredMessagesToChatMessages` : un tour `parts` se découpe en messages `assistant`
 * successifs (texte, appels) suivis des messages `tool` de leurs résultats ; les messages `system`
 * (avis locaux, placeholders) sont écartés. 03 §6.4 la laisse « à valider par L11 ».
 */
export function displayToStoredMessages(display: readonly unknown[], nowIso: string): PlainStoredMessage[] {
    const ids = new IdMap();
    const out: PlainStoredMessage[] = [];
    const tool = (t: Rec): { call: PlainToolCall; result: JsonValue | undefined } => {
        if (typeof t.name !== 'string') throw unreadable();
        let args: unknown = t.args ?? t.arguments ?? {};
        if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch { /* reste une chaîne */ }
        }
        return {
            call: { id: ids.call(t.toolCallId), name: t.name, arguments: toJson(args), category: readCategory(t.category), mutating: t.mutating === true, status: readStatus(t.status) },
            result: t.result === undefined ? undefined : toJson(t.result),
        };
    };
    for (const m of display) {
        if (!isRec(m)) throw unreadable();
        const content = typeof m.content === 'string' ? m.content : '';
        if (m.role === 'user') {
            out.push({ id: ids.message(undefined), role: 'user', content, createdAt: nowIso });
            continue;
        }
        if (m.role !== 'assistant') continue;
        const turn: PlainStoredMessage[] = [];
        const st: { cur: PlainStoredMessage | null; results: PlainStoredMessage[] } = { cur: null, results: [] };
        const flush = () => {
            if (st.cur) turn.push(st.cur);
            turn.push(...st.results);
            st.cur = null;
            st.results = [];
        };
        const current = (): PlainStoredMessage => (st.cur ??= { id: ids.message(undefined), role: 'assistant', content: null, createdAt: nowIso });
        const addTool = (t: Rec) => {
            const { call, result } = tool(t);
            (current().toolCalls ??= []).push(call);
            if (result !== undefined) st.results.push({ id: ids.message(undefined), role: 'tool', content: null, toolCallId: call.id, toolResult: result, createdAt: nowIso });
        };
        if (Array.isArray(m.parts) && m.parts.length) {
            for (const part of m.parts) {
                if (!isRec(part)) continue;
                if (part.type === 'thinking' && typeof part.text === 'string') {
                    // Le raisonnement ouvre un nouveau message s'il suit du texte ou des appels.
                    if (st.cur && (st.cur.content !== null || st.cur.toolCalls)) flush();
                    const c = current();
                    c.thinking = (c.thinking ?? '') + part.text;
                } else if (part.type === 'text' && typeof part.text === 'string') {
                    if (st.cur?.toolCalls) flush();
                    const c = current();
                    c.content = (c.content ?? '') + part.text;
                } else if (part.type === 'tool' && isRec(part.tool)) {
                    addTool(part.tool);
                }
            }
        } else {
            current().content = content;
            if (isRec(m.tool_call)) addTool({ ...m.tool_call, args: m.tool_call.arguments });
        }
        flush();
        const usage = readUsage(m.usage);
        const lastAssistant = [...turn].reverse().find(x => x.role === 'assistant');
        if (usage && lastAssistant) lastAssistant.usage = usage;
        out.push(...turn);
    }
    return out;
}

/** Ancien tableau en clair : `StoredMessage` structuré (id + createdAt) ou format d'affichage. */
const isStoredShape = (m: unknown): boolean => isRec(m) && typeof m.id === 'string' && typeof m.createdAt === 'string' && (m.role === 'user' || m.role === 'assistant' || m.role === 'tool');

// ---------------------------------------------------------------------------
// Bornes
// ---------------------------------------------------------------------------

/** Contrôle final du corps contre `switchToRuntimeSchema` ; `history_too_large` / `history_unreadable`. */
export function checkSwitchBody(body: SwitchToRuntimeBody, sessionId: string): void {
    if (!isValidId(sessionId) || !isValidId(body.runtimeId) || !isValidId(body.delegationId) || body.convEntry.ref !== sessionId) throw new AiRuntimeError('delegation_invalid');
    if (!Number.isSafeInteger(body.baseRev) || body.baseRev < 0) throw unreadable();
    if (!isGcm1(body.title) || body.title.length > SWITCH_MAX_TITLE_WIRE) throw unreadable();
    if (body.messages.length > SWITCH_MAX_MESSAGES) throw new AiRuntimeError('history_too_large');
    for (const m of body.messages) {
        if (!isValidId(m.id) || (m.content !== null && !isGcm1(m.content))) throw unreadable();
        if (m.createdAt.length < 1 || m.createdAt.length > SWITCH_MAX_CREATED_AT) throw unreadable();
        if (m.thinking !== undefined && !isGcm1(m.thinking)) throw unreadable();
        if (m.toolResult !== undefined && !isGcm1(m.toolResult)) throw unreadable();
        if (m.toolCallId !== undefined && !isValidId(m.toolCallId)) throw unreadable();
        if (m.toolCalls) {
            if (m.toolCalls.length > SWITCH_MAX_TOOL_CALLS) throw new AiRuntimeError('history_too_large');
            for (const tc of m.toolCalls) {
                if (!isValidId(tc.id) || tc.name.length < 1 || tc.name.length > SWITCH_MAX_TOOL_NAME || !isGcm1(tc.arguments)) throw unreadable();
            }
        }
    }
    if (new TextEncoder().encode(JSON.stringify(body.messages)).length > SWITCH_MAX_TRANSCRIPT_BYTES) throw new AiRuntimeError('history_too_large');
    if (body.convKey) {
        const k = body.convKey;
        if (k.encryptedKey.length < 1 || k.encryptedKey.length > 4096) throw new AiRuntimeError('delegation_invalid');
        if ((k.commitment !== undefined && k.commitment.length > 512) || (k.signature !== undefined && k.signature.length > 512)) throw new AiRuntimeError('delegation_invalid');
    }
}

/** Avant chiffrement : bornes que la conversion ne corrige pas (noms d'outils, nombre d'appels). */
function checkPlain(messages: readonly PlainStoredMessage[], nowIso: string): PlainStoredMessage[] {
    if (messages.length > SWITCH_MAX_MESSAGES) throw new AiRuntimeError('history_too_large');
    return messages.map(m => {
        if (m.toolCalls && m.toolCalls.length > SWITCH_MAX_TOOL_CALLS) throw new AiRuntimeError('history_too_large');
        for (const tc of m.toolCalls ?? []) if (tc.name.length < 1 || tc.name.length > SWITCH_MAX_TOOL_NAME) throw unreadable();
        return m.createdAt.length >= 1 && m.createdAt.length <= SWITCH_MAX_CREATED_AT ? m : { ...m, createdAt: nowIso };
    });
}

// ---------------------------------------------------------------------------
// Construction du corps
// ---------------------------------------------------------------------------

interface SessionSnapshot {
    rev: number;
    scheme: string | null;
    title: unknown;
    messages: unknown;
}

async function readSession(deps: AiRuntimeDeps, orgId: string, sessionId: string): Promise<SessionSnapshot> {
    const res = await deps.api.request('GET', `/api/orgs/${encodeURIComponent(orgId)}/ai/sessions/${encodeURIComponent(sessionId)}`);
    if (res.status === 404) throw new AiRuntimeError('not_found');
    if (res.status !== 200 || !isRec(res.body)) throw apiError(res.status, res.body);
    const s = res.body;
    if (s.id !== sessionId || typeof s.rev !== 'number' || !Number.isSafeInteger(s.rev) || s.rev < 0) throw new AiRuntimeError('api_error');
    return { rev: s.rev, scheme: typeof s.encryptionScheme === 'string' ? s.encryptionScheme : null, title: s.title, messages: s.messages };
}

/**
 * `CK` existante (GET …/key `200`, ouverte et vérifiée par `deps.keys`, FC4 `aiconv:<sessionId>`) ou
 * `null` s'il n'y en a pas (`404`). Une clé servie mais impossible à ouvrir est une ERREUR : en tirer
 * une autre rendrait l'historique illisible, l'API conservant l'ancienne (03 §6.2).
 */
async function existingConversationKey(deps: AiRuntimeDeps, orgId: string, sessionId: string): Promise<Uint8Array | null> {
    const res = await deps.api.request('GET', `/api/orgs/${encodeURIComponent(orgId)}/ai/sessions/${encodeURIComponent(sessionId)}/key`);
    if (res.status === 404) return null;
    if (res.status !== 200) throw apiError(res.status, res.body);
    let raw: Uint8Array | null = null;
    try {
        raw = await deps.keys.open(orgId, { kind: 'conv', ref: sessionId, version: 1 });
    } catch {
        raw = null;
    }
    if (!raw || raw.length !== 32) {
        raw?.fill(0);
        throw new AiRuntimeError('conversation_key_unavailable');
    }
    return raw;
}

/** 03 §6.2 étapes 2-3 : `CK` scellée pour soi (RSA-OAEP-SHA256) et enveloppe FC4 `aiconv:<sessionId>`. */
async function sealConversationKeyForSelf(deps: AiRuntimeDeps, sessionId: string, ck: Uint8Array): Promise<NonNullable<SwitchToRuntimeBody['convKey']>> {
    const rsa = await deps.identity.verifiedRsaPublicKey();
    const signKey = deps.identity.signKey();
    if (!rsa || !signKey) throw new AiRuntimeError('e2ee_locked');
    const copy = ck.slice();
    try {
        const encryptedKey = await wrapAiSessionKeyForMember(copy.buffer, rsa);
        const { commitment, signature } = await signKeyEnvelope(copy.buffer, `aiconv:${sessionId}`, 1, signKey);
        return { encryptedKey, commitment, signature };
    } finally {
        copy.fill(0);
    }
}

async function plainHistory(
    source: SwitchHistorySource,
    orgId: string,
    sessionId: string,
    snap: SessionSnapshot,
    nowIso: string,
): Promise<PlainStoredMessage[]> {
    const raw = Array.isArray(snap.messages) ? snap.messages : null;
    if (!raw) throw unreadable();
    if (raw.length === 0) {
        // Blob `isE2EE` du régime `client` : l'API le rend vide, seul l'affichage de cet appareil le porte.
        const shown = source.displayedMessages(orgId, sessionId);
        return shown?.length ? displayToStoredMessages(shown, nowIso) : [];
    }
    const encrypted = raw.some(m => isRec(m) && (isGcm1(m.content) || isGcm1(m.thinking) || isGcm1(m.toolResult)
        || (Array.isArray(m.toolCalls) && m.toolCalls.some(tc => isRec(tc) && isGcm1(tc.arguments)))));
    if (raw.every(isStoredShape)) {
        let key: CryptoKey | null = null;
        if (encrypted) {
            try {
                key = await source.gatewayKey(orgId);
            } catch {
                throw new AiRuntimeError('conversation_key_unavailable');
            }
        }
        return decryptConversationHistory(key, sessionId, raw, false);
    }
    if (encrypted) throw unreadable();
    return displayToStoredMessages(raw, nowIso);
}

async function plainTitle(source: SwitchHistorySource, orgId: string, sessionId: string, snap: SessionSnapshot, ck: Uint8Array): Promise<string> {
    const t = snap.title;
    if (typeof t !== 'string') return '';
    if (!isGcm1(t)) return t;
    try {
        if (snap.scheme === CONV_SCHEME) return await decryptAiFieldStrict(ck, sessionId, TITLE_MESSAGE_ID, 'title', t);
        return await decryptAiField(await source.gatewayKey(orgId), sessionId, TITLE_MESSAGE_ID, 'title', t);
    } catch {
        throw unreadable();
    }
}

export interface SwitchBodyArgs {
    orgId: string;
    sessionId: string;
    runtimeId: string;
    delegationId: string;
}

/**
 * Construit le corps de la bascule (04 §5). Ordre : délégation prête (DK en mémoire, échec fermé),
 * lecture de la conversation, `CK` réutilisée ou tirée, enregistrement PC81, entrée `conv`, historique
 * et titre sous `CK`, `CK` scellée pour soi si elle est neuve, bornes. Les octets de `CK` sont effacés
 * en sortie.
 */
export async function buildSwitchToRuntimeBody(deps: AiRuntimeDeps, source: SwitchHistorySource, args: SwitchBodyArgs): Promise<SwitchToRuntimeBody> {
    const { orgId, sessionId, runtimeId, delegationId } = args;
    const userId = requireUserId(deps);
    if (!isValidId(sessionId) || !isValidId(runtimeId) || !isValidId(delegationId)) throw new AiRuntimeError('delegation_invalid');
    if (!hasDelegationKey(userId, orgId, delegationId)) throw new AiRuntimeError('delegation_unusable');

    const snap = await readSession(deps, orgId, sessionId);
    const nowIso = new Date(deps.clock.now() * 1000).toISOString();
    let ck = await existingConversationKey(deps, orgId, sessionId);
    const fresh = ck === null;
    if (snap.scheme === CONV_SCHEME && fresh) throw new AiRuntimeError('conversation_key_unavailable');
    ck ??= crypto.getRandomValues(new Uint8Array(32));
    try {
        await registerRuntimeConversation(deps, orgId, sessionId);
        const convEntry = await sealConversationEntry(deps, orgId, delegationId, sessionId, ck);

        let messages: EncryptedStoredMessage[];
        if (snap.scheme === CONV_SCHEME) {
            // 03 §6.4 dernière ligne : déjà sous CK. Relu en strict (preuve que c'est bien CETTE clé),
            // puis renvoyé tel quel, sans conversion.
            const raw = Array.isArray(snap.messages) ? snap.messages : null;
            if (!raw) throw unreadable();
            await decryptConversationHistory(ck, sessionId, raw, true);
            messages = raw.map(m => pickEncrypted(m));
        } else {
            const plain = checkPlain(await plainHistory(source, orgId, sessionId, snap, nowIso), nowIso);
            messages = await encryptConversationHistory(ck, sessionId, plain);
        }
        const title = await encryptAiFieldStrict(ck, sessionId, TITLE_MESSAGE_ID, 'title', truncateChars(await plainTitle(source, orgId, sessionId, snap, ck), SWITCH_MAX_TITLE_CHARS));

        const body: SwitchToRuntimeBody = { runtimeId, delegationId, baseRev: snap.rev, messages, title, convEntry };
        if (fresh) body.convKey = await sealConversationKeyForSelf(deps, sessionId, ck);
        checkSwitchBody(body, sessionId);
        return body;
    } finally {
        ck.fill(0);
    }
}

/** Message déjà chiffré (`conv-gcm1-v1`), réduit aux seuls champs admis par l'API. */
function pickEncrypted(m: unknown): EncryptedStoredMessage {
    if (!isRec(m) || typeof m.id !== 'string' || (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'tool') || typeof m.createdAt !== 'string') throw unreadable();
    const e: EncryptedStoredMessage = { id: m.id, role: m.role, content: isGcm1(m.content) ? m.content : null, createdAt: m.createdAt };
    if (isGcm1(m.thinking)) e.thinking = m.thinking;
    if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
        e.toolCalls = m.toolCalls.map(tc => {
            if (!isRec(tc) || typeof tc.id !== 'string' || typeof tc.name !== 'string' || !isGcm1(tc.arguments)) throw unreadable();
            return { id: tc.id, name: tc.name, arguments: tc.arguments, category: readCategory(tc.category), mutating: tc.mutating === true, status: readStatus(tc.status) };
        });
    }
    if (typeof m.toolCallId === 'string') e.toolCallId = m.toolCallId;
    if (isGcm1(m.toolResult)) e.toolResult = m.toolResult;
    const usage = readUsage(m.usage);
    if (usage) e.usage = usage;
    return e;
}

/** Constructeur à brancher par `setSwitchBodyBuilder` (aiRuntimeUi, L11). */
export function createSwitchBodyBuilder(deps: AiRuntimeDeps, source: SwitchHistorySource): (args: SwitchBodyArgs) => Promise<SwitchToRuntimeBody> {
    return args => buildSwitchToRuntimeBody(deps, source, args);
}
