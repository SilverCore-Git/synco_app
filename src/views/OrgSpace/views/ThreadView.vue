<template>

    <main 
        ref="messagesContainer"
        @scroll="handleScroll"
        class="flex-1 overflow-y-auto p-4 w-full h-full"
        :class="messageWillBeResponded || selectedFiles.length ? 'mb-32' : 'mb-14'"
    >

        <div 
            v-if="thread" 
            class="flex flex-col justify-end min-h-full w-full"
        >

            <div class="mb-8 p-4">

                <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                    <i class="bi bi-hash text-4xl text-(--text)/60" />
                </div>

                <h1 class="text-3xl font-black text-white mb-2">#{{ thread.name }}</h1>

                <p class="text-(--text)/50 flex items-center gap-2">
                    C'est le début de l'histoire de ce thread.
                </p>

            </div>

            <div class="space-y-4 w-full">

                <div v-if="isFetchingMore" class="flex justify-center py-4">
                    <SpinLoader />
                </div>

                <template v-if="loading">

                    <div 
                        v-for="i in 10" 
                        :key="i"
                        class="flex gap-3 px-4 py-1 animate-pulse"
                    >

                        <div class="bg-white/5 rounded-full w-9 h-9 shrink-0" />

                        <div class="space-y-2 flex-1">
                            <div class="bg-white/5 w-24 h-3 rounded" />
                            <div class="bg-white/5 w-full h-4 rounded" />
                        </div>

                    </div>

                </template>

                <div
                    v-else
                >
                
                    <ThreadMessage
                        v-for="msg in sortedMessages"
                        :key="msg.id"
                        :msg="msg"
                        :selectedMessage="selectedMessage"
                        :messages="sortedMessages"
                    />

                </div>

            </div>

        </div>

        <div 
            v-else 
            class="
                h-full flex flex-col items-center justify-start pt-40 gap-4
                bg-linear-to-t from-(--primary-dark) to-transparent 
                bg-size-[100%_50%] bg-bottom bg-no-repeat
                -m-4 translate-y-8 overflow-hidden
            "
        >
            <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 border border-(--primary)/10">
                <i class="bi bi-hash text-4xl text-(--text)/60" />
            </div>
            <p class="text-(--text)/80 italic font-medium">Thread introuvable ou accès refusé.</p>
        </div>

    </main>

    <footer v-if="thread" class="absolute bottom-0 inset-x-0 p-1 bg-transparent mt-auto">

        <transition name="fade-bottom">

            <div 
                v-if="messageWillBeResponded" 
                class="
                    mb-2 flex items-start gap-3 bg-(--bg)/80 backdrop-blur-3xl
                    border border-(--primary)/30 rounded-lg px-4 py-3
                "
            >
                
                <div class="flex-1 min-w-0">
                    <p class="text-xs text-(--primary) font-semibold mb-1">
                        Répondre à {{ getMessageSenderName(messageWillBeResponded) }}
                    </p>
                    <p class="text-sm text-(--text)/70 truncate">
                        {{ messageWillBeResponded.content || '(message vide)' }}
                    </p>
                </div>

                <button 
                    @click="cancelReply"
                    class="shrink-0 text-(--text)/40 hover:text-(--text)/70 transition-colors"
                    title="Annuler la réponse"
                >
                    <i class="bi bi-x-lg text-lg" />
                </button>

            </div>

        </transition>

        <transition name="fade-bottom">

            <div 
                v-if="selectedFiles.length > 0"
                class="flex flex-wrap gap-2 mb-2 p-2 bg-(--bg)/80 backdrop-blur-3xl rounded-lg border border-white/5 relative overflow-hidden"
            >
            
                <div v-if="fileSendProgress !== null" class="absolute inset-0 bg-(--bg)/40 z-10 pointer-events-none" />

                <div 
                    v-for="(file, index) in selectedFiles" 
                    :key="index" 
                    class="relative group bg-(--bg) border border-white/10 rounded-md px-3 py-1 flex items-center gap-2 overflow-hidden"
                >
                
                    <div 
                        v-if="fileSendProgress !== null"
                        class="absolute bottom-0 left-0 h-0.5 bg-(--primary) transition-all duration-300"
                        :style="{ width: fileSendProgress + '%' }"
                    />

                    <i class="bi bi-file-earmark-text text-(--primary)" />
                    <span class="text-xs truncate max-w-50">{{ file.name }}</span>

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

            <div class="relative flex items-center bg-(--bg) border border-white/10 rounded-xl px-4 py-2 focus-within:border-(--primary)/50 transition-all shadow-2xl">
                
                <input 
                    type="file" 
                    multiple 
                    ref="fileInputRef" 
                    class="hidden" 
                    @change="(e) => handleFiles(e.target.files)"
                />

                <button 
                    @click="triggerFileSearch"
                    class="mr-3 text-(--text)/40 hover:text-(--primary) transition-colors"
                >
                    <i class="bi bi-plus-circle-fill text-xl" />
                </button>
                
                <ThreadTextarea
                    v-show="!(selectedFiles.length && !files.length)"
                    v-model="newMessage"
                    @send="sendMessage"
                    :placeholder="currentThreadKey ? 'Envoyer un message...' : 'Génération de la clé...'"
                    :disabled="!currentThreadKey"
                    ref="TextareaRef"
                />

                <div 
                    v-show="!(selectedFiles.length && !files.length)"
                    class="flex gap-3 ml-3"
                >
                    <button 
                        @click="sendMessage"
                        :disabled="(!newMessage.trim() && selectedFiles.length === 0) || !currentThreadKey"
                        :class="(newMessage.trim() || selectedFiles.length > 0) && currentThreadKey ? 'text-(--primary)' : 'text-(--text)/40 opacity-50'"
                        class="transition-colors"
                    >
                        <i class="bi bi-send-fill" />
                    </button>
                </div>

                <button 
                    v-if="(selectedFiles.length && !files.length)"
                    @click="validUpload" 
                    class="primary flex items-center gap-2 min-w-24 justify-center relative overflow-hidden w-full"
                    :disabled="fileSendProgress !== null"
                >

                    <template v-if="fileSendProgress !== null">

                        <i class="bi bi-arrow-repeat animate-spin text-lg" />
                        <span>{{ fileSendProgress }}%</span>
                        
                        <div 
                            class="absolute inset-0 bg-white/10 pointer-events-none transition-all duration-300"
                            :style="{ width: fileSendProgress + '%' }"
                        />

                    </template>
                    
                    <template v-else>
                        Valider les pièces jointes
                    </template>

                </button>

            </div>

        </div>

    </footer>

