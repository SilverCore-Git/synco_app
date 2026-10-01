<template>

    <main 
        ref="messagesContainer"
        @scroll="handleScroll"
        @media-loaded="onMediaLoaded"
        class="flex-1 overflow-y-auto px-4 w-full h-full"
        :style="{ marginBottom: footerHeight + 'px' }"
    >

        <div 
            v-if="thread" 
            class="flex flex-col justify-end min-h-full w-full"
        >

            <div class="mb-8 p-4">

                <div class="w-16 h-16 rounded-2xl bg-(--text)/5 flex items-center justify-center mb-4">
                    <i class="bi bi-hash text-4xl text-(--text2)" />
                </div>

                <h1 class="text-3xl font-black text-(--text) mb-2">#{{ thread.name }}</h1>

                <p class="text-(--text2) flex items-center gap-2">
                    C'est le début de l'histoire de ce thread.
                </p>

            </div>

            <div class="w-full overflow-hidden">

                <div v-if="isFetchingMore" class="flex justify-center py-4">
                    <SpinLoader />
                </div>

                <template v-if="loading">

                    <div 
                        v-for="i in 10" 
                        :key="i"
                        class="flex gap-3 px-4 py-1 animate-pulse"
                    >

                        <div class="bg-(--text)/5 rounded-full w-9 h-9 shrink-0" />

                        <div class="space-y-2 flex-1">
                            <div class="bg-(--text)/5 w-24 h-3 rounded" />
                            <div class="bg-(--text)/5 w-full h-4 rounded" />
                        </div>

                    </div>

                </template>

                <div v-else class=" py-6 flex flex-col">
                
                    <div 
                            v-for="(msg, index) in sortedMessages" 
                            :key="msg.id"
                            :id="'msg-' + msg.id"
                    >
                        <div v-if="showUnreadDelimiterAfterId === msg.id" class="flex items-center gap-4 my-6">
                            <div class="h-px flex-1 bg-red-500/50"></div>
                            <span class="text-xs font-bold text-red-500 uppercase tracking-widest">Nouveaux messages</span>
                            <div class="h-px flex-1 bg-red-500/50"></div>
                        </div>
                        <ThreadMessage
                            :msg="msg"
                            :selectedMessage="selectedMessage"
                            :messages="sortedMessages"
                            :currentThreadKey="currentThreadKey"
                            :is-stacked="index > 0 && sameAuthor(sortedMessages[index-1]!, msg) && !msg.replyToId && (new Date(msg.createdAt).getTime() - new Date(sortedMessages[index-1]!.createdAt).getTime() < 60000)"
                            :is-editing="editingMessageId === msg.id"
                            @edit-start="editingMessageId = msg.id"
                            @edit-end="endEdit"
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
            <div class="w-16 h-16 rounded-2xl bg-(--text)/5 flex items-center justify-center mb-4 border border-(--primary)/10">
                <i class="bi bi-hash text-4xl text-(--text2)" />
            </div>
            <p class="text-(--text) italic font-medium">Thread introuvable ou accès refusé.</p>
        </div>

    </main>

    <footer v-if="thread" ref="footerRef" class="absolute bottom-0 inset-x-0 z-[110] p-1 bg-transparent mt-auto">

        <transition name="fade-bottom">

            <ReplyBanner
                v-if="messageWillBeResponded"
                :msg="messageWillBeResponded"
                @cancel="cancelReply"
            />

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
                    class="relative group bg-(--bg) border border-(--text)/10 rounded-md px-3 py-1 flex items-center gap-2 overflow-hidden max-w-full min-w-0"
                >
                
                    <div 
                        v-if="fileSendProgress !== null"
                        class="absolute bottom-0 left-0 h-0.5 bg-(--primary) transition-all duration-300"
                        :style="{ width: (fileProgress[index] ?? 0) + '%' }"
                    />

                    <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-(--bg) border border-(--text)/5">

                        <i class="bi text-xl" :class="[ getSelectedFileInfo(file).color, getSelectedFileInfo(file).icon ]" />

                    </div>

                    <span class="text-xs truncate max-w-50">{{ file.name }}</span>
                    <span v-if="fileSendProgress !== null" class="text-[10px] tabular-nums text-(--text2) shrink-0 w-8 text-right">
                        <i v-if="(fileProgress[index] ?? 0) >= 100" class="bi bi-check-lg text-(--primary)" />
                        <template v-else>{{ fileProgress[index] ?? 0 }}%</template>
                    </span>

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
            v-if="canSpeak"
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

            <div class="relative flex items-center bg-(--bg) border border-(--text)/10 rounded-xl px-4 py-2 focus-within:border-(--primary)/50 transition-all shadow-2xl">
                
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
                    @edit-last="editLastOwnMessage"
                    :placeholder="currentThreadKey ? 'Envoyer un message...' : loading ? 'Génération de la clé...' : (debugMsg || 'Erreur : Clé introuvable, rechargez la page')"
                    :disabled="!currentThreadKey"
                    ref="TextareaRef"
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
                        :disabled="(!newMessage.trim() && selectedFiles.length === 0) || !currentThreadKey || fileSendProgress !== null"
                        :class="(newMessage.trim() || selectedFiles.length > 0) && currentThreadKey ? 'text-(--primary)' : 'text-(--text2) opacity-50'"
                        class="transition-colors"
                    >
                        <i v-if="fileSendProgress !== null" class="bi bi-arrow-repeat animate-spin" />
                        <i v-else class="bi bi-send-fill" />
                    </button>

                </div>

                <div
                    v-if="showEmojiPicker && thread"
                    class="absolute bottom-full right-0 mb-2 z-50 emoji-picker-container"
                    @click.stop
                >
                    <EmojiPicker @select="insertEmoji" />
                </div>

            </div>

        </div>

    </footer>

    <div v-else-if="thread && !canSpeak" class="absolute bottom-0 inset-x-0 p-4 bg-transparent mt-auto pointer-events-none">
        <div class="bg-(--bg)/80 backdrop-blur-3xl border border-(--text)/10 rounded-xl px-4 py-3 flex items-center justify-center gap-3 shadow-2xl">
            <i class="bi bi-megaphone-fill text-(--primary) text-lg" />
            <span class="text-(--text) text-sm font-medium">Vous ne pouvez pas parler dans ce salon.</span>
        </div>
    </div>

