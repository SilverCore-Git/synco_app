<template>

    <div class="flex flex-col h-full bg-(--bg3) relative overflow-hidden w-full">
        
        <header 
            v-if="recipient" 
            class="h-14 flex items-center px-4 border-b border-(--border-color) bg-(--bg2)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-3">

                <MobileBackBtn />


                <img 
                    :src="recipient?.avatarUrl || `https://ui-avatars.com/api/?name=${$p(recipient?.name)}&background=128a60&color=fff`" 
                    :alt="$p(recipient.name)"
                    @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${$p(recipient?.name)}&background=128a60&color=fff`"
                    class="w-9 h-9 rounded-full border border-white/10"
                />

                <div class="flex flex-col">

                    <h2 class="font-bold text-(--text) tracking-wide leading-none mb-1">
                        {{ $p(recipient.name) }}
                    </h2>

                    <div class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full" :class="getColorByStatus(recipient.data!.status!)" />
                        <span class="text-[10px] text-(--text2) uppercase tracking-tighter font-bold">
                            {{ getTextByStatus(recipient.data!.status!) }}
                        </span>
                    </div>

                </div>

            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text2)">

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
                        <button
                            v-if="recipient?.publicKey"
                            @click="openKeyPanel"
                            class="dropdown-item-annimate dropdown-item-style gap-2"
                            title="Vérifier la clé de chiffrement de bout en bout."
                        >
                            <i class="bi bi-key-fill text-(--primary)" />
                            Code de sécurité
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
                    
                <div class="mb-8 p-6 border-b border-(--border-color) bg-white/1 rounded-2xl mx-4">
                   
                    <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 overflow-hidden border-2 border-white/10">
                        <img 
                            :src="recipient?.avatarUrl || `https://ui-avatars.com/api/?name=${$p(recipient?.name)}&background=128a60&color=fff`" 
                            class="w-full h-full object-cover" 
                        />
                    </div>

                    <h1 class="text-3xl font-black text-(--text) mb-2">{{ $p(recipient.name) }}</h1>
                    <p class="text-(--text2) text-sm">
                        C'est le début de votre historique de messages directs avec <b>@{{ $p(recipient.name) }}</b>.
                    </p>

                </div>

                <div class="flex flex-col w-full">

                    <template v-if="loading">

                        <div v-for="n in 10" :key="n" class="px-4 py-2 animate-pulse flex gap-3">
                            <div class="bg-white/5 rounded-full w-9 h-9 shrink-0" />
                            <div class="flex-1 space-y-2">
                                <div class="bg-white/5 w-24 h-3 rounded-full" />
                                <div class="bg-white/5 w-3/4 h-4 rounded-lg" />
                            </div>
                        </div>

                    </template>

                    <template v-else>
                        <!-- Loading more indicator -->
                        <div v-if="isFetchingMore" class="px-4 py-2 flex justify-center">
                            <div class="animate-spin h-5 w-5 border-2 border-(--primary) border-t-transparent rounded-full" />
                        </div>

                        <ChatMessage
                            v-for="(msg, index) in messages"
                            :key="msg.id"
                            :id="'msg-' + msg.id"

                            :selected-message="selectedMessage"
                            :msg="msg"
                            :messages="messages"
                            :is-stacked="index > 0 && messages[index-1].senderId === msg.senderId && !msg.replyToId && (new Date(msg.createdAt).getTime() - new Date(messages[index-1].createdAt).getTime() < 60000)"
                            :is-editing="editingMessageId === msg.id"
                            @edit-start="editingMessageId = msg.id"
                            @edit-end="endEdit"
                        />

                    </template>

                </div>

            </div>

            <div v-else class="h-full flex flex-col items-center justify-center gap-4">
                <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-4xl opacity-20">
                    <i class="bi bi-person-x" />
                </div>
                <p class="text-(--text2) italic font-medium">Sélectionnez une discussion.</p>
            </div>

        </main>

        <footer v-if="recipient" class="absolute bottom-0 inset-x-0 z-[110] p-1 bg-transparent mt-auto">

            <div v-if="isSomeoneTyping" class="h-5 flex justify-start items-center px-4 gap-2 select-none">
            
                <div class="typing-indicator">
                    <div class="typing-circle" />
                    <div class="typing-circle" />
                    <div class="typing-circle" />
                    <div class="typing-shadow" />
                    <div class="typing-shadow" />
                    <div class="typing-shadow" />
                </div>

                <p class="text-[11px] text-(--text2) italic">
                    {{ $p(recipient.name) }} est en train d'écrire
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
                        class="shrink-0 text-(--text2) hover:text-(--text) transition-colors"
                        title="Annuler la réponse"
                    >
                        <i class="bi bi-x-lg text-lg" />
                    </button>

                </div>

            </transition>

            <transition name="fade-bottom">

                <div 
                    v-if="selectedFiles.length > 0"
                    class="z-50 flex flex-wrap gap-2 mb-2 p-2 bg-(--bg)/80 backdrop-blur-3xl rounded-lg border border-(--border-color) relative overflow-hidden"
                >
                
                    <div v-if="fileSendProgress !== null" class="absolute inset-0 bg-(--bg)/40 z-10 pointer-events-none" />

                    <div
                        v-for="(file, index) in selectedFiles"
                        :key="index"
                        class="relative group bg-(--bg) border border-white/10 rounded-md px-3 py-1 flex items-center gap-2 overflow-hidden max-w-full min-w-0"
                    >
                    
                        <div 
                            v-if="fileSendProgress !== null"
                            class="absolute bottom-0 left-0 h-0.5 bg-(--primary) transition-all duration-300"
                            :style="{ width: fileSendProgress + '%' }"
                        />

                        <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-(--bg) border border-(--text)/5">

                            <i class="bi text-xl" :class="[ getSelectedFileInfo(file).color, getSelectedFileInfo(file).icon ]" />

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
                        class="mr-3 text-(--text2) hover:text-(--primary) transition-colors"
                    >
                        <i class="bi bi-plus-circle-fill text-xl" />
                    </button>

                    <ThreadTextarea
                        v-model="newMessage"
                        @send="sendMessage"
                        @input="handleTyping"
                        @edit-last="editLastOwnMessage"
                        ref="TextareaRef"
                        :placeholder="'Message @' + $p(recipient.name)"
                    />

                    <div class="flex gap-3 ml-3">
                        <button
                            @click="showEmojiPicker = !showEmojiPicker"
                            class="text-(--text2) hover:text-(--primary) transition-colors"
                            title="Ajouter un emoji"
                        >
                            <i class="bi bi-emoji-smile-fill text-xl" />
                        </button>

                        <button
                            @click="sendMessage"
                            :disabled="(!newMessage.trim() && selectedFiles.length === 0) || fileSendProgress !== null"
                            :class="(newMessage.trim() || selectedFiles.length > 0) ? 'text-(--primary)' : 'text-(--text2) opacity-50'"
                            class="transition-colors"
                        >
                            <i v-if="fileSendProgress !== null" class="bi bi-arrow-repeat animate-spin" />
                            <i v-else class="bi bi-send-fill" />
                        </button>

                    </div>

                </div>

                <div 
                    v-if="showEmojiPicker && recipient"
                    class="absolute bottom-full right-0 mb-2 z-50 emoji-picker-container"
                    @click.stop
                >
                    <EmojiPicker @select="insertEmoji" />
                </div>

            </div>

        </footer>

        <div v-if="isPrivateMeet" class="absolute inset-0 z-50 backdrop-blur-xs">
            <PrivateMeetView />
        </div>

        <Popup :isOpen="showKeyPanel" @close="showKeyPanel = false">
            <template #title>Code de sécurité</template>

            <div v-if="keyTrustState === 'changed'" class="mb-4 flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <i class="bi bi-exclamation-triangle-fill text-red-400 mt-0.5" />
                <p class="text-xs text-red-400 leading-relaxed">
                    La clé de {{ $p(recipient?.name) }} a changé depuis votre dernière conversation chiffrée.
                    Cela peut signifier qu'{{ $p(recipient?.name) }} a réinstallé l'application — ou qu'un tiers
                    intercepte vos messages. Vérifiez ce code avec {{ $p(recipient?.name) }} par un autre moyen
                    (appel, en personne) avant de faire confiance à la nouvelle clé.
                </p>
            </div>
            <p v-else class="text-sm text-(--text2) mb-4 leading-relaxed">
                Comparez ce code avec {{ $p(recipient?.name) }} par un autre moyen (appel, en personne) pour
                confirmer que vos messages sont chiffrés uniquement entre vous deux.
            </p>

            <div class="px-4 py-3 rounded-xl bg-(--bg2) border border-(--border-color) text-center">
                <span class="text-lg font-mono tracking-[0.2em] text-(--text)">{{ keyFingerprint }}</span>
            </div>

            <template #footer>
                <button @click="showKeyPanel = false" class="default">Fermer</button>
                <button v-if="keyTrustState === 'changed'" @click="trustCurrentKey" class="danger">
                    Faire confiance à cette clé
                </button>
            </template>
        </Popup>

    </div>

