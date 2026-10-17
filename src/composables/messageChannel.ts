import { computed, inject, ref, watch, type InjectionKey, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Message, Thread, User } from '@/types/types';
import { member, openedOrg, user } from '@/assets/var';
import { openProfile } from '@/composables/useProfile';
import { navigateToReference } from '@/composables/useReferenceNavigation';
import type { ExtractedReference } from '@/composables/useReferences';
import type { UploadContext } from '@/assets/uploadFile';
import type { ReactionMap } from '@/assets/utils/decryptMessages';
import {
    createOrgMentionSource, orgMentionRenderSource,
    type MentionSource,
} from '@/composables/mentionSource';

/**
 * MessageChannel — tout ce qui distingue une conversation d'une autre pour
 * les composants de chat (ChatTimeline, ThreadMessage, ThreadTextarea).
 *
 * Ces composants n'émettent jamais eux-mêmes sur le socket et ne lisent ni
 * `openedOrg`, ni `member`, ni la route : ils passent par le canal fourni
 * (provide/inject, clé MESSAGE_CHANNEL_KEY). Un thread fournit
 * createThreadMessageChannel ; un ticket de support fournira le sien
 * (événements `support:*`, clé du canal PUBLIC/INTERNAL, mentions fixes…).
 *
 * Contrat de chiffrement : les messages ont le format des threads
 * (content + iv chiffrés avec `encryptionKey` via
 * encryptMessageWithContentKey). Les composants chiffrent/déchiffrent ; le
 * canal transporte des données déjà chiffrées.
 */

/** Message sortant, contenu déjà chiffré avec `encryptionKey`. */
export interface OutgoingMessage {
    content: string;
    iv: string;
    nonce: string;
    replyToId?: string;
    references: ExtractedReference[];
}

/** Événements temps réel du canal, déjà filtrés sur la conversation courante. */
export interface MessageChannelListeners {
    /** Nouveau message (chiffré). */
    onNew: (msg: Message) => void;
    /** Message modifié (contenu et/ou pièces jointes, chiffré). */
    onEdit: (msg: Message) => void;
    /** Message supprimé. */
    onDelete: (messageId: string) => void;
    /** Réactions d'un message, déjà groupées par emoji. */
    onReactions: (messageId: string, reactions: ReactionMap) => void;
}

/** Ouverture d'une référence `#`/`!`/`&` cliquée dans un message. */
export type ReferenceTarget = { kind: 'thread' | 'task' | 'file' | 'folder'; id: string; spaceId?: string };

export interface MessageChannel {
    /** Identité de la conversation courante (id du thread, du ticket+canal…) ; null tant qu'aucune. */
    readonly id: Readonly<Ref<string | null>>;
    /** Clé AES-GCM courante du canal ; null tant qu'elle n'est pas disponible (saisie désactivée). */
    readonly encryptionKey: Readonly<Ref<CryptoKey | null>>;
    /** L'utilisateur peut écrire (sinon : pas de composer, cf. slot `read-only` de ChatTimeline). */
    readonly canWrite: Readonly<Ref<boolean>>;
    /** Conversation figée : messages affichés sans aucune action (ni réaction, ni réponse, ni profil). */
    readonly readOnly: Readonly<Ref<boolean>>;
    /** Peut supprimer les messages d'autrui (modération). */
    readonly canModerate: Readonly<Ref<boolean>>;
    /** Les messages sont chiffrés au format authentifié (AAD + signature, cf. messageAuth.ts) ; faux : format historique (support). */
    readonly authenticatedMessages?: boolean;

    /** Envoie un message ; résout avec le message confirmé par le serveur, rejette avec l'erreur. */
    send(msg: OutgoingMessage): Promise<Message>;
    /** Modifie le contenu (déjà chiffré) d'un message. */
    edit(id: string, content: string, iv: string, references: ExtractedReference[]): void;
    /** Supprime un message. */
    remove(id: string): void;
    /** Bascule une réaction ; résout avec un message d'erreur à afficher, ou null. */
    react(messageId: string, emoji: string): Promise<string | null>;
    /** Lie des fichiers déjà envoyés (cf. uploadContext) à un message existant. */
    attachFiles(messageId: string, files: any[]): void;
    /** Messages plus anciens que `before` (chiffrés, ordre quelconque). */
    loadMore(before: string): Promise<Message[]>;
    /** S'abonne aux événements temps réel ; renvoie la fonction de désabonnement. */
    subscribe(listeners: MessageChannelListeners): () => void;

    /** Contexte d'envoi des pièces jointes (clé qui les chiffre) ; null : pièces jointes impossibles. */
    readonly uploadContext: Readonly<Ref<UploadContext | null>>;

    canEdit(msg: Message): boolean;
    canDelete(msg: Message): boolean;