</template>

<script lang="ts" setup>

import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Thread, Message } from '@/types/types';
import useWSocket from '@/composables/useWSocket';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import EmojiPicker from '@/components/common/EmojiPicker.vue';
import { 
    privateKey, 
    decryptThreadKeyWithRsa, 
    encryptMessageWithContentKey, 
    decryptMessageWithContentKey 
} from '@/assets/utils/crypto';
import { useToast } from '@/composables/useToast';
import { openedOrg, user } from '@/assets/var';
import SpinLoader from '@/components/SpinLoader.vue';
import ThreadMessage from '../components/common/ThreadMessage.vue';
import ReplyBanner from '../components/common/ReplyBanner.vue';
import useFooterInset from '@/composables/useFooterInset';
import useResponse from '@/composables/useResponse';
import { extractReferenceTokens } from '@/composables/useReferences';
import { uploadFiles } from '@/assets/uploadFile';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { waitForSocketConnection } from '@/composables/useWSocket';
import { getCachedThreadKey, setCachedThreadKey, invalidateThreadKey } from '@/assets/utils/threadKeyCache';

import { SearchSyncService } from '@/services/SearchSyncService';
import { localSearchDB } from '@/services/LocalSearchVectorDB';
import { useNotification } from '@/composables/useNotification';


const props = defineProps<{ 
    thread?: Thread 
}>();