</template>

<script lang="ts" setup>

import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { DMMessage, OrgMember } from '@/types/types';
import { openedOrg, user } from '@/assets/var';
import useWSocket from '@/composables/useWSocket';
import type { Socket } from 'socket.io-client';
import getColorByStatus from '@/assets/utils/getColorByStatus';
import getTextByStatus from '@/assets/utils/getTextByStatus';
import { useToast } from '@/composables/useToast';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import DropDown from '@/components/DropDown.vue';
import EmojiPicker from '@/components/common/EmojiPicker.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import useSecurePeer from '@/composables/useSecurePeer';

import { E2EEUnloked, privateKey, encryptForPeer, decryptFromPeer } from '@/assets/utils/crypto';
import PrivateMeetView from './PrivateMeetView.vue';
import ChatMessage from '../components/common/ChatMessage.vue';
import { uploadFiles } from '@/assets/uploadFile';
import useResponse from '@/composables/useResponse';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { useNotification } from '@/composables/useNotification';
import { checkKeyTrust, trustKey, computeKeyFingerprint, type KeyTrustResult } from '@/assets/utils/keyTrust';
import Popup from '@/components/Popup.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { startCall } = useSecurePeer();
const { messageWillBeResponded, setMessageWillBeResponded } = useResponse();
const { markDMAsRead } = useNotification();

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
const editingMessageId = ref<string | null>(null);

