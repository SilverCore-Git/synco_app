/**
 * Messages écrits par l'agent (synco_ai_runtime/docs/plan/12 §4.3 et §10.7 ; L00i, L00j ; PC88, PC94,
 * PC97 à PC100). Fonctions pures, sans réseau ni état global, rejouées par la crate (L15-rt) :
 *
 * - formats `m3` (salon) et `d3` (MP) : analyse du champ `iv` / `nonce`, AAD, octets signés ;
 * - déclaration du texte signée par l'utilisateur (`td`, septième partie d'un `m3` d'auteur `rt1:`) :
 *   texte final `agentMessageText`, sel HKDF sous `CK`, empreinte salée, JCS, signature, segment `td1:` ;
 * - enveloppe du clair `{ salt, text }` et vérification de la déclaration par le lecteur (raisons
 *   ordonnées de 12 §10.7) ;
 * - condensat de cible `SHA-256(JCS({ kind, target, argsRefs }))` (12 §8.4 point 6).
 *
 * Vecteurs : scripts/e2ee-vectors/message-v3.json, text-declaration.json, plan-kinds.json (copies conformes
 * de synco_ai_runtime/docs/plan/vectors/).
 */
import { jcs, parseArgRef, parseJsonStrict, type JsonObject, type JsonValue } from './aiActionPlan';
import { fromB64u, hkdf32, isValidId, sha256, toB64u, toHex } from './runtimeCert';

const enc = new TextEncoder();

export class AgentMessageFormatError extends Error {
    constructor(readonly code: 'invalid_format' | 'invalid_input') {
        super(code);
    }
}

// ---------------------------------------------------------------------------
// Formats m3 / d3 (12 §4.3)
// ---------------------------------------------------------------------------

export const M3_PREFIX = 'm3.';
export const D3_PREFIX = 'd3.';
export const RT1_AUTHOR_PREFIX = 'rt1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** `rev` : entier décimal ≥ 0 sans zéro de tête, au plus 2⁵³ − 1. */
const REV = /^(?:0|[1-9][0-9]{0,15})$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** Identifiant de message tiré par le client (UUID en pratique) : jamais de `|` ni de `.` dans les octets signés. */
const CLIENT_MSG_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TD_SEGMENT = /^td1:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/;

/** `ai` (écrit par l'agent, envoyé par l'appareil) ou `rt1:<delegationId>` (runtime, mode autonome). */
export type AgentAuthor = 'ai' | `rt1:${string}`;

export interface ParsedM3 {
    iv: string;
    clientMsgId: string;
    author: AgentAuthor;
    /** Vide : format lisible mais message `invalid` (vecteur « m3 signature vide »). */
    signature: string;
    rev: number;
    /** Septième partie (auteur `rt1:` seulement) ; `null` pour la forme à six parties. */
    td: string | null;
}

export const isRt1Author = (author: string): author is `rt1:${string}` =>
    author.startsWith(RT1_AUTHOR_PREFIX) && UUID.test(author.slice(RT1_AUTHOR_PREFIX.length));

export const rt1DelegationOf = (author: string): string | null => (isRt1Author(author) ? author.slice(RT1_AUTHOR_PREFIX.length) : null);

const isAuthor = (author: string): author is AgentAuthor => author === 'ai' || isRt1Author(author);

function parseRevStrict(raw: string | undefined): number {
    if (raw === undefined || !REV.test(raw)) throw new AgentMessageFormatError('invalid_format');
    const n = Number(raw);
    if (!Number.isSafeInteger(n)) throw new AgentMessageFormatError('invalid_format');
    return n;
}

export const isM3Iv = (ivField: string | null | undefined): boolean => !!ivField && ivField.startsWith(M3_PREFIX);
export const isD3Nonce = (nonce: string | null | undefined): boolean => !!nonce && nonce.startsWith(D3_PREFIX);

