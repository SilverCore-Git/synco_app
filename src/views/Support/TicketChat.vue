<template>
    <div class="flex flex-col h-full bg-(--bg) relative overflow-hidden w-full">
        <main 
            ref="messagesContainer"
            class="flex-1 overflow-y-auto p-4 custom-scrollbar w-full mb-18"
        >
            <div v-if="ticket" class="flex flex-col justify-end min-h-full w-full">
                <div class="mb-8 p-6 border-b border-(--border-color) bg-(--bg2) rounded-2xl mx-4">
                    <div class="w-16 h-16 rounded-full bg-(--primary)/20 flex items-center justify-center mb-4 text-(--primary)">
                        <i class="bi bi-headset text-2xl"></i>
                    </div>
                    <h1 class="text-2xl font-black text-(--text) mb-2">{{ ticket.subject }}</h1>
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/5 text-(--text2)">
                            {{ ticket.domain }}
                        </span>
                        <span class="text-xs text-(--text2)">Ticket #{{ ticket.id.substring(0, 8) }}</span>
                    </div>
                    <p class="text-(--text2) text-sm">
                        L'équipe de support vous répondra dans les plus brefs délais. Vos messages sont chiffrés de bout en bout.
                    </p>
                </div>

                <div class="flex flex-col w-full space-y-4">
                    <template v-if="loading">
                        <div v-for="n in 5" :key="n" class="px-4 py-2 animate-pulse flex gap-3">
                            <div class="bg-white/5 rounded-full w-9 h-9 shrink-0" />
                            <div class="flex-1 space-y-2">
                                <div class="bg-white/5 w-24 h-3 rounded-full" />
                                <div class="bg-white/5 w-3/4 h-4 rounded-lg" />
                            </div>
                        </div>
                    </template>

                    <template v-else>
                        <div v-for="msg in messages" :key="msg.id" class="px-4 py-1 flex gap-3 group">
                            <div class="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
                                <img v-if="msg.sender?.avatarUrl" :src="msg.sender.avatarUrl" class="w-full h-full object-cover" />
                                <i v-else class="bi bi-person-fill text-(--text2)"></i>
                            </div>
                            <div class="flex flex-col min-w-0">
                                <div class="flex items-baseline gap-2 mb-0.5">
                                    <span class="font-bold text-sm text-(--text)">{{ msg.sender?.name || 'Support' }}</span>
                                    <span class="text-[10px] text-(--text2)">{{ new Date(msg.createdAt).toLocaleTimeString() }}</span>
                                    <span v-if="msg.isSupport" class="text-[10px] uppercase font-bold text-(--primary) bg-(--primary)/10 px-1 rounded">Équipe Support</span>
                                </div>
                                <div class="text-sm text-(--text) whitespace-pre-wrap break-words leading-relaxed opacity-90">{{ msg.content }}</div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </main>

        <footer class="absolute bottom-0 inset-x-0 p-2 bg-(--bg2) border-t border-(--border-color)">
            <div class="relative flex items-center bg-(--bg) border border-white/10 rounded-xl px-4 py-2 focus-within:border-(--primary)/50 transition-all">
                <textarea
                    v-model="newMessage"
                    @keydown.enter.prevent="sendMessage"
                    class="flex-1 bg-transparent border-none focus:outline-none text-sm text-(--text) resize-none py-1 custom-scrollbar"
                    rows="1"
                    placeholder="Écrivez votre message..."
                ></textarea>

                <button 
                    @click="sendMessage"
                    :disabled="!newMessage.trim()"
                    :class="newMessage.trim() ? 'text-(--primary)' : 'text-(--text2) opacity-50'"
                    class="ml-3 transition-colors shrink-0"
                >
                    <i class="bi bi-send-fill text-lg"></i>
                </button>
            </div>
        </footer>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { user } from '@/assets/var';
import useWSocket from '@/composables/useWSocket';
import { E2EEUnloked, privateKey, decryptThreadKeyWithRsa, encryptMessageWithContentKey, decryptMessageWithContentKey } from '@/assets/utils/crypto';
import { useToast } from '@/composables/useToast';

const props = defineProps<{
    ticket: any;
}>();

const toast = useToast();

const socket = ref<any>(null);
const messages = ref<any[]>([]);
const newMessage = ref('');
const loading = ref(true);
const messagesContainer = ref<HTMLElement | null>(null);

let currentThreadKey: CryptoKey | null = null;

const scrollToBottom = async () => {
    await nextTick();
    if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
};

const setupCrypto = async () => {
    if (!E2EEUnloked.value || !privateKey.value || !props.ticket.userEncryptedKey) return;
    try {
        currentThreadKey = await decryptThreadKeyWithRsa(props.ticket.userEncryptedKey, privateKey.value);
    } catch (e) {
        toast.show('Erreur de déchiffrement du ticket', 'error');
    }
};

const decryptMsg = async (msg: any) => {
    if (!msg.content || !msg.iv || !currentThreadKey) return msg;
    try {
        const decryptedContent = await decryptMessageWithContentKey(msg.content, msg.iv, currentThreadKey);
        return { ...msg, content: decryptedContent };
    } catch (e) {
        return { ...msg, content: '[⚠️ Message chiffré illisible]' };
    }
};

const initListener = () => {
    if (!socket.value) return;

    socket.value.on('ticket:history', async (data: any[]) => {
        loading.value = false;
        messages.value = await Promise.all(data.map(m => decryptMsg(m)));
        scrollToBottom();
    });

    socket.value.on('ticket:new-message', async (msg: any) => {
        const tempIndex = messages.value.findIndex(m => String(m.id).startsWith('temp-') && m.senderId === user.value?.id);
        if (tempIndex !== -1) messages.value.splice(tempIndex, 1);
        
        messages.value.push(await decryptMsg(msg));
        scrollToBottom();
    });

    socket.value.emit('join-ticket', { ticketId: props.ticket.id });
};

const sendMessage = async () => {
    if (!newMessage.value.trim() || !socket.value || !currentThreadKey) return;

    const clearContent = newMessage.value;
    newMessage.value = '';

    const tempMessage = {
        id: `temp-${Date.now()}`,
        content: clearContent,
        senderId: user.value?.id,
        sender: user.value,
        createdAt: new Date(),
        isSending: true
    };
    messages.value.push(tempMessage);
    scrollToBottom();

    try {
        const { ciphertext, iv } = await encryptMessageWithContentKey(clearContent, currentThreadKey);
        
        socket.value.emit('ticket:send-message', {
            ticketId: props.ticket.id,
            content: ciphertext,
            iv: iv
        });
    } catch (e) {
        toast.show('Erreur lors de l\'envoi chiffré', 'error');
        messages.value = messages.value.filter(m => m.id !== tempMessage.id);
    }
};

onMounted(async () => {
    socket.value = (await useWSocket()).value;
    await setupCrypto();
    initListener();
});

onUnmounted(() => {
    if (socket.value) {
        socket.value.off('ticket:history');
        socket.value.off('ticket:new-message');
    }
});
</script>