const editLastOwnMessage = () => {
    const last = [...messages.value].reverse().find(m => m.senderId === user.value?.id && m.type !== 'voice_invite');
    if (!last) return;
    editingMessageId.value = last.id;
    nextTick(() => {
        document.getElementById('msg-' + last.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
};

const endEdit = () => {
    editingMessageId.value = null;
    nextTick(() => {
        TextareaRef.value?.textarea?.focus();
    });
};

const selectedFiles = ref<File[]>([]);
const fileSendProgress = ref<null | number>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const selectedMessage = computed<string>(() => String(route.query.select));
const showEmojiPicker = ref<boolean>(false);

const insertEmoji = (emoji: string) => {
  const textarea = TextareaRef.value?.textarea;
  if (!textarea) return;
  
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const newValue = newMessage.value.slice(0, start) + emoji + newMessage.value.slice(end);
  
  newMessage.value = newValue;
  showEmojiPicker.value = false;
  
  nextTick(() => {
    textarea.focus();
    textarea.selectionStart = start + emoji.length;
    textarea.selectionEnd = start + emoji.length;
  });
};

// Fermer le picker si on clique en dehors
const closeEmojiPickerOnOutsideClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  const emojiPickerElement = target.closest('.emoji-picker-container');
  const emojiButtonElement = target.closest('button[title="Ajouter un emoji"]');
  
  if (!emojiPickerElement && !emojiButtonElement) {
    showEmojiPicker.value = false;
  }
};

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

// getFileInfo expects a StoredFile (originalName/mimeType) — the preview
// chips render raw File objects (name/type) before upload, so adapt here
// rather than changing the shared util every other caller relies on.
const getSelectedFileInfo = (file: File) => getFileInfo({ originalName: file.name, mimeType: file.type } as any);

const decryptSingleMessage = async (msg: DMMessage | null | undefined): Promise<DMMessage | null> => {

        if (!msg) return null;
        
        if (!msg.content || msg.content.trim() === "") return msg;

        // Check if E2EE is unlocked and we have a private key
        if (!E2EEUnloked.value || !privateKey.value) {
            return { ...msg, content: "[🔒 E2EE non déverrouillé]" };
        }

        // Check if this message has E2EE data
        const keyToUse = (msg.senderId === user.value?.id) 
            ? msg.selfEncryptedAesKey 
            : msg.encryptedAesKey;

        // Only attempt decryption if message is marked as E2EE and has the required keys
        if (!msg.isE2EE || !keyToUse || !msg.nonce) {
            return { ...msg, content: msg.content };
        }

        try {

            const clearText = await decryptFromPeer(msg.content, keyToUse, msg.nonce, privateKey.value);
            return { ...msg, content: clearText };

        } 
        catch (cryptoErr) {
            console.error(`[E2EE] Échec du déchiffrement pour le message ${msg.id}:`, cryptoErr);
            return { ...msg, content: "[⚠️ Impossible de déchiffrer ce message.]" };
        }

};



const procesMessages = async (msgs: DMMessage[]) => {

    const BATCH_SIZE = 10;
    const results: (DMMessage | null)[] = [];

    for (let i = 0; i < msgs.length; i += BATCH_SIZE) {
        const batch = msgs.slice(i, i + BATCH_SIZE);

        const decryptedBatch = await Promise.all(batch.map(async m => {
            let decryptedMain = await decryptSingleMessage(m);
            if (!decryptedMain) return m;

            if (decryptedMain.replyMessage) {
                const decryptedReply = await decryptSingleMessage(decryptedMain.replyMessage);
                if (decryptedReply) {
                    decryptedMain.replyMessage = decryptedReply;
                }
            }

            return decryptedMain;
        }));

        results.push(...decryptedBatch);

        // Yield to main thread after each batch so the UI can paint
        if (i + BATCH_SIZE < msgs.length) {
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // Backend sends messages pre-sorted — no need to re-sort
    return results as DMMessage[];

};

const initListener = () => {

    if (!socket.value) return;
    
    const events = ["dm:history", "dm:new-message", "dm:user-typing", "dm:delete-message", "dm:edit-message", "dm-more-messages", "dm-reaction-updated", "connect"];
    events.forEach(ev => socket.value?.off(ev));

    socket.value.on("connect", () => {
        if (recipient.value?.id) {
            joinDM(recipient.value.id);
        }
    });

    socket.value.on('dm:history', async (data: { recipientId?: string; messages: any[]; hasMore: boolean } | any[]) => {
        // Handle both old format (array) and new format (object with messages and hasMore)
        const history = Array.isArray(data) ? data : data.messages;
        const receivedHasMore = Array.isArray(data) ? true : data.hasMore;
        const receivedRecipientId = Array.isArray(data) ? undefined : data.recipientId;

        if (receivedRecipientId && recipient.value?.id && receivedRecipientId !== recipient.value.id) {
            return; // Ignore history from another DM (race condition)
        }
        
        messages.value = await procesMessages(history);
        hasMore.value = receivedHasMore;
        loading.value = false;
        scrollToBottom(true);
    });

    socket.value.on('dm-more-messages', async (data: { messages: any[]; hasMore: boolean }) => {
        if (!data.messages || data.messages.length === 0) {
            hasMore.value = false;
            isFetchingMore.value = false;
            return;
        }

        const container = messagesContainer.value;
        const scrollOffset = container ? container.scrollHeight - container.scrollTop : 0;

        const decryptedMore = await procesMessages(data.messages);
        messages.value = [...decryptedMore, ...messages.value];
        hasMore.value = data.hasMore;

        await nextTick();
        if (container) container.scrollTop = container.scrollHeight - scrollOffset;
        setTimeout(() => { isFetchingMore.value = false; }, 100);
    });

    socket.value.on("dm:new-message", async (msg: any) => {
        const decryptedMsg = await decryptSingleMessage(msg);
        
        if (msg.senderId === user.value?.id) {
            const tempIndex = messages.value.findIndex(m => String(m.id).startsWith('temp-') && m.content === decryptedMsg?.content);
            if (tempIndex !== -1) {
                messages.value.splice(tempIndex, 1);
            } else {
                const fallbackTempIndex = messages.value.findIndex(m => String(m.id).startsWith('temp-'));
                if (fallbackTempIndex !== -1) messages.value.splice(fallbackTempIndex, 1);
            }
        }

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
                // Use decryptSingleMessage for consistent decryption handling
                const decrypted = await decryptSingleMessage(editedMsg);
                if (decrypted) {
                    decryptedContent = decrypted.content;
                }
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

    // Centralized reaction listener — avoids per-ChatMessage socket registration
    socket.value.on('dm-reaction-updated', (data: { dmMessageId: string; reactions: Record<string, { count: number; users: any[] }> }) => {
        const msg = messages.value.find(m => m.id === data.dmMessageId);
        if (msg) msg.reactions = data.reactions;
    });

};

const joinDM = async (userId: string) => {
    
    loading.value = true;
    messages.value = [];
    
    socket.value?.emit("join-dm", { recipientId: userId });
    markDMAsRead(userId);

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

// TOFU pinning for the recipient's E2EE public key (audit finding #3): the
// server is not treated as an authoritative source of key identity, so a
// server that swaps in an attacker's key mid-conversation is surfaced here
// instead of trusted silently — see sendMessage() below for the blocking
// check, and keyTrust.ts for the underlying store.
const showKeyPanel = ref<boolean>(false);
const keyTrustState = ref<KeyTrustResult | null>(null);
const keyFingerprint = ref<string>('');

const openKeyPanel = async () => {
    if (!recipient.value?.publicKey) return;
    keyFingerprint.value = await computeKeyFingerprint(recipient.value.publicKey);
    keyTrustState.value = await checkKeyTrust(recipient.value.id, recipient.value.publicKey);
    showKeyPanel.value = true;
};

const trustCurrentKey = async () => {
    if (!recipient.value?.publicKey) return;
    await trustKey(recipient.value.id, recipient.value.publicKey);
    keyTrustState.value = 'match';
    toast.show('Nouvelle clé de sécurité approuvée.', 'warning');
};

const sendMessage = async () => {

    if ((!newMessage.value.trim() && selectedFiles.value.length === 0) || !socket.value || !recipient.value) return;

    const clearContent = newMessage.value;
    const tempId = `temp-${Date.now()}`;
    const useEncryption = isE2EEEnabled.value && E2EEUnloked.value;

    const tempMessage = {
        id: tempId,
        content: clearContent,
        senderId: user.value?.id,
        recipientId: recipient.value.id,
        sender: user.value,
        recipient: recipient.value,
        createdAt: new Date(),
        isE2EE: useEncryption,
        isSending: true,
        replyToId: messageWillBeResponded.value?.id,
        replyMessage: messageWillBeResponded.value,
    };
    
    messages.value.push(tempMessage);
    
    setMessageWillBeResponded(null);
    newMessage.value = "";
    stopTyping();
    scrollToBottom();

    let finalContent = clearContent;
    let finalEncryptedAesKey = null;
    let selfEncryptedAesKey = null;
    let finalIv = null;

    if (useEncryption) 
    {
        
        const recipientPubKey = recipient.value.publicKey;
        const myPubKey = user.value?.publicKey; 

        if (!recipientPubKey)
        {
            toast.show("Clé du destinataire introuvable.", "error");
            messages.value = messages.value.filter(m => m.id !== tempId);
            return;
        }

        const trust = await checkKeyTrust(recipient.value.id, recipientPubKey);
        if (trust === 'changed')
        {
            toast.show(
                `La clé de sécurité de ${recipient.value.name} a changé depuis votre dernier échange. Message non envoyé — vérifiez le code de sécurité avant de continuer.`,
                'error',
                10000
            );
            messages.value = messages.value.filter(m => m.id !== tempId);
            newMessage.value = clearContent;
            keyFingerprint.value = await computeKeyFingerprint(recipientPubKey);
            keyTrustState.value = trust;
            showKeyPanel.value = true;
            return;
        }

        try {
            
            const encryptedData = await encryptForPeer(clearContent, recipientPubKey, myPubKey || undefined);

            finalContent = encryptedData.ciphertext;
            finalEncryptedAesKey = encryptedData.encryptedAesKey;
            finalIv = encryptedData.iv;
            selfEncryptedAesKey = encryptedData.selfEncryptedAesKey || null;

        } catch (e) {
            console.error("Erreur de chiffrement:", e);
            toast.show("Erreur lors du chiffrement.", "error");
            messages.value = messages.value.filter(m => m.id !== tempId);
            return;
        }
    }
    
    let uploadedFiles: any[] = [];
    if (selectedFiles.value.length) {
        fileSendProgress.value = 0;
        try {
            uploadedFiles = await uploadFiles(
                selectedFiles.value,
                { dmPeerId: recipient.value!.id },
                (percent: number) => { fileSendProgress.value = percent; }
            );
        } catch (e) {
            console.error('Erreur upload fichiers:', e);
            toast.show('Échec de l\'envoi des pièces jointes.', 'error');
        }
    }
    selectedFiles.value = [];
    fileSendProgress.value = null;

    const confirmedMessage: any = await new Promise((resolve) => {
        socket.value?.emit("dm:send-message", {
            recipientId: recipient.value!.id,
            content: finalContent,
            encryptedAesKey: finalEncryptedAesKey,
            selfEncryptedAesKey: selfEncryptedAesKey,
            nonce: finalIv,
            isE2EE: useEncryption,
            replyToId: tempMessage.replyToId,
        }, (response: any) => resolve(response));
    });

    if (confirmedMessage?.error) {
        toast.show(confirmedMessage.error, "error");
        messages.value = messages.value.filter(m => m.id !== tempId);
        return;
    }

    if (uploadedFiles.length && confirmedMessage?.id) {
        socket.value?.emit('edit-dm-message-files', { id: confirmedMessage.id, files: uploadedFiles });
    }

};

const createPrivateMeet = () => {
    const memberId = openedOrg.value?.members?.find((m: OrgMember) => m.id === route.params.userId)?.id;
    router.push({ name: 'OrgThreadChatPrivateMeet', params: { userId: memberId } });
};

const handleScroll = (e: Event) => {
    const container = e.target as HTMLElement;
    if (container.scrollTop < 100 && !isFetchingMore.value && hasMore.value) {
        loadMoreDM();
    }
};

const loadMoreDM = async () => {
    if (messages.value.length === 0 || isFetchingMore.value || !recipient.value) return;
    
    isFetchingMore.value = true;
    const firstMessageId = messages.value[0]?.id;
    
    if (firstMessageId) {
        socket.value?.emit("load-more-dm", { 
            recipientId: recipient.value.id, 
            before: firstMessageId,
            limit: 20
        });
    }
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
        if (firstUser) router.replace({ params: { ...route.params, userId: firstUser.id }, query: route.query });
    }

    const wsRef = await useWSocket();
    socket.value = wsRef.value; 

    // Reactive wait — resolves instantly if already set, otherwise watches for change
    if (!openedOrg.value) {
        await new Promise<void>(resolve => {
            const stop = watch(() => openedOrg.value, (val) => {
                if (val) { stop(); resolve(); }
            }, { immediate: true });
        });
    }
    if (!socket.value) {
        await new Promise<void>(resolve => {
            const stop = watch(() => socket.value, (val) => {
                if (val) { stop(); resolve(); }
            }, { immediate: true });
        });
    }

    await mount();
    
    // Ajouter l'écouteur pour fermer le picker sur clic extérieur
    document.addEventListener('click', closeEmojiPickerOnOutsideClick);
    window.addEventListener('paste', handlePaste);
});

onUnmounted(() => {
    stopTyping();
    document.removeEventListener('click', closeEmojiPickerOnOutsideClick);
    window.removeEventListener('paste', handlePaste);
    const sock = socket.value;
    if (sock) {
        const events = ["dm:history", "dm:new-message", "dm:user-typing", "dm:delete-message", "dm:edit-message", "dm-more-messages", "dm-reaction-updated", "connect"];
        events.forEach(ev => sock.off(ev));
    }
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