<template>

                <div
                    :key="msg.id" 
                    class="group relative px-4 py-2 flex justify-start items-start gap-3 hover:bg-white/6 rounded-lg transition-colors"
                    :class="selectedMessage == msg.id ? ' border border-(--primary) border-dashed animate-pulse' : ''"
                >

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

                        <div v-if="msg.replyToId && getReplyMessage(msg.replyToId)" class="mb-2 pl-3 border-l-2 border-(--primary)/40">
                            <p class="text-xs text-(--text)/60 mb-1">
                                {{ getReplyMessage(msg.replyToId)?.sender?.name || 'Anonyme' }}
                            </p>
                            <p class="text-xs text-(--text)/70 italic line-clamp-2">
                                {{ getReplyMessage(msg.replyToId)?.content }}
                            </p>
                        </div>

                        <p class="text-(--text)/80 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                            {{ msg.content }}
                            <span v-if="msg.edited" class="text-[10px] text-(--text)/30">
                                (modifié)
                            </span>
                        </p>

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

import { ref } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import useResponse from '@/composables/useResponse';
import useWSocket from '@/composables/useWSocket';
import EditMessage from '../popup/EditMessage.vue';
import { deriveKey, encrypt } from '@/assets/utils/threadsCrypto';
import { openedOrg } from '@/assets/var';

const props = defineProps<{
    msg: any;
    selectedMessage: string | null;
    messages: any[];
}>();

interface DropdownBtn {
    icon: string,
    tooltip: string,
    func: (msg: any) => void,
    class?: string;
}

const dropdownBtns: DropdownBtn[] = [
    {
        icon: "bi-clipboard-fill",
        tooltip: "copier",
        func: () => {},
    },
    {
        icon: "bi-pencil-fill",
        tooltip: "modifier",
        func: () => openEditMessage()
    },
    {
        icon: "bi-arrow-90deg-left",
        tooltip: "répondre",
        func: (msg: any) => setMessageWillBeResponded(msg)
    },
    {
        icon: "bi-arrow-90deg-right",
        tooltip: "transférer",
        func: () => {}
    },
    {
        icon: "bi-trash-fill",
        tooltip: "supprimer",
        func: () => openDeleteConfirm(),
        class: "text-red-400! hover:bg-red-500/10!"
    }
];

const { setMessageWillBeResponded } = useResponse();

const showPlusDropdown = ref<boolean>(false);
const showDeleteConfirm = ref<boolean>(false);
const showEditMessage = ref<boolean>(false);

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
    socket.value?.emit('delete-message', props.msg.id);
    showDeleteConfirm.value = false;
};

const editMessage = async (newContent: string) => {

    const key = await deriveKey(openedOrg.value!.id, props.msg.threadId);
    if (!key) return;
    const cryptedContent = await encrypt(newContent, key);

    const socket = await useWSocket();
    socket.value?.emit('edit-message', { id: props.msg.id, newContent: cryptedContent });

};

const getReplyMessage = (replyToId: string) => {
    return (props.messages || []).find(m => m.id === replyToId);
};

</script>