const route = useRoute();
const router = useRouter();
const toast = useToast();
const { markThreadAsRead } = useNotification();

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
const fileSendProgress = ref<null | number>(null);
// Progression de chaque fichier en cours d'envoi (même index que selectedFiles).
const fileProgress = ref<number[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const TextareaRef = ref<InstanceType<typeof ThreadTextarea> | null>(null);
const socket = ref<any>(null);
const newMessage = ref<string>("");
const messagesContainer = ref<HTMLElement | null>(null);
const footerRef = ref<HTMLElement | null>(null);
const { footerHeight } = useFooterInset(footerRef, messagesContainer, 56);
const loading = ref<boolean>(true);
const debugMsg = ref<string>('');
const hasMore = ref<boolean>(true);
const isFetchingMore = ref<boolean>(false);
const sortedMessages = ref<Message[]>([]);
const { messageWillBeResponded, setMessageWillBeResponded } = useResponse();
const lastMessageId = ref<string>('');
const showEmojiPicker = ref<boolean>(false);
const showUnreadDelimiterAfterId = ref<string | null>(null);
const editingMessageId = ref<string | null>(null);

const editLastOwnMessage = () => {
    const last = [...sortedMessages.value].reverse().find(m => m.senderId === user.value?.id);
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

const saveLastRead = () => {
    if (!thread.value || sortedMessages.value.length === 0) return;
    const lastMsg = sortedMessages.value[sortedMessages.value.length - 1];
    if (!lastMsg) return;
    localStorage.setItem(`lastRead_${thread.value.id}`, lastMsg.id);
};

import globalVectorWorker from '@/services/GlobalVectorWorker';

const handleWorkerMessage = async (e: MessageEvent) => {
    const { status, id, vector, text, type, metadata } = e.data;
    if (status === 'complete' && currentThreadKey.value && type === 'MESSAGE') {
        const workspaceId = (route.params.spaceId as string) || null;
        if (!workspaceId) return; // Only indexing workspace threads for now

        // Insert locally
        await localSearchDB.insertDocument({
            id,
            workspaceId,
            type,
            textContent: text,
            vector,
            metadata
        });
        
        // Sync to backend (E2EE)
        await SearchSyncService.syncIndex(
            workspaceId,
            thread.value?.id || null,
            type,
            id,
            text,
            vector,
            currentThreadKey.value,
            metadata
        );
    }
};




const canSpeak = computed(() => {
    if (!thread.value) return false;
    if (!thread.value.isReadOnly) return true;
    
    const userId = user.value?.id;
    if (!userId) return false;

    // 1. Thread owner
    if (thread.value.ownerId === userId) return true;
    
    // 2. WritersId
    if (thread.value.writersId && thread.value.writersId.includes(userId)) return true;
    
    // 3. Org/Space Admin or Owner
    const currentMember = openedOrg.value?.members?.find(m => m.userId === userId);
    if (currentMember && ['ADMIN', 'OWNER'].includes(currentMember.role || '')) return true;

    if (openedOrg.value?.ownerId === userId) return true;

    return false;
});

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

// getFileInfo expects a StoredFile (originalName/mimeType) — the preview
// chips render raw File objects (name/type) before upload, so adapt here
// rather than changing the shared util every other caller relies on.
const getSelectedFileInfo = (file: File) => getFileInfo({ originalName: file.name, mimeType: file.type } as any);

const scrollToSelectedMessage = async () => {

    if (!selectedMessage.value || selectedMessage.value === 'undefined') return;

    await nextTick();

    const targetEl = document.getElementById(`msg-${selectedMessage.value}`);
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

};

// Un message webhook n'a pas de senderId (jamais d'expéditeur humain) : deux
// messages webhook consécutifs comparent donc toujours senderId=null à
// senderId=null. On compare webhookId dans ce cas pour ne pas regrouper deux
// bots différents comme s'ils étaient le même expéditeur.
const sameAuthor = (a: Message, b: Message): boolean => {
    if (a.isWebhook || b.isWebhook) return a.isWebhook === b.isWebhook && a.webhookId === b.webhookId;
    return a.senderId === b.senderId;
};

// Utility function to transform Prisma reaction array to grouped object
const formatReactions = (reactions: any[]) => {
    if (!reactions || reactions.length === 0) return {};
    
    return reactions.reduce((acc: Record<string, { count: number, users: Array<{ id: string; name: string; avatarUrl?: string }> }>, reaction) => {
        if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = { count: 0, users: [] };
        }
        acc[reaction.emoji]!.count++;
        if (reaction.user) {
            acc[reaction.emoji]!.users.push({
                id: reaction.user.id,
                name: reaction.user.name,
                avatarUrl: reaction.user.avatarUrl
            });
        }
        return acc;
    }, {});
};

const procesMessages = async (msgs: Message[], key: CryptoKey | null = currentThreadKey.value) => {

    if (!key) return msgs;

    const decryptSingleMessage = async (msg: Message | null | undefined): Promise<Message | null> => {

        if (!msg) return null;
        if (!msg.content || msg.content.trim() === "") return msg;
        if (msg.isWebhook) return msg;

        try {

            const vectorInit = msg.iv && msg.iv.trim() !== "" ? msg.iv : msg.nonce;
            
            if (!vectorInit || vectorInit.trim() === "") 
            {
                console.error('ProcesMessages : Erreur E2EE : Vecteur d\'initialisation manquant')
                return { ...msg, content: "[⚠️ Impossible de déchiffrer ce message.]" };
            }

            const clearText = await decryptMessageWithContentKey(msg.content, vectorInit, key);
            
            // Format reactions if they exist (from Prisma array to grouped object)
            // reactions can be either an array (from Prisma) or already grouped (from WebSocket updates)
            const formattedReactions = msg.reactions 
                ? (Array.isArray(msg.reactions) ? formatReactions(msg.reactions as any) : msg.reactions)
                : {};
            
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

        // Le transfert de message est une fonctionnalité en attente : le
        // serveur ne l'envoie plus dans l'historique allégé, mais les anciens
        // formats (et la future fonctionnalité) peuvent encore le porter.
        if (decryptedMain.transferMessage)
        {
            const decryptedTransfer = await decryptSingleMessage(decryptedMain.transferMessage);
            if (decryptedTransfer) {
                decryptedMain.transferMessage = decryptedTransfer;
            }
        }

        // Ensure reactions are formatted even if message content was empty
        if (m.reactions) {
            decryptedMain.reactions = Array.isArray(m.reactions) 
                ? formatReactions(m.reactions as any) 
                : m.reactions;
        }

        return decryptedMain;

    }));

    return decryptedMessages.sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

};

