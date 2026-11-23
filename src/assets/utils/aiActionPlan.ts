/**
 * Plan d'action de Synco AI — référence TS des fonctions pures de
 * synco_ai_runtime/docs/plan/12-plan-action.md (§3 à §9), rejouées à l'identique par le module
 * `plan` de la crate Rust `synco-e2ee`. Vecteurs : scripts/e2ee-vectors/action-plan.json (copie
 * conforme de docs/plan/vectors/action-plan.json, figé par L00f).
 *
 * - `jcs` : JSON canonique RFC 8785 restreint aux entiers sûrs (§3.3) ;
 * - `planAad`, `phaseResultAad` : AAD du plan et des résultats de phase (§3.3, §9) ;
 * - `encryptPlan`, `decryptPlan`, `encryptPhaseResult`, `decryptPhaseResult` : `gcm1:` sous `CK` ;
 * - `serverDigest`, `planServerDigests`, `checkServerCall` : `serverDigests` et verrou `refs` (§8.4) ;
 * - `validatePlan` : règles 1 à 6 du §5 et bornes de PC61 ; `checkServedGraph` : règle 8 ;
 * - `PlanGraph`, `PlanRun` : niveaux, cascade (PC37), échec (PC54), actions prêtes et statut (PC58).
 *
 * Aucun appel réseau, aucun état global. Utilisé par l'appareil (lot L10) pour revalider et exécuter.
 */
import { RuntimeFormatError, isValidId, sha256, toHex } from './runtimeCert';
import type { MandateMode } from './runtimeDelegation';
import { TEXT_FILE_FORMATS } from './textFileFormats';

const enc = new TextEncoder();

export const PLAN_VERSION = 1;
/** PC61. */
export const MAX_PLAN_ACTIONS = 100;
/** PC61 : entrées d'`after` pour tout le plan. */
export const MAX_PLAN_AFTER_ENTRIES = 2000;
/** PC61 : `utf8(JCS(plan))` ≤ 256 Kio. */
export const MAX_PLAN_BYTES = 262_144;
/**
 * PC61 : longueur maximale, en OCTETS UTF-8, d'une valeur `gcm1:` de plan ou de résultat de phase,
 * celle d'un clair de `MAX_PLAN_BYTES` : `5 + 4·⌈(12 + 262 144 + 16) / 3⌉ = 349 569`. Contrôlée avant
 * le base64, AES-GCM et le JSON, comme `MAX_PLAN_VALUE_LEN` de la crate.
 */
export const MAX_PLAN_VALUE_LEN = 5 + 4 * Math.ceil((12 + MAX_PLAN_BYTES + 16) / 3);
/** 09 §3 : 7 jours au plus. */
export const MAX_PLAN_LIFETIME_SECS = 604_800;
export const MAX_PLAN_GROUPS = 50;
const MAX_DEPTH = 64;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

const isObject = (v: JsonValue | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (o: JsonObject, key: string): string | undefined => (typeof o[key] === 'string' ? (o[key] as string) : undefined);
const uint = (v: JsonValue | undefined): number | undefined => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined);
const has = (o: JsonObject, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);
const charLength = (s: string): number => Array.from(s).length;

// ---------------------------------------------------------------------------
// JCS (RFC 8785, entiers seulement)
// ---------------------------------------------------------------------------

/**
 * JSON canonique (12 §3.3) : clés triées par unités UTF-16 (tri par défaut de JavaScript), aucune
 * espace, chaînes de `JSON.stringify`, nombres entiers sûrs seulement (sinon `invalid_input`).
 */
export function jcs(value: JsonValue): string {
    const write = (v: JsonValue, depth: number): string => {
        if (depth > MAX_DEPTH) throw new RuntimeFormatError('invalid_input');
        if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
        if (typeof v === 'number') {
            if (!Number.isSafeInteger(v)) throw new RuntimeFormatError('invalid_input');
            return JSON.stringify(v);
        }
        if (Array.isArray(v)) return `[${v.map(item => write(item, depth + 1)).join(',')}]`;
        if (typeof v !== 'object') throw new RuntimeFormatError('invalid_input');
        return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${write(v[k] as JsonValue, depth + 1)}`).join(',')}}`;
    };
    return write(value, 0);
}

// ---------------------------------------------------------------------------
// AAD et chiffrement sous CK (12 §3.3, §9)
// ---------------------------------------------------------------------------

/** Exécutant d'une action (12 §4) ; chacun numérote ses phases de 1 en 1. */
export type PlanExecutor = 'device' | 'agent';

/** Champ de l'AAD du résultat de la phase `phase ≥ 1` de cet exécutant. */
export function phaseResultField(executor: PlanExecutor, phase: number): string {
    if (!Number.isSafeInteger(phase) || phase < 1) throw new RuntimeFormatError('invalid_input');
    return `${executor === 'device' ? 'plan_result' : 'plan_agent_result'}:${phase}`;
}

function assertIds(...ids: string[]): void {
    for (const id of ids) if (!isValidId(id)) throw new RuntimeFormatError('invalid_input');
}

export function planAad(sessionId: string, planId: string): string {
    assertIds(sessionId, planId);
    return `${sessionId}:${planId}:plan`;
}

