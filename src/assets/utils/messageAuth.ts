import { decryptFromPeer, encryptForPeer, privateSignKey } from './crypto';
import { noteMessageRevision } from './messageRevisions';
import { lookupCreatorSignKey, readPinnedSignKey, verifyWithSignKeys, type SignatureTrust } from './keyTrust';
import {
    dmAadV3, dmSignedV3, formatD3Nonce, formatM3Iv, isD3Nonce, isM3Iv, isRt1Author, parseD3Nonce, parseM3Iv, rt1DelegationOf, threadAadV3,
    threadSignedV3, verifyTextDeclaration, type DeclarationSignerTrust, type ParsedM3, type TextUnverifiedReason,
} from './agentMessage';

/**
 * Messages de salon authentifiés, format v2 (audit FC7 §1-2).
 *
 * Le contenu reste chiffré avec la clé du salon, mais :
 * - l'AAD d'AES-GCM lie le chiffré au salon, à l'expéditeur et à un identifiant de message tiré par
 *   le client (le serveur ne peut plus réattribuer, déplacer ou rejouer un message sous un autre
 *   contexte) ;
 * - le chiffré et son contexte sont signés avec la clé d'identité ECDSA P-256 de l'expéditeur
 *   (FC4 §2), vérifiée contre la clé épinglée (TOFU) : un autre membre, qui détient pourtant la
 *   clé du salon, ne peut plus se faire passer pour lui.
 *
 * Aucune colonne ni route à changer : tout voyage dans le champ `iv` du message, que l'API traite
 * comme opaque. Un `iv` ancien (base64 seul) reste lu comme avant, sans garantie d'origine.
 *
 *   v2 : "m2." + ivB64 + "." + clientMsgId + "." + signatureB64 (vide si l'expéditeur n'a pas de clé de signature)
 *        [+ "." + rev pour une édition : compteur croissant, dans l'AAD et la signature ; absent = 0]
 */

const V2_PREFIX = 'm2.';
const enc = new TextEncoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** legacy : ancien format, sans garantie · unsigned : v2 sans signature exploitable · verified · invalid : signature fausse, rejeu ou clé de signature changée. */
export type MessageAuthState = 'legacy' | 'unsigned' | 'verified' | 'invalid';

export class MessageAuthError extends Error {}

interface ParsedIv { iv: string; clientMsgId: string; signature: string; rev: number }

function parseRev(raw: string | undefined): number {
    if (raw === undefined) return 0;
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 1) throw new MessageAuthError('Invalid revision');
    return n;
}

const revSuffix = (rev: number) => (rev > 0 ? `|rev:${rev}` : '');

/** Format authentifié : `m2` (humain) ou `m3` (écrit par l'agent, 12 §4.3). */
export const isAuthenticatedIv = (ivField: string | null | undefined): boolean => !!ivField && (ivField.startsWith(V2_PREFIX) || isM3Iv(ivField));

export function parseAuthenticatedIv(ivField: string): ParsedIv {
    const parts = ivField.slice(V2_PREFIX.length).split('.');
    if (parts.length < 3 || parts.length > 4 || !parts[0] || !parts[1]) throw new MessageAuthError('Invalid v2 message iv');
    return { iv: parts[0], clientMsgId: parts[1], signature: parts[2] ?? '', rev: parseRev(parts[3]) };
}

/**
 * Clé de signature à utiliser pour `senderId` : la clé déjà épinglée localement prime sur l'annuaire
 * des membres (fourni par le serveur, qui pourrait omettre la clé pour faire passer un message
 * signé pour « non vérifiable »).
 */
async function senderSignKey(senderId: string): Promise<string | null> {
    return (await readPinnedSignKey(senderId)) ?? lookupCreatorSignKey(senderId);
}

const aad = (threadId: string, senderId: string, clientMsgId: string, rev = 0) =>
    enc.encode(`synco-msg-v2|${threadId}|${senderId}|${clientMsgId}${revSuffix(rev)}`);