    /** Personnes citables, rendu et résolution des mentions. */
    readonly mentions: MentionSource;
    /** Références `#`/`!`/`&` (salons, tâches, fichiers) : cartes, clics et recherche. */
    readonly referencesEnabled: boolean;
    /** Ouvre une référence cliquée (seulement si referencesEnabled). */
    openReference?: (ref: ReferenceTarget) => void;
    /** Ouvre la carte de profil d'une personne ; absent : avatars et noms non cliquables. */
    openProfile?: (user: User, event: MouseEvent) => void;
    /** Statut de présence à jour d'un expéditeur (pastille sur l'avatar). */
    senderStatus(sender?: User | null): string | undefined;

    /** Indicateur de frappe ; absent : ni émission ni affichage (cas des threads). */
    readonly typing?: {
        /** Libellé à afficher (« X est en train d'écrire ») ; null quand personne n'écrit. */
        readonly label: Readonly<Ref<string | null>>;
        notify(isTyping: boolean): void;
    };
}

export const MESSAGE_CHANNEL_KEY: InjectionKey<MessageChannel> = Symbol('messageChannel');


// ── Règles partagées par les threads ─────────────────────────────────────

// Un message webhook n'a pas de senderId (aucun expéditeur humain) : la
// suppression reste possible pour le créateur du webhook via webhookCreatorId,
// mais l'édition ne l'est jamais (cf. canEdit).
const isThreadMessageOwner = (msg: Message): boolean => {
    if (msg.isWebhook) return msg.webhookCreatorId === user.value?.id;
    return msg.senderId === user.value?.id;
};

// msg.sender est une copie figée au moment de la réception du message : son
// data.status n'est jamais mis à jour par le socket `user-status-changed`
// (cf. OrgLayout.vue), contrairement à openedOrg.members qui lui est réactif.
const orgSenderStatus = (sender?: User | null): string | undefined => {
    if (!sender) return undefined;
    const m = openedOrg.value?.members?.find(mb => mb.userId === sender.id);
    return m?.user?.data?.status || sender.data?.status;
};

// Rôle d'org tel que lu historiquement par ThreadMessage pour la suppression
// d'un message d'autrui.
const orgCanModerate = computed(() => member.value?.role === 'ADMIN' || member.value?.role === 'admin');


export interface ThreadMessageChannelOptions {
    thread: Readonly<Ref<Thread | undefined>>;
    /** Espace du thread (undefined : salon d'organisation, route OrgThreadHome). */
    spaceId: () => string | undefined;
    encryptionKey: Readonly<Ref<CryptoKey | null>>;
    canWrite: Readonly<Ref<boolean>>;
    /** Socket déjà ouvert par la vue (ThreadView). */
    socket: Readonly<Ref<any>>;
}

/**
 * Canal d'un thread d'organisation : mêmes événements, charges utiles et
 * acks qu'avant l'extraction (send-message, edit-message, delete-message,
 * add-message-reaction, edit-message-files, load-more/more-messages).
 * À appeler dans le `setup()` de la vue (lit le routeur, pose des watchers).
 */
