/**
 * Messages écrits par l'agent, exécutés par l'appareil (12 §4.2, §4.3 ; L15f) : routes et sockets NORMAUX de
 * l'utilisateur, aucun droit nouveau. Chiffrement `m3` / `d3` d'auteur `ai` (mention « avec Synco AI »), texte
 * final `agentMessageText` (jetons de mention ajoutés comme le compositeur), champ `plan: "<planId>/<n>"` pour
 * lier l'objet à l'action. Lecture : déchiffrée sur l'appareil, bornée, donnée au modèle comme texte de tiers.
 *
 * Non couvert par les tests unitaires (socket, E2EE réel, clés de salon) : recette manuelle. Les fonctions de
 * format et de bornage sont pures et testées.
 */
import sfetch from '@/assets/utils/sfetch';
import { user, openedOrg } from '@/assets/var';
import { decryptThreadKeyWithRsa, privateKey, E2EEUnloked, decryptFromPeer } from '@/assets/utils/crypto';
import { pinOrCheckKey, KeyChangedError } from '@/assets/utils/keyPinning';
import { getCachedThreadKey, setCachedThreadKey } from '@/assets/utils/threadKeyCache';
import { requireTrustedKey } from '@/assets/utils/keyTrust';
import { clientMsgIdOf, decryptDmV2, encryptDmV3, encryptThreadMessageV3, isAuthenticatedDmNonce, revisionOf, dmClientMsgIdOf, dmRevisionOf, type AgentMark } from '@/assets/utils/messageAuth';
import { agentMessageText } from '@/assets/utils/agentMessage';
import { decryptMessages } from '@/assets/utils/decryptMessages';
import { extractReferenceTokens } from '@/composables/useReferences';
import { buildForwardToken, extractForwardedPayload } from '@/composables/useForwardedContent';
import useWSocket from '@/composables/useWSocket';
import type { Message } from '@/types/types';
import { DeviceHttpError, DeviceNotSentError } from './plan/deviceErrors';

/** Échec métier d'une action de message (codes de 12 §4.2) : `failed` avec ce code. */
export class AgentMessageError extends DeviceNotSentError {
    readonly code: 'not_own_message' | 'message_too_long' | 'no_thread_key' | 'peer_key_untrusted';
    constructor(code: AgentMessageError['code']) {
        super(code);
        this.code = code;
    }
}

/** Bornes de ce qui est rendu au modèle (09 §4 : 64 Kio par résultat ; orgs de 1000+ membres). */
export const READ_TEXT_MAX = 4000;
export const READ_RESULT_MAX_BYTES = 64 * 1024;

type Socket = NonNullable<Awaited<ReturnType<typeof useWSocket>>['value']>;

async function socketOrFail(): Promise<Socket> {
    const ref = await useWSocket();
    if (!ref.value) throw new DeviceNotSentError('no_socket');
    return ref.value;
}

/**
 * Évènement avec accusé de réception. Expiration d'une ÉCRITURE : issue inconnue (le message est peut-être créé,
 * 12 §8.2) ; d'une lecture préalable : rien n'est parti, échec.
 */
function emitAck<T>(socket: Socket, event: string, payload: unknown, kind: 'read' | 'write' = 'read'): Promise<T> {
    return new Promise((resolve, reject) => {
        socket.timeout(15000).emit(event, payload, (err: Error | null, res: T) =>
            (err ? reject(kind === 'read' ? new DeviceNotSentError('timeout') : new Error('timeout')) : resolve(res)));
    });
}

/** Clé du salon (cache, sinon accès socket + déchiffrement RSA + épinglage FC1), comme le partage de référence. */
export async function resolveThreadKey(threadId: string): Promise<CryptoKey> {
    const socket = await socketOrFail();
    const access = await emitAck<{ encryptedKey?: string; error?: string }>(socket, 'get-thread-access', { threadId });
    if (access?.error || !access?.encryptedKey) throw new DeviceHttpError(403);
    const cached = getCachedThreadKey(threadId);
    if (cached && cached.encryptedKey === access.encryptedKey) return cached.key;
    if (!privateKey.value) throw new AgentMessageError('no_thread_key');
    try {
        const key = await decryptThreadKeyWithRsa(access.encryptedKey, privateKey.value);
        await pinOrCheckKey(key, `thread:${threadId}`, 1);
        setCachedThreadKey(threadId, access.encryptedKey, key);
        return key;
    } catch (e) {
        if (e instanceof KeyChangedError) throw new AgentMessageError('no_thread_key');
        throw e;
    }
}

