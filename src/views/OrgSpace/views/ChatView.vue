<template>
    <div class="flex flex-col h-full bg-(--bg) relative overflow-hidden w-full">
        
        <header 
            v-if="recipient" 
            class="h-14 flex items-center px-4 border-b border-white/5 bg-(--bg)/80 backdrop-blur-md z-10"
        >
            <div class="flex items-center gap-3">
                <img 
                    :src="recipient.avatarUrl" 
                    :alt="recipient.name"
                    class="w-9 h-9 rounded-full"
                />
                <h2 class="font-bold text-(--text) tracking-wide">
                    {{ recipient.name }}
                </h2>
                <span class="w-2 h-2 rounded-full bg-green-500" />
            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text)/40">
                <button class="hover:text-(--text) transition-colors">
                    <i class="bi bi-telephone-fill" />
                </button>
            </div>
        </header>

        <main 
            ref="messagesContainer"
            @scroll="handleScroll"
            class="flex-1 overflow-y-auto p-4 custom-scrollbar bg-(--bg) w-full"
        >
            <div v-if="recipient" class="flex flex-col justify-end min-h-full w-full">
                
                <div class="mb-8 p-4">
                    <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 overflow-hidden">
                        <img :src="recipient.avatarUrl" class="w-full h-full object-cover" />
                    </div>
                    <h1 class="text-3xl font-black text-white mb-2">Conversation avec {{ recipient.name }}</h1>
                    <p class="text-(--text)/50">Début de votre conversation privée.</p>
                </div>

                <div class="space-y-6 w-full">
                    <div
                        v-if="loading || isFetchingMore"
                        v-for="index in 15" 
                        :key="'loader-mdg-' + index" 
                        class="group px-4 py-1 animate-pulse flex flex-raw justify-start items-start gap-3 hover:bg-white/[0.02] rounded-lg transition-colors"
                    >
                        <div class="bg-white/5 rounded-full w-9 h-9" />
                        <div class="space-y-2">
                            <div class="flex items-baseline bg-white/5 w-16 h-2 rounded-full" />
                            <p class="bg-white/5 w-100 h-4 rounded-full" />
                        </div>
                    </div>

                    <div
                        v-show="!loading"
                        v-for="msg in messages" 
                        :key="msg.id" 
                        class="group px-4 py-1 flex flex-raw justify-start items-start gap-3 hover:bg-white/[0.02] rounded-lg transition-colors"
                    >
                        <img 
                            v-if="msg.sender"
                            :src="msg.sender.avatarUrl"
                            class="rounded-full w-9 h-9"
                        />
                        <div>
                            <div class="flex items-baseline gap-2">
                                <span class="text-(--primary) font-bold text-xs tracking-tighter">
                                    {{ msg.sender?.name || 'Anonyme' }}
                                </span>
                                <span class="text-(--text)/20 text-[10px]">
                                    {{ new Date(msg.createdAt).toLocaleString() }}
                                </span>
                            </div>
                            <p class="text-(--text)/80 text-sm leading-relaxed break-words">
                                {{ msg.content }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="h-full flex flex-col items-center justify-center gap-4">
                <div class="text-6xl opacity-20">👤</div>
                <p class="text-(--text)/40 italic font-medium">Utilisateur introuvable.</p>
            </div>
        </main>

        <footer v-if="recipient" class="p-4 bg-transparent">
            <div class="relative flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-(--primary)/50 transition-all shadow-2xl">
                
                <textarea 
                    v-model="newMessage" 
                    type="text" 
                    :placeholder="'Message @' + recipient.name"
                    class="bg-transparent border-none outline-none resize-none flex-1 text-sm text-(--text) placeholder:text-(--text)/20 h-full"
                    @keyup.enter.prevent="sendMessage"
                />

                <div class="flex gap-3 ml-3 text-(--text)/40">
                    <button 
                        @click="sendMessage"
                        :class="newMessage.trim() ? 'text-(--primary)' : 'text-(--text)/40'"
                        class="transition-colors"
                    >
                        <i class="bi bi-send-fill" />
                    </button>
                </div>
            </div>
        </footer>
    </div>
</template>

<script lang="ts" setup>

import { computed, ref, onMounted, onUnmounted, watch, nextTick, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Message, OrgMember } from '@/types/types';
import { openedOrg } from '@/assets/var';
import useWSocket from '@/composables/useWSocket';
import type { Socket } from 'socket.io-client';

let socket: Ref<Socket | null> = ref<null>(null);
const route = useRoute();

interface sMessage extends Message {
    sender?: {
        name: string;
        avatarUrl: string;
    };
}

const messages = ref<sMessage[]>([]);
const newMessage = ref<string>("");
const messagesContainer = ref<HTMLElement | null>(null);
const loading = ref<boolean>(true);
const hasMore = ref<boolean>(true);
const isFetchingMore = ref<boolean>(false);

const recipient = computed(() => {
    const userId = route.params.userId;
    return openedOrg.value?.members?.find((m: OrgMember) => m.id === userId)?.user;
});

const handleScroll = async (e: Event) => {
    const container = e.target as HTMLElement;
    if (container.scrollTop < 20 && !isFetchingMore.value && hasMore.value) {
        loadMore();
    }
};

const loadMore = () => {

    if (messages.value.length === 0 || !recipient.value) return;
    isFetchingMore.value = true;
    const oldestMessageId = messages.value[0]?.id;

    socket.value?.emit("load-more-dm", { 
        recipientId: recipient.value.id, 
        before: oldestMessageId 
    });

};

const initListener = async () => {
    if (!socket.value) return;
    
    socket.value.off("dm-history");
    socket.value.off("more-messages-dm");
    socket.value.off("new-message-dm");

    socket.value.on("connect", () => {
        if (recipient.value) joinDM(recipient.value.id);
    });

    // --- CHANGEMENT : Event names ---
    socket.value.on('dm-history', (history: Message[]) => {
        messages.value = history;
        loading.value = false;
        scrollToBottom(true);
    });

    socket.value.on("more-messages-dm", async (moreMessages: sMessage[]) => {
        if (moreMessages.length === 0) {
            hasMore.value = false;
            isFetchingMore.value = false;
            return;
        }

        const container = messagesContainer.value;
        const previousHeight = container?.scrollHeight || 0;
        messages.value = [...moreMessages, ...messages.value];

        await nextTick();
        if (container) {
            const newHeight = container.scrollHeight;
            container.scrollTop = newHeight - previousHeight;
        }
        isFetchingMore.value = false;
    });

    socket.value.on("new-message-dm", async (msg: Message) => {
        messages.value.push(msg);
        scrollToBottom();
    });
};

// --- CHANGEMENT : joinDM au lieu de joinThread ---
const joinDM = (userId: string) => {
    messages.value = [];
    loading.value = true;
    socket.value?.emit("join-dm", { 
        recipientId: userId
    });
};

const sendMessage = () => {
    if (!newMessage.value.trim() || !socket.value || !recipient.value) return;

    // --- CHANGEMENT : Payload adapté ---
    const payload = {
        recipientId: recipient.value.id,
        content: newMessage.value, 
        nonce: "nonce_" + Date.now(),
    };

    socket.value.emit("send-dm", payload);
    newMessage.value = "";
};

const scrollToBottom = async (noSmoth: boolean = false) => {
    await nextTick();
    if (messagesContainer.value) {
        messagesContainer.value.scrollTo({
            top: messagesContainer.value.scrollHeight,
            behavior: noSmoth ? 'auto' : 'smooth'
        });
    }
};

watch(() => route.params.userId, (newId) => {
    if (newId) {
        joinDM(newId as string);
    }
});

onMounted(async () => {
    socket = await useWSocket();
    initListener();
    if (recipient.value) joinDM(recipient.value.id);
});

onUnmounted(() => {
    if (socket.value) {
        socket.value.off("dm-history");
        socket.value.off("more-messages-dm");
        socket.value.off("new-message-dm");
    }
});

</script>

<style scoped>

.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.1);
}

</style>