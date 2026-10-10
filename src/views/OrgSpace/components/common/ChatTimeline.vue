<template>

    <!-- Fil d'une conversation (thread, ticket de support…) : liste des
         messages, empilement, scroll, « charger plus », bandeau de réponse,
         pièces jointes et composer. Tout ce qui varie d'une conversation à
         l'autre passe par le MessageChannel reçu en prop (et fourni au
         sous-arbre) ; le reste (en-tête, bannières) par des slots. Aucun
         état global : deux instances peuvent cohabiter. -->

    <main
        ref="messagesContainer"
        @scroll="handleScroll"
        @media-loaded="onMediaLoaded"
        class="flex-1 overflow-y-auto px-4 w-full h-full"
        :style="{ marginBottom: footerHeight + 'px' }"
    >

        <div v-if="!unavailable" class="flex flex-col justify-end min-h-full w-full">

            <slot name="header" />

            <div class="w-full overflow-hidden">

                <div v-if="isFetchingMore" class="flex justify-center py-4">
                    <SpinLoader />
                </div>

                <template v-if="loading">

                    <div
                        v-for="i in 10"
                        :key="i"
                        class="flex gap-3 px-4 py-1 animate-pulse"
                    >

                        <div class="bg-(--text)/5 rounded-full w-9 h-9 shrink-0" />

                        <div class="space-y-2 flex-1">
                            <div class="bg-(--text)/5 w-24 h-3 rounded" />
                            <div class="bg-(--text)/5 w-full h-4 rounded" />
                        </div>

                    </div>

                </template>

                <div v-else class=" py-6 flex flex-col">

                    <slot v-if="messages.length === 0" name="empty" />

                    <div
                            v-for="(msg, index) in messages"
                            :key="msg.id"
                            :id="'msg-' + msg.id"
                    >
                        <div v-if="unreadAfterId === msg.id" class="flex items-center gap-4 my-6">
                            <div class="h-px flex-1 bg-red-500/50"></div>
                            <span class="text-xs font-bold text-red-500 uppercase tracking-widest">Nouveaux messages</span>
                            <div class="h-px flex-1 bg-red-500/50"></div>
                        </div>
                        <ThreadMessage
                            :msg="msg"
                            :selectedMessage="selectedMessageId"
                            :is-stacked="index > 0 && sameAuthor(messages[index-1]!, msg) && !msg.replyToId && (new Date(msg.createdAt).getTime() - new Date(messages[index-1]!.createdAt).getTime() < 60000)"
                            :is-editing="editingMessageId === msg.id"
                            @edit-start="editingMessageId = msg.id"
                            @edit-end="endEdit"
                            @jump-to="(id: string) => emit('jump-to', id)"
                        />
                    </div>

                </div>

            </div>

        </div>

        <!-- Conversation introuvable ou inaccessible. La timeline reste
             montée (état et abonnements conservés) si elle réapparaît. -->
        <slot v-else name="unavailable" />

    </main>

    <footer v-if="!unavailable" ref="footerRef" class="absolute bottom-0 inset-x-0 z-[110] p-1 bg-transparent mt-auto">

        <div v-if="channel.typing?.label.value" class="h-5 flex justify-start items-center px-4 gap-2 select-none">
            <TypingIndicator />
            <p class="text-[11px] text-(--text2) italic">
                {{ channel.typing.label.value }}
            </p>
        </div>

        <transition name="fade-bottom">

            <ReplyBanner
                v-if="messageWillBeResponded"
                :msg="messageWillBeResponded"
                @cancel="cancelReply"
            />

        </transition>

        <transition name="fade-bottom">

            <div
                v-if="selectedFiles.length > 0"
                class="z-50 flex flex-wrap gap-2 mb-2 p-2 bg-(--bg)/80 backdrop-blur-3xl rounded-lg border border-(--border-color) relative overflow-hidden"
            >

                <div v-if="fileSendProgress !== null" class="absolute inset-0 bg-(--bg)/40 z-10 pointer-events-none" />

                <div
                    v-for="(file, index) in selectedFiles"
                    :key="index"
                    class="relative group bg-(--bg) border border-(--text)/10 rounded-md px-3 py-1 flex items-center gap-2 overflow-hidden max-w-full min-w-0"
                >

                    <div
                        v-if="fileSendProgress !== null"
                        class="absolute bottom-0 left-0 h-0.5 bg-(--primary) transition-all duration-300"
                        :style="{ width: (fileProgress[index] ?? 0) + '%' }"
                    />

                    <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-(--bg) border border-(--text)/5">

                        <i class="bi text-xl" :class="[ getSelectedFileInfo(file).color, getSelectedFileInfo(file).icon ]" />

                    </div>

                    <span class="text-xs truncate max-w-50">{{ file.name }}</span>
                    <span v-if="fileSendProgress !== null" class="text-[10px] tabular-nums text-(--text2) shrink-0 w-8 text-right">
                        <i v-if="(fileProgress[index] ?? 0) >= 100" class="bi bi-check-lg text-(--primary)" />
                        <template v-else>{{ fileProgress[index] ?? 0 }}%</template>
                    </span>

                    <button
                        v-if="fileSendProgress === null"
                        @click="removeFile(index)"
                        class="text-red-400 hover:text-red-500"
                    >
                        <i class="bi bi-x-circle-fill" />
                    </button>

                </div>

            </div>

        </transition>

        <div
            v-if="channel.canWrite.value"
            class="relative flex flex-col w-full"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
        >

            <div
                v-if="isDragging"
                class="
                    absolute inset-0 z-50 bg-(--primary)/10
                     border-2 border-dashed border-(--primary)
                     rounded-xl flex items-center justify-center
                     pointer-events-none
                "
            >
                <span class="text-(--primary) font-bold">
                    Relâchez pour ajouter
                </span>
            </div>

            <!-- Bannières propres à la conversation (ex. clé du salon
                 remplacée, audit FC4), juste au-dessus de la saisie. -->
            <slot name="composer-top" />

            <div class="relative flex items-center bg-(--bg) border border-(--text)/10 rounded-xl px-4 py-2 focus-within:border-(--primary)/50 transition-all shadow-2xl">

                <input
                    type="file"
                    multiple
                    ref="fileInputRef"
                    class="hidden"
                    @change="(e) => handleFiles((e.target as HTMLInputElement).files)"
                />

                <button
                    @click="triggerFileSearch"
                    class="mr-3 text-(--text2) hover:text-(--primary) transition-colors"
                >
                    <i class="bi bi-plus-circle-fill text-xl" />
                </button>

                <ThreadTextarea
                    v-model="newMessage"
                    @send="sendMessage"
                    @edit-last="editLastOwnMessage"
                    @input="handleTyping"
                    :placeholder="placeholder"
                    :disabled="!channel.encryptionKey.value"
                    ref="TextareaRef"
                />

                <div class="flex gap-3 ml-3">
                    <button
                        ref="emojiButtonRef"
                        @click="showEmojiPicker = !showEmojiPicker"
                        class="text-(--text2) hover:text-(--primary) transition-colors"
                        title="Ajouter un emoji"
                    >
                        <i class="bi bi-emoji-smile-fill text-xl" />
                    </button>

                    <button
                        @click="sendMessage"
                        :disabled="(!newMessage.trim() && selectedFiles.length === 0) || !channel.encryptionKey.value || fileSendProgress !== null"
                        :class="(newMessage.trim() || selectedFiles.length > 0) && channel.encryptionKey.value ? 'text-(--primary)' : 'text-(--text2) opacity-50'"
                        class="transition-colors"
                    >
                        <i v-if="fileSendProgress !== null" class="bi bi-arrow-repeat animate-spin" />
                        <i v-else class="bi bi-send-fill" />
                    </button>

                </div>

                <div
                    v-if="showEmojiPicker"
                    ref="emojiPickerRef"
                    class="absolute bottom-full right-0 mb-2 z-50 emoji-picker-container"
                    @click.stop
                >
                    <EmojiPicker @select="insertEmoji" />
                </div>

            </div>

        </div>

        <!-- Pas le droit d'écrire : rien par défaut (comportement historique
             des threads), un bandeau si la conversation en fournit un. -->
        <slot v-else name="read-only" />

    </footer>

