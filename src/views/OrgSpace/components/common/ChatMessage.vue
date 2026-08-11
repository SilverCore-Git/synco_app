<template>

                <div
                    :key="msg.id" 
                    class="group relative px-4 flex flex-col justify-start items-start rounded-lg transition-colors w-full"
                    :class="[
                        isStacked ? 'py-0.5 mt-0' : 'py-2 mt-2',
                        (msg as any).isSending ? 'opacity-50' : '',
                        selectedMessage == msg.id ? ' border border-(--primary) border-dashed animate-pulse' : '',
                        user?.id == msg.replyMessage?.senderId || isTagMe
                            ? 'border-l-2 border-(--primary-dark) bg-(--primary-dark)/30 hover:bg-(--primary-dark)/50' 
                            : 'hover:bg-white/5',
                        showReactionPicker ? 'z-100' : 'z-10'
                    ]"
                >

                    <div 
                        v-if="msg.replyToId && msg.replyMessage" 
                        @click="router.push({ query: { ...route.query, select: msg.replyMessage?.id } })"
                        class="group/reply reply-context flex items-center gap-2 mb-1 text-xs text-(--text2) relative pl-13 cursor-pointer"
                    >
                        
                        <div class="z-10 absolute left-4 top-2.5 w-7 h-13 border-l-2 border-t-2 border-white/20 group-hover/reply:border-white/40 rounded-tl-md" />

                        <img 
                            :src="msg.replyMessage?.sender?.avatarUrl || `https://ui-avatars.com/api/?name=${msg.replyMessage?.sender?.name}&background=128a60&color=fff`"
                            :alt="msg.replyMessage?.sender?.name"
                            @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${msg.replyMessage?.sender?.name}&background=128a60&color=fff`"
                            class="w-4 h-4 rounded-full opacity-80 shrink-0"
                        />
                        
                        <span class="font-semibold text-(--primary)/80 ">
                            @{{ msg.replyMessage?.sender?.name || 'Anonyme' }}
                        </span>

                        <div class="max-w-md opacity-70 pointer-events-none text-[11px] line-clamp-1 [&_p]:inline [&_h1]:inline [&_h2]:inline [&_h3]:inline">
                            <MarkdownRender :content="msg.replyMessage?.content || ''" />
                        </div>

                    </div>

                    <div 
                        class="
                            absolute -top-5 right-3 sdropdown 
                            flex-raw items-start z-80
                            rounded-xl border border-(--text)/10
                            bg-(--bg) shadow-xl ring-1 ring-white/5 focus:outline-none
                        "
                        :class="showPlusDropdown ? 'flex' : 'hidden group-hover:flex'"
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
                            <i class="bi text-lg" :class="btn.icon" />
                        </button>

                        <!-- <button @click="showPlusDropdown = !showPlusDropdown" class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-three-dots text-lg" />
                        </button> -->

                        <div 
                            v-if="showPlusDropdown"
                            class="
                                flex flex-col items-start absolute top-full mt-2 right-0
                                rounded-xl border border-(--text)/10 sdropdown w-56 z-90
                                bg-(--bg) shadow-xl ring-1 ring-white/5 focus:outline-none
                            "
                        >

                            <button 
                                v-if="msg.senderId == user?.id"
                                @click="openDeleteConfirm" 
                                class="dropdown-item-annimate dropdown-item-style  text-red-400! hover:bg-red-500/10!"
                            >
                                Supprimer le message
                            </button>
                        
                        </div>
                    
                    </div>

                    <div class="z-20 flex justify-start items-start gap-3">

                        <img 
                            v-if="msg.sender && !isStacked"
                            :src="msg.sender?.avatarUrl || `https://ui-avatars.com/api/?name=${msg.sender?.name}&background=128a60&color=fff`"
                            :alt="msg.sender?.name"
                            @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${msg.sender?.name}&background=128a60&color=fff`"
                            @click.stop="(e) => msg.sender && openProfile(msg.sender, e)"
                            class="rounded-full w-9 h-9 object-cover shrink-0 cursor-pointer hover:ring-2 hover:ring-(--primary)/50 transition-all"
                        />
                        <div 
                            v-else-if="isStacked"
                            class="w-9 h-9 shrink-0 flex items-start justify-center opacity-0 group-hover:opacity-100 transition-opacity select-none"
                        >
                            <span class="text-[10px] text-(--text2) font-medium text-center mt-1.5">{{ formatTimeOnly(msg.createdAt as any) }}</span>
                        </div>

                        <div class="min-w-0 flex-1">

                            <div v-if="!isStacked" class="flex items-baseline gap-2 mb-0.5">

                                <span 
                                    class="text-(--primary) font-bold text-xs tracking-tighter truncate cursor-pointer hover:underline"
                                    @click.stop="(e) => msg.sender && openProfile(msg.sender, e)"
                                >
                                    {{ msg.sender?.name || 'Anonyme' }}
                                </span>

                                <span class="text-(--text2) text-[10px] whitespace-nowrap">
                                    {{ formatTime(msg.createdAt as any) }}
                                </span>

                            </div>

                            <div ref="messageContentRef" class="text-(--text) text-sm leading-relaxed wrap-break-word">
                                <MarkdownRender :content="msg.content" />
                                <span v-if="msg.edited" class="text-[10px] text-(--text2)"> (modifié)</span>
                            </div>
                            
                            <!-- Message reactions -->
                            <MessageReactions
                                :message-id="msg.id"
                                :reactions="formatDMReactions(msg.reactions)"
                                :is-dm="true"
                                :showReactionPicker="showReactionPicker"
                                @reaction-updated="(newReactions: any) => msg.reactions = newReactions"
                                @add-reaction="(payload) => handleAddReaction(payload)"
                                @reaction-picker-closed="showReactionPicker = false"
                                :pickerCoords="pickerCoords"
                                :alignRight="msg.senderId === user?.id"
                            />

                            <div 
                                v-if="msg.files && msg.files.length > 0" 
                                class="mt-3 flex flex-wrap gap-2"
                            >

                                <div 
                                    v-for="file in msg.files" 
                                    :key="file.id"
                                    class="
                                        group/file relative flex items-center gap-3 p-2 
                                        rounded-lg border border-(--text)/10 
                                        bg-white/3 hover:bg-white/5 transition-all 
                                        max-w-sm overflow-hidden
                                    "
                                    :title="file.originalName"
                                >
                                
                                    <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-(--bg) border border-(--text)/5">

                                        <i class="bi text-xl" :class="[ getFileInfo(file).color, getFileInfo(file).icon ]" />

                                    </div>

                                    <div class="flex flex-col min-w-0 pr-2">
                                        <span class="text-xs font-medium text-(--text) truncate">
                                            {{ file.originalName }}
                                        </span>
                                        <span class="text-[10px] text-(--text2) uppercase tracking-wider">
                                            {{ (file.size / 1024 / 1024).toFixed(2) }} MB
                                        </span>
                                    </div>

                                    <button 
                                        @click="downloadFile(file.id)"
                                        class="ml-auto p-1.5 rounded-md hover:bg-(--primary)/20 text-(--text2) hover:text-(--primary) transition-colors"
                                        title="Télécharger"
                                    >
                                        <i class="bi bi-download" />
                                    </button>

                                </div>
                                
                            </div>

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

        <EditMessage 
            :is-open="showEditMessage" 
            :initial-content="msg.content"
            @close="showEditMessage = false"
            @save="editMessage"
        />

</template>

<script setup lang="ts">

import { computed, nextTick, ref, watch } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import useResponse from '@/composables/useResponse';
import useWSocket from '@/composables/useWSocket';
import EditMessage from '../popup/EditMessage.vue';
import MessageReactions from '@/components/common/MessageReactions.vue';
import type { DMMessage, DMMessageReaction, ReactionUser } from '@/types/types';
import { downloadFile } from '@/assets/utils/downloadFile';
import MarkdownRender from '../../views/MarkdownRender.vue';
import { useRoute, useRouter } from 'vue-router';
import { user } from '@/assets/var';
import { encryptForPeer } from '@/assets/utils/crypto';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { useToast } from '@/composables/useToast';
import { openProfile } from '@/composables/useProfile';
import useSettingsItem from '@/composables/useSettingsItem';

const toast = useToast();
const showReactionPicker = ref<boolean>(false);
const pickerCoords = ref<{ x: number, y: number } | null>(null);
const { Item: devMode } = useSettingsItem('devMode', false);

// Format DM reactions to match MessageReactions expected format
const formatDMReactions = (reactions: DMMessageReaction[] | Record<string, { count: number; users: ReactionUser[] }> | any[] | undefined): Record<string, { count: number; users: ReactionUser[] }> | undefined => {
    if (!reactions) return undefined;
    
    if (Array.isArray(reactions)) {
        // Transform array of DMMessageReaction to grouped Record
        const grouped: Record<string, { count: number; users: ReactionUser[] }> = {};
        for (const reaction of reactions as any[]) {
            const emoji = reaction?.emoji;
            if (!emoji) continue;
            if (!grouped[emoji]) {
                grouped[emoji] = { count: 0, users: [] };
            }
            grouped[emoji].count++;
            const reactionUser = reaction?.user as ReactionUser | undefined;
            if (reactionUser?.id) {
                grouped[emoji].users.push({
                    id: reactionUser.id,
                    name: reactionUser.name || '',
                    avatarUrl: reactionUser.avatarUrl
                });
            }
        }
        return grouped;
    }
    
    return reactions as Record<string, { count: number; users: ReactionUser[] }>;
};

const props = defineProps<{
    msg: DMMessage;
    selectedMessage: string | null;
    messages: DMMessage[];
    currentThreadKey?: CryptoKey | null;
    isStacked?: boolean;
}>();

interface DropdownBtn {
    icon: string,
    tooltip: string,
    func: (msg: DMMessage, e?: Event) => void,
    class?: string;
    show: (msg: DMMessage) => boolean;
}

const dropdownBtns: DropdownBtn[] = [
    {
        icon: "bi-clipboard-fill",
        tooltip: "copier",
        func: () => {},
        show: () => true
    },
    {
        icon: "bi-hash",
        tooltip: "copier l'id",
        func: (msg: DMMessage) => {
            navigator.clipboard.writeText(msg.id);
            toast.show("ID copié", "success");
        },
        class: "text-(--primary)! hover:bg-(--primary)/10!",
        show: () => devMode.value
    },
    {
        icon: "bi-pencil-fill",
        tooltip: "modifier",
        func: () => openEditMessage(),
        show: (msg: DMMessage) => msg.senderId == user.value?.id
    },
    {
        icon: "bi-arrow-90deg-left",
        tooltip: "répondre",
        func: (msg: DMMessage) => setMessageWillBeResponded(msg),
        show: () => true
    },
    {
        icon: "bi-emoji-grin-fill",
        tooltip: "réagir",
        func: (_msg: DMMessage, e?: Event) => {
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
        func: () => openDeleteConfirm(),
        class: "text-red-400! hover:bg-red-500/10!",
        show: (msg: DMMessage) => msg.senderId == user.value?.id
    }
];

const router = useRouter();
const route = useRoute();
const { setMessageWillBeResponded } = useResponse();

const showPlusDropdown = ref<boolean>(false);
const showDeleteConfirm = ref<boolean>(false);
const showEditMessage = ref<boolean>(false);
const messageContentRef = ref<HTMLElement | null>(null);

const isTagMe = computed(() => {

    if (!props.msg.content || !user.value) return false;
    
    const regex = new RegExp(`@${user.value.name}\\b`, 'i');
    return regex.test(props.msg.content);

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

// Reaction updates are handled centrally in ChatView.vue — no per-instance socket listener needed

const applyMentions = () => {

    if (!messageContentRef.value) return;
    
    const walker = document.createTreeWalker(
        messageContentRef.value, 
        NodeFilter.SHOW_TEXT, 
        {
            acceptNode: (node) => {
                if (node.parentElement?.classList.contains('mention-tag')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let node;
    const nodesToReplace: { oldNode: ChildNode, newNode: HTMLElement }[] = [];
    
    while (node = walker.nextNode())
    {
        const text = node.textContent || '';
        if (text.includes('@')) 
        {
            const span = document.createElement('span');
            span.innerHTML = text.replace(
                /@([a-zA-Z0-9_\-\.]+)/g, 
                '<span class="mention-tag">@$1</span>'
            );
            nodesToReplace.push({ oldNode: node as any, newNode: span });
        }
    }

    nodesToReplace.forEach(({ oldNode, newNode }) => {
        oldNode.parentNode?.replaceChild(newNode, oldNode);
    });

};

watch(() => props.msg.content, async () => {
    await nextTick();
    applyMentions();
}, { immediate: true });

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

const openEditMessage = () => {
    showPlusDropdown.value = false;
    showEditMessage.value = true;
}

const deleteMessage = async () => {
    const socket = await useWSocket();
    socket.value?.emit('dm:delete-message', props.msg.id);
    showDeleteConfirm.value = false;
};

const editMessage = async (newContent: string) => {

    const myPubKey = user.value?.publicKey;

    const { ciphertext, encryptedAesKey, iv, selfEncryptedAesKey } = await encryptForPeer(newContent, props.msg.sender?.publicKey!, myPubKey);

    const socket = await useWSocket();
        
    socket.value?.emit('dm:edit-message', { 
        id: props.msg.id, 
        newContent: ciphertext,
        encryptedAesKey,
        selfEncryptedAesKey: selfEncryptedAesKey,
        nonce: iv,
    });

};

</script>

<style scoped>

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

</style>