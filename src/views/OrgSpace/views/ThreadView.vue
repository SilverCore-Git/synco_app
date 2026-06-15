<template>

    <main 
        ref="messagesContainer"
        @scroll="handleScroll"
        class="flex-1 overflow-y-auto px-4 w-full h-full"
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

            <div class="space-y-4 w-full overflow-hidden">

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

                <div v-else class=" space-y-2 py-6">
                
                    <div 
                            v-for="msg in sortedMessages" 
                            :key="msg.id"
                            :id="'msg-' + msg.id"
                    >
                        <ThreadMessage
                            :msg="msg"
                            :selectedMessage="selectedMessage"
                            :messages="sortedMessages"
                            :currentThreadKey="currentThreadKey"
                        />
                    </div>

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
                    z-50 mb-2 flex items-center gap-3 bg-(--bg)/80 backdrop-blur-3xl
                    border border-(--primary)/30 rounded-lg px-4 py-3
                "
            >
                
                <div class="flex-1 min-w-0">
                    <p class="text-md text-(--primary) font-semibold mb-1">
                        Répondre à {{ getMessageSenderName(messageWillBeResponded as Message) }}
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

                        <template v-if="file.name.includes('67')">
                            67
                        </template>

                        <template v-else-if="file.type.startsWith('image/')">
                            <i class="bi bi-image text-(--primary)/60 text-xl" />
                        </template>

                        <template v-else-if="file.type.includes('pdf')">
                            <i class="bi bi-file-earmark-pdf text-red-400 text-xl" />
                        </template>

                        <template v-else-if="file.type.includes('zip') || file.type.includes('rar') || file.type.includes('7z') || file.type.includes('tar')">
                            <i class="bi bi-file-earmark-zip text-yellow-500 text-xl" />
                        </template>

                        <template v-else-if="file.type.includes('application/x-msdownload') || file.type.includes('exe')">
                            <i class="bi bi-terminal-fill text-blue-400 text-xl" />
                        </template>

                        <template v-else-if="file.type.startsWith('text/') || file.type.includes('javascript') || file.type.includes('json') || file.type.includes('typescript')">
                            <i class="bi bi-file-earmark-code text-indigo-400 text-xl" />
                        </template>

                        <template v-else-if="file.type.includes('word') || file.type.includes('officedocument.wordprocessingml')">
                            <i class="bi bi-file-earmark-word text-blue-500 text-xl" />
                        </template>

                        <template v-else-if="file.type.includes('excel') || file.type.includes('spreadsheetml') || file.type.includes('csv')">
                            <i class="bi bi-file-earmark-excel text-green-500 text-xl" />
                        </template>

                        <template v-else-if="file.type.includes('powerpoint') || file.type.includes('presentationml')">
                            <i class="bi bi-file-earmark-ppt text-orange-500 text-xl" />
                        </template>

                        <template v-else-if="file.type.startsWith('video/')">
                            <i class="bi bi-play-btn text-purple-400 text-xl" />
                        </template>

                        <template v-else-if="file.type.startsWith('audio/')">
                            <i class="bi bi-music-note-beamed text-pink-400 text-xl" />
                        </template>

                        <template v-else>
                            <i class="bi bi-file-earmark text-(--text)/40 text-xl" />
                        </template>

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

</template>

<script lang="ts" setup>

import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Thread, Message } from '@/types/types';
import useWSocket from '@/composables/useWSocket';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import { 
    privateKey, 
    decryptThreadKeyWithRsa, 
    encryptMessageWithContentKey, 
    decryptMessageWithContentKey 
} from '@/assets/utils/crypto';
import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';
import SpinLoader from '@/components/SpinLoader.vue';
import ThreadMessage from '../components/common/ThreadMessage.vue';
import useResponse from '@/composables/useResponse';
import { uploadFiles } from '@/assets/uploadFile';


const props = defineProps<{ 
    thread?: Thread 
}>();


const route = useRoute();
const router = useRouter();
const toast = useToast();

const thread = computed(() => props.thread);
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

const currentThreadKey = ref<CryptoKey | null>(null);

const selectedFiles = ref<File[]>([]);
const files = ref<any[]>([]);
const fileSendProgress = ref<null | number>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const TextareaRef = ref<InstanceType<typeof ThreadTextarea> | null>(null);
const socket = ref<any>(null);
const rawMessages = ref<Map<string, Message>>(new Map());
const newMessage = ref<string>("");
const messagesContainer = ref<HTMLElement | null>(null);
const loading = ref<boolean>(true);
const hasMore = ref<boolean>(true);
const isFetchingMore = ref<boolean>(false);
const sortedMessages = ref<Message[]>([]);
const { messageWillBeResponded, setMessageWillBeResponded } = useResponse();
const lastMessageId = ref<string>('');


// file / pj
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

const scrollToSelectedMessage = async () => {

    if (!selectedMessage.value || selectedMessage.value === 'undefined') return;

    await nextTick();

    const targetEl = document.getElementById(`msg-${selectedMessage.value}`);
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    console.log(targetEl)

};