const signedBytes = (threadId: string, senderId: string, clientMsgId: string, ivB64: string, ciphertextB64: string, rev = 0) =>
    enc.encode(`synco-sig-v1|thread|${threadId}|${senderId}|${clientMsgId}|${ivB64}|${ciphertextB64}${revSuffix(rev)}`);

export interface MessageContext {
    threadId: string;
    senderId: string;
    /** Lecture d'un `m3` `rt1:` (12 §10.7) : org du salon et identité du message, pour la déclaration du texte. */
    reader?: ThreadReaderContext;
}

/**
 * Chiffre un message de salon au format v2. `clientMsgId` : à reprendre de l'original pour une
 * édition ; sinon un nouvel identifiant est tiré.
 */
export async function encryptThreadMessageV2(
    text: string,
    threadKey: CryptoKey,
    ctx: MessageContext,
    clientMsgId: string = crypto.randomUUID(),
    rev = 0
): Promise<{ ciphertext: string; iv: string }> {
    const ivBytes = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes, additionalData: aad(ctx.threadId, ctx.senderId, clientMsgId, rev) },
        threadKey,
        enc.encode(text)
    ));
    const ciphertext = toB64(ct);
    const ivB64 = toB64(ivBytes);

    let signature = '';
    if (privateSignKey.value) {
        const sig = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            privateSignKey.value,
            signedBytes(ctx.threadId, ctx.senderId, clientMsgId, ivB64, ciphertext, rev) as BufferSource
        );
        signature = toB64(new Uint8Array(sig));
    }
    return { ciphertext, iv: `${V2_PREFIX}${ivB64}.${clientMsgId}.${signature}${rev > 0 ? `.${rev}` : ''}` };
}

const safeM3 = (ivField: string): ParsedM3 | null => {
    try { return parseM3Iv(ivField); } catch { return null; }
};

/** Identifiant de message à reprendre pour une édition ; undefined si le message est ancien. */
export const clientMsgIdOf = (ivField: string | null | undefined): string | undefined => {
    if (!ivField) return undefined;
    if (isM3Iv(ivField)) return safeM3(ivField)?.clientMsgId;
    return ivField.startsWith(V2_PREFIX) ? parseAuthenticatedIv(ivField).clientMsgId : undefined;
};

/** Révision d'un message v2 / v3 (0 = jamais édité), pour calculer la suivante lors d'une édition. */
export const revisionOf = (ivField: string | null | undefined): number => {
    if (!ivField) return 0;
    if (isM3Iv(ivField)) return safeM3(ivField)?.rev ?? 0;
    return ivField.startsWith(V2_PREFIX) ? parseAuthenticatedIv(ivField).rev : 0;
};

/**
 * Clé épinglée, anciennes clés prouvées, puis anciennes clés désignées par la chaîne de transitions
 * (cf. verifyWithSignKeys) : un message signé avant un renouvellement de clés de son expéditeur reste
 * affiché. Une signature qu'aucune de ces clés ne valide reste 'invalid' (message masqué).
 */
const AUTH_BY_TRUST: Record<SignatureTrust, MessageAuthState> = {
    trusted: 'verified',
    history: 'unsigned', // ancienne clé sans preuve locale : affiché, mais pas comme vérifié
    unknown: 'unsigned',
    none: 'invalid',
};