export function phaseResultAad(sessionId: string, planId: string, executor: PlanExecutor, phase: number): string {
    assertIds(sessionId, planId);
    return `${sessionId}:${planId}:${phaseResultField(executor, phase)}`;
}

function toB64(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}

/** base64 standard strict (forme canonique, comme la crate) ; `field_invalid_base64` sinon. */
function fromB64(text: string): Uint8Array {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw new RuntimeFormatError('field_invalid_base64');
    const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
    if (toB64(bytes) !== text) throw new RuntimeFormatError('field_invalid_base64');
    return bytes;
}

const aesKey = async (ck: CryptoKey | Uint8Array, usage: KeyUsage): Promise<CryptoKey> => {
    if (ck instanceof CryptoKey) return ck;
    if (ck.length !== 32) throw new RuntimeFormatError('invalid_input');
    return crypto.subtle.importKey('raw', ck as BufferSource, { name: 'AES-GCM', length: 256 }, false, [usage]);
};

/** `gcm1:` + `b64(iv ‖ chiffré ‖ tag)`, AAD `sessionId:messageId:fieldName` (03 §6.3). */
async function sealField(ck: CryptoKey | Uint8Array, aad: string, plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad), tagLength: 128 }, await aesKey(ck, 'encrypt'), enc.encode(plaintext) as BufferSource));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0);
    out.set(ct, 12);
    return `gcm1:${toB64(out)}`;
}

/**
 * Écriture d'un champ `gcm1:` (03 §6.3), AAD `sessionId:messageId:fieldName` ; identifiants conformes
 * à 00 §3.2 (`invalid_input` sinon). Même format que `encryptAiField`, base64 par blocs (gros champs).
 */
export async function encryptAiFieldStrict(ck: CryptoKey | Uint8Array, sessionId: string, messageId: string, fieldName: string, plaintext: string): Promise<string> {
    assertIds(sessionId, messageId);
    return sealField(ck, `${sessionId}:${messageId}:${fieldName}`, plaintext);
}

/**
 * Lecture STRICTE d'un champ `gcm1:` avec les codes de la crate (`session::decrypt_field`) :
 * `invalid_input` (identifiant non conforme, avant l'AAD), `field_unknown_version`,
 * `field_invalid_base64`, `field_invalid_length`, `field_authentication_failed`,
 * `field_invalid_utf8`. `fieldName` est la partie brute de l'AAD.
 */
export async function decryptAiFieldStrict(ck: CryptoKey | Uint8Array, sessionId: string, messageId: string, fieldName: string, wireValue: string): Promise<string> {
    assertIds(sessionId, messageId);
    if (!wireValue.startsWith('gcm1:')) throw new RuntimeFormatError('field_unknown_version');
    const raw = fromB64(wireValue.slice(5));
    if (raw.length < 28) throw new RuntimeFormatError('field_invalid_length');
    let plain: Uint8Array;
    try {
        plain = new Uint8Array(await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: raw.slice(0, 12) as BufferSource, additionalData: enc.encode(`${sessionId}:${messageId}:${fieldName}`), tagLength: 128 },
            await aesKey(ck, 'decrypt'),
            raw.slice(12) as BufferSource,
        ));
    } catch {
        throw new RuntimeFormatError('field_authentication_failed');
    }
    try {
        // `ignoreBOM` : un BOM initial reste dans le texte (et le JSON est refusé), comme
        // `String::from_utf8` de la crate ; sans lui, TextDecoder l'ôterait en silence.
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(plain);
    } catch {
        throw new RuntimeFormatError('field_invalid_utf8');
    }
}

const JSON_ESCAPES: Readonly<Record<string, string>> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

/**
 * Lecture STRICTE d'un clair de plan ou de résultat de phase, au verdict identique à `parse_clear` de
 * la crate (`serde_json`, puis JCS) : `JSON.parse` perd la forme des nombres, d'où ce parseur.
 * Refusés (`field_invalid_json`) : syntaxe hors RFC 8259, nombre écrit avec fraction ou exposant
 * (`1.0`, `1e2`), `-0`, entier hors de ±(2⁵³ − 1), demi-paire de substitution (`"\ud800"`), profondeur
 * > 64. Clés posées par `Object.defineProperty` (`__proto__` reste une clé ordinaire) ; doublon : la
 * dernière valeur l'emporte, comme `serde_json`.
 */
