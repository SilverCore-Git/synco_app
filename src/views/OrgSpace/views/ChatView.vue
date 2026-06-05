<template>

    <div class="flex flex-col h-full bg-(--bg3) relative overflow-hidden w-full">
        
        <header 
            v-if="recipient" 
            class="h-14 flex items-center px-4 border-b border-white/5 bg-(--bg2)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-3">

                <button v-if="isLittleScreen" @click="router.push({ query: { ...route.query, showView: '0' } })">
                    <i class="bi bi-arrow-left text-2xl text-(--text)/80" />
                </button>


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

                <button @click="startCall(recipient)" class="hover:text-(--text) transition-colors" title="Appeler">
                    <i class="bi bi-telephone-fill text-xl" />
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
                            class="dropdown-item-annimate dropdown-item-style gap-2"
                            title="Conversation P2P chiffrée de bout en bout."
                        >
                            <i class="bi bi-shield-fill-check text-(--primary)" />
                            Session ephemere
                        </button>
                    </template>

                </DropDown>

            </div>

        </header>

        <main 
            ref="messagesContainer"
            @scroll="handleScroll"
            class="flex-1 overflow-y-auto p-4 custom-scrollbar w-full mb-18"
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

                    <div v-else>

                        <ChatMessage 
                            v-for="msg in messages" 
                            :key="msg.id" 

                            :selected-message="selectedMessage"
                            :msg="msg"
                            :messages="messages"
                        />

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

            <div v-if="isSomeoneTyping" class="h-5 flex justify-start items-center px-4 gap-2 select-none">
            
                <div class="typing-indicator">
                    <div class="typing-circle" />
                    <div class="typing-circle" />
                    <div class="typing-circle" />
                    <div class="typing-shadow" />
                    <div class="typing-shadow" />
                    <div class="typing-shadow" />
                </div>

                <p class="text-[11px] text-(--text)/50 italic">
                    {{ recipient.name }} est en train d'écrire
                </p>

            </div>

            <transition name="fade-bottom">

                <div 
                    v-if="messageWillBeResponded" 
                    class="
                        z-50 mb-2 flex items-center gap-3 bg-(--bg)/80 backdrop-blur-3xl
                        border border-(--primary)/30 rounded-lg px-4 py-3
                    "
                >
                    
                    <div class="flex-1 min-w-0">
                        <p class="text-md text-(--primary) font-semibold mb-1">
                            Répondre à {{ getMessageSenderName(messageWillBeResponded as any) }}
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
                    class="z-50 flex flex-wrap gap-2 mb-2 p-2 bg-(--bg)/80 backdrop-blur-3xl rounded-lg border border-white/5 relative overflow-hidden"
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

                        <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-(--bg) border border-(--text)/5">

                            <i class="bi text-xl" :class="[ getFileInfo(file as any).color, getFileInfo(file as any).icon ]" />

                        </div>

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
                        @change="(e) => handleFiles((e.target as HTMLInputElement).files)"
                    />

                    <button 
                        @click="triggerFileSearch"
                        class="mr-3 text-(--text)/40 hover:text-(--primary) transition-colors"
                    >
                        <i class="bi bi-plus-circle-fill text-xl" />
                    </button>
                    
                    <ThreadTextarea
                        v-model="newMessage"
                        @send="sendMessage"
                        @input="handleTyping"
                        ref="TextareaRef"
                        :placeholder="'Message @' + recipient.name"
                    />

                    <div 
                        v-show="!(selectedFiles.length && !files.length)"
                        class="flex gap-3 ml-3"
                    >

                        <button 
                            @click="sendMessage"
                            :disabled="(!newMessage.trim() && selectedFiles.length === 0) "
                            :class="(newMessage.trim() || selectedFiles.length > 0) ? 'text-(--primary)' : 'text-(--text)/40 opacity-50'"
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
                            
                            <span v-if="fileSendProgress == 100">Finalisation...</span>
                            <span v-else>{{ fileSendProgress }}%</span>
                            
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

        <div v-if="isPrivateMeet" class="absolute inset-0 z-50 backdrop-blur-xs">
            <PrivateMeetView />
        </div>

    </div>

</template>

<script lang="ts" setup>

import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { DMMessage, OrgMember } from '@/types/types';
import { isLittleScreen, openedOrg, user } from '@/assets/var';
import useWSocket from '@/composables/useWSocket';
import type { Socket } from 'socket.io-client';
import getColorByStatus from '@/assets/utils/getColorByStatus';
import getTextByStatus from '@/assets/utils/getTextByStatus';
import { useToast } from '@/composables/useToast';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import DropDown from '@/components/DropDown.vue';
import waitFor from '@/assets/utils/waitfor';
import useSecurePeer from '@/composables/useSecurePeer';

