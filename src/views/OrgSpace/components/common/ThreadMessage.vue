<template>

                <div
                    :key="msg.id" 
                    class="group relative px-4 py-2 flex flex-col justify-start items-start hover:bg-white/5 rounded-lg transition-colors w-full"
                    :class="selectedMessage == msg.id ? ' border border-(--primary) border-dashed animate-pulse' : ''"
                >

                    <div 
                        v-if="msg.replyToId && msg.replyMessage" 
                        @click="router.push({ query: { ...route.query, select: msg.replyMessage?.id } })"
                        class="group/reply reply-context flex items-center gap-2 mb-1 text-xs text-(--text)/60 relative pl-13 cursor-pointer"
                    >
                        
                        <div class="absolute left-4 top-2.5 w-7 h-2.5 border-l-2 border-t-2 border-white/20 group-hover/reply:border-white/40 rounded-tl-md" />

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

                    <div class="flex justify-start items-start gap-3">

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

                                        <template v-if="file.originalName.includes('67')">
                                            67
                                        </template>

                                        <template v-else-if="file.mimeType.startsWith('image/')">
                                            <i class="bi bi-image text-(--primary)/60 text-xl" />
                                        </template>

                                        <template v-else-if="file.mimeType.includes('pdf')">
                                            <i class="bi bi-file-earmark-pdf text-red-400 text-xl" />
                                        </template>

                                        <template v-else-if="file.mimeType.includes('zip') || file.mimeType.includes('rar') || file.mimeType.includes('7z') || file.mimeType.includes('tar')">
                                            <i class="bi bi-file-earmark-zip text-yellow-500 text-xl" />
                                        </template>

                                        <template v-else-if="file.mimeType.includes('application/x-msdownload') || file.mimeType.includes('exe') || file.originalName.endsWith('.exe') || file.originalName.endsWith('.msi')">
                                            <i class="bi bi-terminal-fill text-blue-400 text-xl" />
                                        </template>

                                        <template v-else-if="file.mimeType.startsWith('text/') || file.mimeType.includes('javascript') || file.mimeType.includes('json') || file.mimeType.includes('typescript')">
                                            <i class="bi bi-file-earmark-code text-indigo-400 text-xl" />
                                        </template>

                                        <template v-else-if="file.mimeType.includes('word') || file.mimeType.includes('officedocument.wordprocessingml')">
                                            <i class="bi bi-file-earmark-word text-blue-500 text-xl" />
                                        </template>

                                        <template v-else-if="file.mimeType.includes('excel') || file.mimeType.includes('spreadsheetml') || file.mimeType.includes('csv')">
                                            <i class="bi bi-file-earmark-excel text-green-500 text-xl" />
                                        </template>

                                        <template v-else-if="file.mimeType.includes('powerpoint') || file.mimeType.includes('presentationml')">
                                            <i class="bi bi-file-earmark-ppt text-orange-500 text-xl" />
                                        </template>

                                        <template v-else-if="file.mimeType.startsWith('video/')">
                                            <i class="bi bi-play-btn text-purple-400 text-xl" />
                                        </template>

                                        <template v-else-if="file.mimeType.startsWith('audio/')">
                                            <i class="bi bi-music-note-beamed text-pink-400 text-xl" />
                                        </template>

                                        <template v-else>
                                            <i class="bi bi-file-earmark text-(--text)/40 text-xl" />
                                        </template>

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
import type { Message } from '@/types/types';
import { downloadFile } from '@/assets/utils/downloadFile';
import { encryptMessageWithContentKey } from '@/assets/utils/crypto';
import MarkdownRender from '../../views/MarkdownRender.vue';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps<{
    msg: Message;
    selectedMessage: string | null;
    messages: Message[];
    currentThreadKey: CryptoKey | null;
}>();

interface DropdownBtn {
    icon: string,
    tooltip: string,
    func: (msg: Message) => void,
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
        func: (msg: Message) => setMessageWillBeResponded(msg)
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

const router = useRouter();
const route = useRoute();
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

    const { ciphertext, iv } = await encryptMessageWithContentKey(newContent, props.currentThreadKey!);

    const socket = await useWSocket();
        
    socket.value?.emit('edit-message', { 
        id: props.msg.id, 
        content: ciphertext, 
        nonce: iv 
    });

};

</script>