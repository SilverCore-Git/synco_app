<template>

                <div
                    :key="msg.id" 
                    class="group relative px-4 py-2 flex flex-col justify-start items-start rounded-lg transition-colors w-full"
                    :class="[
                        selectedMessage == msg.id ? ' border border-(--primary) border-dashed animate-pulse' : '',
                        user?.id == msg.replyMessage?.senderId 
                            ? 'border-l-2 border-(--primary-dark) bg-(--primary-dark)/30 hover:bg-(--primary-dark)/50' 
                            : 'hover:bg-white/5'
                    ]"
                >

                    <div 
                        v-if="msg.replyToId && msg.replyMessage" 
                        @click="router.push({ query: { ...route.query, select: msg.replyMessage?.id } })"
                        class="group/reply reply-context flex items-center gap-2 mb-1 text-xs text-(--text)/60 relative pl-13 cursor-pointer"
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
                            @click="btn.func(msg)"
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
                                @click="openDeleteConfirm" 
                                class="dropdown-item-annimate dropdown-item-style  text-red-400! hover:bg-red-500/10!"
                            >
                                Supprimer le message
                            </button>
                        
                        </div>
                    
                    </div>

                    <div class="z-20 flex justify-start items-start gap-3">

                        <img 
                            v-if="msg.sender"
                            :src="msg.sender?.avatarUrl || `https://ui-avatars.com/api/?name=${msg.sender?.name}&background=128a60&color=fff`"
                            :alt="msg.sender?.name"
                            @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${msg.sender?.name}&background=128a60&color=fff`"
                            class="rounded-full w-9 h-9 object-cover shrink-0"
                        />

                        <div class="min-w-0 flex-1">

                            <div class="flex items-baseline gap-2">

                                <span class="text-(--primary) font-bold text-xs tracking-tighter truncate">
                                    {{ msg.sender?.name || 'Anonyme' }}
                                </span>

                                <span class="text-(--text)/27 text-[10px] whitespace-nowrap">
                                    {{ formatTime(msg.createdAt as any) }}
                                </span>

                            </div>

                            <div class="text-(--text)/80 text-sm leading-relaxed wrap-break-word">
                                <MarkdownRender :content="msg.content" />
                                <span v-if="msg.edited" class="text-[10px] text-(--text)/30"> (modifié)</span>
                            </div>
                            
                            <!-- Message reactions -->
                            <MessageReactions
                                :message-id="msg.id"
                                :reactions="msg.reactions"
                                @reaction-updated="(newReactions: any) => msg.reactions = newReactions"
                                @add-reaction="handleAddReaction"
                                @reaction-updated="(newReactions: any) => msg.reactions = newReactions"
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
                                        <span class="text-xs font-medium text-(--text)/90 truncate">
                                            {{ file.originalName }}
                                        </span>
                                        <span class="text-[10px] text-(--text)/40 uppercase tracking-wider">
                                            {{ (file.size / 1024 / 1024).toFixed(2) }} MB
                                        </span>
                                    </div>

                                    <button 
                                        @click="downloadFile(file.id)"
                                        class="ml-auto p-1.5 rounded-md hover:bg-(--primary)/20 text-(--text)/60 hover:text-(--primary) transition-colors"
                                        title="Télécharger"
                                    >
                                        <i class="bi bi-download" />
                                    </button>

                                </div>
                                
                            </div>

                        </div>

                    </div>

                        <!-- Emoji reaction picker dropdown -->
                        <div
                            v-if="showReactionPicker && selectedMessageForReaction?.id === msg.id"
                            @click.away="showReactionPicker = false"
                            class="absolute z-50 bg-(--bg) border border-white/5 rounded-xl shadow-xl p-2"
                            style="right: 100px; top: -10px;"
                        >
                            <button
                                v-for="emoji in availableEmojis"
                                :key="emoji"
                                @click="addReaction(emoji)"
                                class="text-2xl p-1 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                {{ emoji }}
                            </button>
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

import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import useResponse from '@/composables/useResponse';
import { ref } from 'vue';
import useWSocket from '@/composables/useWSocket';
import EditMessage from '../popup/EditMessage.vue';
import MessageReactions from '@/components/common/MessageReactions.vue';
import type { DMMessage } from '@/types/types';
import { downloadFile } from '@/assets/utils/downloadFile';
import MarkdownRender from '../../views/MarkdownRender.vue';
import { useRoute, useRouter } from 'vue-router';
import { user } from '@/assets/var';
import { encryptAesKeyWithRsa, encryptForPeer } from '@/assets/utils/crypto';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { useToast } from '@/composables/useToast';

const socket = await useWSocket();
const toast = useToast();

const props = defineProps<{
    msg: DMMessage;
    selectedMessage: string | null;
    messages: DMMessage[];
    currentThreadKey?: CryptoKey | null;
}>();

interface DropdownBtn {
    icon: string,
    tooltip: string,
    func: (msg: DMMessage) => void,
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
    // {
    //     icon: "bi-arrow-90deg-right",
    //     tooltip: "transférer",
    //     func: (msg: DMMessage) => setMessageWillBeTransfer(msg),
    //      show: () => true
    // },
    {
        icon: "bi-trash-fill",
        tooltip: "supprimer",
        func: () => openDeleteConfirm(),
        class: "text-red-400! hover:bg-red-500/10!",
        show: (msg: DMMessage) => msg.senderId == user.value?.id
    },
    {
        icon: "bi-emoji-smile-fill",
        tooltip: "Ajouter une réaction",
        func: (msg: DMMessage) => toggleReactionPicker(msg),
        show: () => true
    }
];

const router = useRouter();
const route = useRoute();
const { setMessageWillBeResponded } = useResponse();

const showPlusDropdown = ref<boolean>(false);
const showDeleteConfirm = ref<boolean>(false);
const showEditMessage = ref<boolean>(false);
const showReactionPicker = ref<boolean>(false);
const selectedMessageForReaction = ref<DMMessage | null>(null);

// Available emojis for reactions
const availableEmojis = [
  '👍', '❤️', '🔥', '😂', '😢', '👏', '🎉', '🚀',
  '✨', '💯', '😮', '😎', '🤔', '🎯', '✅'
];
// Reaction picker functions
const toggleReactionPicker = (msg: DMMessage) => {
    selectedMessageForReaction.value = msg;
    showReactionPicker.value = !showReactionPicker.value;

const handleAddReaction = async (payload: { messageId: string; emoji: string; isDM: boolean }) => {
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
};

const addReaction = async (emoji: string) => {
    const msg = selectedMessageForReaction.value;
    if (!msg || !user.value?.id) return;

    try {
        // Optimistic update
        const currentReactions = msg.reactions || {};
        const hasReacted = currentReactions[emoji]?.users?.some((u: any) => u.id === user.value?.id);
        
        const newReactions = { ...currentReactions };
        if (hasReacted) {
            // Remove reaction
            if (newReactions[emoji]) {
                newReactions[emoji] = {
                    ...newReactions[emoji],
                    count: newReactions[emoji].count - 1,
                    users: newReactions[emoji].users?.filter((u: any) => u.id !== user.value?.id) || []
                };
                if (newReactions[emoji].count <= 0) {
                    delete newReactions[emoji];
                }
            }
        } else {
            // Add reaction
            newReactions[emoji] = {
                count: (newReactions[emoji]?.count || 0) + 1,
                users: [
                    ...(newReactions[emoji]?.users || []) as any[],
                    { id: user.value.id, name: user.value.name, avatarUrl: user.value.avatarUrl }
                ]
            };
        }
        
        msg.reactions = newReactions;
        
        // Send to server via WebSocket
        socket.value?.emit('add-dm-reaction', {
            dmMessageId: msg.id,
            emoji
        });
        
        showReactionPicker.value = false;
        selectedMessageForReaction.value = null;
        
    } catch (error) {
        console.error('Error adding reaction:', error);
        toast.show('Erreur lors de l\'ajout de la réaction', 'error');
    }
};

// Handle reaction updates from socket
const handleReactionUpdate = (data: { dmMessageId: string; reactions: Record<string, { count: number; users: any[] }> }) => {
    if (data.dmMessageId === props.msg.id) {
        props.msg.reactions = data.reactions;
    }
};

if (socket.value) {
    socket.value.on('dm-reaction-updated', handleReactionUpdate);
}

const formatTime = (d: string) => {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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

    const { ciphertext, encryptedAesKey, iv, rawKey } = await encryptForPeer(newContent, props.msg.sender?.publicKey!);

    const selfEncryptedAesKey = await encryptAesKeyWithRsa(
        rawKey,
        myPubKey
    );

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