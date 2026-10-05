<template>

                <div
                    :key="msg.id" 
                    class="group relative px-4 flex flex-col justify-start items-start rounded-lg transition-colors w-full"
                    :class="[
                        isStacked ? 'mt-1' : 'mt-6',
                        selectedMessage == msg.id ? ' border border-(--primary) border-dashed animate-pulse' : '',
                        user?.id == msg.replyMessage?.senderId || isTagMe
                            ? 'border-l-2 border-(--primary-dark) bg-(--primary-dark)/30 hover:bg-(--primary-dark)/50' 
                            : 'hover:bg-(--text)/5',
                        showReactionPicker ? 'z-100' : 'z-10',
                        showActionSheet ? 'bg-(--text)/10' : ''
                    ]"
                    @touchstart.passive="longPress.onTouchstart"
                    @touchmove.passive="longPress.onTouchmove"
                    @touchend="longPress.onTouchend"
                    @touchcancel="longPress.onTouchend"
                    @contextmenu="longPress.onContextmenu"
                    @mouseenter="hovered = true"
                    @mouseleave="hovered = false"
                >

                    <!-- Espacement entre messages : en marge (`mt-*`), jamais
                         en padding. Ce conteneur porte le fond coloré d'une
                         mention, d'une réponse ou du survol : un écart mis en
                         padding serait peint avec, et le bloc coloré traînerait
                         sous son propre texte. En marge il reste dehors — le
                         fond épouse le message, l'air le sépare des voisins.
                         `mt-1` entre messages empilés (même auteur à moins
                         d'une minute), `mt-6` entre deux blocs d'auteurs. -->

                    <div 
                        v-if="msg.replyToId && msg.replyMessage" 
                        @click="router.push({ query: { ...route.query, select: msg.replyMessage?.id } })"
                        class="group/reply reply-context flex items-center gap-2 mb-1 text-xs text-(--text2) relative pl-13 cursor-pointer"
                    >
                        
                        <div class="z-10 absolute left-4 top-2.5 w-7 h-13 border-l-2 border-t-2 border-(--text)/20 group-hover/reply:border-(--text)/40 rounded-tl-md"></div>

                        <img
                            v-if="msg.replyMessage?.isWebhook"
                            :src="msg.replyMessage?.webhookAvatar || defaultAvatar(msg.replyMessage?.webhookName || 'Webhook', '#7c3aed')"
                            :alt="msg.replyMessage?.webhookName || 'Webhook'"
                            @error="(e: any) => e.target.src = defaultAvatar(msg.replyMessage?.webhookName || 'Webhook', '#7c3aed')"
                            class="w-4 h-4 rounded-full opacity-80 shrink-0"
                        />
                        <img
                            v-else
                            :src="msg.replyMessage?.sender?.avatarUrl || defaultAvatar($p(msg.replyMessage?.sender?.name))"
                            :alt="$p(msg.replyMessage?.sender?.name)"
                            @error="(e: any) => e.target.src = defaultAvatar($p(msg.replyMessage?.sender?.name))"
                            class="w-4 h-4 rounded-full opacity-80 shrink-0"
                        />

                        <span v-if="msg.replyMessage?.isWebhook" class="font-semibold text-(--primary)/80 ">
                            @{{ msg.replyMessage?.webhookName || 'Webhook' }}
                        </span>
                        <span v-else class="font-semibold text-(--primary)/80 ">
                            @{{ $p(msg.replyMessage?.sender?.name) || 'Anonyme' }}
                        </span>

                        <div class="max-w-md opacity-70 pointer-events-none text-[11px] line-clamp-1 [&_p]:inline [&_h1]:inline [&_h2]:inline [&_h3]:inline">
                            <MarkdownRender :content="msg.replyMessage?.content || ''" :show-reference-cards="false" />
                        </div>

                    </div>

                    <!-- Montée seulement au survol : chaque bouton porte un
                         v-tooltip, et floating-vue monte un composant Popper
                         complet par tooltip dès le montage du bouton (cf. le
                         même correctif dans ChatMessage.vue). -->
                    <div
                        v-if="hovered || showPlusDropdown"
                        class="
                            absolute -top-5 right-3 sdropdown
                            flex-raw items-start z-80
                            rounded-xl border border-(--text)/10
                            bg-(--bg) shadow-xl ring-1 ring-(--text)/5 focus:outline-none
                        "
                        :class="(showPlusDropdown ? 'flex' : 'hidden group-hover:flex') + (isReadOnly ? ' !hidden' : '')"
                    >

                        <button
                            v-for="(btn, index) in dropdownBtns"
                            v-show="btn.show(msg)"
                            :key="'dropdownBtns-' + index"
                            v-tooltip="btn.tooltip" 
                            class="dropdown-item-annimate dropdown-item-style"
                            :class="btn.class"
                            @click="btn.func(msg, $event)"
                        >
                            <i :key="btn.icon" class="bi text-lg" :class="btn.icon" />
                        </button>

                        <!-- <button @click="showPlusDropdown = !showPlusDropdown" class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-three-dots text-lg" />
                        </button> -->

                        <div 
                            v-if="showPlusDropdown"
                            class="
                                flex flex-col items-start absolute top-full mt-2 right-0
                                rounded-xl border border-(--text)/10 sdropdown w-56 z-90
                                bg-(--bg) shadow-xl ring-1 ring-(--text)/5 focus:outline-none
                            "
                        >

                            <button
                                v-if="isMessageOwner(msg) || member?.role === 'ADMIN' || member?.role === 'admin'"
                                @click="openDeleteConfirm"
                                class="dropdown-item-annimate dropdown-item-style  text-red-400! hover:bg-red-500/10!"
                            >
                                Supprimer le message
                            </button>
                        
                        </div>
                    
                    </div>
                    
                    <!-- Emoji reaction picker dropdown - REMOVED: using MessageReactions component instead -->

                    <div class="z-20 flex justify-start items-start gap-3 min-w-0 w-full">

                        <img 
                            v-if="msg.isWebhook && !isStacked"
                            :src="msg.webhookAvatar || defaultAvatar(msg.webhookName || 'Webhook', '#7c3aed')"
                            :alt="msg.webhookName || 'Webhook'"
                            @error="(e: any) => e.target.src = defaultAvatar(msg.webhookName || 'Webhook', '#7c3aed')"
                            class="rounded-full w-9 h-9 object-cover shrink-0 cursor-default"
                        />
                        <img 
                            v-else-if="msg.sender && !isStacked"
                            :src="msg.sender?.avatarUrl || defaultAvatar($p(msg.sender?.name))"
                            :alt="$p(msg.sender?.name)"
                            @error="(e: any) => e.target.src = defaultAvatar($p(msg.sender?.name))"
                            @click.stop="(e) => !isReadOnly && msg.sender && openProfile(msg.sender, e)"
                            class="rounded-full w-9 h-9 object-cover shrink-0"
                            :class="!isReadOnly ? 'cursor-pointer hover:ring-2 hover:ring-(--primary)/50 transition-all' : ''"
                        />
                        <div 
                            v-else-if="isStacked"
                            class="w-9 shrink-0 flex items-start justify-center opacity-0 group-hover:opacity-100 transition-opacity select-none"
                        >
                            <!-- Pas de `h-9` ici : cette gouttière ne fait que
                                 réserver la colonne de l'avatar (w-9) et
                                 montrer l'heure au survol. Lui fixer 36px de
                                 haut imposait cette hauteur à toute la ligne
                                 flex, alors qu'un message empilé d'une seule
                                 ligne en fait ~23 — d'où un vide sous le
                                 texte, bien visible dans le fond coloré d'une
                                 mention. La hauteur vient du contenu. -->
                            <span class="text-[10px] text-(--text2) font-medium text-center mt-1.5">{{ formatTimeOnly(msg.createdAt as any) }}</span>
                        </div>

                        <div class="min-w-0 flex-1">

                            <div v-if="!isStacked" class="flex items-baseline gap-2 mb-0.5">

                                <span 
                                    v-if="msg.isWebhook"
                                    class="text-(--text) font-bold text-xs tracking-tighter truncate"
                                >
                                    {{ msg.webhookName || 'Webhook' }}
                                    <span class="ml-1 bg-(--primary) text-white text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider inline-flex items-center">
                                        <i class="bi bi-robot mr-1 text-[8px]"></i> BOT
                                    </span>
                                    <!-- Contenu de webhook : en clair, non authentifié (audit FC7) -->
                                    <span
                                        class="ml-1 inline-flex items-center gap-1 text-[9px] font-semibold text-amber-500"
                                        title="Message de webhook : non chiffré de bout en bout, son contenu est visible par le serveur."
                                    >
                                        <i class="bi bi-unlock-fill" /> Non chiffré
                                    </span>
                                </span>
                                <span 
                                    v-else
                                    class="text-(--text) font-bold text-xs tracking-tighter truncate"
                                    :class="!isReadOnly ? 'cursor-pointer hover:underline' : ''"
                                    @click.stop="(e) => !isReadOnly && msg.sender && openProfile(msg.sender, e)"
                                >
                                    {{ $p(msg.sender?.name) || 'Anonyme' }}
                                </span>

                                <span class="text-(--text2) text-[10px] whitespace-nowrap">
                                    {{ formatTime(msg.createdAt as any) }}
                                </span>

                            </div>

                            <div v-if="isEditing" class="w-full" @keydown.esc.prevent="cancelEdit">
                                <ThreadTextarea
                                    ref="editTextareaRef"
                                    :model-value="editContent"
                                    @update:model-value="editContent = $event"
                                    @send="saveEdit"
                                    class="w-full bg-(--bg) border border-(--primary)/60 rounded-lg px-2 outline-none focus-within:border-(--primary)"
                                />
                                <p class="text-[10px] text-(--text2) mt-1">
                                    échap pour annuler • entrée pour enregistrer
                                </p>
                            </div>
                            <div v-else class="text-(--text) text-sm leading-relaxed wrap-break-word">
                                <MarkdownRender
                                    :content="msg.content"
                                    @user-click="(u: User, e: MouseEvent) => openProfile(u, e)"
                                    @reference-click="onReferenceClick"
                                />
                                <WebhookEmbed v-if="msg.isWebhook && msg.embeds && msg.embeds.length > 0" :embeds="msg.embeds" />
                                <span v-if="msg.edited" class="text-[10px] text-(--text2)"> (modifié)</span>
                            </div>
                            
                            <!-- Message reactions -->
                            <MessageReactions
                                ref="reactionsRef"
                                v-if="!isReadOnly || (msg.reactions && Object.keys(msg.reactions).length > 0)"
                                :message-id="msg.id"
                                :reactions="(msg.reactions as any)"
                                :is-dm="false"
                                @reaction-updated="(newReactions: any) => msg.reactions = newReactions"
                                @add-reaction="handleAddReaction"
                                @reaction-picker-closed="showReactionPicker = false"
                                :showReactionPicker="showReactionPicker"
                                :pickerCoords="pickerCoords"
                                :alignRight="msg.senderId === user?.id"
                                :isReadOnly="isReadOnly"
                            />

                            <MessageAttachments v-if="msg.files && msg.files.length > 0" :files="msg.files" />

                        </div>

                    </div>

                </div>

        <ConfirmDelete 
            :show="showDeleteConfirm"
            itemType="le message"
            :itemName="msg.content.substring(0, 50)"
            @confirm="deleteMessage"
            @cancel="showDeleteConfirm = false"
        />

        <MessageActionSheet
            :show="showActionSheet"
            :actions="sheetActions"
            :preview-name="msg.isWebhook ? (msg.webhookName || 'Webhook') : ($p(msg.sender?.name) || 'Anonyme')"
            :preview-content="msg.content.substring(0, 120)"
            :quick-reactions="QUICK_REACTIONS"
            @close="showActionSheet = false"
            @react="reactFromSheet"
            @more-reactions="openPickerFromSheet"
        />


</template>

<script setup lang="ts">

import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { computed, nextTick, ref, watch } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import useResponse from '@/composables/useResponse';
import useWSocket from '@/composables/useWSocket';
import MessageReactions from '@/components/common/MessageReactions.vue';
import MessageActionSheet, { type SheetAction } from '@/components/common/MessageActionSheet.vue';
import { useLongPress } from '@/composables/useLongPress';
import type { Message } from '@/types/types';
import MessageAttachments from './MessageAttachments.vue';
import { encryptMessageWithContentKey } from '@/assets/utils/crypto';
import MarkdownRender from '../../views/MarkdownRender.vue';
import ThreadTextarea from './ThreadTextarea.vue';
import { useRoute, useRouter } from 'vue-router';
import { user, member } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import { openProfile } from '@/composables/useProfile';
import WebhookEmbed from './WebhookEmbed.vue';
import { orgMentionLookup, isUserMentioned } from '@/composables/useMentions';
import { extractReferenceTokens } from '@/composables/useReferences';
import { navigateToReference } from '@/composables/useReferenceNavigation';
import type { User } from '@/types/types';

const toast = useToast();
const showReactionPicker = ref<boolean>(false);
const pickerCoords = ref<{ x: number, y: number } | null>(null);

const props = defineProps<{
    msg: Message;
    selectedMessage?: string | null;
    messages?: Message[];
    currentThreadKey?: CryptoKey | null;
    isReadOnly?: boolean;
    isStacked?: boolean;
    isEditing?: boolean;
}>();

const emit = defineEmits<{
    (e: 'edit-start'): void;
    (e: 'edit-end'): void;
}>();

interface DropdownBtn {
    icon: string,
    tooltip: string,
    label: string,
    inSheet?: boolean,
    danger?: boolean,
    func: (msg: Message, e?: Event) => void,
    class?: string;
    show: (msg: Message) => boolean;
}

// Un message webhook n'a pas de senderId (aucun expéditeur humain) : la
// suppression reste possible pour le créateur du webhook via webhookCreatorId,
// mais l'édition ne l'est jamais (cf. dropdownBtns "modifier" ci-dessous).
function isMessageOwner(msg: Message): boolean {
    if (msg.isWebhook) return msg.webhookCreatorId === user.value?.id;
    return msg.senderId === user.value?.id;
}

const copied = ref<boolean>(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const copyMessage = async (msg: Message) => {
    try {
        await navigator.clipboard.writeText(msg.content);
        copied.value = true;
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => copied.value = false, 1500);
        // Sans survol (tactile), la coche de la barre d'actions n'est jamais
        // visible — la copie part du sheet mobile, qui se ferme aussitôt.
        if (!window.matchMedia('(hover: hover)').matches) toast.show("Message copié", "success");
    } catch {
        toast.show("Échec de la copie", "error");
    }
};

const dropdownBtns: DropdownBtn[] = [
    {
        // Getter : l'icône bascule sur une coche le temps du feedback, et la
        // `:key` sur l'<i> relance l'animation `copy-pop` à chaque bascule.
        get icon() { return copied.value ? "bi-check-lg copy-pop text-(--primary)" : "bi-clipboard-fill"; },
        tooltip: "copier",
        label: "Copier le texte",
        func: (msg: Message) => copyMessage(msg),
        show: () => true
    },
    {
        icon: "bi-pencil-fill",
        tooltip: "modifier",
        label: "Modifier",
        func: () => startEdit(),
        show: (msg: Message) => msg.senderId == user.value?.id
    },
    {
        icon: "bi-arrow-90deg-left",
        tooltip: "répondre",
        label: "Répondre",
        func: (msg: Message) => setMessageWillBeResponded(msg),
        show: () => true
    },
    {
        icon: "bi-emoji-grin-fill",
        tooltip: "réagir",
        label: "Réagir",
        // Remplacé dans le sheet mobile par la rangée de réactions rapides.
        inSheet: false,
        func: (_msg: Message, e?: Event) => {
            showReactionPicker.value = !showReactionPicker.value;
            if (showReactionPicker.value && e) {
                const target = e.currentTarget as HTMLElement;
                const rect = target.getBoundingClientRect();
                pickerCoords.value = { x: rect.right, y: rect.top };
            } else {
                pickerCoords.value = null;
            }
        },
        show: () => true
    },
    {
        icon: "bi-trash-fill",
        tooltip: "supprimer",
        label: "Supprimer",
        func: () => openDeleteConfirm(),
        class: "text-red-400! hover:bg-red-500/10!",
        danger: true,
        show: (msg: Message) => isMessageOwner(msg)
    }
];

// ── Sheet d'actions mobile ──────────────────────────────────────────────
// Sur écran tactile il n'y a pas de survol, donc pas de barre d'actions :
// un appui long ouvre à la place un sheet qui glisse du bas, avec les mêmes
// actions (mêmes `show`) en liste libellée.
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const showActionSheet = ref<boolean>(false);
const reactionsRef = ref<InstanceType<typeof MessageReactions> | null>(null);

const longPress = useLongPress(() => {
    if (props.isEditing || props.isReadOnly) return;
    showActionSheet.value = true;
});

const sheetActions = computed<SheetAction[]>(() => dropdownBtns
    .filter(btn => btn.inSheet !== false && btn.show(props.msg))
    .map(btn => ({
        icon: btn.icon,
        label: btn.label,
        danger: btn.danger,
        onClick: () => {
            showActionSheet.value = false;
            btn.func(props.msg);
        },
    }))
);

const reactFromSheet = (emoji: string) => {
    showActionSheet.value = false;
    reactionsRef.value?.toggleReaction(emoji);
};

const openPickerFromSheet = () => {
    showActionSheet.value = false;
    // Sans coordonnées, MessageReactions centre le sélecteur à l'écran.
    pickerCoords.value = null;
    showReactionPicker.value = true;
};

const router = useRouter();
const route = useRoute();
const { setMessageWillBeResponded } = useResponse();

// Les mises à jour de réactions sont reçues une seule fois par ThreadView.vue
// (message-reaction-updated), plus par un écouteur socket par message.

const showPlusDropdown = ref<boolean>(false);
const hovered = ref<boolean>(false);
const showDeleteConfirm = ref<boolean>(false);
const editContent = ref<string>('');
const editTextareaRef = ref<InstanceType<typeof ThreadTextarea> | null>(null);

watch(() => props.isEditing, (editing) => {
    if (!editing) return;
    editContent.value = props.msg.content;
    nextTick(() => {
        editTextareaRef.value?.textarea?.focus();
        editTextareaRef.value?.textarea?.select();
    });
});


const mentionLookup = orgMentionLookup;

// Couvre l'ancien format @pseudo (isUserMentioned) ET le nouveau <@:id> — un
// message envoyé après cette feature ne matchera jamais le premier.
const isTagMe = computed(() => {
    if (isUserMentioned(props.msg.content, user.value, mentionLookup.value)) return true;
    if (!user.value) return false;
    return extractReferenceTokens(props.msg.content).some(r => r.type === 'user' && r.id === user.value!.id);
});

const handleAddReaction = async (payload: { messageId: string; emoji: string; isDM: boolean }) => {
   
    const socket = await useWSocket();
   
    if (!user.value?.id) {
        toast.show('Veuillez vous connecter pour ajouter une réaction', 'error');
        return;
    }
    
    // Send to server via WebSocket
    const eventName = payload.isDM ? 'add-dm-reaction' : 'add-message-reaction';
    socket.value?.emit(eventName, { 
        messageId: payload.messageId,
        emoji: payload.emoji
    }, (response: any) => {
        if (response.error) {
            toast.show(response.error, 'error');
        }
    });
};

const onReferenceClick = (ref: { kind: 'thread' | 'task' | 'file'; id: string; spaceId?: string }) => {
    navigateToReference(router, ref);
};


const formatTime = (d: string) => {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTimeOnly = (d: string) => {
  return new Date(d).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const openDeleteConfirm = () => {
    showPlusDropdown.value = false;
    showDeleteConfirm.value = true;
};

const startEdit = () => {
    showPlusDropdown.value = false;
    emit('edit-start');
}

const cancelEdit = () => {
    emit('edit-end');
}

const deleteMessage = async () => {
    const socket = await useWSocket();
    socket.value?.emit('delete-message', props.msg.id);
    showDeleteConfirm.value = false;
};

const saveEdit = async () => {

    const content = editContent.value.trim();
    if (!content || content === props.msg.content) {
        emit('edit-end');
        return;
    }

    const { ciphertext, iv } = await encryptMessageWithContentKey(content, props.currentThreadKey!);

    const socket = await useWSocket();

    socket.value?.emit('edit-message', {
        id: props.msg.id,
        content: ciphertext,
        iv: iv,
        references: extractReferenceTokens(content),
    });

    emit('edit-end');

};

</script>

<style scoped>

.copy-pop {
    display: inline-block;
    animation: copy-pop 0.35s ease-out;
}

@keyframes copy-pop {
    0%   { transform: scale(0.4) rotate(-20deg); opacity: 0; }
    60%  { transform: scale(1.25) rotate(5deg); opacity: 1; }
    100% { transform: scale(1) rotate(0); }
}

:deep(.mention-tag) {
    display: inline-flex;
    align-items: center;
    padding: 0 0.4rem;
    margin: 0 0.1rem;
    border-radius: 0.375rem;
    font-weight: 600;
    background-color: var(--primary-dark);
    color: white;
    cursor: pointer;
    transition: all 0.2s;
}

:deep(.mention-tag:hover) {
    filter: brightness(1.2);
}

:deep(.mention-tag[data-mention-kind="everyone"]),
:deep(.mention-tag[data-mention-kind="here"]) {
    background-color: color-mix(in srgb, orange 55%, var(--primary-dark));
    cursor: default;
}

</style>