async function verifySenderSignature(senderId: string, signatureB64: string, signed: Uint8Array): Promise<MessageAuthState> {
    const signKeyJwk = await senderSignKey(senderId);
    // Pas de signature alors que l'expéditeur a une clé d'identité : signature retirée.
    if (!signatureB64) return signKeyJwk ? 'invalid' : 'unsigned';
    if (!signKeyJwk) return 'unsigned'; // clé d'identité introuvable localement : non vérifiable
    try {
        const trust = await verifyWithSignKeys(senderId, lookupCreatorSignKey(senderId), async (jwk) => {
            const key = await crypto.subtle.importKey('jwk', JSON.parse(jwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64(signatureB64) as BufferSource, signed as BufferSource);
        });
        return AUTH_BY_TRUST[trust];
    } catch {
        return 'invalid';
    }
}

async function verifySignature(parsed: ParsedIv, ctx: MessageContext, ciphertextB64: string): Promise<MessageAuthState> {
    return verifySenderSignature(
        ctx.senderId,
        parsed.signature,
        signedBytes(ctx.threadId, ctx.senderId, parsed.clientMsgId, parsed.iv, ciphertextB64, parsed.rev)
    );
}

/**
 * Déchiffre un message v2 et évalue son authenticité. Lève si l'AAD ne correspond pas (message
 * déplacé ou réattribué). `replayed` : ce message répète l'identifiant d'un message plus ancien
 * (cf. findReplayedMessages) ; il est alors 'invalid'.
 */
export async function decryptThreadMessageV2(
    ciphertextB64: string,
    ivField: string,
    threadKey: CryptoKey,
    ctx: MessageContext,
    replayed = false
): Promise<{ text: string; auth: MessageAuthState; agent?: AgentMark }> {
    if (isM3Iv(ivField)) return decryptThreadMessageV3(ciphertextB64, ivField, threadKey, ctx, replayed);
    const parsed = parseAuthenticatedIv(ivField);
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(parsed.iv), additionalData: aad(ctx.threadId, ctx.senderId, parsed.clientMsgId, parsed.rev) },
        threadKey,
        fromB64(ciphertextB64)
    );
    let auth = replayed ? 'invalid' : await verifySignature(parsed, ctx, ciphertextB64);
    // Version plus ancienne que la dernière éditée déjà vue : retour en arrière imposé par le serveur.
    if (auth !== 'invalid' && !await noteMessageRevision(`thread|${ctx.threadId}|${ctx.senderId}|${parsed.clientMsgId}`, parsed.rev)) auth = 'invalid';
    return { text: new TextDecoder().decode(plain), auth };
}

/**
 * Ids des messages qui rejouent l'identifiant d'un message PLUS ANCIEN de la liste (même salon,
 * même expéditeur). Le plus ancien reste valide. Calculé avant le déchiffrement, qui est parallèle.
 */
export function findReplayedMessages(msgs: Array<{ id: string; threadId: string; senderId: string | null; iv: string | null; createdAt: string | Date }>): Set<string> {
    const replayed = new Set<string>();
    const seen = new Set<string>();
    const ordered = [...msgs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const m of ordered) {
        const cid = clientMsgIdOf(m.iv);
        if (!cid) continue;
        const key = `${m.threadId}|${m.senderId}|${cid}`;
        if (seen.has(key)) replayed.add(m.id);
        else seen.add(key);
    }
    return replayed;
}


// ---------------------------------------------------------------------------
// Messages privés (DM), format v2 — audit FC7 §1-2
// ---------------------------------------------------------------------------
//
// Le DM est chiffré pour le destinataire (RSA-OAEP + AES-GCM) sans qu'aucune clé de l'expéditeur
// n'intervienne : n'importe qui peut en fabriquer un. Le format v2 ajoute au champ `nonce` (opaque
// pour l'API) un identifiant de message et une signature ECDSA de l'expéditeur ; l'AAD d'AES-GCM
// lie le chiffré à (expéditeur, destinataire, identifiant). Les clés AES emballées font partie des
// octets signés.
//
//   "d2." + ivB64 + "." + clientMsgId + "." + signatureB64

const DM_V2_PREFIX = 'd2.';

export interface DmContext { senderId: string; recipientId: string }

export const isAuthenticatedDmNonce = (nonce: string | null | undefined): boolean => !!nonce && (nonce.startsWith(DM_V2_PREFIX) || isD3Nonce(nonce));