const me = (): string => {
    const id = user.value?.id;
    if (!id) throw new DeviceNotSentError('no_user');
    return id;
};

const plan = (planHeader?: string) => (planHeader ? { plan: planHeader } : {});

export interface AgentSendArgs { threadId: string; text: string; replyTo?: string; mentionUserIds?: string[]; fileIds?: string[]; forwardOf?: string }

/**
 * `message.send` d'appareil : socket `send-message` avec un `iv` `m3` d'auteur `ai`, références extraites du texte
 * final, puis pièces jointes déjà présentes (`edit-message-files`). Transfert : `transferOrigin` de
 * messageTransferService (le serveur revalide l'origine pour l'expéditeur). Rend `{ id, threadId }`.
 */
export async function sendAgentThreadMessage(args: AgentSendArgs, planHeader?: string): Promise<{ id: string; threadId: string }> {
    const senderId = me();
    const text = args.forwardOf ? await forwardContent(args.forwardOf, args.text) : agentMessageText({ text: args.text, mentionUserIds: args.mentionUserIds });
    if (Array.from(text).length > 10000) throw new AgentMessageError('message_too_long');
    const key = await resolveThreadKey(args.threadId);
    const { ciphertext, iv } = await encryptThreadMessageV3(text, key, { threadId: args.threadId, senderId });
    const socket = await socketOrFail();
    const res = await emitAck<{ id?: string; error?: string }>(socket, 'send-message', {
        threadId: args.threadId,
        content: ciphertext,
        iv,
        nonce: `n_${Date.now()}`,
        replyToId: args.replyTo,
        references: extractReferenceTokens(text),
        ...(args.forwardOf ? { transferOrigin: { kind: 'thread', id: args.forwardOf } } : {}),
        ...plan(planHeader),
    }, 'write');
    if (!res?.id || res.error) throw new DeviceHttpError(403);
    if (args.fileIds?.length) socket.emit('edit-message-files', { id: res.id, files: args.fileIds.map(id => ({ id })) });
    return { id: res.id, threadId: args.threadId };
}

/**
 * Contenu d'un transfert (comme le geste de l'app, ThreadMessage.vue::confirmForward) : l'original est déchiffré sur
 * l'appareil puis rechiffré pour la destination ; transférer un transfert repart de SON origine.
 */
async function forwardContent(forwardOf: string, comment: string): Promise<string> {
    const original = await fetchThreadMessage(forwardOf);
    const [clear] = await decryptMessages([original], await resolveThreadKey(original.threadId));
    if (!clear || clear.authState === 'invalid') throw new DeviceNotSentError('forward_unreadable');
    const payload = extractForwardedPayload(clear.content)?.payload ?? {
        senderId: clear.senderId ?? '',
        senderName: (clear.senderId && memberName(clear.senderId)) || 'Anonyme',
        text: clear.content,
    };
    const token = buildForwardToken(payload);
    if (!token) throw new DeviceNotSentError('forward_unreadable');
    return comment.trim() ? `${comment.trim()}\n${token}` : token;
}

/** Message chiffré tel que servi par `GET /api/messages/message/:id`. */
async function fetchThreadMessage(messageId: string): Promise<Message> {
    const res = await sfetch(`/api/messages/message/${encodeURIComponent(messageId)}`);
    if (!res.ok) throw new DeviceHttpError(res.status);
    return await res.json() as Message;
}

/**
 * `message.edit` d'appareil : seul un message de l'utilisateur (`not_own_message` sinon) ; même `clientMsgId`,
 * `rev` + 1, `iv` `m3` d'auteur `ai` (un `m2` modifié par l'agent devient `m3`). Rend `{ id, threadId }`.
 */
export async function editAgentThreadMessage(args: { messageId: string; text: string }, planHeader?: string): Promise<{ id: string; threadId: string }> {
    const senderId = me();
    const original = await fetchThreadMessage(args.messageId);
    if (original.senderId !== senderId || original.isWebhook) throw new AgentMessageError('not_own_message');
    const text = agentMessageText({ text: args.text });
    const key = await resolveThreadKey(original.threadId);
    const cid = clientMsgIdOf(original.iv) ?? crypto.randomUUID();
    const { ciphertext, iv } = await encryptThreadMessageV3(text, key, { threadId: original.threadId, senderId }, cid, revisionOf(original.iv) + 1);
    const socket = await socketOrFail();
    socket.emit('edit-message', { id: args.messageId, content: ciphertext, iv, references: extractReferenceTokens(text), ...plan(planHeader) });
    return { id: args.messageId, threadId: original.threadId };
}