/**
 * `m3.` ivB64 `.` clientMsgId `.` author `.` signatureB64 `.` rev [`.` td] ; `invalid_format` sinon. Une
 * septième partie n'est admise qu'avec un auteur `rt1:` et le préfixe `td1:` (12 §4.3).
 */
export function parseM3Iv(ivField: string): ParsedM3 {
    const fail = () => new AgentMessageFormatError('invalid_format');
    if (!ivField.startsWith(M3_PREFIX)) throw fail();
    const parts = ivField.slice(M3_PREFIX.length).split('.');
    if (parts.length !== 5 && parts.length !== 6) throw fail();
    const [iv, clientMsgId, author, signature, rawRev, td] = parts as [string, string, string, string, string, string | undefined];
    if (!B64.test(iv) || !CLIENT_MSG_ID.test(clientMsgId) || !isAuthor(author)) throw fail();
    if (signature !== '' && !B64.test(signature)) throw fail();
    const rev = parseRevStrict(rawRev);
    if (td !== undefined && (!isRt1Author(author) || !TD_SEGMENT.test(td))) throw fail();
    return { iv, clientMsgId, author, signature, rev, td: td ?? null };
}

export function formatM3Iv(p: Omit<ParsedM3, 'td'> & { td?: string | null }): string {
    const base = `${M3_PREFIX}${p.iv}.${p.clientMsgId}.${p.author}.${p.signature}.${p.rev}`;
    const out = p.td ? `${base}.${p.td}` : base;
    parseM3Iv(out); // jamais d'écriture d'une forme que la lecture refuserait
    return out;
}

/** Forme du champ `iv` d'un message de salon (vecteurs `parseCases`). */
export type ThreadIvClass = 'm3' | 'm2' | 'legacy';
export const classifyThreadIv = (ivField: string): ThreadIvClass =>
    ivField.startsWith(M3_PREFIX) ? 'm3' : ivField.startsWith('m2.') ? 'm2' : 'legacy';

export interface ParsedD3 { iv: string; clientMsgId: string; signature: string; rev: number }

/** `d3.` ivB64 `.` clientMsgId `.ai.` signatureB64 `.` rev ; auteur `ai` seulement (aucune MP en mode autonome, EX-13). */
export function parseD3Nonce(nonce: string): ParsedD3 {
    const fail = () => new AgentMessageFormatError('invalid_format');
    if (!nonce.startsWith(D3_PREFIX)) throw fail();
    const parts = nonce.slice(D3_PREFIX.length).split('.');
    if (parts.length !== 5) throw fail();
    const [iv, clientMsgId, author, signature, rawRev] = parts as [string, string, string, string, string];
    if (!B64.test(iv) || !CLIENT_MSG_ID.test(clientMsgId) || author !== 'ai') throw fail();
    if (signature !== '' && !B64.test(signature)) throw fail();
    return { iv, clientMsgId, signature, rev: parseRevStrict(rawRev) };
}

export function formatD3Nonce(p: ParsedD3): string {
    const out = `${D3_PREFIX}${p.iv}.${p.clientMsgId}.ai.${p.signature}.${p.rev}`;
    parseD3Nonce(out);
    return out;
}

export const threadAadV3 = (threadId: string, senderId: string, clientMsgId: string, author: string, rev: number): string =>
    `synco-msg-v3|${threadId}|${senderId}|${clientMsgId}|${author}|rev:${rev}`;

/** Octets signés d'un `m3` ; `td` (auteur `rt1:`) est couvert par la signature `csk` (PC97). */
export const threadSignedV3 = (
    threadId: string, senderId: string, clientMsgId: string, author: string, ivB64: string, ciphertextB64: string, rev: number, td?: string | null,
): string => `synco-sig-v2|thread|${threadId}|${senderId}|${clientMsgId}|${author}|${ivB64}|${ciphertextB64}|rev:${rev}${td ? `|${td}` : ''}`;

export const dmAadV3 = (senderId: string, recipientId: string, clientMsgId: string, rev: number): string =>
    `synco-dm-v3|${senderId}|${recipientId}|${clientMsgId}|ai|rev:${rev}`;