import { E2EEUnloked, privateKey, encryptForPeer, decryptFromPeer, encryptAesKeyWithRsa } from '@/assets/utils/crypto';
import PrivateMeetView from './PrivateMeetView.vue';
import ChatMessage from '../components/common/ChatMessage.vue';
import { uploadFiles } from '@/assets/uploadFile';
import useResponse from '@/composables/useResponse';
import { getFileInfo } from '@/assets/utils/getFileIcon';


const route = useRoute();
const router = useRouter();
const toast = useToast();
const { startCall } = useSecurePeer();
const { messageWillBeResponded, setMessageWillBeResponded } = useResponse();

const socket = ref<Socket | null>(null);

const TextareaRef = ref<InstanceType<typeof ThreadTextarea> | null>(null);
const isPrivateMeet = computed(() => route.name == 'OrgThreadChatPrivateMeet');
const isE2EEEnabled = ref<boolean>(true);
const messages = ref<any[]>([]);
const newMessage = ref<string>("");
const messagesContainer = ref<HTMLElement | null>(null);
const loading = ref<boolean>(true);
const isFetchingMore = ref<boolean>(false);
const hasMore = ref<boolean>(true);
const isSomeoneTyping = ref<boolean>(false);
let typingTimeout: any = null;

const selectedFiles = ref<File[]>([]);
const files = ref<any[]>([]);
const fileSendProgress = ref<null | number>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const selectedMessage = computed<string>(() => String(route.query.select));
watch(() => selectedMessage.value, async (newId) => {
    if (newId && newId !== 'undefined') 
    {

        await scrollToSelectedMessage();
        
        setTimeout(() => {
            router.push({ query: { ...route.query, select: undefined } });
        }, 5000);
        
    }
}, { immediate: true });

const recipient = computed(() => {
    const userId = route.params.userId;
    if (!openedOrg.value?.members) return null;
    return openedOrg.value.members.find((m: OrgMember) => m.id === userId)?.user;
});




const triggerFileSearch = () => fileInputRef.value?.click();