// Vrai tant que l'utilisateur est (presque) en bas du fil. Une pièce jointe
// média qui finit de se charger agrandit son message (MessageMedia émet
// l'événement DOM `media-loaded`) : on se recolle alors en bas au lieu de
// laisser le dernier message glisser hors de l'écran.
let stickToBottom = true;

const onMediaLoaded = () => {
    if (stickToBottom) scrollToBottom(true);
};

const handleScroll = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el.scrollTop < 200 && !isFetchingMore.value && hasMore.value) loadMore();
    
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 10;
    stickToBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 120;
    if (isAtBottom) saveLastRead();
};

// Salon pour lequel le dernier "charger plus" a été demandé.
let loadMoreFor: string | null = null;

const loadMore = () => {
    if (sortedMessages.value.length === 0 || isFetchingMore.value || !thread.value) return;
    isFetchingMore.value = true;
    loadMoreFor = thread.value.id;
    socket.value?.emit("load-more", { threadId: thread.value.id, before: sortedMessages.value[0]?.id, lite: true });
};

// "connect", "disconnect" et "thread:deleted" sont aussi écoutés ailleurs
// (useWSocket.ts, OrgLayout.vue) : on ne retire que NOS handlers, jamais
// l'événement entier.
const onReconnect = () => {
    const id = thread.value?.id;
    // Join émis hors ligne : socket.io l'a mis en file et l'envoie à la
    // connexion, sa réponse arrivera — pas de doublon.
    if (!id || joinInFlight === id) return;
    // Un simple aller-retour de connexion (coupure réseau, mise en veille,
    // redémarrage serveur...) alors qu'on regarde déjà ce salon ne doit pas
    // se voir : rejoin silencieux plutôt qu'un rechargement complet
    // (skeleton + liste vidée + saut de scroll).
    joinThread(id, joinedThreadId === id);
};

const onDisconnect = () => {
    // Un join-thread parti avant la coupure n'aura jamais de réponse : on
    // l'abandonne pour que onReconnect puisse le relancer.
    if (joinInFlight) {
        joinInFlight = null;
        joinSeq++;
    }
};

// The sidebar (OrgLayout.vue) already removes the thread from the list
// on this event — here we also need to move a user actively viewing it
// elsewhere, since otherwise they're left on a dead route.
const onThreadDeleted = ({ threadId }: { threadId: string }) => {
    if (threadId !== thread.value?.id) return;
    toast.show('Ce salon a été supprimé.', 'warning');
    router.push({
        name: 'OrgHome',
        params: { orgId: route.params.orgId },
        query: { noRedirect: 'true' }
    });
};

const THREAD_EVENTS = ["more-messages", "new-message", "keys-distributed", "delete-message", "edit-message", "message-reaction-updated"];

const removeListeners = () => {
    const sock = socket.value;
    if (!sock) return;
    THREAD_EVENTS.forEach(ev => sock.off(ev));
    sock.off("connect", onReconnect);
    sock.off("disconnect", onDisconnect);
    sock.off("thread:deleted", onThreadDeleted);
};