/** Clé publique de l'interlocuteur, membre de l'org ouverte, épinglée (FC1) ; sinon refus. */
async function trustedPeerKey(peerId: string): Promise<string> {
    const member = openedOrg.value?.members?.find(m => m.userId === peerId);
    const pk = member?.user?.publicKey;
    if (!pk) throw new AgentMessageError('peer_key_untrusted');
    try {
        return await requireTrustedKey(peerId, pk);
    } catch {
        throw new AgentMessageError('peer_key_untrusted');
    }
}

/** `dm.send` d'appareil : socket `dm:send-message`, nonce `d3` d'auteur `ai`. Rend `{ id, peerId }`. */
export async function sendAgentDm(args: { peerId: string; text: string; fileIds?: string[] }, planHeader?: string): Promise<{ id: string; peerId: string }> {
    const senderId = me();
    if (!E2EEUnloked.value) throw new DeviceNotSentError('e2ee_locked');
    const text = agentMessageText({ text: args.text });
    const peerKey = await trustedPeerKey(args.peerId);
    const e = await encryptDmV3(text, peerKey, user.value?.publicKey || undefined, { senderId, recipientId: args.peerId });
    const socket = await socketOrFail();
    const res = await emitAck<{ id?: string; error?: string }>(socket, 'dm:send-message', {
        recipientId: args.peerId,
        content: e.ciphertext,
        encryptedAesKey: e.encryptedAesKey,
        selfEncryptedAesKey: e.selfEncryptedAesKey || null,
        nonce: e.iv,
        isE2EE: true,
        references: extractReferenceTokens(text),
        ...plan(planHeader),
    }, 'write');
    if (!res?.id || res.error) throw new DeviceHttpError(403);
    if (args.fileIds?.length) socket.emit('edit-dm-message-files', { id: res.id, files: args.fileIds.map(id => ({ id })) });
    return { id: res.id, peerId: args.peerId };
}

interface ServedDm { id: string; senderId: string; recipientId: string; content: string; nonce: string; encryptedAesKey: string | null; selfEncryptedAesKey: string | null; createdAt: string; replyToId: string | null; isE2EE: boolean }

/** `dm.edit` d'appareil : seul SON message (`not_own_message`), même `clientMsgId`, `rev` + 1, `d3`. Rend `{ id }`. */
export async function editAgentDm(args: { dmMessageId: string; text: string }, planHeader?: string): Promise<{ id: string }> {
    const senderId = me();
    const socket = await socketOrFail();
    const got = await emitAck<{ message?: ServedDm; error?: string }>(socket, 'dm:get-message', { id: args.dmMessageId });
    const original = got?.message;
    if (!original) throw new DeviceHttpError(404);
    if (original.senderId !== senderId) throw new AgentMessageError('not_own_message');
    const text = agentMessageText({ text: args.text });
    const peerKey = await trustedPeerKey(original.recipientId);
    const cid = dmClientMsgIdOf(original.nonce) ?? crypto.randomUUID();
    const e = await encryptDmV3(text, peerKey, user.value?.publicKey || undefined, { senderId, recipientId: original.recipientId }, cid, dmRevisionOf(original.nonce) + 1);
    socket.emit('dm:edit-message', {
        id: args.dmMessageId,
        newContent: e.ciphertext,
        encryptedAesKey: e.encryptedAesKey,
        selfEncryptedAesKey: e.selfEncryptedAesKey ?? '',
        nonce: e.iv,
        references: extractReferenceTokens(text),
        ...plan(planHeader),
    });
    return { id: args.dmMessageId };
}

// ---------------------------------------------------------------------------
// Lecture (outils read_thread_messages, get_message, read_dm) : déchiffrée sur l'appareil, bornée
// ---------------------------------------------------------------------------

export interface ReadMessageView {
    id: string;
    senderId: string | null;
    senderName: string | null;
    createdAt: string;
    replyToId: string | null;
    text: string;
    /** Texte coupé à `READ_TEXT_MAX` caractères. */
    cut?: true;
    /** Écrit par l'agent ; `textUnconfirmed` : avertissement « Texte non confirmé » (12 §10.7). */
    agent?: 'ai' | 'autonomous';
    textUnconfirmed?: true;
}