</template>

<script lang="ts" setup>

import { ref, onMounted, onUnmounted, watch, nextTick, provide } from 'vue';
import type { Message } from '@/types/types';
import { user } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import { encryptMessageWithContentKey } from '@/assets/utils/crypto';
import { decryptMessages, decryptEditedMessage } from '@/assets/utils/decryptMessages';
import { uploadFiles } from '@/assets/uploadFile';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { extractReferenceTokens } from '@/composables/useReferences';
import { provideResponse } from '@/composables/useResponse';
import useFooterInset from '@/composables/useFooterInset';
import { MESSAGE_CHANNEL_KEY, type MessageChannel } from '@/composables/messageChannel';
import { MENTION_SOURCE_KEY } from '@/composables/mentionSource';
import SpinLoader from '@/components/SpinLoader.vue';
import EmojiPicker from '@/components/common/EmojiPicker.vue';
import TypingIndicator from '@/components/common/TypingIndicator.vue';
import ThreadMessage from './ThreadMessage.vue';
import ThreadTextarea from './ThreadTextarea.vue';
import ReplyBanner from './ReplyBanner.vue';

const props = withDefaults(defineProps<{
    channel: MessageChannel;
    /** Conversation introuvable : slot `unavailable` à la place du fil, pas de footer. */
    unavailable?: boolean;
    /** Squelette de chargement à la place des messages (historique en cours). */
    loading?: boolean;
    placeholder?: string;
    /** Message mis en évidence (ex. ?select= d'un lien). */
    selectedMessageId?: string | null;
    /** Séparateur « Nouveaux messages » affiché avant le message suivant celui-ci. */
    unreadAfterId?: string | null;
    /**
     * Collage de fichiers : 'window' les prend où que soit le focus
     * (comportement historique d'un thread seul à l'écran) ; 'local'
     * seulement quand le collage vise cette timeline (plusieurs timelines
     * à l'écran).
     */
    pasteScope?: 'window' | 'local';
    maxFiles?: number;
    maxFileSizeBytes?: number;
}>(), {
    unavailable: false,
    loading: false,
    placeholder: 'Envoyer un message...',
    selectedMessageId: null,
    unreadAfterId: null,
    pasteScope: 'window',
    maxFiles: 10,
    maxFileSizeBytes: 10 * 1024 * 1024 * 1024,
});