function parseDmNonce(nonce: string): ParsedIv {
    const parts = nonce.slice(DM_V2_PREFIX.length).split('.');
    if (parts.length < 3 || parts.length > 4 || !parts[0] || !parts[1]) throw new MessageAuthError('Invalid v2 DM nonce');
    return { iv: parts[0], clientMsgId: parts[1], signature: parts[2] ?? '', rev: parseRev(parts[3]) };
}

const safeD3 = (nonce: string) => {
    try { return parseD3Nonce(nonce); } catch { return null; }
};

export const dmClientMsgIdOf = (nonce: string | null | undefined): string | undefined => {
    if (!nonce) return undefined;
    if (isD3Nonce(nonce)) return safeD3(nonce)?.clientMsgId;
    return nonce.startsWith(DM_V2_PREFIX) ? parseDmNonce(nonce).clientMsgId : undefined;
};

export const dmRevisionOf = (nonce: string | null | undefined): number => {
    if (!nonce) return 0;
    if (isD3Nonce(nonce)) return safeD3(nonce)?.rev ?? 0;
    return nonce.startsWith(DM_V2_PREFIX) ? parseDmNonce(nonce).rev : 0;
};

const dmAad = (ctx: DmContext, clientMsgId: string, rev = 0) =>
    enc.encode(`synco-dm-v2|${ctx.senderId}|${ctx.recipientId}|${clientMsgId}${revSuffix(rev)}`);

const dmSignedBytes = (ctx: DmContext, clientMsgId: string, ivB64: string, ciphertext: string, encryptedAesKey: string, selfEncryptedAesKey: string, rev = 0) =>
    enc.encode(`synco-sig-v1|dm|${ctx.senderId}|${ctx.recipientId}|${clientMsgId}|${ivB64}|${ciphertext}|${encryptedAesKey}|${selfEncryptedAesKey}${revSuffix(rev)}`);

/** Chiffre un DM au format v2. `iv` du résultat est à envoyer dans le champ `nonce`. */
export async function encryptDmV2(
    text: string,
    peerPublicKeyJWK: string,
    myPublicKeyJWK: string | object | undefined,
    ctx: DmContext,
    clientMsgId: string = crypto.randomUUID(),
    rev = 0
) {
    const r = await encryptForPeer(text, peerPublicKeyJWK, myPublicKeyJWK, dmAad(ctx, clientMsgId, rev));
    let signature = '';
    if (privateSignKey.value) {
        const sig = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            privateSignKey.value,
            dmSignedBytes(ctx, clientMsgId, r.iv, r.ciphertext, r.encryptedAesKey, r.selfEncryptedAesKey ?? '', rev) as BufferSource
        );
        signature = toB64(new Uint8Array(sig));
    }
    return { ...r, iv: `${DM_V2_PREFIX}${r.iv}.${clientMsgId}.${signature}${rev > 0 ? `.${rev}` : ''}` };
}

async function verifyDmSignature(
    parsed: ParsedIv, ctx: DmContext, ciphertext: string, encryptedAesKey: string, selfEncryptedAesKey: string
): Promise<MessageAuthState> {
    return verifySenderSignature(
        ctx.senderId,
        parsed.signature,
        dmSignedBytes(ctx, parsed.clientMsgId, parsed.iv, ciphertext, encryptedAesKey, selfEncryptedAesKey, parsed.rev)
    );
}

/**
 * Déchiffre un DM v2 avec `aesKeyForMe` (la clé AES emballée pour moi : `encryptedAesKey` si je suis
 * le destinataire, `selfEncryptedAesKey` si j'en suis l'expéditeur). Lève si le chiffré a été
 * réattribué ou déplacé. `replayed` : cf. findReplayedDms.
 */