const handleFiles = (filesList: FileList | File[] | null) => {

    if (!filesList) return;
    isDragging.value = false;
    const newFiles = Array.from(filesList);
    const LIMIT = 10;
    const MAX_SIZE_GB = 10; 
    const MAX_SIZE_BYTES = MAX_SIZE_GB * 1024 * 1024 * 1024;

    if (selectedFiles.value.length >= LIMIT) 
    {
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
    
    const validFiles = newFiles.filter(file => {
        if (file.size > MAX_SIZE_BYTES) {
            toast.show(`Le fichier ${file.name} est trop lourd (max ${MAX_SIZE_GB}Go)`, 'error');
            return false;
        }
        return true;
    });

    selectedFiles.value.push(...validFiles);

};

// const handlePaste = (e: ClipboardEvent) => {
//     const items = e.clipboardData?.items;
//     if (!items) return;
    
//     for (const item of items) 
//     {
//         if (item.kind === 'file') 
//         {
//             const file = item.getAsFile();
//             if (file) handleFiles([file]);
//         }
//     }
// };

const cancelReply = () => {
    setMessageWillBeResponded(null);
};

watch(() => messageWillBeResponded.value, () => {
    TextareaRef.value?.textarea?.focus();
});

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

const decryptSingleMessage = async (msg: DMMessage | null | undefined): Promise<DMMessage | null> => {

        if (!msg) return null;
        
        if (!msg.content || msg.content.trim() === "") return msg;

        try {

            const keyToUse = (msg.senderId === user.value?.id) 
                ? msg.selfEncryptedAesKey 
                : msg.encryptedAesKey;

            const clearText = await decryptFromPeer(msg.content, keyToUse!, msg.nonce, privateKey.value!);
            return { ...msg, content: clearText };

        } 
        catch (cryptoErr) {
            console.error(`[E2EE] Échec du déchiffrement pour le message ${msg.id}:`, cryptoErr);
            return { ...msg, content: "[⚠️ Impossible de déchiffrer ce message.]" };
        }

};

const procesMessages = async (msgs: DMMessage[]) => {

    const decryptedMessages = await Promise.all(msgs.map(async m => {
        
        let decryptedMain = await decryptSingleMessage(m);
        if (!decryptedMain) return m;

        if (decryptedMain.replyMessage) 
        {
            const decryptedReply = await decryptSingleMessage(decryptedMain.replyMessage);
            if (decryptedReply) {
                decryptedMain.replyMessage = decryptedReply;
            }
        }

        return decryptedMain;

    }));

    return decryptedMessages.sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

};

const initListener = () => {

    if (!socket.value) return;
    
    const events = ["dm:history", "dm:new-message", "dm:user-typing"];
    events.forEach(ev => socket.value?.off(ev));

    socket.value.on('dm:history', async (history: any[]) => {
        messages.value = await procesMessages(history);
        loading.value = false;
        scrollToBottom(true);
    });

    socket.value.on("dm:new-message", async (msg: any) => {
        const decryptedMsg = await decryptSingleMessage(msg);
        messages.value.push(decryptedMsg);
        isSomeoneTyping.value = false;
        scrollToBottom();
    });

    socket.value.on('dm:delete-message', (msgId: string) => {
        messages.value = messages.value.filter(m => m.id !== msgId);
    });

    socket.value.on('dm:edit-message', async (editedMsg: DMMessage) => {

        let decryptedContent = editedMsg.content;

        if (editedMsg.content && editedMsg.content.trim() !== "") 
        {
            try {


                const keyToUse = (editedMsg.senderId === user.value?.id) 
                    ? editedMsg.selfEncryptedAesKey 
                    : editedMsg.encryptedAesKey;

                decryptedContent = await decryptFromPeer(editedMsg.content, keyToUse!, editedMsg.nonce, privateKey.value!);

            } catch (err) {
                decryptedContent = "🔒 Échec du déchiffrement lors de l'édition.";
            }
        }
        
        const updatedMsg = { ...editedMsg, content: decryptedContent };
        messages.value = messages.value.map(m => m.id === editedMsg.id ? updatedMsg : m);

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

const scrollToSelectedMessage = async () => {

    if (!selectedMessage.value || selectedMessage.value === 'undefined') return;

    await nextTick();

    const targetEl = document.getElementById(`msg-${selectedMessage.value}`);
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    console.log(targetEl)

};

const getMessageSenderName = (msg: DMMessage): string => {
    return msg.sender?.name || 'Anonyme';
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
        isE2EE: useEncryption,
        replyToId: messageWillBeResponded.value?.id,
    });

    setMessageWillBeResponded(null);
    newMessage.value = "";
    stopTyping();

};

const createPrivateMeet = () => {
    const memberId = openedOrg.value?.members?.find((m: OrgMember) => m.id === route.params.userId)?.id;
    router.push({ name: 'OrgThreadChatPrivateMeet', params: { userId: memberId } });
};

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
        TextareaRef.value?.textarea?.focus();
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

<style scoped>

.typing-indicator {
  width: 60px;
  height: 30px;
  position: relative;
  z-index: 4;
}

.typing-circle {
  width: 8px;
  height: 8px;
  position: absolute;
  border-radius: 50%;
  background-color: var(--primary);
  left: 15%;
  transform-origin: 50%;
  animation: typing-circle7124 0.5s alternate infinite ease;
}

@keyframes typing-circle7124 {
  0% {
    top: 20px;
    height: 5px;
    border-radius: 50px 50px 25px 25px;
    transform: scaleX(1.7);
  }

  40% {
    height: 8px;
    border-radius: 50%;
    transform: scaleX(1);
  }

  100% {
    top: 0%;
  }
}

.typing-circle:nth-child(2) {
  left: 45%;
  animation-delay: 0.2s;
}

.typing-circle:nth-child(3) {
  left: auto;
  right: 15%;
  animation-delay: 0.3s;
}

.typing-shadow {
  width: 5px;
  height: 4px;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.2);
  position: absolute;
  top: 30px;
  transform-origin: 50%;
  z-index: 3;
  left: 15%;
  filter: blur(1px);
  animation: typing-shadow046 0.5s alternate infinite ease;
}

@keyframes typing-shadow046 {
  0% {
    transform: scaleX(1.5);
  }

  40% {
    transform: scaleX(1);
    opacity: 0.7;
  }

  100% {
    transform: scaleX(0.2);
    opacity: 0.4;
  }
}

.typing-shadow:nth-child(4) {
  left: 45%;
  animation-delay: 0.2s;
}

.typing-shadow:nth-child(5) {
  left: auto;
  right: 15%;
  animation-delay: 0.3s;
}

</style>