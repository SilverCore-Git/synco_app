import type { StoredFile } from './types';

/**
 * SAV intégré — DTO échangés avec synco_api (contrat :
 * synco_api/vibe/features/SUPPORT_FEATURE.md §4). Le filtrage client/équipe
 * est fait par le serveur : un client ne reçoit jamais un
 * SupportTicketStaffDTO ni un message du canal INTERNAL.
 */

export type SupportTicketStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type SupportChannel = 'PUBLIC' | 'INTERNAL';
export type SupportTicketEventType =
    | 'CREATED' | 'CLAIMED' | 'TRANSFERRED' | 'RELEASED'
    | 'PRIORITY_CHANGED' | 'STATUS_CHANGED'
    | 'CLOSED_BY_CLIENT' | 'REOPENED_BY_CLIENT';

/** Rôle dans l'équipe support (GET /api/support/me) ; null : simple client. */
export type SupportRole = 'superadmin' | 'admin' | 'moderator' | null;
export type SupportStaffRole = Exclude<SupportRole, null>;

export const SUPPORT_TICKET_STATUSES: readonly SupportTicketStatus[] = ['PENDING', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];
export const SUPPORT_TICKET_PRIORITIES: readonly SupportTicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export interface SupportUserLite {
    id: string;
    name: string;
    avatarUrl: string | null;
}

export interface SupportTicketKeyDTO {
    kind: SupportChannel;
    encryptedKey: string;
    staffKeyVersion: number | null;
    creatorId: string | null;
    commitment: string | null;
    signature: string | null;
}

/** Ticket vu par son créateur (GET /api/support/tickets*). */
export interface SupportTicketClientDTO {
    id: string;
    number: number;
    titleCipher: string | null;
    titleIv: string | null;
    organization: { id: string; name: string } | null;
    status: SupportTicketStatus;
    priority: SupportTicketPriority | null;
    assignee: SupportUserLite | null;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string;
    closedAt: string | null;
    /** Copie PUBLIC du créateur. */
    myKey: SupportTicketKeyDTO | null;
}

export interface SupportTag {
    id: string;
    name: string;
    color: string;
}

/** Ticket vu par l'équipe. */
export interface SupportTicketStaffDTO extends Omit<SupportTicketClientDTO, 'myKey'> {
    // publicSignKey : vérifie l'enveloppe FC4 de la clé PUBLIC posée par le client.
    creator: SupportUserLite & { email: string; publicSignKey: string | null };
    tags: SupportTag[];
    publicStaffKey: SupportTicketKeyDTO | null;
    internalStaffKey: SupportTicketKeyDTO | null;
    unreadForAssignee?: boolean;
}

export type SupportTicketDTO = SupportTicketClientDTO | SupportTicketStaffDTO;

export const isStaffTicket = (t: SupportTicketDTO): t is SupportTicketStaffDTO => 'creator' in t;

export interface SupportMessageReactionDTO {
    id: string;
    emoji: string;
    userId: string;
    user: SupportUserLite;
}

/** Même forme qu'un message de thread, pour que ThreadMessage l'affiche tel quel. */
export interface SupportMessageDTO {
    id: string;
    ticketId: string;
    channel: SupportChannel;
    senderId: string | null;
    sender: SupportUserLite | null;
    content: string;
    nonce: string;
    iv: string | null;
    replyToId: string | null;
    replyMessage: {
        id: string;
        senderId: string | null;
        sender: SupportUserLite | null;
        content: string;
        nonce: string;
        iv: string | null;
    } | null;
    edited: boolean;
    pinned: boolean;
    references: { type: 'user'; id: string }[];
    files: StoredFile[];
    reactions: SupportMessageReactionDTO[];
    createdAt: string;
    updatedAt: string;
}

export interface SupportTicketEventDTO {
    id: string;
    ticketId: string;
    type: SupportTicketEventType;
    actor: SupportUserLite | null;
    data: Record<string, unknown> | null;
    createdAt: string;
}

export interface SupportRequesterDTO {
    id: string;
    name: string;
    email: string;
    pseudo: string | null;
    avatarUrl: string | null;
    publicSignKey: string | null;
    job: string | null;
    description: string | null;
    createdAt: string;
    organizations: {
        id: string;
        name: string;
        role: string | null;
        roles: { id: string; name: string; color: string | null; icon: string | null }[];
        joinedAt: string;
    }[];
}

export interface SupportStaffMember extends SupportUserLite {
    role: SupportStaffRole;
    publicKey: string | null;
    /** Vérifie les enveloppes FC4 des clés INTERNAL créées par ce membre. */
    publicSignKey: string | null;
}

/** GET /staff/public-keys : annuaire de l'équipe pour la mise en place et la rotation. */
export interface SupportStaffPublicKey {
    userId: string;
    publicKey: string | null;
    publicSignKey: string | null;
}

/** Version (signée) de la clé d'équipe, telle que servie par GET /staff-key(/versions). */
export interface SupportStaffKeyInfo {
    version: number;
    publicKey: string;
    signature: string;
    signerId: string;
    signerPublicSignKey: string | null;
}

export interface SupportStaffKeyShareDTO {
    version: number;
    encryptedPrivateKey: string;
}

export interface SupportMissingShare {
    version: number;
    userId: string;
    publicKey: string;
}

/** Copie de clé envoyée à l'API (§5 KeyIn). */
export interface SupportKeyIn {
    encryptedKey: string;
    commitment?: string;
    signature?: string;
}

export interface SupportStaffKeyIn extends SupportKeyIn {
    staffKeyVersion: number;
}

/** Réponse de POST /tickets : le ticket et l'id du premier message (liaison des pièces jointes). */
export type CreateSupportTicketResponse = SupportTicketClientDTO & { firstMessageId: string };

export interface CreateSupportTicketPayload {
    id: string;
    titleCipher?: string;
    titleIv?: string;
    organizationId?: string;
    keys: { creator: SupportKeyIn; staff: SupportStaffKeyIn };
    firstMessage: { content: string; nonce: string; iv: string };
}

export interface SupportStaffTicketFilters {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    /** 'me', 'none' ou l'id d'un membre de l'équipe. */
    assignee?: 'me' | 'none' | string;
    tag?: string;
    orgId?: string;
    /** Id du dernier ticket de la page précédente (pages de 50). */
    cursor?: string;
}