export async function decryptDmV2(
    msg: { content: string; nonce: string; encryptedAesKey: string | null | undefined; selfEncryptedAesKey: string | null | undefined },
    aesKeyForMe: string,
    myPrivateKey: CryptoKey,
    ctx: DmContext,
    replayed = false
): Promise<{ text: string; auth: MessageAuthState; agent?: AgentMark }> {
    if (isD3Nonce(msg.nonce)) return decryptDmV3(msg, aesKeyForMe, myPrivateKey, ctx, replayed);
    const parsed = parseDmNonce(msg.nonce);
    const text = await decryptFromPeer(msg.content, aesKeyForMe, parsed.iv, myPrivateKey, dmAad(ctx, parsed.clientMsgId, parsed.rev));
    let auth: MessageAuthState = replayed
        ? 'invalid'
        : await verifyDmSignature(parsed, ctx, msg.content, msg.encryptedAesKey ?? '', msg.selfEncryptedAesKey ?? '');
    if (auth !== 'invalid' && !await noteMessageRevision(`dm|${ctx.senderId}|${ctx.recipientId}|${parsed.clientMsgId}`, parsed.rev)) auth = 'invalid';
    return { text, auth };
}

/** Ids des DM qui rejouent l'identifiant d'un DM plus ancien de la liste (le plus ancien reste valide). */
export function findReplayedDms(msgs: Array<{ id: string; senderId: string; recipientId: string; nonce: string | null; createdAt: string | Date }>): Set<string> {
    const replayed = new Set<string>();
    const seen = new Set<string>();
    const ordered = [...msgs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const m of ordered) {
        const cid = dmClientMsgIdOf(m.nonce);
        if (!cid) continue;
        const key = `${m.senderId}|${m.recipientId}|${cid}`;
        if (seen.has(key)) replayed.add(m.id);
        else seen.add(key);
    }
    return replayed;
}


// ---------------------------------------------------------------------------
// Messages écrits par l'agent : formats m3 (salon) et d3 (MP), 12 §4.3 et §10.7 (L15f, PC88, PC94)
// ---------------------------------------------------------------------------
//
// Mention « avec Synco AI » portée par un champ AUTHENTIFIÉ (`author`) : le serveur ne peut ni l'ôter ni
// l'ajouter sans casser la signature. N'est écrit QUE pour un message écrit par l'agent (ou la révision d'un
// message m3) ; un message écrit à la main reste m2 / d2. Octets exacts : agentMessage.ts (vecteurs message-v3.json).

/** Ce que l'interface affiche sous un message de l'agent. */
export type AgentMark =
    | { author: 'ai' }
    | {
        author: 'rt1';
        delegationId: string;
        /** Déclaration du texte (12 §10.7) : `text_unverified` → avertissement « Texte non confirmé par <nom> ». */
        text: 'text_verified' | 'text_unverified';
        /** Raison interne (journal, détails) ; jamais affichée telle quelle. */
        reason?: TextUnverifiedReason;
        /** Action du plan de la déclaration, pour la détection du rejeu sur la fenêtre chargée (étape 8). */
        action?: { planId: string; n: number };
    };

/**
 * Vérification d'un auteur `rt1:` (12 §4.3 : mandat de la délégation, certificat, signature `csk`). Branchée par
 * l'app quand le mandat est vérifiable ; SANS vérificateur, l'état est `invalid` (le message est masqué, comme toute
 * origine non vérifiée). La déclaration du texte signée par l'utilisateur est contrôlée ensuite.
 */
export type Rt1AuthorVerifier = (input: {
    delegationId: string;
    senderId: string;
    threadId: string;
    signed: Uint8Array;
    signature: Uint8Array;
}) => Promise<'verified' | 'unsigned' | 'invalid'>;

let rt1Verifier: Rt1AuthorVerifier | null = null;
export const setRt1AuthorVerifier = (v: Rt1AuthorVerifier | null): void => { rt1Verifier = v; };

/** Contexte du lecteur pour la déclaration du texte : org du salon et identité du message. */
export interface ThreadReaderContext { orgId: string; messageId: string; replyToId: string | null }

async function signOrThrow(bytes: string): Promise<string> {
    // Un message de l'agent est toujours signé : une signature vide le rendrait `invalid` (12 §4.3).
    if (!privateSignKey.value) throw new MessageAuthError('Clé de signature indisponible');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateSignKey.value, enc.encode(bytes) as BufferSource);
    return toB64(new Uint8Array(sig));
}