</template>

<script lang="ts" setup>

import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Thread, Message } from '@/types/types';
import useWSocket from '@/composables/useWSocket';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import { encrypt, decrypt, deriveKey } from '@/assets/utils/threadsCrypto';
import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';
import SpinLoader from '@/components/SpinLoader.vue';
import ThreadMessage from '../components/common/ThreadMessage.vue';
import useResponse from '@/composables/useResponse';
import { uploadFiles } from '@/assets/uploadFile';
import sfetch from '@/assets/utils/sfetch';


const props = defineProps<{ 
    thread?: Thread 
}>();


const route = useRoute();
const router = useRouter();
const toast = useToast();

const thread = computed(() => props.thread);
const selectedMessage = computed<string>(() => String(route.query.select));
watch(() => selectedMessage.value, () => { setTimeout(() => { router.push({ query: { ...route.query, select: undefined } }) }, 5000) });

const currentThreadKey = ref<CryptoKey | null>(null);

interface sMessage extends Message {
    sender?: { name: string; avatarUrl: string; };
}

const selectedFiles = ref<File[]>([]);
const files = ref<any[]>([]);
const fileSendProgress = ref<null | number>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const TextareaRef = ref<InstanceType<typeof ThreadTextarea> | null>(null);
const socket = ref<any>(null);
const rawMessages = ref<Map<string, sMessage>>(new Map());
const newMessage = ref<string>("");
const messagesContainer = ref<HTMLElement | null>(null);
const loading = ref<boolean>(true);
const hasMore = ref<boolean>(true);
const isFetchingMore = ref<boolean>(false);
const sortedMessages = ref<sMessage[]>([]);
const { messageWillBeResponded, setMessageWillBeResponded } = useResponse();
const lastMessageId = ref<string>('');


// file / pj
const triggerFileSearch = () => fileInputRef.value?.click();