export function parseJsonStrict(text: string): JsonValue {
    const fail = () => new RuntimeFormatError('field_invalid_json');
    let i = 0;
    const ws = () => {
        while (i < text.length) {
            const c = text.charCodeAt(i);
            if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) break;
            i++;
        }
    };
    const literal = (word: string, value: JsonValue): JsonValue => {
        if (!text.startsWith(word, i)) throw fail();
        i += word.length;
        return value;
    };
    const hex4 = (): number => {
        const h = text.slice(i, i + 4);
        if (!/^[0-9A-Fa-f]{4}$/.test(h)) throw fail();
        i += 4;
        return parseInt(h, 16);
    };
    const string = (): string => {
        i++; // "
        let out = '';
        let start = i;
        for (;;) {
            if (i >= text.length) throw fail();
            const c = text.charCodeAt(i);
            if (c === 0x22) {
                out += text.slice(start, i);
                i++;
                return out;
            }
            if (c < 0x20) throw fail();
            if (c !== 0x5c) {
                i++;
                continue;
            }
            out += text.slice(start, i);
            const e = text[i + 1];
            i += 2;
            if (e === 'u') {
                const u = hex4();
                if (u >= 0xdc00 && u <= 0xdfff) throw fail();
                if (u >= 0xd800 && u <= 0xdbff) {
                    if (text[i] !== '\\' || text[i + 1] !== 'u') throw fail();
                    i += 2;
                    const low = hex4();
                    if (low < 0xdc00 || low > 0xdfff) throw fail();
                    out += String.fromCharCode(u, low);
                } else {
                    out += String.fromCharCode(u);
                }
            } else if (e !== undefined && has(JSON_ESCAPES, e)) {
                out += JSON_ESCAPES[e] ?? '';
            } else {
                throw fail();
            }
            start = i;
        }
    };
    const number = (): number => {
        const m = /^-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(text.slice(i, i + 400));
        if (!m) throw fail();
        const raw = m[0];
        i += raw.length;
        const n = Number(raw);
        if (m[1] !== undefined || m[2] !== undefined || raw === '-0' || !Number.isSafeInteger(n)) throw fail();
        return n;
    };
    const value = (depth: number): JsonValue => {
        if (depth > MAX_DEPTH) throw fail();
        ws();
        const c = text[i];
        if (c === '{') {
            i++;
            const obj: JsonObject = {};
            ws();
            if (text[i] === '}') {
                i++;
                return obj;
            }
            for (;;) {
                ws();
                if (text[i] !== '"') throw fail();
                const key = string();
                ws();
                if (text[i] !== ':') throw fail();
                i++;
                Object.defineProperty(obj, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
                ws();
                if (text[i] === ',') { i++; continue; }
                if (text[i] === '}') { i++; return obj; }
                throw fail();
            }
        }
        if (c === '[') {
            i++;
            const arr: JsonValue[] = [];
            ws();
            if (text[i] === ']') {
                i++;
                return arr;
            }
            for (;;) {
                arr.push(value(depth + 1));
                ws();
                if (text[i] === ',') { i++; continue; }
                if (text[i] === ']') { i++; return arr; }
                throw fail();
            }
        }
        if (c === '"') return string();
        if (c === 't') return literal('true', true);
        if (c === 'f') return literal('false', false);
        if (c === 'n') return literal('null', null);
        if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return number();
        throw fail();
    };
    const out = value(0);
    ws();
    if (i !== text.length) throw fail();
    return out;
}

/** Chiffre le plan (`JCS(plan)`) sous `CK` ; AAD tirée de ses `sessionId` et `planId`. */
export async function encryptPlan(ck: CryptoKey | Uint8Array, plan: JsonObject): Promise<string> {
    const sessionId = str(plan, 'sessionId');
    const planId = str(plan, 'planId');
    if (sessionId === undefined || planId === undefined) throw new RuntimeFormatError('invalid_input');
    const clear = jcs(plan);
    if (enc.encode(clear).length > MAX_PLAN_BYTES) throw new PlanInvalidError('plan_too_large');
    return sealField(ck, planAad(sessionId, planId), clear);
}

/** Borne de PC61 sur la valeur chiffrée, en octets (comme `str::len` de la crate), avant tout décodage. */
function checkValueLength(value: string): void {
    // `length` (unités UTF-16) ≤ octets UTF-8 : l'encodage n'est fait que sous la borne.
    if (value.length > MAX_PLAN_VALUE_LEN || enc.encode(value).length > MAX_PLAN_VALUE_LEN) throw new PlanInvalidError('plan_too_large');
}

/**
 * Déchiffre `pendingToolCall.args` ; le clair doit porter ce `sessionId` et ce `planId`. Identifiants
 * non conformes : `invalid_input`, avant l'AAD.
 */
export async function decryptPlan(ck: CryptoKey | Uint8Array, sessionId: string, planId: string, value: string): Promise<JsonObject> {
    assertIds(sessionId, planId);
    checkValueLength(value);
    const plan = parseJsonStrict(await decryptAiFieldStrict(ck, sessionId, planId, 'plan', value));
    if (!isObject(plan) || plan.sessionId !== sessionId || plan.planId !== planId) throw new PlanInvalidError('plan_header');
    return plan;
}

export type ActionState = 'pending' | 'executing' | 'done' | 'failed' | 'skipped' | 'unknown_outcome';
const ACTION_STATES: readonly string[] = ['pending', 'executing', 'done', 'failed', 'skipped', 'unknown_outcome'];
const isFinal = (s: ActionState): boolean => s !== 'pending' && s !== 'executing';

/** Codes d'abandon d'une action d'agent (12 §8.3, PC74), liste fermée identique à `ABANDON_CODES` de la crate. */
export const ABANDON_CODES = ['rate_limited', 'refs_inconsistent', 'action_not_accepted', 'autonomy_required', 'key_unavailable'] as const;
export type AbandonCode = (typeof ABANDON_CODES)[number];
export const isAbandonCode = (code: unknown): code is AbandonCode => typeof code === 'string' && (ABANDON_CODES as readonly string[]).includes(code);

/**
 * Clair d'un résultat de phase : `{ v: 1, planId, phase, outcomes: [{ n, state, output?, code? }] }`
 * (§9), `n` croissants, chacun action du plan (`graph`) confiée à l'exécutant de l'AAD, état final (ni
 * `pending` ni `executing`), `output` = objet d'identifiants, `code` = abandon (PC74) : liste fermée,
 * seulement avec `failed` / `unknown_outcome`, jamais avec `output` (`check_phase_result` de la crate).
 */