/**
 * Chiffre un message de salon écrit par l'agent (`m3`, auteur `ai`), envoyé par l'appareil et signé par la clé
 * d'identité de l'utilisateur. `rev` toujours écrit (0 = original) ; pour une révision, reprendre `clientMsgId`.
 */
export async function encryptThreadMessageV3(
    text: string,
    threadKey: CryptoKey,
    ctx: MessageContext,
    clientMsgId: string = crypto.randomUUID(),
    rev = 0
): Promise<{ ciphertext: string; iv: string }> {
    const ivBytes = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes, additionalData: enc.encode(threadAadV3(ctx.threadId, ctx.senderId, clientMsgId, 'ai', rev)) },
        threadKey,
        enc.encode(text)
    ));
    const ciphertext = toB64(ct);
    const ivB64 = toB64(ivBytes);
    const signature = await signOrThrow(threadSignedV3(ctx.threadId, ctx.senderId, clientMsgId, 'ai', ivB64, ciphertext, rev));
    return { ciphertext, iv: formatM3Iv({ iv: ivB64, clientMsgId, author: 'ai', signature, rev }) };
}

/** Lecteur de la déclaration : clés de signature servies de l'expéditeur (`unavailable` si aucune). */
async function declarationSigner(senderId: string, bytes: Uint8Array, signature: Uint8Array): Promise<DeclarationSignerTrust> {
    const served = lookupCreatorSignKey(senderId);
    if (!served && !(await readPinnedSignKey(senderId))) return 'unavailable';
    try {
        const trust = await verifyWithSignKeys(senderId, served, async (jwk) => {
            const key = await crypto.subtle.importKey('jwk', JSON.parse(jwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature as BufferSource, bytes as BufferSource);
        });
        return trust === 'unknown' ? 'unavailable' : trust;
    } catch {
        return 'none';
    }
}

/** Ordre des états, du plus fort au plus faible ; le plus faible des deux l'emporte. */
const weaker = (a: MessageAuthState, b: MessageAuthState): MessageAuthState => {
    const rank: Record<MessageAuthState, number> = { verified: 0, unsigned: 1, legacy: 2, invalid: 3 };
    return rank[a] >= rank[b] ? a : b;
};

/**
 * Déchiffre un `m3` et évalue son authenticité (12 §4.3) puis, pour un auteur `rt1:`, la déclaration du texte
 * (12 §10.7) : un texte non confirmé est AFFICHÉ (texte de l'enveloppe, ou clair brut), jamais masqué.
 */
async function decryptThreadMessageV3(
    ciphertextB64: string,
    ivField: string,
    threadKey: CryptoKey,
    ctx: MessageContext,
    replayed: boolean
): Promise<{ text: string; auth: MessageAuthState; agent: AgentMark }> {
    const p = parseM3Iv(ivField);
    const plainBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(p.iv), additionalData: enc.encode(threadAadV3(ctx.threadId, ctx.senderId, p.clientMsgId, p.author, p.rev)) },
        threadKey,
        fromB64(ciphertextB64)
    );
    const plaintext = new TextDecoder().decode(plainBytes);
    const signed = threadSignedV3(ctx.threadId, ctx.senderId, p.clientMsgId, p.author, p.iv, ciphertextB64, p.rev, p.td);
    const noteKey = `thread|${ctx.threadId}|${ctx.senderId}|${p.clientMsgId}`;

    if (!isRt1Author(p.author)) {
        let auth: MessageAuthState = replayed || !p.signature ? 'invalid' : await verifySenderSignature(ctx.senderId, p.signature, enc.encode(signed));
        if (auth !== 'invalid' && !await noteMessageRevision(noteKey, p.rev)) auth = 'invalid';
        return { text: plaintext, auth, agent: { author: 'ai' } };
    }

    const delegationId = rt1DelegationOf(p.author)!;
    // Sans vérificateur (03 §10 : mandat, certificat, `csk` couvrant `td`), un auteur `rt1:` n'est PAS vérifiable : il est
    // `invalid` (masqué), jamais `unsigned` affiché. Le serveur ne peut donc pas faire passer un message pour celui de l'agent.
    let auth: MessageAuthState = 'invalid';
    if (!replayed && p.signature && rt1Verifier) {
        try {
            auth = await rt1Verifier({ delegationId, senderId: ctx.senderId, threadId: ctx.threadId, signed: enc.encode(signed), signature: fromB64(p.signature) });
        } catch {
            auth = 'invalid';
        }
    }
    if (auth !== 'invalid' && !await noteMessageRevision(noteKey, p.rev)) auth = 'invalid';
    if (auth === 'invalid') return { text: plaintext, auth, agent: { author: 'rt1', delegationId, text: 'text_unverified' } };

    const rc = ctx.reader ?? null;
    if (!rc) return { text: plaintext, auth, agent: { author: 'rt1', delegationId, text: 'text_unverified', reason: 'signer_unavailable' } };
    const check = await verifyTextDeclaration(
        { orgId: rc.orgId, threadId: ctx.threadId, senderId: ctx.senderId, messageId: rc.messageId, replyToId: rc.replyToId, rev: p.rev },
        p.td,
        plaintext,
        { verifySigner: declarationSigner },
    );
    if (check.weakKey) auth = weaker(auth, 'unsigned');
    return {
        text: check.display,
        auth,
        agent: { author: 'rt1', delegationId, text: check.state, ...(check.reason ? { reason: check.reason } : {}), ...(check.action ? { action: check.action } : {}) },
    };
}