const handleFiles = (files: FileList | File[]) => {
    
    isDragging.value = false;
    const newFiles = Array.from(files);
    const LIMIT = 10;

    if (selectedFiles.value.length >= LIMIT) {
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

    selectedFiles.value.push(...newFiles);

};

const handlePaste = (e: ClipboardEvent) => {
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

const validUpload = async () => {

    fileSendProgress.value = 0;

    files.value = await uploadFiles(
        selectedFiles.value,
        {
            workspaceId: String(route.params.spaceId),
        },
        (percent: number) => {
            fileSendProgress.value = percent;
        }
    )

}

const updateFilesMetadata = async () => {

    const updateMetaMap = files.value.map((file) => {
        return sfetch(`/api/cdn/meta/${file.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ update: { ...file, messageId: lastMessageId.value } })
        });
    });

    await Promise.all(updateMetaMap);

    const socket = await useWSocket();
    socket.value?.emit('edit-message-files', { id: lastMessageId.value, files: files.value });

}


const processMessages = async (msgs: sMessage[]) => {
    if (!currentThreadKey.value) return msgs;
    return await Promise.all(msgs.map(async m => ({
        ...m,
        content: await decrypt(m.content, currentThreadKey.value!)
    })));
};

const handleScroll = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el.scrollTop < 200 && !isFetchingMore.value && hasMore.value) loadMore();
};

const loadMore = () => {
    if (sortedMessages.value.length === 0 || isFetchingMore.value) return;
    isFetchingMore.value = true;
    socket.value?.emit("load-more", { threadId: thread.value?.id, before: sortedMessages.value[0]?.id });
};

const initListener = () => {

    if (!socket.value) return;

    socket.value.off("thread-history").off("more-messages").off("new-message");

    socket.value.on("thread-history", async (history: sMessage[]) => {

        rawMessages.value.clear();
        history.forEach(m => rawMessages.value.set(m.id, m));
        sortedMessages.value = await processMessages(history);

        loading.value = false;
        hasMore.value = history.length >= 15;
        scrollToBottom(true);

    });

    socket.value.on("more-messages", async (more: sMessage[]) => {

        if (more.length === 0) { hasMore.value = false; isFetchingMore.value = false; return; }
        if (more.length < 20) hasMore.value = false;

        const container = messagesContainer.value;
        const scrollOffset = container ? container.scrollHeight - container.scrollTop : 0;
        
        const decryptedMore = await processMessages(more);
        sortedMessages.value = [...decryptedMore, ...sortedMessages.value];

        await nextTick();
        if (container) container.scrollTop = container.scrollHeight - scrollOffset;
        setTimeout(() => { isFetchingMore.value = false; }, 100);

    });

    socket.value.on("new-message", async (msg: sMessage) => {

        const decrypted = { ...msg, content: await decrypt(msg.content, currentThreadKey.value!) };
        sortedMessages.value.push(decrypted);
        
        const container = messagesContainer.value;
        if (container) 
        {
            const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 200;
            if (isNearBottom) scrollToBottom();
        }

    });

    socket.value.on('delete-message', (msgId: string) => {
        rawMessages.value.delete(msgId);
        sortedMessages.value = sortedMessages.value.filter(m => m.id !== msgId);
    });

    socket.value.on('edit-message', async (editedMsg: sMessage) => {
        const decryptedContent = await decrypt(editedMsg.content, currentThreadKey.value!);
        const updatedMsg = { ...editedMsg, content: decryptedContent };
        rawMessages.value.set(editedMsg.id, updatedMsg);
        sortedMessages.value = sortedMessages.value.map(m => m.id === editedMsg.id ? updatedMsg : m);
    });

};

const joinThread = async (id: string) => {

    if (!socket.value) return;
    
    loading.value = true;
    currentThreadKey.value = null;
    sortedMessages.value = [];

    const orgId = route.params.orgId as string || "no-org";

    const key = await deriveKey(orgId, id);
    
    if (!key) 
    {
        toast.show('[E2EE] Échec génération clé. Le salon restera verrouillé.', 'error')
        return;
    }

    currentThreadKey.value = key;

    socket.value.emit("join-thread", { 
        threadId: id, 
        spaceId: route.params.spaceId 
    });

    let _thread
    if (route.params.spaceId == 'home')  _thread = openedOrg.value?.home.threads.find(__thread => __thread.id == thread.value?.id);
    else _thread = (openedOrg.value?.spaces?.find(space => space.id == route.params.spaceId))?.threads.find(__thread => __thread.id == thread.value?.id);

    if (_thread) _thread.hasUnread = false;

    await nextTick();
    TextareaRef.value?.textarea?.focus();

};

const sendMessage = async () => {

    if (!newMessage.value.trim() || !socket.value || !currentThreadKey.value) return;

    const encryptedData = await encrypt(newMessage.value, currentThreadKey.value);
    
    socket.value.emit("send-message", {
        threadId: thread.value?.id,
        content: JSON.stringify(encryptedData), 
        replyToId: messageWillBeResponded.value?.id,
        nonce: "n_" + Date.now(),
        context: route.params.spaceId ? 'workspace' : 'home'
    });

    setMessageWillBeResponded(null);
    newMessage.value = "";
    scrollToBottom();

    if (selectedFiles.value.length)
    {
        await updateFilesMetadata();
        await nextTick();
        files.value = [];
        selectedFiles.value = [];
    }

};

const scrollToBottom = async (instant = false) => {
    await nextTick();
    if (messagesContainer.value) 
    {
        messagesContainer.value.scrollTo({ top: messagesContainer.value.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
    }
};

const getMessageSenderName = (msg: sMessage): string => {
    return msg.sender?.name || 'Anonyme';
};

const cancelReply = () => {
    setMessageWillBeResponded(null);
};

watch(() => messageWillBeResponded.value, () => {
    TextareaRef.value?.textarea?.focus();
});

watch(() => route.params.threadId, (newId) => {
    if (newId) joinThread(newId as string);
}, { immediate: true });

onMounted(async () => {
    socket.value = (await useWSocket()).value;
    await nextTick();
    initListener();
    await nextTick();
    joinThread(String(route.params.threadId));
    window.addEventListener('paste', handlePaste);
});

onUnmounted(() => {

    if (socket.value) 
    {
        socket.value.emit("leave-thread", thread.value?.id);
        socket.value.off("thread-history").off("more-messages").off("new-message");
    }

    window.removeEventListener('paste', handlePaste);

});

</script>