function checkPhaseResult(value: JsonValue, planId: string, phase: number, executor: PlanExecutor, graph: PlanGraph): asserts value is JsonObject {
    const fail = () => new PlanInvalidError('plan_header');
    if (!isObject(value) || Object.keys(value).some(k => !['v', 'planId', 'phase', 'outcomes'].includes(k))) throw fail();
    if (value.v !== PLAN_VERSION || value.planId !== planId || value.phase !== phase || !Array.isArray(value.outcomes)) throw fail();
    let last = 0;
    for (const o of value.outcomes) {
        if (!isObject(o) || Object.keys(o).some(k => !['n', 'state', 'output', 'code'].includes(k))) throw fail();
        const n = uint(o.n);
        if (n === undefined || n <= last || typeof o.state !== 'string' || !ACTION_STATES.includes(o.state)) throw fail();
        if (graph.actions[n - 1]?.executor !== executor || !isFinal(o.state as ActionState)) throw fail();
        last = n;
        if (has(o, 'code') && (!isAbandonCode(o.code) || has(o, 'output') || (o.state !== 'failed' && o.state !== 'unknown_outcome'))) throw fail();
        if (has(o, 'output')) {
            const out = o.output;
            if (!isObject(out) || Object.entries(out).some(([k, v]) => !isExportField(k) || typeof v !== 'string' || !isValidId(v))) throw fail();
        }
    }
}

/** Chiffre un résultat de phase (`planId` et `phase` lus dans le clair, contrôlés contre le graphe du plan). */
export async function encryptPhaseResult(ck: CryptoKey | Uint8Array, sessionId: string, executor: PlanExecutor, graph: PlanGraph, result: JsonObject): Promise<string> {
    const planId = str(result, 'planId');
    const phase = uint(result.phase);
    if (planId === undefined || phase === undefined) throw new RuntimeFormatError('invalid_input');
    checkPhaseResult(result, planId, phase, executor, graph);
    return sealField(ck, phaseResultAad(sessionId, planId, executor, phase), jcs(result));
}

/**
 * Déchiffre et recontrôle un résultat de phase : AAD de l'exécutant et de la phase, puis le clair,
 * contre `graph` (le plan déchiffré et validé) : chaque `n` du plan et de cet exécutant, état final.
 */
export async function decryptPhaseResult(ck: CryptoKey | Uint8Array, sessionId: string, planId: string, executor: PlanExecutor, phase: number, graph: PlanGraph, value: string): Promise<JsonObject> {
    assertIds(sessionId, planId);
    const field = phaseResultField(executor, phase);
    checkValueLength(value);
    const result = parseJsonStrict(await decryptAiFieldStrict(ck, sessionId, planId, field, value));
    checkPhaseResult(result, planId, phase, executor, graph);
    return result;
}

// ---------------------------------------------------------------------------
// serverDigests et verrou `refs` (12 §8.4, PC47)
// ---------------------------------------------------------------------------

/** `hex(SHA-256(JCS({ tool, args, argsRefs })))`, `argsRefs` omis s'il est absent. */
export async function serverDigest(tool: string, args: JsonObject, argsRefs?: JsonObject): Promise<string> {
    const input: JsonObject = argsRefs === undefined ? { tool, args } : { tool, args, argsRefs };
    return toHex(await sha256(enc.encode(jcs(input))));
}

/** `serverDigests` d'un plan : `n` → condensat de chaque `server.call`. */
export async function planServerDigests(plan: JsonObject): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    if (!Array.isArray(plan.actions)) throw new RuntimeFormatError('invalid_input');
    for (const a of plan.actions) {
        if (!isObject(a) || a.kind !== 'server.call') continue;
        const n = uint(a.n), tool = str(a, 'tool');
        if (n === undefined || tool === undefined || !isObject(a.args) || (has(a, 'argsRefs') && !isObject(a.argsRefs))) throw new RuntimeFormatError('invalid_input');
        out.set(n, await serverDigest(tool, a.args, isObject(a.argsRefs) ? a.argsRefs : undefined));
    }
    return out;
}

const isExportField = (field: string): boolean => field === 'id' || field === 'spaceId';

/** `"$<m>.<champ>"` : `m ≥ 1` sans zéro de tête, champ exporté connu ; `null` sinon. */
export function parseArgRef(text: string): { m: number; field: 'id' | 'spaceId' } | null {
    const match = /^\$([1-9][0-9]{0,2})\.(id|spaceId)$/.exec(text);
    if (!match) return null;
    return { m: Number(match[1]), field: match[2] as 'id' | 'spaceId' };
}

export interface ServerCall {
    tool: string;
    /** `args` NON résolus. */
    args: JsonObject;
    argsRefs?: JsonObject;
    refs?: JsonObject;
}

/**
 * Verrou de l'API pour un `server.call` (§8.4, point 4) : condensat de l'appel reçu égal à
 * `serverDigests[n]`, `refs` avec exactement les clés d'`argsRefs`, chaque valeur égale à la sortie
 * ENREGISTRÉE de l'action visée (`recorded`, absente tant qu'elle n'est pas `done`). Rend `args ∪ refs` ;
 * tout écart : `action_not_accepted`.
 */
