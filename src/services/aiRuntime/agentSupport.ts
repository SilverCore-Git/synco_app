/**
 * Demandes au support de Synco écrites ou lues par l'agent, exécutées par l'APPAREIL (12 §4.2, 03 §2 ; L15j) :
 * côté demandeur seulement (côté modérateur : EX-7). Le support est hors de l'org : sensible (R4), jamais précoché.
 *
 * - La clé du ticket (`support:<id>`) est créée, scellée et lue ici, sur l'appareil ; elle n'est JAMAIS déléguée au
 *   runtime (les outils sont `device_only`, en mode plan comme en mode autonome).
 * - Un demandeur ne voit que SES tickets : tout `ticketId` venu du modèle est recoupé avec `GET /support/tickets`
 *   (liste filtrée par créateur côté API) avant toute lecture ou écriture, même pour un modérateur qui serait aussi
 *   demandeur (l'API lui servirait alors la vue équipe : on ne l'utilise pas).
 * - Seul le canal PUBLIC est lu ou écrit : jamais le canal interne ni les notes des modérateurs.
 * - Le texte des modérateurs est rendu au modèle comme texte de tiers (enveloppe `<untrusted>` côté registre).
 * - Écrire ne réécrit pas : aucun outil ne modifie, ne supprime ni ne réagit à un message envoyé (EX-17).
 *
 * Non couvert par les tests unitaires (socket, E2EE réel, clés d'équipe) : recette manuelle. Les contrôles d'arguments
 * et de mise en forme sont purs et testés.
 */
import sfetch from '@/assets/utils/sfetch';
import { user } from '@/assets/var';
import { decryptMessageWithContentKey, encryptMessageWithContentKey, privateKey } from '@/assets/utils/crypto';
import { pinOrCheckKey } from '@/assets/utils/keyPinning';
import { decryptMessages } from '@/assets/utils/decryptMessages';
import { isWellFormedText } from '@/assets/utils/agentMessage';
import { isValidId } from '@/assets/utils/runtimeCert';
import { hasHiddenChars } from './supportText';
import {
    generateTicketKey, sealTicketKey, setCachedTicketKey, signTicketKey, supportKeyContext, SUPPORT_KEY_VERSION,
} from '@/assets/utils/supportCrypto';
import { fetchCurrentStaffKey, getTicketChannelKey, SupportLockedError } from '@/services/support/keys';
import { supportApi } from '@/services/support/api';
import useWSocket from '@/composables/useWSocket';
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import type { SupportMessageDTO, SupportTicketClientDTO } from '@/types/support';
import type { Message } from '@/types/types';
import { DeviceHttpError, DeviceNotSentError } from './plan/deviceErrors';
import { boundReadViews, toReadView, type ReadMessageView } from './agentMessaging';

export const SUPPORT_SUBJECT_MAX = 200;
export const SUPPORT_TEXT_MAX = 8000;

export type SupportKind = 'support.create' | 'support.reply';

const chars = (s: string): number => Array.from(s).length;
/** Texte bien formé, SANS caractère invisible ni de contrôle (ce qui est lu sur la carte est ce qui part) : voir supportText.ts. */
const text = (s: unknown, min: number, max: number): boolean =>
    typeof s === 'string' && isWellFormedText(s) && !hasHiddenChars(s) && chars(s) >= min && chars(s) <= max;

/**
 * `args` stricts du §4.2 : champ inconnu, type ou bornes hors limites → faux. `ticketId` peut manquer quand il vient
 * d'`argsRefs` (le kind est alors revalidé par `validatePlan`) ; l'exécutant, lui, le reçoit toujours résolu.
 */
export function checkSupportKindArgs(kind: SupportKind, args: JsonObject): boolean {
    const keys = Object.keys(args);
    if (kind === 'support.create') {
        return keys.every(k => k === 'subject' || k === 'text') && text(args.subject, 1, SUPPORT_SUBJECT_MAX) && text(args.text, 1, SUPPORT_TEXT_MAX);
    }
    return keys.every(k => k === 'ticketId' || k === 'text') && typeof args.ticketId === 'string' && isValidId(args.ticketId) && text(args.text, 1, SUPPORT_TEXT_MAX);
}

export function assertSupportArgs(kind: SupportKind, args: JsonObject): void {
    if (!checkSupportKindArgs(kind, args)) throw new DeviceNotSentError('invalid_args');
}

type Socket = NonNullable<Awaited<ReturnType<typeof useWSocket>>['value']>;

async function socketOrFail(): Promise<Socket> {
    const ref = await useWSocket();
    if (!ref.value) throw new DeviceNotSentError('no_socket');
    return ref.value;
}