const emit = defineEmits<{
    /** Message reçu en direct, déchiffré (`raw` : tel que reçu). */
    (e: 'message-received', msg: Message, raw: Message): void;
    /** Message envoyé et confirmé par le serveur, avec le texte clair et les fichiers joints. */
    (e: 'message-sent', payload: { message: Message; text: string; files: File[] }): void;
    /** L'utilisateur voit le bas de la conversation : `lastMessageId` est lu. */
    (e: 'read', lastMessageId: string): void;
    /** Clic sur un message cité : aller à ce message. */
    (e: 'jump-to', messageId: string): void;
}>();

const toast = useToast();

// Le canal, la source de mentions et la réponse en cours sont propres à
// cette timeline et à ses messages (pas d'état partagé entre deux timelines).
provide(MESSAGE_CHANNEL_KEY, props.channel);
provide(MENTION_SOURCE_KEY, props.channel.mentions);
const { messageWillBeResponded, setMessageWillBeResponded } = provideResponse();

const PAGE_SIZE = 20;

const messages = ref<Message[]>([]);
const hasMore = ref<boolean>(true);
const isFetchingMore = ref<boolean>(false);
const editingMessageId = ref<string | null>(null);

const selectedFiles = ref<File[]>([]);
const fileSendProgress = ref<null | number>(null);
// Progression de chaque fichier en cours d'envoi (même index que selectedFiles).
const fileProgress = ref<number[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const TextareaRef = ref<InstanceType<typeof ThreadTextarea> | null>(null);
const newMessage = ref<string>("");
const messagesContainer = ref<HTMLElement | null>(null);
const footerRef = ref<HTMLElement | null>(null);
const emojiPickerRef = ref<HTMLElement | null>(null);
const emojiButtonRef = ref<HTMLElement | null>(null);
const { footerHeight } = useFooterInset(footerRef, messagesContainer, 56);
const showEmojiPicker = ref<boolean>(false);

// Incrémenté à chaque remplacement de la liste (reset, nouvel historique) :
// une réponse « charger plus » partie avant appartient à l'ancienne liste et
// est ignorée.
let generation = 0;

const lastMessageId = () => messages.value[messages.value.length - 1]?.id;

const emitRead = () => {
    const id = lastMessageId();
    if (id) emit('read', id);
};

// Un message webhook n'a pas de senderId (jamais d'expéditeur humain) : deux
// messages webhook consécutifs comparent donc toujours senderId=null à
// senderId=null. On compare webhookId dans ce cas pour ne pas regrouper deux
// bots différents comme s'ils étaient le même expéditeur.
const sameAuthor = (a: Message, b: Message): boolean => {
    if (a.isWebhook || b.isWebhook) return a.isWebhook === b.isWebhook && a.webhookId === b.webhookId;
    return a.senderId === b.senderId;
};

const editLastOwnMessage = () => {
    const last = [...messages.value].reverse().find(m => m.senderId === user.value?.id);
    if (!last) return;
    editingMessageId.value = last.id;
    nextTick(() => {
        document.getElementById('msg-' + last.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
};

const endEdit = () => {
    editingMessageId.value = null;
    nextTick(() => {
        TextareaRef.value?.textarea?.focus();
    });
};

// ── Pièces jointes ──────────────────────────────────────────────────────

const triggerFileSearch = () => fileInputRef.value?.click();

const handleFiles = (filesList: FileList | File[] | null) => {

    if (!filesList) return;
    isDragging.value = false;
    const newFiles = Array.from(filesList);
    const LIMIT = props.maxFiles;
    const MAX_SIZE_BYTES = props.maxFileSizeBytes;

    if (selectedFiles.value.length >= LIMIT)
    {
        return toast.show(`Limite de ${LIMIT} fichiers atteinte.`, 'warning');
    }

    const availableSlots = LIMIT - selectedFiles.value.length;

    if (newFiles.length > availableSlots)
    {
        const filesToAdd = newFiles.slice(0, availableSlots);
        selectedFiles.value.push(...filesToAdd);

        return toast.show(
            `Seuls les ${availableSlots} premiers fichiers ont été ajoutés (max ${LIMIT}).`,
            'warning'
        );
    }

    const validFiles = newFiles.filter(file => {
        if (file.size > MAX_SIZE_BYTES) {
            toast.show(`Le fichier ${file.name} est trop lourd (max ${formatSize(MAX_SIZE_BYTES)})`, 'error');
            return false;
        }
        return true;
    });

    selectedFiles.value.push(...validFiles);

};

// « 10Go », « 25Mo » : même libellé que l'ancienne limite fixe des threads.
const formatSize = (bytes: number) => {
    const GB = 1024 * 1024 * 1024;
    const MB = 1024 * 1024;
    if (bytes >= GB && bytes % GB === 0) return `${bytes / GB}Go`;
    return `${Math.round(bytes / MB)}Mo`;
};

const handlePaste = (e: ClipboardEvent) => {
    // Plusieurs timelines à l'écran : seule celle qui reçoit le collage le prend.
    if (props.pasteScope === 'local' && !footerRef.value?.contains(e.target as Node)) return;
    // Pas de composer (lecture seule) : rien où ajouter ces fichiers.
    if (props.pasteScope === 'local' && !props.channel.canWrite.value) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items)
    {
        if (item.kind === 'file')
        {
            const file = item.getAsFile();
            if (file) handleFiles([file]);
        }
    }
};

const isDragging = ref<boolean>(false);
const handleDrop = (e: DragEvent) => {
    isDragging.value = false;
    if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
};

const removeFile = (index: number) => {
    selectedFiles.value.splice(index, 1);
};

// getFileInfo expects a StoredFile (originalName/mimeType) — the preview
// chips render raw File objects (name/type) before upload, so adapt here
// rather than changing the shared util every other caller relies on.
const getSelectedFileInfo = (file: File) => getFileInfo({ originalName: file.name, mimeType: file.type });

// ── Scroll ──────────────────────────────────────────────────────────────

// Vrai tant que l'utilisateur est (presque) en bas du fil. Une pièce jointe
// média qui finit de se charger agrandit son message (MessageMedia émet
// l'événement DOM `media-loaded`) : on se recolle alors en bas au lieu de
// laisser le dernier message glisser hors de l'écran.
let stickToBottom = true;

const onMediaLoaded = () => {
    if (stickToBottom) scrollToBottom(true);
};

const handleScroll = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el.scrollTop < 200 && !isFetchingMore.value && hasMore.value) loadMore();

    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 10;
    stickToBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 120;
    if (isAtBottom) emitRead();
};

const scrollToBottom = async (instant = false) => {
    await nextTick();
    if (messagesContainer.value)
    {
        messagesContainer.value.scrollTo({ top: messagesContainer.value.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
    }
};

const scrollToMessage = async (id: string) => {
    await nextTick();
    const targetEl = document.getElementById(`msg-${id}`);
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const loadMore = async () => {

    const conversation = props.channel.id.value;
    const before = messages.value[0]?.id;
    if (!before || isFetchingMore.value || !conversation) return;
    isFetchingMore.value = true;

    const gen = generation;
    const more = await props.channel.loadMore(before);

    // Réponse à un « charger plus » d'une conversation quittée (ou d'une
    // liste remplacée) depuis.
    if (gen !== generation || conversation !== props.channel.id.value) { isFetchingMore.value = false; return; }

    if (more.length === 0) { hasMore.value = false; isFetchingMore.value = false; return; }
    if (more.length < PAGE_SIZE) hasMore.value = false;

    const decryptedMore = await decryptMessages(more, props.channel.encryptionKey.value);
    if (gen !== generation) { isFetchingMore.value = false; return; }

    const container = messagesContainer.value;
    const scrollOffset = container ? container.scrollHeight - container.scrollTop : 0;

    messages.value = [...decryptedMore, ...messages.value];

    await nextTick();
    if (container) container.scrollTop = container.scrollHeight - scrollOffset;
    setTimeout(() => { isFetchingMore.value = false; }, 100);

};

// ── Temps réel ──────────────────────────────────────────────────────────

let unsubscribe: (() => void) | null = null;

const subscribe = () => props.channel.subscribe({

    onNew: async (msg) => {
        const conversation = props.channel.id.value;

        // Même déchiffrement que l'historique, pour qu'un message poussé en
        // direct ait aussi ses replyMessage/transferMessage déchiffrés — sans
        // ça l'encart de citation d'une réponse affichait le texte chiffré
        // jusqu'au prochain rechargement complet.
        const decrypted = (await decryptMessages([msg], props.channel.encryptionKey.value))[0] ?? msg;
        if (conversation !== props.channel.id.value) return;
        messages.value.push(decrypted);

        const container = messagesContainer.value;
        if (container)
        {
            const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 200;
            if (isNearBottom) {
                scrollToBottom();
                setTimeout(() => { emitRead(); }, 100);
            }
        }

        emit('message-received', decrypted, msg);
    },

    onEdit: async (editedMsg) => {
        const updatedMsg = await decryptEditedMessage(
            editedMsg,
            props.channel.encryptionKey.value,
            () => messages.value.find(m => m.id === editedMsg.id)
        );
        messages.value = messages.value.map(m => m.id === editedMsg.id ? updatedMsg : m);
    },

    onDelete: (msgId) => {
        messages.value = messages.value.filter(m => m.id !== msgId);
    },

    onReactions: (messageId, reactions) => {
        const msg = messages.value.find(m => m.id === messageId);
        if (msg) msg.reactions = reactions;
    },

});

// ── Envoi ───────────────────────────────────────────────────────────────

const sendMessage = async () => {

    const key = props.channel.encryptionKey.value;
    if ((!newMessage.value.trim() && selectedFiles.value.length === 0) || !key) return;

    try {

        let uploadedFiles: any[] = [];

        if (selectedFiles.value.length) {
            const context = props.channel.uploadContext.value;
            if (!context) throw new Error("Pièces jointes indisponibles pour cette conversation.");
            fileSendProgress.value = 0;
            fileProgress.value = selectedFiles.value.map(() => 0);
            uploadedFiles = await uploadFiles(
                selectedFiles.value,
                context,
                (percent: number) => { fileSendProgress.value = percent; },
                (index: number, percent: number) => { fileProgress.value[index] = percent; }
            );
        }

        const { ciphertext, iv } = await encryptMessageWithContentKey(newMessage.value, key);

        const confirmedMessage = await props.channel.send({
            content: ciphertext,
            iv: iv,
            replyToId: messageWillBeResponded.value?.id,
            nonce: "n_" + Date.now(),
            references: extractReferenceTokens(newMessage.value),
        });

        if (confirmedMessage && confirmedMessage.id) {
            emit('message-sent', { message: confirmedMessage, text: newMessage.value, files: [...selectedFiles.value] });
        }

        const sentId = confirmedMessage.id;

        setMessageWillBeResponded(null);
        newMessage.value = "";
        stopTyping();
        scrollToBottom();

        if (uploadedFiles.length) {
            props.channel.attachFiles(sentId, uploadedFiles);
        }

        selectedFiles.value = [];
        fileSendProgress.value = null;

    } catch (err) {
        console.error("Erreur lors de l'envoi du message :", err);
        toast.show('Une erreur est survenue lors de l\'envoi du message.', 'error');
        fileSendProgress.value = null;
    }

};

// ── Frappe (seulement si le canal la gère) ──────────────────────────────

// Une émission par TYPING_EMIT_INTERVAL_MS tant que l'utilisateur tape, et
// « false » une seule fois quand il s'arrête (cf. ChatView.vue).
const TYPING_EMIT_INTERVAL_MS = 2500;
let lastTypingEmit = 0;
let typingTimeout: ReturnType<typeof setTimeout> | undefined;

const handleTyping = () => {
    const typing = props.channel.typing;
    if (!typing) return;
    const now = Date.now();
    if (now - lastTypingEmit >= TYPING_EMIT_INTERVAL_MS) {
        lastTypingEmit = now;
        typing.notify(true);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 3000);
};

const stopTyping = () => {
    clearTimeout(typingTimeout);
    if (!lastTypingEmit || !props.channel.typing) return;
    lastTypingEmit = 0;
    props.channel.typing.notify(false);
};

// ── Composer ────────────────────────────────────────────────────────────

const cancelReply = () => {
    setMessageWillBeResponded(null);
};

const insertEmoji = (emoji: string) => {
  const textarea = TextareaRef.value?.textarea;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const newValue = newMessage.value.slice(0, start) + emoji + newMessage.value.slice(end);

  newMessage.value = newValue;
  showEmojiPicker.value = false;

  nextTick(() => {
    textarea.focus();
    textarea.selectionStart = start + emoji.length;
    textarea.selectionEnd = start + emoji.length;
  });
};

// Fermer le picker si on clique en dehors (de CE picker et de CE bouton :
// une autre timeline à l'écran a les siens).
const closeEmojiPickerOnOutsideClick = (event: MouseEvent) => {
  const target = event.target as Node;
  if (emojiPickerRef.value?.contains(target) || emojiButtonRef.value?.contains(target)) return;
  showEmojiPicker.value = false;
};

watch(() => messageWillBeResponded.value, () => {
    TextareaRef.value?.textarea?.focus();
});

onMounted(() => {
    unsubscribe = subscribe();
    window.addEventListener('paste', handlePaste);
    document.addEventListener('click', closeEmojiPickerOnOutsideClick);
});

onUnmounted(() => {
    // Abandonne un « charger plus » encore en cours.
    generation++;
    unsubscribe?.();
    stopTyping();
    window.removeEventListener('paste', handlePaste);
    document.removeEventListener('click', closeEmojiPickerOnOutsideClick);
});

defineExpose({
    /** Messages affichés (déchiffrés, triés). */
    messages,
    /** Vide la liste avant le chargement d'une autre conversation. */
    reset: () => {
        generation++;
        messages.value = [];
        isFetchingMore.value = false;
        stickToBottom = true;
    },
    /** Remplace la liste par un historique déjà déchiffré. */
    setMessages: (list: Message[], more: boolean) => {
        generation++;
        messages.value = list;
        hasMore.value = more;
    },
    scrollToBottom,
    scrollToMessage,
    focusComposer: () => TextareaRef.value?.textarea?.focus(),
    lastMessageId,
});

</script>