export async function checkServerCall(expectedDigest: string, call: ServerCall, recorded: ReadonlyMap<number, JsonObject>): Promise<JsonObject> {
    const fail = () => new RuntimeFormatError('action_not_accepted');
    let digest: string;
    try {
        digest = await serverDigest(call.tool, call.args, call.argsRefs);
    } catch {
        throw fail();
    }
    if (digest !== expectedDigest) throw fail();
    const argsRefs = call.argsRefs ?? {}, refs = call.refs ?? {};
    if (Object.keys(refs).length !== Object.keys(argsRefs).length) throw fail();
    const effective: JsonObject = { ...call.args };
    for (const [field, target] of Object.entries(argsRefs)) {
        const ref = typeof target === 'string' ? parseArgRef(target) : null;
        const given = refs[field];
        const known = ref ? recorded.get(ref.m)?.[ref.field] : undefined;
        if (!ref || !has(refs, field) || typeof given !== 'string' || typeof known !== 'string' || given !== known || has(effective, field)) throw fail();
        // `defineProperty` : `__proto__` reste une clé ordinaire (une affectation changerait le
        // prototype et perdrait la clé), comme dans la `Map` de la crate.
        Object.defineProperty(effective, field, { value: given, enumerable: true, writable: true, configurable: true });
    }
    return effective;
}

// ---------------------------------------------------------------------------
// Validation (12 §5, PC61)
// ---------------------------------------------------------------------------

/** Motif rendu au modèle dans `detail` (texte court, sans valeur reçue). Identique à la crate. */
export type PlanInvalidDetail =
    | 'plan_too_large'
    | 'plan_header'
    | 'plan_groups'
    | 'plan_actions'
    | 'plan_kind'
    | 'plan_args'
    | 'plan_after'
    | 'plan_args_refs'
    | 'plan_served_mismatch';

export class PlanInvalidError extends RuntimeFormatError {
    readonly detail: PlanInvalidDetail;
    constructor(detail: PlanInvalidDetail) {
        super('plan_invalid');
        this.name = 'PlanInvalidError';
        this.detail = detail;
    }
}

type ParamType = 'string' | 'integer' | 'boolean';
export interface ParamSpec {
    type: ParamType;
    required: boolean;
    min?: number;
    max?: number;
    /** Identifiant 00 §3.2. */
    id?: boolean;
    oneOf?: readonly string[];
}
export type ArgsSchema = Map<string, ParamSpec>;

const parseParamType = (t: JsonValue | undefined): ParamType | null => (t === 'string' || t === 'integer' || t === 'boolean' ? t : null);
const optionalBound = (v: JsonValue | undefined): number | undefined | null => (v === undefined ? undefined : uint(v) ?? null);

function parseParameters(params: JsonValue | undefined): ArgsSchema | null {
    const schema: ArgsSchema = new Map();
    if (params === undefined) return schema;
    if (!isObject(params)) return null;
    if (has(params, 'properties')) {
        if (!isObject(params.properties)) return null;
        const required = new Set(Array.isArray(params.required) ? params.required.filter((r): r is string => typeof r === 'string') : []);
        for (const [field, spec] of Object.entries(params.properties)) {
            if (!isObject(spec)) return null;
            const type = parseParamType(spec.type);
            if (!type) return null;
            const min = optionalBound(type === 'string' ? spec.minLength : spec.minimum);
            const max = optionalBound(type === 'string' ? spec.maxLength : spec.maximum);
            if (min === null || max === null) return null;
            schema.set(field, { type, required: required.has(field), min, max });
        }
        return schema;
    }
    if (params.type === 'object') return Object.keys(params).length === 1 ? schema : null;
    for (const [field, spec] of Object.entries(params)) {
        if (!isObject(spec)) return null;
        const type = parseParamType(spec.type);
        const min = optionalBound(spec.min), max = optionalBound(spec.max);
        if (!type || min === null || max === null) return null;
        schema.set(field, { type, required: spec.required === true, min, max });
    }
    return schema;
}

/** Outils admissibles en `server.call` : catégorie `server` et `mutating` (règle 4). */
export class ToolManifest {
    private readonly tools = new Map<string, ArgsSchema>();

    /** `GET …/tools` (`{ tools: [...] }` ou la liste) ; `parameters` en JSON Schema ou forme abrégée. */
    static fromJson(value: JsonValue): ToolManifest {
        const manifest = new ToolManifest();
        const list = isObject(value) ? value.tools : value;
        for (const t of Array.isArray(list) ? list : []) {
            if (!isObject(t) || t.category !== 'server' || t.mutating !== true || typeof t.name !== 'string') continue;
            const schema = parseParameters(t.parameters);
            if (schema) manifest.tools.set(t.name, schema);
        }
        return manifest;
    }

    get(name: string): ArgsSchema | undefined {
        return this.tools.get(name);
    }
}

export type ActionKind = 'category.create' | 'thread.create' | 'folder.create' | 'file.create_text' | 'server.call';
const ACTION_KINDS: readonly string[] = ['category.create', 'thread.create', 'folder.create', 'file.create_text', 'server.call'];

/** Champs exportés (12 §4). */
export const actionExports = (kind: ActionKind): readonly string[] => (kind === 'server.call' ? ['id'] : ['id', 'spaceId']);