const initListener = () => {

    if (!socket.value) return;

    removeListeners();

    socket.value.on("connect", onReconnect);
    socket.value.on("disconnect", onDisconnect);
    socket.value.on("thread:deleted", onThreadDeleted);

    socket.value.on("keys-distributed", async ({ threadId }: { threadId: string }) => {
        if (threadId === thread.value?.id) {
            // Nouvelle clé distribuée : celle en cache (s'il y en a une) est périmée.
            invalidateThreadKey(threadId);
            joinThread(threadId);
        }
    });

    socket.value.on("more-messages", async (more: Message[]) => {
        // Réponse à un "charger plus" d'un salon qu'on a quitté depuis.
        if (loadMoreFor !== thread.value?.id) { isFetchingMore.value = false; return; }

        if (more.length === 0) { hasMore.value = false; isFetchingMore.value = false; return; }
        if (more.length < 20) hasMore.value = false;

        const seq = joinSeq;
        const decryptedMore = await procesMessages(more);
        if (seq !== joinSeq) return;

        const container = messagesContainer.value;
        const scrollOffset = container ? container.scrollHeight - container.scrollTop : 0;
        
        sortedMessages.value = [...decryptedMore, ...sortedMessages.value];

        await nextTick();
        if (container) container.scrollTop = container.scrollHeight - scrollOffset;
        setTimeout(() => { isFetchingMore.value = false; }, 100);
    });

    socket.value.on("new-message", async (msg: Message) => {
        if (msg.threadId !== thread.value?.id) return;

        // Reuses procesMessages() rather than decrypting msg.content by hand here, so a
        // live-pushed message gets the same recursive decryption of replyMessage/transferMessage
        // as history load does — the two used to disagree, leaving a just-sent reply's quote
        // box showing raw ciphertext until the next full reload.
        const decrypted = (await procesMessages([msg]))[0] ?? msg;
        if (msg.threadId !== thread.value?.id) return;
        const clearContent = decrypted.content;
        sortedMessages.value.push(decrypted);
        
        const container = messagesContainer.value;
        if (container) 
        {
            const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 200;
            if (isNearBottom) {
                scrollToBottom();
                setTimeout(() => { saveLastRead(); }, 100);
            }
        }

        // Generate vector for the newly received message if we have the content
        if (clearContent && !clearContent.startsWith("[⚠️") && !msg.isWebhook) {
            const hasFiles = Array.isArray(msg.files) && msg.files.length > 0;
            let vectorText = clearContent;
            if (hasFiles) {
                const fileNames = msg.files?.map((f: any) => f.originalName || '').join(' ') || '';
                vectorText = clearContent.trim() === '' ? fileNames : `${clearContent}\n${fileNames}`;
                if (!vectorText.trim()) vectorText = 'Fichier joint';
            }

            globalVectorWorker.postMessage({
                id: msg.id,
                text: vectorText,
                type: hasFiles ? 'FILE' : 'MESSAGE',
                metadata: { 
                    threadId: thread.value?.id,
                    senderName: msg.sender?.name,
                    senderAvatar: msg.sender?.avatarUrl,
                    createdAt: msg.createdAt
                }
            });
        }
    });

    socket.value.on('delete-message', (msgId: string) => {
        sortedMessages.value = sortedMessages.value.filter(m => m.id !== msgId);
    });

    socket.value.on('edit-message', async (editedMsg: Message) => {
        if (editedMsg.threadId !== thread.value?.id) return;
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
        // reactions can be either an array (from Prisma) or already grouped (from WebSocket)
        const formattedReactions = editedMsg.reactions 
            ? (Array.isArray(editedMsg.reactions) ? formatReactions(editedMsg.reactions as any) : editedMsg.reactions)
            : {};
        // The edit payload carries no replyMessage/transferMessage — keep the
        // already-decrypted ones (an edit never changes what a message quotes),
        // otherwise the quote box vanishes after an edit or attachment upload.
        const previous = sortedMessages.value.find(m => m.id === editedMsg.id);
        const updatedMsg = {
            ...editedMsg,
            content: decryptedContent,
            reactions: formattedReactions,
            replyMessage: previous?.replyMessage ?? editedMsg.replyMessage,
            transferMessage: previous?.transferMessage ?? editedMsg.transferMessage,
        };
        sortedMessages.value = sortedMessages.value.map(m => m.id === editedMsg.id ? updatedMsg : m);
    });

    // Un seul écouteur pour tout le salon, au lieu d'un par ThreadMessage
    // (20 à 60 écouteurs ajoutés puis retirés à chaque ouverture, tous
    // appelés à chaque réaction).
    socket.value.on('message-reaction-updated', (data: { messageId: string; reactions: Record<string, { count: number; users: any[] }> }) => {
        const msg = sortedMessages.value.find(m => m.id === data.messageId);
        if (msg) msg.reactions = data.reactions;
    });

};

