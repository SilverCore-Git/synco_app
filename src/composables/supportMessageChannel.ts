import { computed, reactive, ref, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import type { Socket } from 'socket.io-client';
import { user } from '@/assets/var';
import type { Message, User } from '@/types/types';
import {
    isStaffTicket,
    type SupportChannel,
    type SupportMessageDTO,
    type SupportMessageReactionDTO,
    type SupportRole,
    type SupportTicketDTO,
    type SupportUserLite,
} from '@/types/support';
import { formatReactions } from '@/assets/utils/decryptMessages';
import type { UploadContext } from '@/assets/uploadFile';
import type { MessageChannel } from '@/composables/messageChannel';
import { createStaticMentionSource } from '@/composables/mentionSource';
import useSettingsItem from '@/composables/useSettingsItem';
import { emitWithAck } from '@/services/support/socket';
import { loadStaffMembers, staffMembers } from '@/services/support/staffMembers';
import { supportApi } from '@/services/support/api';

/**
 * MessageChannel d'un canal de ticket de support (SUPPORT_FEATURE.md §6),
 * à fournir à ChatTimeline comme createThreadMessageChannel pour un thread.
 *
 * Différences avec un thread :
 *  - événements `support:*`, filtrés strictement sur (ticketId, canal) ;
 *  - l'historique initial passe par `join()` (ack), à appeler par la vue :
 *        const { messages, hasMore } = await channel.join();
 *        timeline.setMessages(await decryptMessages(messages, key), hasMore);
 *  - édition : auteur ; suppression : auteur, admin ou super-admin ;
 *  - aucune référence `#`/`!`/`&` ; mentions limitées à une liste fixe
 *    (client : membres de l'équipe ayant déjà écrit en PUBLIC dans le
 *    ticket ; équipe : toute l'équipe) ;
 *  - écriture impossible sur un ticket CLOSED (et INTERNAL : équipe seule) ;
 *  - INTERNAL : message épinglé (`pinning`).
 *
 * À appeler dans le `setup()` de la vue (pose des watchers).
 *
 * Deux timelines (PUBLIC + INTERNAL) d'un même ticket peuvent partager le
 * socket : `support:join` ne fait quitter que les rooms des autres tickets.
 */

export interface SupportMentionPerson {
    id: string;
    name: string;
    pseudo?: string | null;
    avatarUrl?: string | null;
}

export interface SupportMessageChannelOptions {
    /** Id du ticket ouvert (null : aucun). */
    ticketId: MaybeRefOrGetter<string | null>;
    channel: SupportChannel;
    /** Clé AES du canal (getTicketChannelKey / openSupportTicket) ; null : saisie désactivée. */
    key: Readonly<Ref<CryptoKey | null>>;
    /** Ticket tel que servi (client ou équipe), tenu à jour par la vue. */
    ticket: Readonly<Ref<SupportTicketDTO | null>>;
    /** Rôle de l'utilisateur (useSupportRole().role). */
    role: Readonly<Ref<SupportRole>>;
    /** Socket partagé (useWSocket()), éventuellement obtenu après coup. */
    socket: Readonly<Ref<Socket | null>>;
    /** Remplace la liste de personnes citables calculée par défaut. */
    participants?: Readonly<Ref<SupportMentionPerson[]>>;
    /** Carte de profil au clic sur un avatar/nom (absent : non cliquable). */
    openProfile?: (user: User, event: MouseEvent) => void;
}

export interface SupportPinning {
    /** Id du message épinglé (null : aucun). */
    readonly pinnedId: Readonly<Ref<string | null>>;
    /**
     * Le message épinglé, chiffré (à déchiffrer avec decryptMessages comme
     * le reste) — lu par GET /tickets/:id/pinned-message après `join()` et à
     * chaque `support:pinned`, même s'il est hors de l'historique chargé.
     */
    readonly pinnedMessage: Readonly<Ref<Message | null>>;
    /** Relit le message épinglé auprès de l'API. */
    refresh(): Promise<void>;
    /** Épingle (un seul par ticket, l'ancien est désépinglé) ou désépingle. */
    pin(messageId: string, pinned: boolean): void;
}

export interface SupportMessageChannel extends MessageChannel {
    readonly ticketId: Readonly<Ref<string | null>>;
    readonly channel: SupportChannel;
    /** Rejoint le canal et renvoie la première page (chiffrée, ordre chronologique). Rejette avec l'erreur de l'API. */
    join(): Promise<{ messages: Message[]; hasMore: boolean }>;
    /** Quitte la room du canal (au démontage de la vue). */
    leave(): void;
    /** Personnes citables (aussi utilisées pour les noms de l'indicateur de frappe). */
    readonly participants: Readonly<Ref<SupportMentionPerson[]>>;
    /** Canal INTERNAL seulement : message épinglé. */
    readonly pinning?: SupportPinning;
}

// ── Conversion DTO → Message (forme attendue par ThreadMessage) ──────────

const liteToUser = (u: SupportUserLite): User => ({
    id: u.id,
    name: u.name,
    email: '',
    avatarUrl: u.avatarUrl ?? undefined,
    data: { status: '' },
    createdAt: '',
    updatedAt: '',
});

export const supportMessageToMessage = (dto: SupportMessageDTO): Message => ({
    id: dto.id,
    // Champ attendu par Message ; ThreadMessage ne s'en sert pas.
    threadId: dto.ticketId,
    senderId: dto.senderId,
    replyToId: dto.replyToId,
    transferId: null,
    content: dto.content,
    nonce: dto.nonce,
    iv: dto.iv,
    edited: dto.edited,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    sender: dto.sender ? liteToUser(dto.sender) : undefined,
    files: dto.files,
    // Tableau brut : decryptMessages le groupe par emoji (formatReactions).
    reactions: dto.reactions,
    replyMessage: dto.replyMessage
        ? {
            id: dto.replyMessage.id,
            threadId: dto.ticketId,
            senderId: dto.replyMessage.senderId,
            replyToId: null,
            transferId: null,
            content: dto.replyMessage.content,
            nonce: dto.replyMessage.nonce,
            iv: dto.replyMessage.iv,
            edited: null,
            createdAt: dto.createdAt,
            updatedAt: dto.updatedAt,
            sender: dto.replyMessage.sender ? liteToUser(dto.replyMessage.sender) : undefined,
        }
        : null,
});

// ── Indicateur de frappe ─────────────────────────────────────────────────

const TYPING_TTL_MS = 6000;

export const createSupportMessageChannel = (options: SupportMessageChannelOptions): SupportMessageChannel => {

    const { channel, key, ticket, role, socket } = options;
    const ticketId = computed(() => toValue(options.ticketId) ?? null);
    const me = () => user.value?.id;
    const isStaff = computed(() => role.value !== null);
    const isPrivileged = computed(() => role.value === 'superadmin' || role.value === 'admin');

    // Messages vus sur ce canal (historique, direct) : filtre des réactions
    // (l'événement ne porte ni ticket ni canal) et auteurs pour les mentions.
    const knownIds = new Set<string>();
    const authors = reactive(new Map<string, SupportMentionPerson>());
    const pinnedId = ref<string | null>(null);
    const pinnedMessage = shallowRef<Message | null>(null);

    const track = (dto: SupportMessageDTO): Message => {
        knownIds.add(dto.id);
        if (dto.sender && dto.channel === 'PUBLIC') {
            authors.set(dto.sender.id, { id: dto.sender.id, name: dto.sender.name, avatarUrl: dto.sender.avatarUrl });
        }
        const msg = supportMessageToMessage(dto);
        if (channel === 'INTERNAL') {
            if (dto.pinned) { pinnedId.value = dto.id; pinnedMessage.value = msg; }
            else if (pinnedId.value === dto.id) { pinnedId.value = null; pinnedMessage.value = null; }
        }
        return msg;
    };

    // Changement de ticket : rien ne doit fuir de l'un à l'autre.
    watch(ticketId, () => {
        knownIds.clear();
        authors.clear();
        pinnedId.value = null;
        pinnedMessage.value = null;
        typingUsers.clear();
    });

    if (isStaff.value || channel === 'INTERNAL') void loadStaffMembers().catch(() => {});
    watch(isStaff, (staff) => { if (staff) void loadStaffMembers().catch(() => {}); });

    // Client : l'équipe qui a déjà répondu publiquement (jamais le créateur
    // lui-même) ; équipe : tous ses membres (sauf soi).
    const defaultParticipants = computed<SupportMentionPerson[]>(() => {
        if (!isStaff.value) {
            const creatorId = me();
            return [...authors.values()].filter(p => p.id !== creatorId);
        }
        return staffMembers.value
            .filter(m => m.id !== me())
            .map(m => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl }));
    });
    const participants = computed(() => options.participants?.value ?? defaultParticipants.value);

    // Noms connus (frappe) : participants + auteurs + ticket.
    const nameOf = (userId: string): string | null => {
        const p = participants.value.find(x => x.id === userId) ?? authors.get(userId)
            ?? staffMembers.value.find(x => x.id === userId);
        if (p) return p.name;
        const t = ticket.value;
        if (t?.assignee?.id === userId) return t.assignee.name;
        if (t && isStaffTicket(t) && t.creator.id === userId) return t.creator.name;
        return null;
    };

    const typingUsers = reactive(new Map<string, ReturnType<typeof setTimeout>>());
    const { Item: privacyMode } = useSettingsItem('privacyMode', false);
    const displayName = (name: string) => (privacyMode.value ? name.charAt(0).toUpperCase() : name);
    const typingLabel = computed<string | null>(() => {
        const names = [...typingUsers.keys()].map(id => nameOf(id) ?? "Quelqu'un").map(displayName);
        if (names.length === 0) return null;
        if (names.length === 1) return `${names[0]} est en train d'écrire`;
        if (names.length === 2) return `${names[0]} et ${names[1]} sont en train d'écrire`;
        return "Plusieurs personnes sont en train d'écrire";
    });
    const setTyping = (userId: string, isTyping: boolean) => {
        clearTimeout(typingUsers.get(userId));
        if (!isTyping) { typingUsers.delete(userId); return; }
        typingUsers.set(userId, setTimeout(() => typingUsers.delete(userId), TYPING_TTL_MS));
    };

    const canWrite = computed(() => {
        const t = ticket.value;
        if (!t || !ticketId.value || !key.value) return false;
        if (t.status === 'CLOSED') return false;
        return channel === 'PUBLIC' || isStaff.value;
    });

    const matchesConversation = (dto: { ticketId?: string; channel?: SupportChannel } | null | undefined) =>
        !!dto && !!ticketId.value && dto.ticketId === ticketId.value && dto.channel === channel;

    const requireSocket = (): Socket => {
        if (!socket.value) throw new Error('Non connecté au serveur.');
        return socket.value;
    };

    const page = async (event: 'support:join' | 'support:load-more', extra: Record<string, unknown> = {}) => {
        const id = ticketId.value;
        if (!id) return { messages: [] as Message[], hasMore: false };
        const res = await emitWithAck<{ messages: SupportMessageDTO[]; hasMore: boolean }>(
            requireSocket(), event, { ticketId: id, channel, ...extra }
        );
        // Réponse d'un ticket quitté entre-temps : ignorée.
        if (id !== ticketId.value) return { messages: [] as Message[], hasMore: false };
        return { messages: (res.messages ?? []).filter(m => matchesConversation(m)).map(track), hasMore: !!res.hasMore };
    };

    const refreshPinned = async () => {
        const id = ticketId.value;
        if (channel !== 'INTERNAL' || !id) return;
        try {
            const dto = await supportApi.getPinnedMessage(id);
            if (id !== ticketId.value) return;
            if (dto) track(dto);
            else { pinnedId.value = null; pinnedMessage.value = null; }
        } catch (e) {
            console.warn('[Support] Message épinglé indisponible :', (e as Error).message);
        }
    };

    const pinning: SupportPinning | undefined = channel === 'INTERNAL'
        ? {
            pinnedId,
            pinnedMessage,
            refresh: refreshPinned,
            pin: (messageId, pinned) => {
                socket.value?.emit('support:pin-message', { id: messageId, pinned });
            },
        }
        : undefined;

    const uploadContext = computed<UploadContext | null>(() =>
        ticketId.value && canWrite.value ? { supportTicketId: ticketId.value, supportChannel: channel } : null
    );

    return {
        id: computed(() => (ticketId.value ? `${ticketId.value}:${channel}` : null)),
        ticketId,
        channel,
        encryptionKey: key,
        canWrite,
        readOnly: ref(false),
        canModerate: isPrivileged,
        participants,
        pinning,

        join: async () => {
            const res = await page('support:join');
            void refreshPinned();
            return res;
        },

        leave: () => {
            if (ticketId.value) socket.value?.emit('support:leave', { ticketId: ticketId.value, channel });
        },

        send: async (msg) => {
            const id = ticketId.value;
            if (!id) throw new Error('Aucun ticket ouvert.');
            const res = await emitWithAck<{ message: SupportMessageDTO }>(requireSocket(), 'support:send-message', {
                ticketId: id,
                channel,
                content: msg.content,
                iv: msg.iv,
                nonce: msg.nonce,
                replyToId: msg.replyToId,
                // Seules les mentions de personnes ont un sens ici (l'API
                // ignore le reste).
                references: msg.references.filter(r => r.type === 'user'),
            });
            return track(res.message);
        },

        edit: (id, content, iv, references) => {
            socket.value?.emit('support:edit-message', { id, content, iv, references: references.filter(r => r.type === 'user') });
        },

        remove: (id) => {
            socket.value?.emit('support:delete-message', id);
        },

        react: async (messageId, emoji) => {
            if (!socket.value) return null;
            try {
                await emitWithAck(socket.value, 'support:react', { messageId, emoji });
                return null;
            } catch (e) {
                return (e as Error).message;
            }
        },

        attachFiles: (messageId, files) => {
            socket.value?.emit('support:edit-message-files', { id: messageId, files });
        },

        loadMore: async (before) => {
            try {
                return (await page('support:load-more', { before })).messages;
            } catch (e) {
                console.warn('[Support] Chargement de l\'historique impossible :', (e as Error).message);
                return [];
            }
        },

        subscribe: (listeners) => {
            const onNew = (dto: SupportMessageDTO) => {
                if (!matchesConversation(dto)) return;
                setTyping(dto.senderId ?? '', false);
                listeners.onNew(track(dto));
            };
            const onEdit = (dto: SupportMessageDTO) => {
                if (!matchesConversation(dto)) return;
                listeners.onEdit(track(dto));
            };
            const onDelete = (data: { id: string; ticketId: string; channel: SupportChannel }) => {
                if (!matchesConversation(data)) return;
                knownIds.delete(data.id);
                if (pinnedId.value === data.id) { pinnedId.value = null; pinnedMessage.value = null; }
                listeners.onDelete(data.id);
            };
            const onReactions = (data: { messageId: string; reactions: SupportMessageReactionDTO[] }) => {
                if (!data || !knownIds.has(data.messageId)) return;
                listeners.onReactions(data.messageId, formatReactions(data.reactions));
            };
            const onPinned = (data: { ticketId: string; id: string; pinned: boolean }) => {
                if (channel !== 'INTERNAL' || !data || data.ticketId !== ticketId.value) return;
                if (data.pinned) {
                    pinnedId.value = data.id;
                    pinnedMessage.value = null;
                    void refreshPinned();
                } else if (pinnedId.value === data.id) {
                    pinnedId.value = null;
                    pinnedMessage.value = null;
                }
            };
            const onTyping = (data: { ticketId: string; channel: SupportChannel; userId: string; isTyping: boolean }) => {
                if (!matchesConversation(data) || !data.userId || data.userId === me()) return;
                setTyping(data.userId, data.isTyping);
            };
            // Reconnexion : les rooms sont perdues côté serveur, on rejoint
            // de nouveau (sans recharger l'historique, à la charge de la vue).
            const onReconnect = () => {
                if (ticketId.value && socket.value) {
                    emitWithAck(socket.value, 'support:join', { ticketId: ticketId.value, channel }).catch(() => {});
                }
            };

            const handlers: [string, Parameters<Socket['on']>[1]][] = [
                ['support:new-message', onNew],
                ['support:edit-message', onEdit],
                ['support:delete-message', onDelete],
                ['support:reaction-updated', onReactions],
                ['support:pinned', onPinned],
                ['support:typing', onTyping],
                ['connect', onReconnect],
            ];

            // On ne retire que NOS handlers, jamais l'événement entier.
            const detach = (sock: Socket | null) => {
                if (!sock) return;
                for (const [ev, fn] of handlers) sock.off(ev, fn);
            };
            const stop = watch(socket, (sock, previous) => {
                detach(previous ?? null);
                if (!sock) return;
                for (const [ev, fn] of handlers) sock.on(ev, fn);
            }, { immediate: true });

            return () => {
                stop();
                detach(socket.value);
                for (const t of typingUsers.values()) clearTimeout(t);
                typingUsers.clear();
            };
        },

        uploadContext,

        canEdit: (msg) => !!msg.senderId && msg.senderId === me(),
        canDelete: (msg) => (!!msg.senderId && msg.senderId === me()) || isPrivileged.value,

        mentions: createStaticMentionSource(participants),
        referencesEnabled: false,
        openProfile: options.openProfile,
        // Pas de présence pour l'équipe support / le client.
        senderStatus: () => undefined,

        typing: {
            label: typingLabel,
            notify: (isTyping) => {
                if (!ticketId.value) return;
                socket.value?.emit('support:typing', { ticketId: ticketId.value, channel, isTyping });
            },
        },
    };

};