/** Évènement avec accusé ; l'expiration d'une ÉCRITURE laisse une issue inconnue (le message est peut-être créé, 12 §8.2). */
function emitAck<T>(socket: Socket, event: string, payload: unknown, kind: 'read' | 'write'): Promise<T> {
    return new Promise((resolve, reject) => {
        socket.timeout(15000).emit(event, payload, (err: Error | null, res: T) =>
            (err ? reject(kind === 'read' ? new DeviceNotSentError('timeout') : new Error('timeout')) : resolve(res)));
    });
}

const me = (): string => {
    const id = user.value?.id;
    if (!id) throw new DeviceNotSentError('no_user');
    return id;
};

function assertUnlocked(): void {
    if (!privateKey.value) throw new DeviceNotSentError('e2ee_locked');
}

/** Mon ticket (jamais celui d'un autre) : absent de MA liste → introuvable, sans rien révéler de plus. */
export async function findOwnTicket(ticketId: string): Promise<SupportTicketClientDTO> {
    if (!isValidId(ticketId)) throw new DeviceNotSentError('invalid_args');
    const own = (await supportApi.listMyTickets()).find(t => t.id === ticketId);
    if (!own) throw new DeviceNotSentError('ticket_not_found');
    return own;
}

/** Clé du canal PUBLIC de mon ticket ; E2EE verrouillé ou clé indisponible : refus local, rien n'est envoyé. */
async function publicKeyOf(ticket: SupportTicketClientDTO): Promise<CryptoKey> {
    try {
        return await getTicketChannelKey(ticket, 'PUBLIC');
    } catch (e) {
        if (e instanceof SupportLockedError) throw new DeviceNotSentError('e2ee_locked');
        throw new DeviceNotSentError('no_ticket_key');
    }
}

/**
 * `support.create` d'appareil : clé de ticket générée ici, scellée pour moi et pour la clé d'équipe courante
 * (enveloppe FC4), sujet et texte chiffrés, `POST /api/support/tickets` avec `X-Synco-Plan` (lien objet ↔ action).
 * Aucune organisation n'est rattachée : l'équipe ne lit que ce que l'utilisateur a validé. Rend `{ id }`.
 */
export async function createAgentSupportTicket(args: { subject: string; text: string }, planHeader?: string): Promise<{ id: string }> {
    const me_ = user.value;
    if (!me_?.id) throw new DeviceNotSentError('no_user');
    assertUnlocked();
    if (!me_.publicKey) throw new DeviceNotSentError('no_public_key');
    let staff;
    try {
        staff = await fetchCurrentStaffKey();
    } catch (e) {
        if (e instanceof SupportLockedError) throw new DeviceNotSentError('e2ee_locked');
        throw new DeviceNotSentError('support_not_configured');
    }
    if (!staff) throw new DeviceNotSentError('support_not_configured');

    const id = crypto.randomUUID();
    const key = await generateTicketKey();
    const envelope = await signTicketKey(key, id, 'PUBLIC');
    const creatorKey = await sealTicketKey(key, me_.publicKey);
    const staffKey = await sealTicketKey(key, staff.publicKey);
    const title = await encryptMessageWithContentKey(args.subject, key);
    const body = await encryptMessageWithContentKey(args.text, key);

    const res = await sfetch('/api/support/tickets', {
        method: 'POST',
        ...(planHeader ? { headers: { 'X-Synco-Plan': planHeader } } : {}),
        body: JSON.stringify({
            id,
            titleCipher: title.ciphertext,
            titleIv: title.iv,
            keys: {
                creator: { encryptedKey: creatorKey, ...(envelope ?? {}) },
                staff: { encryptedKey: staffKey, staffKeyVersion: staff.version, ...(envelope ?? {}) },
            },
            firstMessage: { content: body.ciphertext, iv: body.iv, nonce: `n_${Date.now()}` },
        }),
    });
    if (!res.ok) throw new DeviceHttpError(res.status);

    // La clé du ticket est à moi : épinglée et gardée en cache tout de suite (les réponses suivantes du plan l'utilisent).
    try {
        await pinOrCheckKey(key, supportKeyContext(id, 'PUBLIC'), SUPPORT_KEY_VERSION);
        setCachedTicketKey(id, 'PUBLIC', creatorKey, key);
    } catch (e) {
        console.warn('[AI support] clé du ticket non mise en cache :', (e as Error).message);
    }
    return { id };
}

/**
 * `support.reply` d'appareil : message du canal PUBLIC de MON ticket, chiffré avec la clé du ticket, socket
 * `support:send-message` avec le champ `plan`. Ticket clos : refusé avant l'envoi. Rend `{ id }` (le message).
 */