/** Vue d'un message pour le modèle : sans clé, sans iv ni chiffré ; messages illisibles signalés comme tels. */
export function toReadView(m: { id: string; senderId: string | null; createdAt: string | Date; replyToId?: string | null; content: string; authState?: string; agentMark?: AgentMark }, senderName: (id: string) => string | null): ReadMessageView {
    const chars = Array.from(m.content ?? '');
    const view: ReadMessageView = {
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderId ? senderName(m.senderId) : null,
        createdAt: new Date(m.createdAt).toISOString(),
        replyToId: m.replyToId ?? null,
        text: chars.length > READ_TEXT_MAX ? chars.slice(0, READ_TEXT_MAX).join('') : (m.content ?? ''),
    };
    if (chars.length > READ_TEXT_MAX) view.cut = true;
    if (m.agentMark) {
        view.agent = m.agentMark.author === 'ai' ? 'ai' : 'autonomous';
        if (m.agentMark.author === 'rt1' && m.agentMark.text === 'text_unverified') view.textUnconfirmed = true;
    }
    return view;
}

/** Borne la liste à `READ_RESULT_MAX_BYTES` (les plus récents gardés) ; `truncated` si des messages sont retirés. */
export function boundReadViews(views: ReadMessageView[]): { messages: ReadMessageView[]; truncated: boolean } {
    const enc = new TextEncoder();
    let total = 2;
    const kept: ReadMessageView[] = [];
    for (let i = views.length - 1; i >= 0; i--) {
        const size = enc.encode(JSON.stringify(views[i])).length + 1;
        if (total + size > READ_RESULT_MAX_BYTES) break;
        total += size;
        kept.unshift(views[i]!);
    }
    return { messages: kept, truncated: kept.length < views.length };
}

const memberName = (id: string): string | null => openedOrg.value?.members?.find(m => m.userId === id)?.user?.name ?? null;

/** `read_thread_messages` : les `limit` derniers (100 au plus), filtrés par `before` / `after` dans la fenêtre lue. */
export async function readThreadMessages(args: { threadId: string; before?: string; after?: string; limit?: number }) {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const res = await sfetch(`/api/messages/threads/${encodeURIComponent(args.threadId)}?limit=100`);
    if (!res.ok) throw new DeviceHttpError(res.status);
    const body = await res.json() as { messages?: Message[] } | Message[];
    const raw = Array.isArray(body) ? body : (body.messages ?? []);
    const key = await resolveThreadKey(args.threadId);
    let list = await decryptMessages(raw, key);
    if (args.before) { const i = list.findIndex(m => m.id === args.before); list = i >= 0 ? list.slice(0, i) : list; }
    if (args.after) { const i = list.findIndex(m => m.id === args.after); list = i >= 0 ? list.slice(i + 1) : []; }
    list = list.slice(-limit);
    return { threadId: args.threadId, ...boundReadViews(list.map(m => toReadView(m, memberName))) };
}

/** `get_message` : le message et ses réponses dans la fenêtre récente du salon. */
export async function getThreadMessage(args: { messageId: string }) {
    const original = await fetchThreadMessage(args.messageId);
    const key = await resolveThreadKey(original.threadId);
    const [decrypted] = await decryptMessages([original], key);
    const recent = await readThreadMessages({ threadId: original.threadId, limit: 100 });
    return {
        message: toReadView(decrypted ?? original, memberName),
        replies: recent.messages.filter(m => m.replyToId === args.messageId).slice(0, 50),
    };
}

/** `read_dm` (appareil seulement, EX-13) : page d'une conversation privée, sans changer de salle. */
export async function readDm(args: { peerId: string; before?: string; limit?: number }) {
    const myId = me();
    if (!privateKey.value) throw new DeviceNotSentError('e2ee_locked');
    const socket = await socketOrFail();
    const page = await emitAck<{ messages?: ServedDm[]; error?: string }>(socket, 'dm:read-page', { recipientId: args.peerId, before: args.before, limit: Math.min(Math.max(args.limit ?? 50, 1), 100) });
    if (!page?.messages) throw new DeviceHttpError(403);
    const views: ReadMessageView[] = [];
    for (const m of page.messages) {
        const aesKey = m.senderId === myId ? m.selfEncryptedAesKey : m.encryptedAesKey;
        let content = '[message illisible]';
        let agentMark: AgentMark | undefined;
        try {
            if (aesKey && isAuthenticatedDmNonce(m.nonce)) {
                const r = await decryptDmV2(m, aesKey, privateKey.value, { senderId: m.senderId, recipientId: m.recipientId });
                content = r.auth === 'invalid' ? '[expéditeur non vérifié]' : r.text;
                agentMark = r.auth === 'invalid' ? undefined : r.agent;
            } else if (aesKey) {
                content = await decryptFromPeer(m.content, aesKey, m.nonce, privateKey.value);
            }
        } catch { /* message illisible */ }
        views.push(toReadView({ ...m, content, agentMark }, memberName));
    }
    return { peerId: args.peerId, ...boundReadViews(views) };
}