// Id du salon pour lequel on a déjà chargé l'historique avec succès. Sert à
// distinguer "on ouvre/change réellement de salon" (où un état de
// chargement visible est normal) de "le socket vient de se reconnecter
// alors qu'on regarde toujours le même salon" (où un rechargement visuel
// complet — skeleton + liste vidée + saut de scroll forcé — n'a aucune
// raison d'être : socket.io se reconnecte tout seul en continu, y compris
// sur une simple coupure réseau, la mise en veille du téléphone/PC, ou un
// redémarrage serveur, cf. reconnection:true/reconnectionAttempts:Infinity
// dans useWSocket.ts). Non réactif exprès (ref inutile, jamais lu par le
// template).
let joinedThreadId: string | null = null;

// Numéro du join le plus récent : une réponse (clé, historique) portant un
// numéro plus ancien appartient à un join annulé par l'ouverture d'un autre
// salon, et est ignorée. Remplace l'ancien verrou isJoiningThread, qui
// refusait purement et simplement l'ouverture d'un autre salon tant que le
// précédent n'avait pas reçu sa clé (le nouveau salon restait alors sur le
// squelette de chargement), et restait bloqué pour de bon si cette réponse
// n'arrivait jamais.
let joinSeq = 0;
// Salon dont le join attend encore sa réponse : un second join vers ce même
// salon est refusé.
let joinInFlight: string | null = null;
const JOIN_TIMEOUT_MS = 15000;

const emitWithAck = (event: string, payload: Record<string, any>): Promise<any> => new Promise((resolve) => {
    if (!socket.value) return resolve({ error: "Non connecté au serveur." });
    socket.value.timeout(JOIN_TIMEOUT_MS).emit(event, payload, (err: Error | null, res: any) => {
        resolve(err ? { error: "Le serveur n'a pas répondu." } : res);
    });
});

// Clé E2EE du salon telle que le serveur la détient pour nous : celle du
// cache si elle n'a pas changé, sinon déchiffrée (RSA) puis mise en cache.
// null si elle n'est pas disponible (erreurs déjà signalées à l'utilisateur).
// `background` : revalidation d'une clé en cache alors que l'historique est
// déjà affiché — une erreur invalide le cache sans toucher à l'écran.
const fetchThreadKey = async (id: string, seq: number, background = false): Promise<CryptoKey | null> => {

    const response: { encryptedKey?: string, error?: string, needsReadd?: boolean } = await emitWithAck("get-thread-access", { threadId: id });
    if (seq !== joinSeq) return null;

    if (response.error || !response.encryptedKey) 
    {
        invalidateThreadKey(id);
        if (background) return null;

        // Special case: user needs to be re-added to thread (after E2EE reset)
        if (response.error && response.needsReadd) {
            if (user.value?.publicKey) {
                socket.value.emit("request-thread-keys", {
                    threadId: id,
                    publicKey: user.value.publicKey
                });
                debugMsg.value = 'Récupération de la clé E2EE en cours... (en attente des autres membres)';
                loading.value = true;
                return null;
            } else {
                debugMsg.value = 'Erreur : Clé publique introuvable. ' + response.error;
                loading.value = false;
                router.push({ 
                    name: 'OrgHome', 
                    params: { orgId: route.params.orgId }, 
                    query: { noRedirect: 'true' } 
                });
                toast.show(response.error, 'warning', 10000);
                return null;
            }
        }
        
        debugMsg.value = 'Erreur serveur : ' + (response.error || 'Clé non retournée');
        loading.value = false;
        console.error('[E2EE] erreur serveur : ', response)
        toast.show(response.error || '[E2EE] Accès refusé ou impossible de récupérer la clé du salon.', 'error');
        return null;
    }

    const cached = getCachedThreadKey(id);
    if (cached && cached.encryptedKey === response.encryptedKey) return cached.key;

    try {
        const key = await decryptThreadKeyWithRsa(response.encryptedKey, privateKey.value!);
        setCachedThreadKey(id, response.encryptedKey, key);
        return key;
    } catch (cryptoErr) {
        invalidateThreadKey(id);
        if (background) return null;
        debugMsg.value = 'Erreur : Déchiffrement RSA échoué.';
        console.error("[E2EE] Échec Déchiffrement Salon:", cryptoErr);
        toast.show('[E2EE] Échec du déchiffrement de la clé de session du salon.', 'error');
        loading.value = false;
        return null;
    }

};

