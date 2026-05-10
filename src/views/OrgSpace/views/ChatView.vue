<template>

    <div class="flex flex-col h-full bg-(--bg3) relative overflow-hidden w-full">
        
        <header 
            v-if="recipient" 
            class="h-14 flex items-center px-4 border-b border-white/5 bg-(--bg2)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-3">

                <img 
                    :src="recipient?.avatarUrl || `https://ui-avatars.com/api/?name=${recipient?.name}&background=128a60&color=fff`" 
                    :alt="recipient.name"
                    @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${recipient?.name}&background=128a60&color=fff`"
                    class="w-9 h-9 rounded-full border border-white/10"
                />

                <div class="flex flex-col">

                    <h2 class="font-bold text-(--text) tracking-wide leading-none mb-1">
                        {{ recipient.name }}
                    </h2>

                    <div class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full" :class="getColorByStatus(recipient.data!.status!)" />
                        <span class="text-[10px] text-(--text)/40 uppercase tracking-tighter font-bold">
                            {{ getTextByStatus(recipient.data!.status!) }}
                        </span>
                    </div>

                </div>

            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text)/40">

                <button @click="startCall(recipient)" class="hover:text-(--text) transition-colors">
                    <i class="bi bi-telephone-fill" />
                </button>

                <DropDown align="right">

                    <template #trigger>
                        <button class="hover:text-(--text) transition-colors">
                            <i class="bi bi-three-dots-vertical" />
                        </button>
                    </template>

                    <template #content>
                        <button 
                            @click="createPrivateMeet" 
                            class="dropdown-item-annimate dropdown-item-style"
                            title="Conversation P2P chiffrée de bout en bout."
                        >
                            Créer une session privée
                        </button>
                    </template>

                </DropDown>

            </div>

        </header>

        <main 
            ref="messagesContainer"
            @scroll="handleScroll"
            class="flex-1 overflow-y-auto p-4 custom-scrollbar w-full mb-14"
        >
                
            <div v-if="recipient" class="flex flex-col justify-end min-h-full w-full">
                    
                <div class="mb-8 p-6 border-b border-white/5 bg-white/1 rounded-2xl mx-4">
                   
                    <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 overflow-hidden border-2 border-white/10">
                        <img 
                            :src="recipient?.avatarUrl || `https://ui-avatars.com/api/?name=${recipient?.name}&background=128a60&color=fff`" 
                            class="w-full h-full object-cover" 
                        />
                    </div>

                    <h1 class="text-3xl font-black text-(--text) mb-2">{{ recipient.name }}</h1>
                    <p class="text-(--text)/50 text-sm">
                        C'est le début de votre historique de messages directs avec <b>@{{ recipient.name }}</b>.
                    </p>

                </div>

                <div class="space-y-1 w-full">

                    <template v-if="loading">

                        <div v-for="n in 10" :key="n" class="px-4 py-2 animate-pulse flex gap-3">
                            <div class="bg-white/5 rounded-full w-9 h-9 shrink-0" />
                            <div class="flex-1 space-y-2">
                                <div class="bg-white/5 w-24 h-3 rounded-full" />
                                <div class="bg-white/5 w-3/4 h-4 rounded-lg" />
                            </div>
                        </div>

                    </template>

                    <div
                        v-else
                        v-for="msg in messages" 
                        :key="msg.id" 
                        class="group px-4 py-1.5 flex flex-row justify-start items-start gap-3 hover:bg-white/2 rounded-lg transition-colors"
                    >

                        <img 
                            :src="msg.sender?.avatarUrl || `https://ui-avatars.com/api/?name=${msg.sender?.name}&background=128a60&color=fff`" 
                            class="rounded-full w-9 h-9 border border-white/5 shrink-0" 
                        />

                        <div class="min-w-0 flex-1">

                            <div class="flex items-baseline gap-2">
                             
                                <span class="text-(--primary) font-bold text-xs tracking-tight">
                                    {{ msg.sender?.name || 'Utilisateur' }}
                                </span>
                               
                                <span class="text-(--text)/20 text-[10px] font-medium">
                                    {{ formatTime(msg.createdAt) }}
                                </span>
                            
                            </div>
                            
                            <p class="text-(--text)/85 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                                {{ msg.content }}
                            </p>

                        </div>

                    </div>

                </div>

            </div>

            <div v-else class="h-full flex flex-col items-center justify-center gap-4">
                <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-4xl opacity-20">
                    <i class="bi bi-person-x" />
                </div>
                <p class="text-(--text)/40 italic font-medium">Sélectionnez une discussion.</p>
            </div>

        </main>

        <footer v-if="recipient" class="absolute bottom-0 inset-x-0 p-1 bg-transparent mt-auto">
              
            <div v-if="isSomeoneTyping" class="h-5 flex justify-start items-center px-2">
               
                <p class="text-[10px] text-(--primary)/60 animate-pulse italic">
                    {{ recipient.name }} est en train d'écrire...
                </p>

            </div>

            <div class="relative flex items-center bg-(--bg) border border-white/10 rounded-xl px-4 py-2 focus-within:border-(--primary)/50 transition-all shadow-2xl">
              
                <ThreadTextarea
                    v-model="newMessage"
                    @send="sendMessage"
                    @input="handleTyping"
                    ref="inputComponent"
                    :placeholder="'Message @' + recipient.name"
                />

                <button 
                    @click="sendMessage"
                    :disabled="!newMessage.trim()"
                    class="ml-3 transition-all hover:scale-110 disabled:opacity-20 disabled:scale-100"
                    :class="newMessage.trim() ? 'text-(--primary)' : 'text-(--text)/40'"
                >
                    <i class="bi bi-send-fill text-lg" />
                </button>

            </div>

        </footer>

    </div>