/**
 * Exécutant (12 §4) selon le mode du mandat vérifié et la politique effective de `create_thread` ;
 * `null` : action hors plan (`thread.create` en mode autonome sous `auto`).
 */
export function actionExecutor(kind: ActionKind, mode: MandateMode, createThreadAsk: boolean): PlanExecutor | null {
    if (kind === 'server.call') return 'agent';
    if (kind === 'thread.create' && mode === 'auto') return createThreadAsk ? 'agent' : null;
    return 'device';
}

const NAME: ParamSpec = { type: 'string', required: true, min: 1, max: 255 };
const ID = (required: boolean): ParamSpec => ({ type: 'string', required, id: true });
const KIND_SCHEMAS: Record<Exclude<ActionKind, 'server.call'>, ArgsSchema> = {
    'category.create': new Map([['name', NAME], ['spaceId', ID(false)]]),
    'thread.create': new Map([
        ['name', NAME],
        ['type', { type: 'string', required: true, oneOf: ['text', 'voice'] }],
        ['spaceId', ID(false)],
        ['categoryId', ID(false)],
    ]),
    'folder.create': new Map([['spaceId', ID(true)], ['name', NAME], ['parentFolderId', ID(false)]]),
    'file.create_text': new Map([['spaceId', ID(true)], ['name', NAME], ['content', { type: 'string', required: false }], ['folderId', ID(false)]]),
};
const TEXT_EXTENSIONS = new Set(TEXT_FILE_FORMATS.map(f => f.ext));

function checkArg(spec: ParamSpec, value: JsonValue): boolean {
    if (spec.type === 'boolean') return typeof value === 'boolean';
    if (spec.type === 'integer') {
        if (typeof value !== 'number' || !Number.isSafeInteger(value)) return false;
        return (spec.min === undefined || value >= spec.min) && (spec.max === undefined || value <= spec.max);
    }
    if (typeof value !== 'string') return false;
    const len = charLength(value);
    return (spec.min === undefined || len >= spec.min)
        && (spec.max === undefined || len <= spec.max)
        && (!spec.id || isValidId(value))
        && (!spec.oneOf || spec.oneOf.includes(value));
}

export interface PlanContext {
    /** La conversation (règle 1). */
    sessionId: string;
    /** `confirmationTimeoutSecs` de l'org (règle 2), borné à 7 jours. */
    maxLifetimeSecs: number;
    manifest: ToolManifest;
    /** Mode du mandat vérifié de la délégation courante. */
    mode: MandateMode;
    /** Politique effective de `create_thread` = `ask`. */
    createThreadAsk: boolean;
}

/** Action du graphe : ce que l'API connaît sans le contenu (§8.1, §12.2). */
export interface GraphAction {
    n: number;
    executor: PlanExecutor;
    after: number[];
}

const ROOT_FIELDS = ['v', 'planId', 'sessionId', 'toolCallId', 'createdAt', 'expiresAt', 'summary', 'groups', 'actions'];
const ACTION_FIELDS = ['n', 'kind', 'tool', 'args', 'group', 'after', 'argsRefs'];

/**
 * Validation (12 §5, règles 1 à 6, bornes de PC61), refaite par l'appareil avant d'afficher. Rend le
 * graphe ; lève `PlanInvalidError` (`code` = `plan_invalid`, `detail`). La règle 7 (annuaire local)
 * reste à l'appelant ; la règle 8 est `checkServedGraph`.
 */