export const dmSignedV3 = (
    senderId: string, recipientId: string, clientMsgId: string, ivB64: string, ciphertext: string, encryptedAesKey: string, selfEncryptedAesKey: string, rev: number,
): string => `synco-sig-v2|dm|${senderId}|${recipientId}|${clientMsgId}|ai|${ivB64}|${ciphertext}|${encryptedAesKey}|${selfEncryptedAesKey}|rev:${rev}`;

/** Contrôle de l'API sur un socket de l'utilisateur (12 §4.3) : un auteur `rt1:` y est refusé. */
export const userSocketIvAllowed = (ivField: string): boolean => {
    if (!isM3Iv(ivField)) return true;
    try {
        return !isRt1Author(parseM3Iv(ivField).author);
    } catch {
        return false;
    }
};

// ---------------------------------------------------------------------------
// Texte final (12 §10.7) et UTF-16 bien formé
// ---------------------------------------------------------------------------

/** Chaîne UTF-16 bien formée (aucune demi-paire isolée) : sinon le plan est invalide, comme JCS. */
export function isWellFormedText(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
            const d = s.charCodeAt(i + 1);
            if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
            i++;
        } else if (c >= 0xdc00 && c <= 0xdfff) {
            return false;
        }
    }
    return true;
}

const userToken = (id: string): string => `<@:${id}>`;

/**
 * Texte final d'un `message.send` / `message.edit` (12 §10.7), celui que le lecteur affiche : `args.text`,
 * suivi, pour chaque `mentionUserIds` (dans l'ordre, sans doublon) dont le jeton `<@:id>` n'est pas déjà dans
 * le texte, d'une espace et du jeton. Sans `mentionUserIds`, `args.text` tel quel. Aucune normalisation
 * (Unicode, fins de ligne, espaces). Rejouée à l'identique par le worker (L15-rt).
 */
