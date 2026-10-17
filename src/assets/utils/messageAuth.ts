import { decryptFromPeer, encryptForPeer, privateSignKey } from './crypto';
import { lookupCreatorSignKey, readPinnedSignKey, requireTrustedSignKey } from './keyTrust';

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
 */

const V2_PREFIX = 'm2.';
const enc = new TextEncoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** legacy : ancien format, sans garantie · unsigned : v2 sans signature exploitable · verified · invalid : signature fausse, rejeu ou clé de signature changée. */
export type MessageAuthState = 'legacy' | 'unsigned' | 'verified' | 'invalid';

export class MessageAuthError extends Error {}

interface ParsedIv { iv: string; clientMsgId: string; signature: string }

export const isAuthenticatedIv = (ivField: string | null | undefined): boolean => !!ivField && ivField.startsWith(V2_PREFIX);

export function parseAuthenticatedIv(ivField: string): ParsedIv {
    const parts = ivField.slice(V2_PREFIX.length).split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1]) throw new MessageAuthError('Invalid v2 message iv');
    return { iv: parts[0], clientMsgId: parts[1], signature: parts[2] ?? '' };
}

/**
 * Clé de signature à utiliser pour `senderId` : la clé déjà épinglée localement prime sur l'annuaire
 * des membres (fourni par le serveur, qui pourrait omettre la clé pour faire passer un message
 * signé pour « non vérifiable »).
 */
async function senderSignKey(senderId: string): Promise<string | null> {
    return (await readPinnedSignKey(senderId)) ?? lookupCreatorSignKey(senderId);
}

const aad = (threadId: string, senderId: string, clientMsgId: string) =>
    enc.encode(`synco-msg-v2|${threadId}|${senderId}|${clientMsgId}`);

const signedBytes = (threadId: string, senderId: string, clientMsgId: string, ivB64: string, ciphertextB64: string) =>
    enc.encode(`synco-sig-v1|thread|${threadId}|${senderId}|${clientMsgId}|${ivB64}|${ciphertextB64}`);

export interface MessageContext { threadId: string; senderId: string }

/**
 * Chiffre un message de salon au format v2. `clientMsgId` : à reprendre de l'original pour une
 * édition ; sinon un nouvel identifiant est tiré.
 */
export async function encryptThreadMessageV2(
    text: string,
    threadKey: CryptoKey,
    ctx: MessageContext,
    clientMsgId: string = crypto.randomUUID()
): Promise<{ ciphertext: string; iv: string }> {
    const ivBytes = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes, additionalData: aad(ctx.threadId, ctx.senderId, clientMsgId) },
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
            signedBytes(ctx.threadId, ctx.senderId, clientMsgId, ivB64, ciphertext) as BufferSource
        );
        signature = toB64(new Uint8Array(sig));
    }
    return { ciphertext, iv: `${V2_PREFIX}${ivB64}.${clientMsgId}.${signature}` };
}

/** Identifiant de message à reprendre pour une édition ; undefined si le message est ancien. */
export const clientMsgIdOf = (ivField: string | null | undefined): string | undefined =>
    isAuthenticatedIv(ivField) ? parseAuthenticatedIv(ivField!).clientMsgId : undefined;

async function verifySignature(parsed: ParsedIv, ctx: MessageContext, ciphertextB64: string): Promise<MessageAuthState> {
    const signKeyJwk = await senderSignKey(ctx.senderId);
    if (!parsed.signature) {
        // Pas de signature alors que l'expéditeur a une clé d'identité : signature retirée.
        return signKeyJwk ? 'invalid' : 'unsigned';
    }
    if (!signKeyJwk) return 'unsigned'; // clé d'identité introuvable localement : non vérifiable

    try {
        const pinned = await requireTrustedSignKey(ctx.senderId, signKeyJwk);
        const key = await crypto.subtle.importKey('jwk', JSON.parse(pinned), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        const ok = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            fromB64(parsed.signature) as BufferSource,
            signedBytes(ctx.threadId, ctx.senderId, parsed.clientMsgId, parsed.iv, ciphertextB64) as BufferSource
        );
        return ok ? 'verified' : 'invalid';
    } catch {
        return 'invalid';
    }
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
): Promise<{ text: string; auth: MessageAuthState }> {
    const parsed = parseAuthenticatedIv(ivField);
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(parsed.iv), additionalData: aad(ctx.threadId, ctx.senderId, parsed.clientMsgId) },
        threadKey,
        fromB64(ciphertextB64)
    );
    const auth = replayed ? 'invalid' : await verifySignature(parsed, ctx, ciphertextB64);
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