/** Chiffre un MP écrit par l'agent (`d3`, auteur `ai`) ; `iv` du résultat est à envoyer dans le champ `nonce`. */
export async function encryptDmV3(
    text: string,
    peerPublicKeyJWK: string,
    myPublicKeyJWK: string | object | undefined,
    ctx: DmContext,
    clientMsgId: string = crypto.randomUUID(),
    rev = 0
) {
    const r = await encryptForPeer(text, peerPublicKeyJWK, myPublicKeyJWK, enc.encode(dmAadV3(ctx.senderId, ctx.recipientId, clientMsgId, rev)));
    const signature = await signOrThrow(dmSignedV3(ctx.senderId, ctx.recipientId, clientMsgId, r.iv, r.ciphertext, r.encryptedAesKey, r.selfEncryptedAesKey ?? '', rev));
    return { ...r, iv: formatD3Nonce({ iv: r.iv, clientMsgId, signature, rev }) };
}

async function decryptDmV3(
    msg: { content: string; nonce: string; encryptedAesKey: string | null | undefined; selfEncryptedAesKey: string | null | undefined },
    aesKeyForMe: string,
    myPrivateKey: CryptoKey,
    ctx: DmContext,
    replayed: boolean
): Promise<{ text: string; auth: MessageAuthState; agent: AgentMark }> {
    const p = parseD3Nonce(msg.nonce);
    const text = await decryptFromPeer(msg.content, aesKeyForMe, p.iv, myPrivateKey, enc.encode(dmAadV3(ctx.senderId, ctx.recipientId, p.clientMsgId, p.rev)));
    let auth: MessageAuthState = replayed || !p.signature
        ? 'invalid'
        : await verifySenderSignature(ctx.senderId, p.signature,
            enc.encode(dmSignedV3(ctx.senderId, ctx.recipientId, p.clientMsgId, p.iv, msg.content, msg.encryptedAesKey ?? '', msg.selfEncryptedAesKey ?? '', p.rev)));
    if (auth !== 'invalid' && !await noteMessageRevision(`dm|${ctx.senderId}|${ctx.recipientId}|${p.clientMsgId}`, p.rev)) auth = 'invalid';
    return { text, auth, agent: { author: 'ai' } };
}