export function validatePlan(plan: JsonValue, ctx: PlanContext): PlanGraph {
    const fail = (detail: PlanInvalidDetail) => new PlanInvalidError(detail);
    if (!isObject(plan)) throw fail('plan_header');
    const actions = plan.actions;
    if (!Array.isArray(actions)) throw fail('plan_actions');

    // Règle 3 (PC61) d'abord : le modèle doit savoir qu'il faut découper. Les comptes d'actions et de
    // dépendances passent avant JCS, qui parcourt tout le plan.
    const afterTotal = actions.reduce<number>((acc, a) => acc + (isObject(a) && Array.isArray(a.after) ? a.after.length : 0), 0);
    if (actions.length > MAX_PLAN_ACTIONS || afterTotal > MAX_PLAN_AFTER_ENTRIES) throw fail('plan_too_large');
    let clear: string;
    try {
        clear = jcs(plan);
    } catch {
        throw fail('plan_header');
    }
    if (enc.encode(clear).length > MAX_PLAN_BYTES) throw fail('plan_too_large');

    // Règles 1 et 2.
    const idOk = (k: string) => { const v = str(plan, k); return v !== undefined && isValidId(v); };
    const created = uint(plan.createdAt), expires = uint(plan.expiresAt);
    const lifetime = Math.min(ctx.maxLifetimeSecs, MAX_PLAN_LIFETIME_SECS);
    const headerOk = Object.keys(plan).every(k => ROOT_FIELDS.includes(k))
        && plan.v === PLAN_VERSION && idOk('planId') && idOk('sessionId') && idOk('toolCallId')
        && plan.sessionId === ctx.sessionId && typeof plan.summary === 'string'
        && created !== undefined && expires !== undefined && created < expires && expires - created <= lifetime;
    if (!headerOk) throw fail('plan_header');

    // Groupes (PC58).
    const groups = new Set<string>();
    if (has(plan, 'groups')) {
        const list = plan.groups;
        if (!Array.isArray(list) || list.length === 0 || list.length > MAX_PLAN_GROUPS) throw fail('plan_groups');
        for (const g of list) {
            if (!isObject(g) || Object.keys(g).length !== 2) throw fail('plan_groups');
            const id = str(g, 'id'), label = str(g, 'label');
            if (id === undefined || !/^[a-z0-9_-]{1,32}$/.test(id) || label === undefined || charLength(label) < 1 || charLength(label) > 100 || groups.has(id)) throw fail('plan_groups');
            groups.add(id);
        }
    }

    if (actions.length === 0) throw fail('plan_actions');
    const kinds: ActionKind[] = [];
    const graph: GraphAction[] = [];
    actions.forEach((action, i) => {
        if (!isObject(action)) throw fail('plan_actions');
        const n = uint(action.n);
        if (n !== i + 1 || !Object.keys(action).every(k => ACTION_FIELDS.includes(k))) throw fail('plan_actions');
        if (has(action, 'group') && !(typeof action.group === 'string' && groups.has(action.group))) throw fail('plan_groups');

        // Règle 4.
        const kindText = str(action, 'kind');
        if (kindText === undefined || !ACTION_KINDS.includes(kindText)) throw fail('plan_kind');
        const kind = kindText as ActionKind;
        let schema: ArgsSchema | undefined;
        if (kind === 'server.call') {
            const tool = str(action, 'tool');
            schema = tool === undefined ? undefined : ctx.manifest.get(tool);
        } else if (!has(action, 'tool')) {
            schema = KIND_SCHEMAS[kind];
        }
        if (!schema) throw fail('plan_kind');
        const args = action.args;
        if (!isObject(args)) throw fail('plan_args');
        for (const [field, value] of Object.entries(args)) {
            const spec = schema.get(field);
            if (!spec || !checkArg(spec, value)) throw fail('plan_args');
        }
        if (kind === 'file.create_text') {
            const name = str(args, 'name') ?? '';
            const dot = name.lastIndexOf('.');
            // Minuscules ASCII seulement (`to_ascii_lowercase` de la crate) : `toLowerCase` plierait aussi
            // des lettres hors ASCII.
            const ext = name.slice(dot + 1).replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32));
            if (dot < 0 || !TEXT_EXTENSIONS.has(ext)) throw fail('plan_args');
        }

        // Règle 5 : after.
        let after: number[] = [];
        if (has(action, 'after')) {
            if (!Array.isArray(action.after)) throw fail('plan_after');
            after = action.after.map(m => {
                const v = uint(m);
                if (v === undefined || v < 1 || v >= n) throw fail('plan_after');
                return v;
            });
            if (new Set(after).size !== after.length) throw fail('plan_after');
        }

        // Règle 5 : argsRefs (règle 6 : aucune contrainte d'exécutant).
        let refs: JsonObject | undefined;
        if (has(action, 'argsRefs')) {
            if (!isObject(action.argsRefs)) throw fail('plan_args_refs');
            refs = action.argsRefs;
            for (const [field, target] of Object.entries(refs)) {
                const ref = typeof target === 'string' ? parseArgRef(target) : null;
                const source = ref ? kinds[ref.m - 1] : undefined;
                if (!ref || !source || !after.includes(ref.m) || !actionExports(source).includes(ref.field) || !schema.has(field) || has(args, field)) throw fail('plan_args_refs');
            }
        }
        for (const [field, spec] of schema) {
            if (spec.required && !has(args, field) && !(refs && has(refs, field))) throw fail('plan_args');
        }

        const executor = actionExecutor(kind, ctx.mode, ctx.createThreadAsk);
        if (!executor) throw fail('plan_kind');
        kinds.push(kind);
        graph.push({ n, executor, after });
    });
    return new PlanGraph(graph);
}

// ---------------------------------------------------------------------------
// Graphe (12 §6, §8.1)
// ---------------------------------------------------------------------------

export class PlanGraph {
    readonly actions: readonly GraphAction[];

    /** `n` consécutifs depuis 1, `after` distincts et antérieurs (aucun cycle possible). */
    constructor(actions: readonly GraphAction[]) {
        if (actions.length === 0 || actions.length > MAX_PLAN_ACTIONS) throw new PlanInvalidError('plan_actions');
        let total = 0;
        actions.forEach((a, i) => {
            if (a.n !== i + 1 || new Set(a.after).size !== a.after.length || a.after.some(m => !Number.isSafeInteger(m) || m < 1 || m >= a.n)) throw new PlanInvalidError('plan_after');
            total += a.after.length;
        });
        if (total > MAX_PLAN_AFTER_ENTRIES) throw new PlanInvalidError('plan_too_large');
        this.actions = actions.map(a => ({ n: a.n, executor: a.executor, after: [...a.after] }));
    }

    /** `niveau = 1` sans `after`, sinon `1 + max(niveau(m))` ; présentation seulement. */
    levels(): number[] {
        const levels: number[] = [];
        for (const a of this.actions) levels.push(1 + Math.max(0, ...a.after.map(m => levels[m - 1] ?? 0)));
        return levels;
    }

