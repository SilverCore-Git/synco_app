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

                        <button v-tooltip="'copier'" class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-clipboard-fill text-lg" />
                        </button>

                        <button @click="editMessage" class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-pencil-fill text-lg" />
                        </button>

                        <button @click="setMessageWillBeResponded(msg)" class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-arrow-90deg-left text-lg" />
                        </button>
                        
                        <button class="dropdown-item-annimate dropdown-item-style">
                            <i class="bi bi-arrow-90deg-right text-lg" />
                        </button>

                        <button @click="openDeleteConfirm"  class="dropdown-item-annimate dropdown-item-style text-red-400! hover:bg-red-500/10!">
                            <i class="bi bi-trash-fill text-lg" />
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

                            <span class="text-(--text)/20 text-[10px] whitespace-nowrap">
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

</template>

<script setup lang="ts">

import { ref } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import useResponse from '@/composables/useResponse';
import useWSocket from '@/composables/useWSocket';

const props = defineProps<{
    msg: any;
    selectedMessage: string | null;
    messages: any[];
}>();

interface DropdownBtn {
    icon: string,
    tooltip: string,
    func: () => void
}

const dropdownBtns: DropdownBtn[] = [
    {
        icon: "bi-clipboard-fill",
        tooltip: "copier",
        func: () => { /* ta logique de copie */ },
        class?: string;
    },
    {
        icon: "bi-pencil-fill",
        tooltip: "modifier",
        func: editMessage
    },
    {
        icon: "bi-arrow-90deg-left",
        tooltip: "répondre",
        func: () => setMessageWillBeResponded(msg)
    },
    {
        icon: "bi-arrow-90deg-right",
        tooltip: "transférer"
    },
    {
        icon: "bi-trash-fill",
        tooltip: "supprimer",
        func: openDeleteConfirm,
        class: "text-red-400! hover:bg-red-500/10!"
    }
];

const { setMessageWillBeResponded } = useResponse();

const showPlusDropdown = ref<boolean>(false);
const showDeleteConfirm = ref<boolean>(false);

const formatTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const openDeleteConfirm = () => {
    showPlusDropdown.value = false;
    showDeleteConfirm.value = true;
};

const deleteMessage = async () => {
    const socket = await useWSocket();
    socket.value?.emit('delete-message', props.msg.id);
    showDeleteConfirm.value = false;
};

const editMessage = async (newContent: string) => {
    const socket = await useWSocket();
    socket.value?.emit('edit-message', { id: props.msg.id, content: newContent });
};

const getReplyMessage = (replyToId: string) => {
    return (props.messages || []).find(m => m.id === replyToId);
};

</script>