// Utility function to transform Prisma reaction array to grouped object
const formatReactions = (reactions: any[]) => {
    if (!reactions || reactions.length === 0) return {};
    
    return reactions.reduce((acc: Record<string, { count: number, users: Array<{ id: string; name: string; avatarUrl?: string }> }>, reaction) => {
        if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = { count: 0, users: [] };
        }
        acc[reaction.emoji].count++;
        if (reaction.user) {
            acc[reaction.emoji].users.push({
                id: reaction.user.id,
                name: reaction.user.name,
                avatarUrl: reaction.user.avatarUrl
            });
        }
        return acc;
    }, {});
};

const procesMessages = async (msgs: Message[]) => {

    if (!currentThreadKey.value) return msgs;

    const decryptSingleMessage = async (msg: Message | null | undefined): Promise<Message | null> => {

        if (!msg) return null;
        
        if (!msg.content || msg.content.trim() === "") return msg;

        try {

            const vectorInit = msg.iv && msg.iv.trim() !== "" ? msg.iv : msg.nonce;
            
            if (!vectorInit || vectorInit.trim() === "") 
            {
                console.error('ProcesMessages : Erreur E2EE : Vecteur d\'initialisation manquant')
                return { ...msg, content: "[⚠️ Impossible de déchiffrer ce message.]" };
            }

            const clearText = await decryptMessageWithContentKey(msg.content, vectorInit, currentThreadKey.value!);
            
            // Format reactions if they exist (from Prisma array to grouped object)
            const formattedReactions = msg.reactions ? formatReactions(msg.reactions as any) : {};
            
            return { ...msg, content: clearText, reactions: formattedReactions };

        } 
        catch (cryptoErr) {
            console.error(`[E2EE] Échec du déchiffrement pour le message ${msg.id}:`, cryptoErr);
            return { ...msg, content: "[⚠️ Impossible de déchiffrer ce message.]" };
        }

    };

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

        if (decryptedMain.transferMessage)
        {
            const decryptedTransfer = await decryptSingleMessage(decryptedMain.transferMessage);
            if (decryptedTransfer) {
                decryptedMain.transferMessage = decryptedTransfer;
            }
        }

        // Ensure reactions are formatted even if message content was empty
        if (m.reactions) {
            decryptedMain.reactions = formatReactions(m.reactions as any);
        }

        return decryptedMain;

    }));

    return decryptedMessages.sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

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

    socket.value.on("thread-history", async (history: Message[]) => {
        rawMessages.value.clear();
        history.forEach(m => rawMessages.value.set(m.id, m));
        sortedMessages.value = await procesMessages(history);

        loading.value = false;
        hasMore.value = history.length >= 15;
        
        if (selectedMessage.value && selectedMessage.value !== 'undefined') 
        {
            await scrollToSelectedMessage();
        } 
        else 
        {
            scrollToBottom(true);
        }
    });

    socket.value.on("more-messages", async (more: Message[]) => {
        if (more.length === 0) { hasMore.value = false; isFetchingMore.value = false; return; }
        if (more.length < 20) hasMore.value = false;

        const container = messagesContainer.value;
        const scrollOffset = container ? container.scrollHeight - container.scrollTop : 0;
        
        const decryptedMore = await procesMessages(more);
        sortedMessages.value = [...decryptedMore, ...sortedMessages.value];

        await nextTick();
        if (container) container.scrollTop = container.scrollHeight - scrollOffset;
        setTimeout(() => { isFetchingMore.value = false; }, 100);
    });

    socket.value.on("new-message", async (msg: Message) => {
        let clearContent = msg.content;
        if (msg.content && msg.content.trim() !== "" && currentThreadKey.value) 
        {
            try {
                const vectorInit = msg.iv && msg.iv.trim() !== "" ? msg.iv : msg.nonce;
                clearContent = await decryptMessageWithContentKey(msg.content, vectorInit, currentThreadKey.value);
            } catch (err) {
                console.error("[E2EE] Échec réception à la volée :", err);
                clearContent = "🔒 Impossible de déchiffrer ce message en direct.";
            }
        }
        
        // Format reactions if they exist
        const formattedReactions = msg.reactions ? formatReactions(msg.reactions as any) : {};
        const decrypted = { ...msg, content: clearContent, reactions: formattedReactions };
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

    socket.value.on('edit-message', async (editedMsg: Message) => {
        let decryptedContent = editedMsg.content;
        if (editedMsg.content && editedMsg.content.trim() !== "" && currentThreadKey.value) 
        {
            try {
                const vectorInit = editedMsg.iv && editedMsg.iv.trim() !== "" ? editedMsg.iv : editedMsg.nonce;
                decryptedContent = await decryptMessageWithContentKey(editedMsg.content, vectorInit, currentThreadKey.value);
            } catch (err) {
                decryptedContent = "🔒 Échec du déchiffrement lors de l'édition.";
            }
        }
        // Format reactions if they exist
        const formattedReactions = editedMsg.reactions ? formatReactions(editedMsg.reactions as any) : {};
        const updatedMsg = { ...editedMsg, content: decryptedContent, reactions: formattedReactions };
        rawMessages.value.set(editedMsg.id, updatedMsg);
        sortedMessages.value = sortedMessages.value.map(m => m.id === editedMsg.id ? updatedMsg : m);
    });

};

const joinThread = async (id: string) => {

    if (!socket.value) {
        loading.value = false;
        return;
    }
    
    // Attendre que la socket soit connectée
    if (!socket.value.connected) {
        await new Promise((resolve) => {
            if (socket.value?.connected) {
                resolve(true);
            } else {
                socket.value?.once('connect', () => resolve(true));
                // Timeout au cas où
                setTimeout(() => resolve(true), 5000);
            }
        });
    }
    
    loading.value = true;
    currentThreadKey.value = null;
    sortedMessages.value = [];

    if (!privateKey.value) 
    {
        loading.value = false;
        toast.show('[E2EE] Votre clé privée est introuvable. Veuillez déverrouiller votre espace sécurisé (PIN).', 'error');
        return;
    }

    // Timeout pour éviter de rester bloqué
    const timeoutId = setTimeout(() => {
        loading.value = false;
        toast.show('[E2EE] Timeout lors de la récupération de la clé du salon.', 'error');
    }, 10000);

    socket.value.emit("get-thread-access", { threadId: id }, async (response: { encryptedKey?: string, error?: string, needsReadd?: boolean }) => {
        clearTimeout(timeoutId);

        if (response.error || !response.encryptedKey) 
        {
            // Special case: user needs to be re-added to thread (after E2EE reset)
            if (response.error && response.needsReadd) {
                loading.value = false;
                router.push({ 
                    name: 'OrgHome', 
                    params: { orgId: route.params.orgId }, 
                    query: { noRedirect: 'true' } 
                });
                toast.show(response.error, 'warning', 10000);
                return;
            }
            
            loading.value = false;
            console.error('[E2EE] erreur serveur : ', response)
            toast.show(response.error || '[E2EE] Accès refusé ou impossible de récupérer la clé du salon.', 'error');
            return;
        }

        try {

            const decryptedKey = await decryptThreadKeyWithRsa(response.encryptedKey, privateKey.value!);
            currentThreadKey.value = decryptedKey;

            socket.value.emit("join-thread", { 
                threadId: id
            });

            let _thread;
            if (route.params.spaceId == 'home')  _thread = openedOrg.value?.home.threads.find(__thread => __thread.id == thread.value?.id);
            else _thread = (openedOrg.value?.spaces?.find(space => space.id == route.params.spaceId))?.threads.find(__thread => __thread.id == thread.value?.id);

            if (_thread) _thread.hasUnread = false;

            await nextTick();
            TextareaRef.value?.textarea?.focus();

        } catch (cryptoErr) {
            console.error("[E2EE] Échec Déchiffrement Salon:", cryptoErr);
            toast.show('[E2EE] Échec du déchiffrement de la clé de session du salon.', 'error');
        } finally {
            loading.value = false;
        }

    });

};

const sendMessage = async () => {

    if (!newMessage.value.trim() || !socket.value || !currentThreadKey.value) return;

    try {

        const { ciphertext, iv } = await encryptMessageWithContentKey(newMessage.value, currentThreadKey.value);
        
        const payload = {
            threadId: thread.value?.id,
            content: ciphertext, 
            iv: iv,              
            replyToId: messageWillBeResponded.value?.id,
            nonce: "n_" + Date.now(),
            context: route.params.spaceId ? 'workspace' : 'home'
        };

        const confirmedMessage: any = await new Promise((resolve, reject) => {
            socket.value.emit("send-message", payload, (response: any) => {
                if (response?.error) reject(response.error);
                else resolve(response);
            });
        });

        lastMessageId.value = confirmedMessage.id;

        setMessageWillBeResponded(null);
        newMessage.value = "";
        scrollToBottom();

        if (selectedFiles.value.length) 
        {
            socket.value?.emit('edit-message-files', { id: lastMessageId.value, files: files.value });
            await nextTick();
            files.value = [];
            selectedFiles.value = [];
            fileSendProgress.value = null;

        }

    } catch (err) {
        console.error("Erreur lors de l'envoi du message :", err);
        toast.show('Une erreur est survenue lors de l\'envoi du message.', 'error');
    }
    
};

const scrollToBottom = async (instant = false) => {
    await nextTick();
    if (messagesContainer.value) 
    {
        messagesContainer.value.scrollTo({ top: messagesContainer.value.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
    }
};

const getMessageSenderName = (msg: Message): string => {
    return msg.sender?.name || 'Anonyme';
};

const cancelReply = () => {
    setMessageWillBeResponded(null);
};

watch(() => messageWillBeResponded.value, () => {
    TextareaRef.value?.textarea?.focus();
});

watch(() => props.thread?.id, (newId) => {
    if (newId) joinThread(newId as string);
}, { immediate: true });

onMounted(async () => {
    const ws = await useWSocket();
    socket.value = ws.value;
    
    initListener();
    window.addEventListener('paste', handlePaste);

    if (route.params.threadId) 
    {
        await joinThread(String(route.params.threadId));
    }
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