    /** `roots` et leurs dépendantes transitives (par `after`), quel que soit l'exécutant. */
    withDependents(roots: Iterable<number>): Set<number> {
        const out = new Set(roots);
        for (const a of this.actions) if (a.after.some(m => out.has(m))) out.add(a.n);
        return out;
    }

    /** Cascade de décision (PC37) : décochées et dépendantes, à passer `skipped` (à montrer avant validation). */
    cascade(unchecked: readonly number[]): Set<number> {
        if (unchecked.some(n => !Number.isSafeInteger(n) || n < 1 || n > this.actions.length)) throw new RuntimeFormatError('invalid_input');
        return this.withDependents(unchecked);
    }
}

/** Règle 8 du §5 : exécutant et `after` servis par l'API (`PlanView.actions`) égaux à ceux du plan. */
export function checkServedGraph(graph: PlanGraph, served: readonly GraphAction[]): void {
    const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b).join(',');
    const same = served.length === graph.actions.length
        && served.every((s, i) => {
            const a = graph.actions[i];
            return a !== undefined && s.n === a.n && s.executor === a.executor && sorted(s.after) === sorted(a.after);
        });
    if (!same) throw new PlanInvalidError('plan_served_mismatch');
}

// ---------------------------------------------------------------------------
// Exécution (12 §7, §8.1, PC54, PC58)
// ---------------------------------------------------------------------------

export type PlanStatus = 'accepted' | 'executing' | 'done' | 'failed' | 'interrupted' | 'stopped' | 'expired';

export class PlanRun {
    readonly graph: PlanGraph;
    private readonly states: ActionState[];
    private started = false;
    private closed: 'stopped' | 'expired' | null = null;

    /** Décision `accept` : hors de `accepted` et leurs dépendantes → `skipped` (PC37), le reste `pending`. */
    constructor(graph: PlanGraph, accepted: readonly number[]) {
        if (accepted.some(n => !Number.isSafeInteger(n) || n < 1 || n > graph.actions.length)) throw new RuntimeFormatError('invalid_input');
        const skipped = graph.cascade(graph.actions.map(a => a.n).filter(n => !accepted.includes(n)));
        this.graph = graph;
        this.states = graph.actions.map(a => (skipped.has(a.n) ? 'skipped' : 'pending'));
    }

    state(n: number): ActionState | undefined {
        return this.states[n - 1];
    }

    /** Prêtes pour cet exécutant, plus petite `n` d'abord : `pending` et tout `after` `done`. */
    ready(executor: PlanExecutor): number[] {
        if (this.closed) return [];
        return this.graph.actions
            .filter((a, i) => a.executor === executor && this.states[i] === 'pending' && a.after.every(m => this.states[m - 1] === 'done'))
            .map(a => a.n);
    }

    executing(executor: PlanExecutor): number {
        return this.graph.actions.filter((a, i) => a.executor === executor && this.states[i] === 'executing').length;
    }

    /** `pending` → `executing`, seulement pour une action prête. */
    start(n: number): void {
        const a = this.graph.actions[n - 1];
        if (!a || !this.ready(a.executor).includes(n)) throw new RuntimeFormatError('invalid_input');
        this.states[n - 1] = 'executing';
        this.started = true;
    }

    /** `executing` → issue ; un échec ou une issue inconnue rend `skipped` ses seules dépendantes (PC54). */
    finish(n: number, outcome: 'done' | 'failed' | 'unknown_outcome'): void {
        if (this.states[n - 1] !== 'executing') throw new RuntimeFormatError('invalid_input');
        this.states[n - 1] = outcome;
        if (outcome === 'done') return;
        for (const m of this.graph.withDependents([n])) if (this.states[m - 1] === 'pending') this.states[m - 1] = 'skipped';
    }

    /**
     * Abandon d'une action d'agent (12 §8.7, PC74) : seule une action d'**agent** `pending` passe à
     * `failed` ou `unknown_outcome` (dépendantes `skipped`, PC54). `false`, sans rien changer, pour
     * tout autre état ou exécutant (rejeu idempotent) ; jamais vers `done`. Comme `PlanRun::abandon`.
     */
    abandon(n: number, outcome: ActionState): boolean {
        const a = Number.isSafeInteger(n) && n >= 1 ? this.graph.actions[n - 1] : undefined;
        if (!a || a.executor !== 'agent' || this.states[n - 1] !== 'pending' || (outcome !== 'failed' && outcome !== 'unknown_outcome')) return false;
        this.states[n - 1] = outcome;
        for (const m of this.graph.withDependents([n])) if (this.states[m - 1] === 'pending') this.states[m - 1] = 'skipped';
        return true;
    }

    private close(status: 'stopped' | 'expired'): void {
        if (this.closed) return;
        this.closed = status;
        this.states.forEach((s, i) => { if (s === 'pending') this.states[i] = 'skipped'; });
    }

    /** `expiresAt` atteint : plus aucun démarrage, `pending` → `skipped`. */
    expire(): void {
        this.close('expired');
    }

    /** « Arrêter le plan » (PC55). */
    stop(): void {
        this.close('stopped');
    }

    status(): PlanStatus {
        if (this.states.some(s => !isFinal(s))) return this.started ? 'executing' : 'accepted';
        if (this.closed) return this.closed;
        if (this.states.includes('failed')) return 'failed';
        if (this.states.includes('unknown_outcome')) return 'interrupted';
        return 'done';
    }
}