const applyHistory = async (seq: number, data: { messages: Message[]; hasMore?: boolean }, key: CryptoKey, silent: boolean) => {

    const history = data.messages || [];
    const decrypted = await procesMessages(history, key);
    // Changement de salon pendant le déchiffrement : ces messages ne sont
    // plus ceux du salon affiché.
    if (seq !== joinSeq) return;

    sortedMessages.value = decrypted;
    loading.value = false;
    hasMore.value = data.hasMore ?? history.length >= 20;

    // Rejoin silencieux (reconnexion sur le salon déjà affiché) : la liste
    // vient d'être rafraîchie en place, mais forcer le scroll ici jetterait
    // l'utilisateur en bas de la conversation s'il était en train de relire
    // plus haut.
    if (silent) return;
    if (selectedMessage.value && selectedMessage.value !== 'undefined') {
        await scrollToSelectedMessage();
    } else {
        scrollToBottom(true);
        setTimeout(() => { saveLastRead(); }, 500); // Save after scroll completes
    }

};

const joinThread = async (id: string, silent = false) => {

    if (!socket.value) {
        debugMsg.value = 'Erreur : Pas de connexion Socket active.';
        loading.value = false;
        return;
    }

    if (joinInFlight === id) return;

    if (!privateKey.value) 
    {
        debugMsg.value = 'Erreur : Clé privée introuvable (verrouillé).';
        loading.value = false;
        toast.show('[E2EE] Votre clé privée est introuvable. Veuillez déverrouiller votre espace sécurisé (PIN).', 'error');
        return;
    }

    const seq = ++joinSeq;
    joinInFlight = id;

    if (!silent) {
        joinedThreadId = null;
        loading.value = true;
        currentThreadKey.value = null;
        sortedMessages.value = [];
        stickToBottom = true;

        const savedLastRead = localStorage.getItem(`lastRead_${id}`);
        if (thread.value?.hasUnread && savedLastRead) {
            showUnreadDelimiterAfterId.value = savedLastRead;
        } else {
            showUnreadDelimiterAfterId.value = null;
        }
    }

    // Clé et historique en parallèle. Avec une clé en cache, l'historique
    // s'affiche dès son arrivée ; la clé est revalidée ensuite auprès du
    // serveur.
    const cached = getCachedThreadKey(id);
    const historyPromise = emitWithAck("join-thread", { threadId: id, joinId: seq });
    const keyPromise = fetchThreadKey(id, seq, !!cached);

    let key = cached?.key ?? null;
    if (!key) {
        key = await keyPromise;
        if (seq !== joinSeq) return;
        if (!key) { joinInFlight = null; return; }
    }
    currentThreadKey.value = key;

    const res = await historyPromise;
    if (seq !== joinSeq) return;
    joinInFlight = null;

    if (!res || res.stale) return;
    if (res.error) {
        debugMsg.value = 'Erreur : ' + res.error;
        loading.value = false;
        toast.show(res.error, 'error');
        return;
    }

    joinedThreadId = id;

    let _thread;
    if (route.params.spaceId == 'home')  _thread = openedOrg.value?.home.threads.find(__thread => __thread.id == thread.value?.id);
    else _thread = (openedOrg.value?.spaces?.find(space => space.id == route.params.spaceId))?.threads.find(__thread => __thread.id == thread.value?.id);
    if (_thread) _thread.hasUnread = false;
    markThreadAsRead(id);

    await applyHistory(seq, res, key, silent);

    // Ne vole le focus du textarea qu'au véritable chargement — sur un
    // rejoin silencieux (reconnexion), l'utilisateur peut être en train de
    // taper ou d'interagir ailleurs sur la page.
    if (!silent && seq === joinSeq) {
        await nextTick();
        TextareaRef.value?.textarea?.focus();
    }

    // Clé prise dans le cache : si le serveur en a une autre (réinitialisation
    // E2EE, redistribution), on bascule dessus et on redéchiffre l'historique.
    if (cached) {
        const fresh = await keyPromise;
        if (seq !== joinSeq || !fresh || fresh === key) return;
        currentThreadKey.value = fresh;
        await applyHistory(seq, res, fresh, true);
    }

};