export function agentMessageText(args: { text: string; mentionUserIds?: readonly string[] }): string {
    const text = args.text;
    if (!isWellFormedText(text)) throw new AgentMessageFormatError('invalid_input');
    let out = text;
    const seen = new Set<string>();
    for (const id of args.mentionUserIds ?? []) {
        if (!isValidId(id)) throw new AgentMessageFormatError('invalid_input');
        if (seen.has(id)) continue;
        seen.add(id);
        if (!text.includes(userToken(id))) out += ` ${userToken(id)}`;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Sel, empreinte, déclaration (12 §10.7)
// ---------------------------------------------------------------------------

export const textSaltInfo = (sessionId: string, planId: string, n: number): string => `synco-text-salt-v1|${sessionId}|${planId}|${n}`;

/** `HKDF-SHA256(ikm = CK, salt = vide, info, L = 32)` : inconnu de l'API, recalculé par le worker (PC98). */
export async function textSalt(ck: Uint8Array, sessionId: string, planId: string, n: number): Promise<Uint8Array> {
    if (!(ck instanceof Uint8Array) || ck.length !== 32 || !isValidId(sessionId) || !isValidId(planId) || !Number.isSafeInteger(n) || n < 1) {
        throw new AgentMessageFormatError('invalid_input');
    }
    return hkdf32(ck, '', textSaltInfo(sessionId, planId, n));
}

/** `hex(SHA-256(utf8("synco-text-commit-v1|") ‖ sel ‖ utf8(texte)))`. */
export async function textCommit(salt: Uint8Array, text: string): Promise<string> {
    if (salt.length !== 32 || !isWellFormedText(text)) throw new AgentMessageFormatError('invalid_input');
    const prefix = enc.encode('synco-text-commit-v1|');
    const body = enc.encode(text);
    const bytes = new Uint8Array(prefix.length + salt.length + body.length);
    bytes.set(prefix, 0);
    bytes.set(salt, prefix.length);
    bytes.set(body, prefix.length + salt.length);
    return toHex(await sha256(bytes));
}

export type TextDeclarationKind = 'message.send' | 'message.edit';
export const TEXT_DECLARATION_KINDS: readonly TextDeclarationKind[] = ['message.send', 'message.edit'];

/** Champs de cible permis par kind (12 §8.4 point 6) ; un champ venu par `argsRefs` est absent de `target`. */
const TARGET_FIELDS: Record<TextDeclarationKind, readonly string[]> = {
    'message.send': ['threadId', 'replyTo'],
    'message.edit': ['messageId'],
};

export interface TextDeclaration {
    v: 1;
    orgId: string;
    userId: string;
    planId: string;
    n: number;
    kind: TextDeclarationKind;
    target: Record<string, string>;
    argsRefs?: Record<string, string>;
    textCommit: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const DECL_KEYS = ['v', 'orgId', 'userId', 'planId', 'n', 'kind', 'target', 'argsRefs', 'textCommit'];
const isObj = (v: JsonValue | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Objet JSON de la déclaration (`argsRefs` omis s'il est absent). */
export function declarationJson(d: TextDeclaration): JsonObject {
    const out: JsonObject = { v: d.v, orgId: d.orgId, userId: d.userId, planId: d.planId, n: d.n, kind: d.kind, target: { ...d.target }, textCommit: d.textCommit };
    if (d.argsRefs !== undefined) out.argsRefs = { ...d.argsRefs };
    return out;
}

/** Contrôle de forme strict d'une déclaration lue (types, champs, `kind`) ; `null` si elle n'est pas conforme. */
export function readDeclaration(value: JsonValue): TextDeclaration | null {
    if (!isObj(value) || Object.keys(value).some(k => !DECL_KEYS.includes(k))) return null;
    const { v, orgId, userId, planId, n, kind, target, argsRefs, textCommit: commit } = value;
    if (v !== 1 || typeof orgId !== 'string' || !isValidId(orgId) || typeof userId !== 'string' || !isValidId(userId)
        || typeof planId !== 'string' || !isValidId(planId) || typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1 || n > 100
        || typeof kind !== 'string' || !(TEXT_DECLARATION_KINDS as readonly string[]).includes(kind)
        || typeof commit !== 'string' || !HEX64.test(commit) || !isObj(target)) return null;
    const allowed = TARGET_FIELDS[kind as TextDeclarationKind];
    const t: Record<string, string> = {};
    for (const [k, val] of Object.entries(target)) {
        if (!allowed.includes(k) || typeof val !== 'string' || !isValidId(val)) return null;
        t[k] = val;
    }
    let refs: Record<string, string> | undefined;
    if (has(value, 'argsRefs')) {
        if (!isObj(argsRefs)) return null;
        refs = {};
        for (const [k, val] of Object.entries(argsRefs)) {
            if (!allowed.includes(k) || has(t, k) || typeof val !== 'string' || !parseArgRef(val)) return null;
            refs[k] = val;
        }
    }
    const out: TextDeclaration = { v: 1, orgId, userId, planId, n, kind: kind as TextDeclarationKind, target: t, textCommit: commit };
    if (refs !== undefined) out.argsRefs = refs;
    return out;
}

export const declarationSignedBytes = (d: TextDeclaration): string => `synco-text-decl-v1|${jcs(declarationJson(d))}`;

/** Préimage du condensat de cible (12 §8.4 point 6) : `{ kind, target, argsRefs? }`. */
export function targetDigestInput(kind: string, target: Record<string, string | string[]>, argsRefs?: Record<string, string>): JsonObject {
    const t: JsonObject = {};
    for (const [k, v] of Object.entries(target)) t[k] = Array.isArray(v) ? [...v] : v;
    return argsRefs === undefined ? { kind, target: t } : { kind, target: t, argsRefs: { ...argsRefs } };
}

/** `hex(SHA-256(JCS({ kind, target, argsRefs })))` = `serverDigests[n]` d'une action ciblée. */
export async function targetDigest(kind: string, target: Record<string, string | string[]>, argsRefs?: Record<string, string>): Promise<string> {
    return toHex(await sha256(enc.encode(jcs(targetDigestInput(kind, target, argsRefs)))));
}

/** Signe la déclaration avec la clé de signature d'identité de l'utilisateur (ECDSA P-256, P1363) ; rend `td1:…`. */
export async function signTextDeclaration(userSignKey: CryptoKey, d: TextDeclaration): Promise<string> {
    if (!readDeclaration(declarationJson(d))) throw new AgentMessageFormatError('invalid_input');
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, userSignKey, enc.encode(declarationSignedBytes(d)) as BufferSource));
    return `td1:${toB64u(enc.encode(jcs(declarationJson(d))))}:${toB64u(sig)}`;
}

export interface ParsedTd { declaration: TextDeclaration; canonical: string; signature: Uint8Array }

/**
 * Lit un segment `td1:` : `b64u` stricts, JSON dont la sérialisation JCS redonne les mêmes octets, forme de la
 * déclaration ; `null` sinon (raison `invalid_declaration` du lecteur, `invalid_body` de l'API).
 */
export function parseTd(td: string): ParsedTd | null {
    const m = TD_SEGMENT.exec(td);
    if (!m) return null;
    try {
        const bytes = fromB64u(m[1]!);
        const canonical = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const value = parseJsonStrict(canonical);
        if (jcs(value) !== canonical) return null;
        const declaration = readDeclaration(value);
        const signature = fromB64u(m[2]!);
        if (!declaration || signature.length !== 64) return null;
        return { declaration, canonical, signature };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Enveloppe du clair (12 §10.7)
// ---------------------------------------------------------------------------

/** Clair d'un `m3` `rt1:` porteur de `td` : `utf8(JCS({ salt, text }))`, sel en hexadécimal minuscule. */
export function encodeTextEnvelope(saltHex: string, text: string): string {
    if (!HEX64.test(saltHex) || !isWellFormedText(text)) throw new AgentMessageFormatError('invalid_input');
    return jcs({ salt: saltHex, text });
}

/** Enveloppe stricte et canonique (exactement `salt` et `text`) ; `null` sinon (`invalid_envelope`). */
export function parseTextEnvelope(plaintext: string): { saltHex: string; text: string } | null {
    try {
        const v = parseJsonStrict(plaintext);
        if (!isObj(v) || Object.keys(v).length !== 2 || typeof v.salt !== 'string' || typeof v.text !== 'string' || !HEX64.test(v.salt)) return null;
        if (jcs(v) !== plaintext) return null;
        return { saltHex: v.salt, text: v.text };
    } catch {
        return null;
    }
}

const fromHex = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g) ?? [], b => parseInt(b, 16));

// ---------------------------------------------------------------------------
// Vérification par le lecteur (12 §10.7, ordre des contrôles)
// ---------------------------------------------------------------------------

export type TextUnverifiedReason =
    | 'absent' | 'invalid_declaration' | 'signer_unavailable' | 'signer_mismatch' | 'kind_mismatch'
    | 'target_mismatch' | 'bad_signature' | 'invalid_envelope' | 'text_mismatch' | 'replayed';

/** Résultat de la vérification de la signature de la déclaration par les clés de l'expéditeur. */
export type DeclarationSignerTrust = 'trusted' | 'history' | 'unknown' | 'none' | 'unavailable';

export interface ReaderMessage {
    orgId: string;
    threadId: string;
    /** `null` : expéditeur supprimé. */
    senderId: string | null;
    messageId: string;
    replyToId: string | null;
    rev: number;
}

export interface TextCheck {
    state: 'text_verified' | 'text_unverified';
    reason?: TextUnverifiedReason;
    /** Texte à afficher : celui de l'enveloppe, ou le clair brut si elle est illisible. Jamais masqué. */
    display: string;
    /** Clé de l'expéditeur ancienne, sans preuve : l'état du message est au mieux `unsigned`. */
    weakKey: boolean;
    /** `(planId, n)` de la déclaration, pour la détection du rejeu (`findReplayedDeclarations`). */
    action?: { planId: string; n: number };
}

export interface ReaderDeps {
    /**
     * Vérifie `signature` sur `bytes` avec les clés de signature servies de `senderId` (`verifyWithSignKeys`) ;
     * `unavailable` si aucune clé n'est servie (expéditeur supprimé).
     */
    verifySigner(senderId: string, bytes: Uint8Array, signature: Uint8Array): Promise<DeclarationSignerTrust>;
}

/**
 * Étapes 1 à 7 de la vérification par le lecteur d'un `m3` d'auteur `rt1:` dont l'état `m3` n'est pas
 * `invalid` (l'étape 8, rejeu, se fait sur la fenêtre chargée : `findReplayedDeclarations`). La première
 * raison trouvée est retenue.
 */
export async function verifyTextDeclaration(msg: ReaderMessage, td: string | null, plaintext: string, deps: ReaderDeps): Promise<TextCheck> {
    const envelope = parseTextEnvelope(plaintext);
    const display = envelope ? envelope.text : plaintext;
    const unverified = (reason: TextUnverifiedReason, action?: { planId: string; n: number }): TextCheck =>
        ({ state: 'text_unverified', reason, display, weakKey: false, ...(action ? { action } : {}) });
    if (td === null) return unverified('absent');
    const parsed = parseTd(td);
    if (!parsed) return unverified('invalid_declaration');
    const d = parsed.declaration;
    const action = { planId: d.planId, n: d.n };
    if (msg.senderId === null) return unverified('signer_unavailable', action);
    // Clés servies d'abord (`signer_unavailable`), puis l'identité du signataire (`signer_mismatch`).
    const trust = await deps.verifySigner(msg.senderId, enc.encode(`synco-text-decl-v1|${parsed.canonical}`), parsed.signature);
    if (trust === 'unavailable') return unverified('signer_unavailable', action);
    if (d.userId !== msg.senderId) return unverified('signer_mismatch', action);
    if (d.orgId !== msg.orgId) return unverified('target_mismatch', action);
    if ((msg.rev === 0) !== (d.kind === 'message.send')) return unverified('kind_mismatch', action);
    const t = d.target;
    if (t.threadId !== undefined && t.threadId !== msg.threadId) return unverified('target_mismatch', action);
    if (t.messageId !== undefined && t.messageId !== msg.messageId) return unverified('target_mismatch', action);
    if (d.kind === 'message.send') {
        const replyByRef = d.argsRefs !== undefined && has(d.argsRefs, 'replyTo');
        if (t.replyTo !== undefined ? t.replyTo !== msg.replyToId : !replyByRef && msg.replyToId !== null) return unverified('target_mismatch', action);
    }
    if (trust === 'none') return unverified('bad_signature', action);
    if (!envelope) return unverified('invalid_envelope', action);
    if (await textCommit(fromHex(envelope.saltHex), envelope.text) !== d.textCommit) return unverified('text_mismatch', action);
    return { state: 'text_verified', display, weakKey: trust !== 'trusted', action };
}

/**
 * Étape 8 : une même `(planId, n)` déjà vue sur un AUTRE `clientMsgId` du salon (fenêtre chargée) ; le plus
 * récent est `replayed`. Rend les identifiants des messages rejoués.
 */
export function findReplayedDeclarations(msgs: ReadonlyArray<{ id: string; clientMsgId: string; createdAt: string | Date; action?: { planId: string; n: number } }>): Set<string> {
    const out = new Set<string>();
    const seen = new Map<string, string>();
    const ordered = [...msgs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const m of ordered) {
        if (!m.action) continue;
        const key = `${m.action.planId}|${m.action.n}`;
        const first = seen.get(key);
        if (first === undefined) seen.set(key, m.clientMsgId);
        else if (first !== m.clientMsgId) out.add(m.id);
    }
    return out;
}