export const isAuthenticatedDmNonce = (nonce: string | null | undefined): boolean => !!nonce && nonce.startsWith(DM_V2_PREFIX);

function parseDmNonce(nonce: string): ParsedIv {
    const parts = nonce.slice(DM_V2_PREFIX.length).split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1]) throw new MessageAuthError('Invalid v2 DM nonce');
    return { iv: parts[0], clientMsgId: parts[1], signature: parts[2] ?? '' };
}

export const dmClientMsgIdOf = (nonce: string | null | undefined): string | undefined =>
    isAuthenticatedDmNonce(nonce) ? parseDmNonce(nonce!).clientMsgId : undefined;

const dmAad = (ctx: DmContext, clientMsgId: string) =>
    enc.encode(`synco-dm-v2|${ctx.senderId}|${ctx.recipientId}|${clientMsgId}`);

const dmSignedBytes = (ctx: DmContext, clientMsgId: string, ivB64: string, ciphertext: string, encryptedAesKey: string, selfEncryptedAesKey: string) =>
    enc.encode(`synco-sig-v1|dm|${ctx.senderId}|${ctx.recipientId}|${clientMsgId}|${ivB64}|${ciphertext}|${encryptedAesKey}|${selfEncryptedAesKey}`);

/** Chiffre un DM au format v2. `iv` du résultat est à envoyer dans le champ `nonce`. */
export async function encryptDmV2(
    text: string,
    peerPublicKeyJWK: string,
    myPublicKeyJWK: string | object | undefined,
    ctx: DmContext,
    clientMsgId: string = crypto.randomUUID()
) {
    const r = await encryptForPeer(text, peerPublicKeyJWK, myPublicKeyJWK, dmAad(ctx, clientMsgId));
    let signature = '';
    if (privateSignKey.value) {
        const sig = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            privateSignKey.value,
            dmSignedBytes(ctx, clientMsgId, r.iv, r.ciphertext, r.encryptedAesKey, r.selfEncryptedAesKey ?? '') as BufferSource
        );
        signature = toB64(new Uint8Array(sig));
    }
    return { ...r, iv: `${DM_V2_PREFIX}${r.iv}.${clientMsgId}.${signature}` };
}

async function verifyDmSignature(
    parsed: ParsedIv, ctx: DmContext, ciphertext: string, encryptedAesKey: string, selfEncryptedAesKey: string
): Promise<MessageAuthState> {
    const signKeyJwk = await senderSignKey(ctx.senderId);
    if (!parsed.signature) return signKeyJwk ? 'invalid' : 'unsigned';
    if (!signKeyJwk) return 'unsigned';
    try {
        const pinned = await requireTrustedSignKey(ctx.senderId, signKeyJwk);
        const key = await crypto.subtle.importKey('jwk', JSON.parse(pinned), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        const ok = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            fromB64(parsed.signature) as BufferSource,
            dmSignedBytes(ctx, parsed.clientMsgId, parsed.iv, ciphertext, encryptedAesKey, selfEncryptedAesKey) as BufferSource
        );
        return ok ? 'verified' : 'invalid';
    } catch {
        return 'invalid';
    }
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
): Promise<{ text: string; auth: MessageAuthState }> {
    const parsed = parseDmNonce(msg.nonce);
    const text = await decryptFromPeer(msg.content, aesKeyForMe, parsed.iv, myPrivateKey, dmAad(ctx, parsed.clientMsgId));
    const auth = replayed
        ? 'invalid'
        : await verifyDmSignature(parsed, ctx, msg.content, msg.encryptedAesKey ?? '', msg.selfEncryptedAesKey ?? '');
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