</template>

<script lang="ts" setup>

import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { OrgMember } from '@/types/types';
import { openedOrg, user } from '@/assets/var';
import useWSocket from '@/composables/useWSocket';
import type { Socket } from 'socket.io-client';
import getColorByStatus from '@/assets/utils/getColorByStatus';
import getTextByStatus from '@/assets/utils/getTextByStatus';
import { useToast } from '@/composables/useToast';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import usePeer from '@/composables/usePeer';
import DropDown from '@/components/DropDown.vue';
import waitFor from '@/assets/utils/waitfor';

import { E2EEUnloked, privateKey, encryptForPeer, decryptFromPeer, encryptAesKeyWithRsa } from '@/assets/utils/crypto';


const route = useRoute();
const router = useRouter();
const toast = useToast();
const { startCall } = usePeer();

const socket = ref<Socket | null>(null);

const isE2EEEnabled = ref<boolean>(true);
const messages = ref<any[]>([]);
const newMessage = ref<string>("");
const messagesContainer = ref<HTMLElement | null>(null);
const loading = ref<boolean>(true);
const isFetchingMore = ref<boolean>(false);
const hasMore = ref<boolean>(true);
const isSomeoneTyping = ref<boolean>(false);
let typingTimeout: any = null;
const inputComponent = ref<any>(null);

const recipient = computed(() => {
    const userId = route.params.userId;
    if (!openedOrg.value?.members) return null;
    return openedOrg.value.members.find((m: OrgMember) => m.id === userId)?.user;
});

const decryptMessageContent = async (msg: any) => {
    
    if (msg.isE2EE && privateKey.value) 
    {
        try {

            const keyToUse = (msg.senderId === user.value?.id) 
                ? msg.selfEncryptedAesKey 
                : msg.encryptedAesKey;

            msg.content = await decryptFromPeer(msg.content, keyToUse, msg.nonce, privateKey.value);

        } catch (e) {
            msg.content = "🔒 [Erreur de déchiffrement]";
        }
    }
    return msg;
};