export const createThreadMessageChannel = (options: ThreadMessageChannelOptions): MessageChannel => {

    const router = useRouter();
    const { thread, spaceId, encryptionKey, canWrite, socket } = options;

    const threadId = computed(() => thread.value?.id ?? null);

    // "more-messages" ne porte pas d'identifiant de requête : les réponses
    // arrivent dans l'ordre des demandes (socket.io), d'où une file.
    const pendingLoadMore: Array<(msgs: Message[]) => void> = [];

    return {
        id: threadId,
        encryptionKey,
        canWrite,
        readOnly: ref(false),
        canModerate: orgCanModerate,
        authenticatedMessages: true,

        send: (msg) => new Promise((resolve, reject) => {
            if (!socket.value) return reject("Non connecté au serveur.");
            const payload = {
                threadId: thread.value?.id,
                content: msg.content,
                iv: msg.iv,
                replyToId: msg.replyToId,
                nonce: msg.nonce,
                context: spaceId() ? 'workspace' : 'home',
                references: msg.references,
            };
            socket.value.emit("send-message", payload, (response: any) => {
                if (response?.error) reject(response.error);
                else resolve(response);
            });
        }),

        edit: (id, content, iv, references) => {
            socket.value?.emit('edit-message', { id, content, iv, references });
        },

        remove: (id) => {
            socket.value?.emit('delete-message', id);
        },

        react: (messageId, emoji) => new Promise((resolve) => {
            if (!socket.value) return resolve(null);
            socket.value.emit('add-message-reaction', { messageId, emoji }, (response: any) => {
                resolve(response?.error ?? null);
            });
        }),

        attachFiles: (messageId, files) => {
            socket.value?.emit('edit-message-files', { id: messageId, files });
        },

        loadMore: (before) => new Promise((resolve) => {
            pendingLoadMore.push(resolve);
            socket.value?.emit("load-more", { threadId: thread.value?.id, before, lite: true });
        }),

        subscribe: (listeners) => {

            const onNew = (msg: Message) => {
                if (msg.threadId !== threadId.value) return;
                listeners.onNew(msg);
            };
            const onEdit = (msg: Message) => {
                if (msg.threadId !== threadId.value) return;
                listeners.onEdit(msg);
            };
            const onDelete = (msgId: string) => listeners.onDelete(msgId);
            // Un seul écouteur pour tout le salon, au lieu d'un par message.
            const onReactions = (data: { messageId: string; reactions: ReactionMap }) =>
                listeners.onReactions(data.messageId, data.reactions);
            const onMore = (more: Message[]) => pendingLoadMore.shift()?.(more);

            // On ne retire que NOS handlers, jamais l'événement entier.
            const detach = (sock: any) => {
                if (!sock) return;
                sock.off("new-message", onNew);
                sock.off("edit-message", onEdit);
                sock.off("delete-message", onDelete);
                sock.off("message-reaction-updated", onReactions);
                sock.off("more-messages", onMore);
            };

            // Le socket est obtenu de façon asynchrone par la vue (après le
            // montage de la timeline) : on s'accroche dès qu'il existe.
            const stop = watch(socket, (sock, previous) => {
                detach(previous);
                if (!sock) return;
                sock.on("new-message", onNew);
                sock.on("edit-message", onEdit);
                sock.on("delete-message", onDelete);
                sock.on("message-reaction-updated", onReactions);
                sock.on("more-messages", onMore);
            }, { immediate: true });

            return () => {
                stop();
                detach(socket.value);
                pendingLoadMore.length = 0;
            };
        },

        // Salon d'espace : clé de l'espace ; salon d'organisation : clé du
        // salon (mêmes destinataires que ses messages).
        uploadContext: computed<UploadContext | null>(() => {
            const sid = spaceId();
            if (sid) return { workspaceId: sid };
            return thread.value ? { threadId: thread.value.id } : null;
        }),

        canEdit: (msg) => msg.senderId == user.value?.id,
        canDelete: isThreadMessageOwner,

        mentions: createOrgMentionSource(),
        referencesEnabled: true,
        openReference: (target) => navigateToReference(router, target),
        openProfile: (u, e) => openProfile(u, e),
        senderStatus: orgSenderStatus,
    };

};


/**
 * Repli d'un ThreadMessage monté hors de toute conversation : aujourd'hui
 * seulement les aperçus en lecture seule de l'assistant IA (OrgAI,
 * ToolResultBody), qui affichent un résultat de recherche de l'organisation.
 * Rendu identique (mentions/profils/références de l'org ouverte), mais
 * aucune écriture : un message éditable hors conversation serait un bug, on
 * le signale en dev plutôt que d'émettre sur un salon deviné.
 */
export const createOrgPreviewChannel = (): MessageChannel => {

    const router = useRouter();

    const refuse = (action: string) => {
        if (import.meta.env.DEV) console.error(`[MessageChannel] ${action} sans canal fourni (provide MESSAGE_CHANNEL_KEY) : ignoré.`);
    };

    return {
        id: ref(null),
        encryptionKey: ref(null),
        canWrite: ref(false),
        readOnly: ref(true),
        canModerate: ref(false),
        send: () => { refuse('send'); return Promise.reject('Aucune conversation.'); },
        edit: () => refuse('edit'),
        remove: () => refuse('remove'),
        react: () => { refuse('react'); return Promise.resolve(null); },
        attachFiles: () => refuse('attachFiles'),
        loadMore: () => Promise.resolve([]),
        subscribe: () => () => {},
        uploadContext: ref(null),
        canEdit: () => false,
        canDelete: () => false,
        // Rendu seul : pas d'entrées ni de recherche (aucun champ de saisie
        // n'est ouvert depuis un aperçu).
        mentions: { ...orgMentionRenderSource, entries: ref([]) },
        referencesEnabled: true,
        openReference: (target) => navigateToReference(router, target),
        openProfile: (u, e) => openProfile(u, e),
        senderStatus: orgSenderStatus,
    };

};

/**
 * Canal de la conversation englobante. Sans fournisseur, repli explicite sur
 * l'aperçu en lecture seule de l'organisation (cf. createOrgPreviewChannel).
 * À appeler dans un `setup()`.
 */
export const useMessageChannel = (): MessageChannel =>
    inject(MESSAGE_CHANNEL_KEY, null) ?? createOrgPreviewChannel();