export async function replyAgentSupportTicket(args: { ticketId: string; text: string }, planHeader?: string): Promise<{ id: string }> {
    me();
    assertUnlocked();
    const ticket = await findOwnTicket(args.ticketId);
    if (ticket.status === 'CLOSED') throw new DeviceNotSentError('ticket_closed');
    const key = await publicKeyOf(ticket);
    const { ciphertext, iv } = await encryptMessageWithContentKey(args.text, key);
    const socket = await socketOrFail();
    const res = await emitAck<{ message?: { id?: string }; error?: string }>(socket, 'support:send-message', {
        ticketId: ticket.id,
        channel: 'PUBLIC',
        content: ciphertext,
        iv,
        nonce: `n_${Date.now()}`,
        ...(planHeader ? { plan: planHeader } : {}),
    }, 'write');
    const id = res?.message?.id;
    if (!id || res.error) throw new DeviceHttpError(403);
    return { id };
}

// ---------------------------------------------------------------------------
// Lecture (outil read_support_ticket) : déchiffrée sur l'appareil, canal PUBLIC seulement, bornée
// ---------------------------------------------------------------------------

export interface SupportMessageView extends ReadMessageView {
    /** `me` : écrit par moi ; `team` : écrit par l'équipe de Synco (texte de tiers). */
    from: 'me' | 'team';
}

/** Vue d'un message du ticket pour le modèle : sans clé ni iv ; l'auteur « équipe » est repéré, le texte coupé et borné. */
export function toSupportView(m: { id: string; senderId: string | null; sender?: { name: string } | null; createdAt: string | Date; replyToId?: string | null; content: string }, myId: string): SupportMessageView {
    const view = toReadView({ ...m, content: m.content }, () => m.sender?.name ?? null);
    return { ...view, from: m.senderId === myId ? 'me' : 'team' };
}

export function boundSupportViews(views: SupportMessageView[]): { messages: SupportMessageView[]; truncated: boolean } {
    const kept = boundReadViews(views);
    return { messages: kept.messages as SupportMessageView[], truncated: kept.truncated };
}

/**
 * Requête de page du canal PUBLIC d'un ticket : TOUJOURS `support:load-more` (avec ou sans `before`), jamais
 * `support:join`, qui ferait quitter au socket partagé les salles des autres tickets ouverts à l'écran.
 */
export function supportPageRequest(ticketId: string, before?: string): { event: 'support:load-more'; payload: { ticketId: string; channel: 'PUBLIC'; before?: string } } {
    return { event: 'support:load-more', payload: { ticketId, channel: 'PUBLIC', ...(before ? { before } : {}) } };
}

/**
 * `read_support_ticket` : un de MES tickets, titre et échanges publics déchiffrés ici. Pages de 20 par `support:load-more` du
 * canal PUBLIC (sans `before` : la plus récente), sans rejoindre la salle du ticket : le temps réel des autres
 * tickets ouverts à l'écran n'est pas touché. Le canal interne n'est jamais demandé.
 */
export async function readSupportTicket(args: { ticketId: string; before?: string }) {
    const myId = me();
    assertUnlocked();
    const ticket = await findOwnTicket(args.ticketId);
    const key = await publicKeyOf(ticket);
    const socket = await socketOrFail();
    const request = supportPageRequest(ticket.id, args.before);
    const page = await emitAck<{ messages?: SupportMessageDTO[]; hasMore?: boolean; error?: string }>(socket, request.event, request.payload, 'read');
    if (!page?.messages) throw new DeviceHttpError(403);
    // Défense en profondeur : rien d'un autre canal ni d'un autre ticket, même si l'API en servait par erreur.
    const own = page.messages.filter(m => m.channel === 'PUBLIC' && m.ticketId === ticket.id);
    const clear = await decryptMessages(own as unknown as Message[], key);
    const views = clear.map(m => {
        const dto = own.find(o => o.id === m.id);
        return toSupportView({ ...m, sender: dto?.sender ?? null }, myId);
    });
    let title: string | null = null;
    try { if (ticket.titleCipher && ticket.titleIv) title = await decryptMessageWithContentKey(ticket.titleCipher, ticket.titleIv, key); } catch { /* titre illisible : laissé vide */ }
    return {
        ticket: {
            id: ticket.id, number: ticket.number, status: ticket.status, title,
            assignee: ticket.assignee ? { name: ticket.assignee.name } : null,
            createdAt: ticket.createdAt, lastMessageAt: ticket.lastMessageAt, closedAt: ticket.closedAt,
        },
        ...boundSupportViews(views),
        hasMore: page.hasMore === true,
    };
}