const initListener = () => {

    if (!socket.value) return;
    
    const events = ["dm:history", "dm:new-message", "dm:user-typing"];
    events.forEach(ev => socket.value?.off(ev));

    socket.value.on('dm:history', async (history: any[]) => {
        messages.value = await Promise.all(history.map(msg => decryptMessageContent(msg)));
        loading.value = false;
        scrollToBottom(true);
    });

    socket.value.on("dm:new-message", async (msg: any) => {
        const decryptedMsg = await decryptMessageContent(msg);
        messages.value.push(decryptedMsg);
        isSomeoneTyping.value = false;
        scrollToBottom();
    });

    socket.value.on("dm:user-typing", (data: { isTyping: boolean }) => {
        isSomeoneTyping.value = data.isTyping;
    });

};

const joinDM = async (userId: string) => {
    
    loading.value = true;
    messages.value = [];
    
    socket.value?.emit("join-dm", { recipientId: userId });

};

const sendMessage = async () => {

    if (!newMessage.value.trim() || !socket.value || !recipient.value) return;

    let finalContent = newMessage.value;
    let finalEncryptedAesKey = null;
    let selfEncryptedAesKey = null;
    let finalIv = null;

    const useEncryption = isE2EEEnabled.value && E2EEUnloked.value;

    if (useEncryption) 
    {
        
        const recipientPubKey = recipient.value.publicKey;
        
        const myPubKey = user.value?.publicKey; 

        if (!recipientPubKey) 
        {
            toast.show("Clé du destinataire introuvable.", "error");
            return;
        }

        try {
            
            const encryptedData = await encryptForPeer(newMessage.value, recipientPubKey);

            finalContent = encryptedData.ciphertext;
            finalEncryptedAesKey = encryptedData.encryptedAesKey;
            finalIv = encryptedData.iv;

            if (myPubKey && encryptedData.rawKey) 
            {
                selfEncryptedAesKey = await encryptAesKeyWithRsa(
                    encryptedData.rawKey,
                    myPubKey
                );
            }

        } catch (e) {
            console.error("Erreur de chiffrement:", e);
            toast.show("Erreur lors du chiffrement.", "error");
            return;
        }
    }
    
    socket.value?.emit("dm:send-message", {
        recipientId: recipient.value.id,
        content: finalContent,
        encryptedAesKey: finalEncryptedAesKey,
        selfEncryptedAesKey: selfEncryptedAesKey,
        nonce: finalIv,
        isE2EE: useEncryption
    });

    newMessage.value = "";
    stopTyping();
};

const createPrivateMeet = () => {
    const memberId = openedOrg.value?.members?.find((m: OrgMember) => m.id === route.params.userId)?.id;
    router.push({ name: 'OrgThreadChatPrivateMeet', params: { userId: memberId } });
};

const formatTime = (date: any) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const handleScroll = (e: Event) => {
    const container = e.target as HTMLElement;
    if (container.scrollTop < 20 && !isFetchingMore.value && hasMore.value) { /* load-more logic */ }
};

const handleTyping = () => {
    if (!socket.value || !recipient.value) return;
    socket.value?.emit("dm:typing", { recipientId: recipient.value.id, isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 3000);
};

const stopTyping = () => {
    if (!socket.value || !recipient.value) return;
    socket.value?.emit("dm:typing", { recipientId: recipient.value.id, isTyping: false });
};

const scrollToBottom = async (instant = false) => {
    await nextTick();
    if (messagesContainer.value) {
        messagesContainer.value.scrollTo({
            top: messagesContainer.value.scrollHeight,
            behavior: instant ? 'auto' : 'smooth'
        });
    }
};


const mount = async () => {
    initListener();
    if (recipient.value && E2EEUnloked.value) 
    {
        await joinDM(recipient.value.id);
    }
    if (E2EEUnloked.value) 
    {
        inputComponent.value?.textarea?.focus();
    }
};

watch(() => route.params.userId, async () => {
    await mount();
});

onMounted(async () => {
    if (!route.params.userId) {
        const firstUser = openedOrg.value?.members?.[0];
        if (firstUser) router.replace({ params: { ...route.params, userId: firstUser.id  } });
    }

    const wsRef = await useWSocket();
    socket.value = wsRef.value; 

    await waitFor(() => openedOrg.value !== null);
    await waitFor(() => socket.value !== null);

    await mount();    
});

onUnmounted(() => {
    stopTyping();
});
</script>