const sendMessage = async () => {

    if ((!newMessage.value.trim() && selectedFiles.value.length === 0) || !socket.value || !currentThreadKey.value) return;

    try {

        let uploadedFiles: any[] = [];

        if (selectedFiles.value.length) {
            fileSendProgress.value = 0;
            fileProgress.value = selectedFiles.value.map(() => 0);
            uploadedFiles = await uploadFiles(
                selectedFiles.value,
                // Salon d'espace : clé de l'espace ; salon d'organisation :
                // clé du salon (mêmes destinataires que ses messages).
                route.params.spaceId
                    ? { workspaceId: route.params.spaceId as string }
                    : { threadId: thread.value!.id },
                (percent: number) => { fileSendProgress.value = percent; },
                (index: number, percent: number) => { fileProgress.value[index] = percent; }
            );
        }

        const { ciphertext, iv } = await encryptMessageWithContentKey(newMessage.value, currentThreadKey.value);

        const payload = {
            threadId: thread.value?.id,
            content: ciphertext,
            iv: iv,
            replyToId: messageWillBeResponded.value?.id,
            nonce: "n_" + Date.now(),
            context: route.params.spaceId ? 'workspace' : 'home',
            references: extractReferenceTokens(newMessage.value)
        };

        const confirmedMessage: any = await new Promise((resolve, reject) => {
            socket.value.emit("send-message", payload, (response: any) => {
                if (response?.error) reject(response.error);
                else resolve(response);
            });
        });

        // Trigger vector generation in background
        if (confirmedMessage && confirmedMessage.id) {
            const hasFiles = Array.isArray(selectedFiles.value) && selectedFiles.value.length > 0;
            let vectorText = newMessage.value;
            if (hasFiles) {
                const fileNames = selectedFiles.value.map(f => f.name).join(' ');
                vectorText = newMessage.value.trim() === '' ? fileNames : `${newMessage.value}\n${fileNames}`;
                if (!vectorText.trim()) vectorText = 'Fichier joint';
            }

            globalVectorWorker.postMessage({
                id: confirmedMessage.id,
                text: vectorText,
                type: hasFiles ? 'FILE' : 'MESSAGE',
                metadata: { 
                    threadId: thread.value?.id,
                    senderName: user.value?.name,
                    senderAvatar: user.value?.avatarUrl,
                    createdAt: new Date().toISOString()
                }
            });
        }

        lastMessageId.value = confirmedMessage.id;

        setMessageWillBeResponded(null);
        newMessage.value = "";
        scrollToBottom();

        if (uploadedFiles.length) {
            socket.value?.emit('edit-message-files', { id: lastMessageId.value, files: uploadedFiles });
        }

        selectedFiles.value = [];
        fileSendProgress.value = null;

    } catch (err) {
        console.error("Erreur lors de l'envoi du message :", err);
        toast.show('Une erreur est survenue lors de l\'envoi du message.', 'error');
        fileSendProgress.value = null;
    }

};

const scrollToBottom = async (instant = false) => {
    await nextTick();
    if (messagesContainer.value) 
    {
        messagesContainer.value.scrollTo({ top: messagesContainer.value.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
    }
};

const cancelReply = () => {
    setMessageWillBeResponded(null);
};

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

watch(() => messageWillBeResponded.value, () => {
    TextareaRef.value?.textarea?.focus();
});

watch(() => props.thread?.id, (newId) => {
    if (newId) joinThread(newId as string);
});

onMounted(async () => {
    const ws = await useWSocket();
    socket.value = ws.value;
    
    initListener();
    window.addEventListener('paste', handlePaste);
    document.addEventListener('click', closeEmojiPickerOnOutsideClick);
    globalVectorWorker.addEventListener('message', handleWorkerMessage);

    if (route.params.threadId) 
    {
        const connected = await waitForSocketConnection(socket, 15000);
        if (!connected) {
            debugMsg.value = 'Erreur : Timeout connexion WebSocket (15s). Proxy Vite inopérant ?';
            loading.value = false;
            toast.show('[E2EE] Impossible de se connecter au serveur. Vérifiez votre connexion et rechargez la page.', 'error');
            return;
        }
        await joinThread(String(route.params.threadId));
    }
});

onUnmounted(() => {
    // Abandonne un join ou un déchiffrement encore en cours pour ce composant.
    joinSeq++;
    joinInFlight = null;
    if (socket.value) 
    {
        socket.value.emit("leave-thread", thread.value?.id);
        removeListeners();
    }
    window.removeEventListener('paste', handlePaste);
    document.removeEventListener('click', closeEmojiPickerOnOutsideClick);
    globalVectorWorker.removeEventListener('message', handleWorkerMessage);
});

</script>