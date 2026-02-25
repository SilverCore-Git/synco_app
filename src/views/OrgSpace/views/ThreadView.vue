<template>

    <div class="flex flex-col h-full bg-(--bg) relative overflow-hidden">
        
        <header 
            v-if="thread" 
            class="h-14 flex items-center px-4 border-b border-white/5 bg-(--bg)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-2">
                <i v-if="thread.type === 'text'" class="bi bi-hash text-2xl text-(--text)/40" />
                <i v-else class="bi bi-volume-up-fill text-xl text-(--text)/40" />
                <h2 class="font-bold text-(--text) tracking-wide lowercase">
                    {{ thread.name }}
                </h2>
            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text)/40">
                <button class="hover:text-(--text) transition-colors">
                    <i class="bi bi-bell-fill" />
                </button>
                <button class="hover:text-(--text) transition-colors">
                    <i class="bi bi-people-fill" />
                </button>
            </div>

        </header>

        <main 
            ref="messagesContainer"
            class="flex-1 overflow-y-auto p-4 custom-scrollbar bg-(--bg)"
        >

            <div v-if="thread" class="flex flex-col justify-end min-h-full">
                
                <div class="mb-8 p-4">
                    <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                        <i class="bi bi-hash text-4xl text-(--text)/60" />
                    </div>
                    <h1 class="text-3xl font-black text-white mb-2">Bienvenue dans #{{ thread.name }} !</h1>
                    <p class="text-(--text)/50">C'est le début de l'histoire de ce salon chiffré.</p>
                </div>

                <div class="space-y-6">

                    <div 
                        v-for="msg in messages" 
                        :key="msg.id" 
                        class="
                            group px-4 py-1
                            flex flex-raw justify-start items-start gap-3
                            hover:bg-white/[0.02] rounded-lg transition-colors"
                    >
                        
                        <img 
                            v-if="msg.sender"
                            :src="msg.sender.avatarUrl"
                            class=" rounded-full w-9 h-9"
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
                <div class="text-6xl opacity-20">🛡️</div>
                <p class="text-(--text)/40 italic font-medium">Thread introuvable ou accès refusé.</p>
            </div>

        </main>

        <footer v-if="thread" class="p-4 bg-transparent">

            <div class="relative flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-(--primary)/50 transition-all shadow-2xl">
                
                <button class="mr-3 text-(--text)/40 hover:text-(--primary) transition-colors">
                    <i class="bi bi-plus-circle-fill text-xl" />
                </button>
                
                <textarea 
                    v-model="newMessage" 
                    type="text" 
                    :placeholder="'Envoyer un message dans #' + thread.name"
                    class="
                        bg-transparent border-none outline-none 
                        resize-none flex-1 text-sm text-(--text) 
                        placeholder:text-(--text)/20 h-full
                    "
                    @keyup.enter="sendMessage"
                />

                <div class="flex gap-3 ml-3 text-(--text)/40">

                    <button class="hover:text-yellow-500 transition-colors">
                        <i class="bi bi-emoji-smile-fill" />
                    </button>

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

import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import type { Thread, WorkSpace, Message } from '@/types/types';
import { openedOrg } from '@/assets/var';
import { io, Socket } from "socket.io-client";
import sfetch from '@/assets/utils/sfetch';

const route = useRoute();

interface sMessage extends Message {
    sender?: {
        name: string;
        avatarUrl: string;
    };
}

const socket = ref<Socket | null>(null);
const messages = ref<sMessage[]>([]);
const newMessage = ref("");
const messagesContainer = ref<HTMLElement | null>(null);


const thread = computed(() => {

    let allThreads: Thread[] = [];
    const space = openedOrg.value?.spaces?.find((s: WorkSpace) => s.id === route.params.spaceId);
    if (space) allThreads = [...allThreads, ...space.threads];
    
    const org = openedOrg.value;
    if (org && org.home) allThreads = [...allThreads, ...org.home.threads];
    
    return allThreads.find((t: Thread) => t.id === route.params.threadId);

});

const getUser = async (userId: string) => {
    const res = await sfetch(`/api/users/${userId}`).then(res => res.json());
    return res;
}


const connectSocket = async () => {
    
    const token = await window.Clerk.session?.getToken();
    
    socket.value = io("http://localhost:3434", {
        path: "/socket/space",
        auth: { token }
    });

    socket.value.on("connect", () => {
        console.log("[Socket] Connecté au serveur");
        if (thread.value) joinThread(thread.value.id);
    });

    socket.value.on("new-message", async (msg: Message) => {
        const message = {
            ...msg,
            sender: await getUser(msg.senderId)
        }
        messages.value.push(message);
        scrollToBottom();
    });

    socket.value.on("error", (err: string) => {
        console.error("[Socket] Erreur:", err);
    });
    
};

const joinThread = (id: string) => {
    messages.value = []; // Reset l'interface
    socket.value?.emit("join-thread", { 
        threadId: id, 
        spaceId: route.params.spaceId 
    });
};

const sendMessage = () => {

    if (!newMessage.value.trim() || !socket.value || !thread.value) return;

    const payload = {
        threadId: thread.value.id,
        content: newMessage.value, 
        nonce: "nonce_" + Date.now(),
        context: route.params.spaceId ? 'workspace' : 'home'
    };

    socket.value.emit("send-message", payload);
    newMessage.value = "";

};


const scrollToBottom = async () => {
    await nextTick();
    if (messagesContainer.value) {
        messagesContainer.value.scrollTo({
            top: messagesContainer.value.scrollHeight,
            behavior: 'smooth'
        });
    }
};


watch(() => route.params.threadId, (newId) => {
    if (newId) joinThread(newId as string);
});

onMounted(() => {
    connectSocket();
});

onUnmounted(() => {
    if (socket.value) {
        socket.value.disconnect();
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