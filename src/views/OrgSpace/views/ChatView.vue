<template>

    <div class="flex flex-col h-full bg-(--bg3) relative overflow-hidden w-full">
        
        <header 
            v-if="recipient" 
            class="h-14 flex items-center px-4 border-b border-(--border-color) bg-(--bg2)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-3">

                <MobileBackBtn />


                <img 
                    :src="recipient?.avatarUrl || defaultAvatar($p(recipient?.name))" 
                    :alt="$p(recipient.name)"
                    @error="(e: any) => e.target.src = defaultAvatar($p(recipient?.name))"
                    class="w-9 h-9 rounded-full border border-(--text)/10"
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
            @media-loaded="onMediaLoaded"
            class="flex-1 overflow-y-auto p-4 custom-scrollbar w-full"
            :style="{ marginBottom: footerHeight + 'px' }"
        >
                
            <div v-if="recipient" class="flex flex-col justify-end min-h-full w-full">
                    
                <div class="mb-8 p-6 border-b border-(--border-color) bg-(--text)/1 rounded-2xl mx-4">
                   
                    <div class="w-20 h-20 rounded-full bg-(--text)/5 flex items-center justify-center mb-4 overflow-hidden border-2 border-(--text)/10">
                        <img 
                            :src="recipient?.avatarUrl || defaultAvatar($p(recipient?.name))" 
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
                            <div class="bg-(--text)/5 rounded-full w-9 h-9 shrink-0" />
                            <div class="flex-1 space-y-2">
                                <div class="bg-(--text)/5 w-24 h-3 rounded-full" />
                                <div class="bg-(--text)/5 w-3/4 h-4 rounded-lg" />
                            </div>
                        </div>

                    </template>

                    <template v-else>
                        <!-- Loading more indicator -->
                        <div v-if="isFetchingMore" class="px-4 py-2 flex justify-center">
                            <div class="animate-spin h-5 w-5 border-2 border-(--primary) border-t-transparent rounded-full" />
                        </div>

                        <template v-for="(msg, index) in messages" :key="msg.id">
                        <div v-if="showUnreadDelimiterAfterId === msg.id" class="flex items-center gap-4 my-6 px-4">
                            <div class="h-px flex-1 bg-red-500/50"></div>
                            <span class="text-xs font-bold text-red-500 uppercase tracking-widest">Nouveaux messages</span>
                            <div class="h-px flex-1 bg-red-500/50"></div>
                        </div>
                        <ChatMessage
                            :id="'msg-' + msg.id"

                            :selected-message="selectedMessage"
                            :msg="msg"
                            :messages="messages"
                            :is-stacked="index > 0 && messages[index-1].senderId === msg.senderId && !msg.replyToId && (new Date(msg.createdAt).getTime() - new Date(messages[index-1].createdAt).getTime() < 60000)"
                            :is-editing="editingMessageId === msg.id"
                            @edit-start="editingMessageId = msg.id"
                            @edit-end="endEdit"
                            @retry-send="retrySend(msg.id)"
                            @discard-send="discardFailed(msg.id)"
                        />
                        </template>

                    </template>

                </div>

            </div>

            <div v-else class="h-full flex flex-col items-center justify-center gap-4">
                <div class="w-20 h-20 rounded-full bg-(--text)/5 flex items-center justify-center text-4xl opacity-20">
                    <i class="bi bi-person-x" />
                </div>
                <p class="text-(--text2) italic font-medium">Sélectionnez une discussion.</p>
            </div>

        </main>

        <footer v-if="recipient" ref="footerRef" class="absolute bottom-0 inset-x-0 z-[110] p-1 bg-transparent mt-auto">

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

        <!-- z-[150] : au-dessus du footer normal ci-dessus (z-[110], toujours
             monté sous cet overlay), sinon sa textarea passait devant celle
             de la session éphémère au lieu d'être masquée derrière. -->
        <div v-if="isPrivateMeet" class="absolute inset-0 z-[150] backdrop-blur-xs">
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
                <!-- Empreinte complète (SHA-256, RFC 7638), en groupes de 4 (audit FC1) -->
                <span class="text-sm font-mono tracking-wider break-all text-(--text)">{{ keyFingerprint }}</span>
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

import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { DMMessage, OrgMember, User } from '@/types/types';
import { openedOrg, user, isLittleScreen } from '@/assets/var';
import useWSocket, { waitForSocketConnection } from '@/composables/useWSocket';
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
import { extractReferenceTokens } from '@/composables/useReferences';
import PrivateMeetView from './PrivateMeetView.vue';
import usePrivateMeet from '@/composables/usePrivatMeet';
import ChatMessage from '../components/common/ChatMessage.vue';
import ReplyBanner from '../components/common/ReplyBanner.vue';
import useFooterInset from '@/composables/useFooterInset';
import { uploadFiles } from '@/assets/uploadFile';
import useResponse from '@/composables/useResponse';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { useNotification } from '@/composables/useNotification';
import { useRecentDMs } from '@/composables/useRecentDMs';
import { getCachedPlaintext, setCachedPlaintext } from '@/assets/utils/dmPlaintextCache';
import { checkKeyTrust, trustKey, computeKeyFingerprint, requireTrustedKey, dismissKeyTrustAlert, type KeyTrustResult } from '@/assets/utils/keyTrust';
import Popup from '@/components/Popup.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { startCall } = useSecurePeer();
const { activeMeetPeerId, startMeet } = usePrivateMeet();
const { messageWillBeResponded, setMessageWillBeResponded } = useResponse();
const { markDMAsRead, getUnreadCountByDMUserId } = useNotification();
const { fetchRecentDMs, getMostRecentDMUserId } = useRecentDMs();

const socket = ref<Socket | null>(null);

const TextareaRef = ref<InstanceType<typeof ThreadTextarea> | null>(null);
const isPrivateMeet = computed(() => route.name == 'OrgThreadChatPrivateMeet');

// Si on ouvre le DM normal de quelqu'un avec qui une session éphémère
// tourne déjà (potentiellement démarrée depuis une tout autre page, la
// session survit maintenant à la navigation), on est redirigé sur cette
// session au lieu de voir le DM normal — "retourner sur la discussion doit
// nous ramener sur elle", plutôt que de la laisser tourner invisible en
// arrière-plan sans qu'on puisse y revenir autrement qu'en re-cliquant
// "Session éphémère".
watch(
    [() => route.name, () => route.params.userId, activeMeetPeerId],
    ([routeName, userId, meetPeerId]) => {
        if (routeName === 'OrgThreadChat' && meetPeerId && meetPeerId === userId) {
            router.replace({ name: 'OrgThreadChatPrivateMeet', params: { userId } });
        }
    },
    { immediate: true }
);
const isE2EEEnabled = ref<boolean>(true);
const messages = ref<any[]>([]);
const newMessage = ref<string>("");
const messagesContainer = ref<HTMLElement | null>(null);
const footerRef = ref<HTMLElement | null>(null);
const { footerHeight } = useFooterInset(footerRef, messagesContainer, 72);
const loading = ref<boolean>(true);
const isFetchingMore = ref<boolean>(false);
const hasMore = ref<boolean>(true);
const isSomeoneTyping = ref<boolean>(false);
const showUnreadDelimiterAfterId = ref<string | null>(null);

// Même mécanisme que ThreadView.vue (localStorage `lastRead_...` + marqueur
// affiché au dernier id connu) — juste scopé par destinataire plutôt que par thread.
const saveLastRead = () => {
    if (!recipient.value || messages.value.length === 0) return;
    const lastMsg = messages.value[messages.value.length - 1];
    if (!lastMsg) return;
    localStorage.setItem(`lastRead_dm_${recipient.value.id}`, lastMsg.id);
};
let typingTimeout: any = null;

// Même fix que ThreadView.vue (salons) : distingue "on ouvre/change
// réellement de conversation" de "le socket vient de se reconnecter alors
// qu'on regarde toujours le même DM" — sans ça, toute reconnexion
// socket.io (coupure réseau, veille, redémarrage serveur...) vidait
// visuellement la conversation puis la rechargeait avec un saut de scroll
// forcé, alors que rien n'avait réellement changé.
let joinedDMUserId: string | null = null;
// Conversation pour laquelle le dernier "charger plus" a été demandé.
let loadMoreFor: string | null = null;
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
// Progression de chaque fichier en cours d'envoi (même index que selectedFiles).
const fileProgress = ref<number[]>([]);
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
const getSelectedFileInfo = (file: File) => getFileInfo({ originalName: file.name, mimeType: file.type });

// Les deux seuls utilisateurs d'un DM sont moi et le destinataire, tous deux
// déjà chargés côté client : l'historique allégé du serveur (dmHistorySelect,
// synco_api/src/websocket/routes/dm.ts) n'envoie plus que leurs ids, on
// rattache ici les objets User correspondants.
const participantById = (id: string | null | undefined): User | undefined => {
    if (!id) return undefined;
    if (id === user.value?.id) return user.value ?? undefined;
    if (id === recipient.value?.id) return recipient.value;
    return openedOrg.value?.members?.find((m: OrgMember) => m.user?.id === id)?.user;
};

const hydrateParticipants = (msg: DMMessage): DMMessage => {
    const hydrated: DMMessage = {
        ...msg,
        sender: msg.sender ?? participantById(msg.senderId),
        recipient: msg.recipient ?? participantById(msg.recipientId),
    };
    if (msg.replyMessage && !msg.replyMessage.sender) {
        hydrated.replyMessage = { ...msg.replyMessage, sender: participantById(msg.replyMessage.senderId) };
    }
    if (Array.isArray(msg.reactions)) {
        hydrated.reactions = msg.reactions.map((r: any) => {
            if (r.user) return r;
            const u = participantById(r.userId);
            return { ...r, user: u ? { id: u.id, name: u.name, avatarUrl: u.avatarUrl } : { id: r.userId } };
        });
    }
    return hydrated;
};

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
            // Contenu en clair (ou drapeau isE2EE posé à faux par le serveur) :
            // affiché avec un marqueur explicite, jamais comme un message
            // chiffré authentique (audit FC7).
            return { ...msg, content: msg.content, securityState: 'plaintext' };
        }

        const cached = getCachedPlaintext(msg.id, msg.nonce);
        if (cached !== undefined) return { ...msg, content: cached };

        try {

            const clearText = await decryptFromPeer(msg.content, keyToUse, msg.nonce, privateKey.value);
            setCachedPlaintext(msg.id, msg.nonce, clearText);
            return { ...msg, content: clearText };

        } 
        catch (cryptoErr) {
            console.error(`[E2EE] Échec du déchiffrement pour le message ${msg.id}:`, cryptoErr);
            return { ...msg, content: "[⚠️ Impossible de déchiffrer ce message.]" };
        }

};

// Contenu principal uniquement (pas la citation), tous les messages en même
// temps : WebCrypto parallélise lui-même les déchiffrements RSA.
const decryptMain = (list: DMMessage[]): Promise<DMMessage[]> =>
    Promise.all(list.map(async m => (await decryptSingleMessage(m)) ?? m));

// Texte clair des messages déjà déchiffrés, par id : une citation dont le
// message d'origine est dans la liste se résout sans aucun déchiffrement.
const knownPlaintexts = (list: DMMessage[]): Map<string, string> =>
    new Map(list.filter(m => !m.decrypting).map(m => [m.id, m.content]));

// Une citation déjà résolue porte `decrypting: false` ; une citation encore
// chiffrée porte `decrypting: true` jusqu'au palier 3 (ChatMessage.vue affiche
// alors un chargement à la place du texte).
const resolveReplyLocally = (reply: DMMessage, known: Map<string, string>): DMMessage => {
    if (reply.decrypting === false) return reply;
    const local = known.get(reply.id) ?? (reply.nonce ? getCachedPlaintext(reply.id, reply.nonce) : undefined);
    if (local !== undefined) return { ...reply, content: local, decrypting: false };
    if (!reply.isE2EE || !reply.content) return { ...reply, decrypting: false };
    return { ...reply, decrypting: true };
};

const attachReplies = (list: DMMessage[], known: Map<string, string>): DMMessage[] =>
    list.map(m => m.replyMessage && m.replyMessage.decrypting !== false
        ? { ...m, replyMessage: resolveReplyLocally(m.replyMessage, known) }
        : m);

const decryptReply = async (reply: DMMessage): Promise<DMMessage> =>
    ({ ...((await decryptSingleMessage(reply)) ?? reply), decrypting: false });

// Déchiffrement complet, sans paliers — pour les messages qui arrivent un par
// un ou par petits paquets (nouveau message, édition, "charger plus").
const procesMessages = async (msgs: DMMessage[]): Promise<DMMessage[]> => {
    const main = await decryptMain(msgs.map(hydrateParticipants));
    const withReplies = attachReplies(main, knownPlaintexts([...messages.value, ...main]));
    return Promise.all(withReplies.map(async m =>
        m.replyMessage?.decrypting ? { ...m, replyMessage: await decryptReply(m.replyMessage) } : m
    ));
};

// Applique une mise à jour de la liste sans faire sauter l'écran : quand des
// messages au-dessus du viewport changent de hauteur (texte déchiffré à la
// place du chargement), on reste collé en bas si on y était, sinon on garde
// la même distance au bas du fil.
const updateKeepingScroll = async (update: () => void) => {
    const el = messagesContainer.value;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    update();
    await nextTick();
    if (!el) return;
    el.scrollTop = stickToBottom ? el.scrollHeight : el.scrollHeight - fromBottom;
};

// Paliers de déchiffrement d'un historique (RSA-4096 par message : quelques
// ms chacun, bien plus sur certains moteurs) :
//   1. les FIRST_TIER_SIZE messages les plus récents — ceux à l'écran —
//      puis affichage immédiat, les plus anciens en chargement ;
//   2. le reste de l'historique ;
//   3. les citations dont le message d'origine n'est pas dans la liste.
// Chaque palier vérifie que son join est toujours le plus récent : changer de
// conversation en plein déchiffrement l'abandonne au lieu d'afficher les
// messages de l'ancienne conversation dans la nouvelle.
const FIRST_TIER_SIZE = 10;

const applyHistory = async (seq: number, data: { messages: DMMessage[]; hasMore: boolean }, silent: boolean) => {

    const isCurrent = () => seq === joinSeq;
    const history = (data.messages || []).map(hydrateParticipants);

    // Messages reçus ou envoyés pendant le join (dm:new-message, envoi en
    // cours) : plus récents que l'historique, on les garde à la suite.
    const historyIds = new Set(history.map(m => m.id));
    const lastTs = history.length ? new Date(history[history.length - 1]!.createdAt).getTime() : 0;
    const extras = () => messages.value.filter(m =>
        !historyIds.has(m.id) && (String(m.id).startsWith('temp-') || new Date(m.createdAt).getTime() > lastTs)
    );

    // Rejoin silencieux (reconnexion) : la conversation est déjà affichée,
    // pas de paliers ni de chargement visibles — tout d'un coup, le cache
    // rend de toute façon l'opération quasi instantanée.
    const split = silent ? 0 : Math.max(0, history.length - FIRST_TIER_SIZE);
    const older = history.slice(0, split);
    const recent = history.slice(split);

    // Palier 1
    const recentDone = await decryptMain(recent);
    if (!isCurrent()) return;

    messages.value = [
        ...older.map(m => ({
            ...m,
            decrypting: true,
            replyMessage: m.replyMessage ? { ...m.replyMessage, decrypting: true } : m.replyMessage,
        })),
        ...attachReplies(recentDone, knownPlaintexts(recentDone)),
        ...extras(),
    ];
    hasMore.value = data.hasMore;
    loading.value = false;

    // Rejoin silencieux : forcer le scroll jetterait l'utilisateur en bas
    // alors qu'il relisait peut-être plus haut.
    if (!silent) {
        scrollToBottom(true);
        setTimeout(() => { saveLastRead(); }, 500); // Après la fin du scroll
    }

    // Palier 2
    if (older.length) {
        const olderDone = await decryptMain(older);
        if (!isCurrent()) return;
        const known = knownPlaintexts([...olderDone, ...recentDone]);
        const byId = new Map(olderDone.map(m => [m.id, m]));
        // Repasse aussi les citations du palier 1 : leur message d'origine
        // vient peut-être d'être déchiffré.
        await updateKeepingScroll(() => {
            messages.value = attachReplies(messages.value.map(m => byId.get(m.id) ?? m), known);
        });
    }

    // Palier 3
    const pending = messages.value.filter(m => m.replyMessage?.decrypting);
    if (!pending.length) return;
    const replies = new Map(await Promise.all(
        pending.map(async m => [m.id, await decryptReply(m.replyMessage!)] as const)
    ));
    if (!isCurrent()) return;
    await updateKeepingScroll(() => {
        messages.value = messages.value.map(m => replies.has(m.id) ? { ...m, replyMessage: replies.get(m.id) } : m);
    });

};

const isFromCurrentDM = (msg: DMMessage) => {
    const peerId = msg.senderId === user.value?.id ? msg.recipientId : msg.senderId;
    return peerId === recipient.value?.id;
};

// Handlers nommés : "connect" / "disconnect" sont aussi écoutés par
// useWSocket.ts (isConnected, reconnexion) — un off() sans handler les
// retirait aussi, laissant le bandeau "Déconnecté" affiché après la première
// reconnexion.
const onReconnect = () => {
    const id = recipient.value?.id;
    // Join émis hors ligne : socket.io l'a mis en file et l'envoie à la
    // connexion, sa réponse arrivera — pas de doublon.
    if (!id || joinInFlight === id) return;
    // Une reconnexion sur le DM déjà affiché ne doit rien changer
    // visuellement — rejoin silencieux plutôt qu'un rechargement
    // complet (skeleton + liste vidée + saut de scroll).
    joinDM(id, joinedDMUserId === id);
};

const onDisconnect = () => {
    // Un join-dm parti avant la coupure n'aura jamais de réponse : on
    // l'abandonne pour que onReconnect puisse le relancer.
    if (joinInFlight) {
        joinInFlight = null;
        joinSeq++;
    }
};

const DM_EVENTS = ["dm:new-message", "dm:user-typing", "dm:delete-message", "dm:edit-message", "dm-more-messages", "dm-reaction-updated"];

const removeListeners = () => {
    const sock = socket.value;
    if (!sock) return;
    DM_EVENTS.forEach(ev => sock.off(ev));
    sock.off("connect", onReconnect);
    sock.off("disconnect", onDisconnect);
};

const initListener = () => {

    if (!socket.value) return;
    
    removeListeners();

    socket.value.on("connect", onReconnect);
    socket.value.on("disconnect", onDisconnect);

    socket.value.on('dm-more-messages', async (data: { messages: any[]; hasMore: boolean }) => {
        // Réponse à un "charger plus" d'une conversation qu'on a quittée depuis.
        if (loadMoreFor !== recipient.value?.id) {
            isFetchingMore.value = false;
            return;
        }

        if (!data.messages || data.messages.length === 0) {
            hasMore.value = false;
            isFetchingMore.value = false;
            return;
        }

        const seq = joinSeq;
        const decryptedMore = await procesMessages(data.messages);
        if (seq !== joinSeq) return;

        const container = messagesContainer.value;
        const scrollOffset = container ? container.scrollHeight - container.scrollTop : 0;

        messages.value = [...decryptedMore, ...messages.value];
        hasMore.value = data.hasMore;

        await nextTick();
        if (container) container.scrollTop = container.scrollHeight - scrollOffset;
        setTimeout(() => { isFetchingMore.value = false; }, 100);
    });

    socket.value.on("dm:new-message", async (msg: any) => {
        // Pendant un changement de conversation, le socket reste dans le salon
        // de l'ancienne jusqu'à la réponse du nouveau join.
        if (!isFromCurrentDM(msg)) return;

        // procesMessages() rather than decryptSingleMessage() so the quoted
        // replyMessage gets decrypted too — otherwise a just-sent reply shows
        // its quote as ciphertext until the DM is reloaded.
        const decryptedMsg = (await procesMessages([msg]))[0] ?? msg;
        if (!isFromCurrentDM(msg)) return;

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
        setTimeout(() => { saveLastRead(); }, 100);
    });

    socket.value.on('dm:delete-message', (msgId: string) => {
        messages.value = messages.value.filter(m => m.id !== msgId);
    });

    socket.value.on('dm:edit-message', async (editedMsg: DMMessage) => {

        let updatedMsg: DMMessage;

        try {
            // procesMessages() also decrypts the quoted replyMessage, which the
            // backend sends back encrypted with every edit (file attach included).
            updatedMsg = (await procesMessages([editedMsg]))[0] ?? editedMsg;
        } catch (err) {
            updatedMsg = { ...editedMsg, content: "🔒 Échec du déchiffrement lors de l'édition." };
        }

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

// Numéro du join-dm le plus récent : une réponse (ou un palier de
// déchiffrement) portant un numéro plus ancien appartient à un join annulé
// par une navigation vers une autre conversation, et est ignorée.
let joinSeq = 0;
// DM dont le join attend encore sa réponse : un second join vers ce même DM
// est refusé (ex. watcher de route + onMounted qui appelaient tous deux
// mount() à l'ouverture de /chat, doublant chargement et déchiffrement).
let joinInFlight: string | null = null;
const JOIN_TIMEOUT_MS = 15000;

const joinDM = async (userId: string, silent = false) => {

    if (!socket.value || joinInFlight === userId) return;

    const seq = ++joinSeq;
    joinInFlight = userId;

    if (!silent) {
        joinedDMUserId = null;
        loading.value = true;
        messages.value = [];
        stickToBottom = true;

        // Capturé avant markDMAsRead() qui remet le compteur à zéro juste après.
        const savedLastRead = localStorage.getItem(`lastRead_dm_${userId}`);
        const hadUnread = getUnreadCountByDMUserId(userId).value > 0;
        showUnreadDelimiterAfterId.value = (hadUnread && savedLastRead) ? savedLastRead : null;
    }

    markDMAsRead(userId);

    const res: any = await new Promise((resolve) => {
        socket.value!.timeout(JOIN_TIMEOUT_MS).emit(
            "join-dm",
            { recipientId: userId, orgId: openedOrg.value?.id, joinId: seq },
            (err: Error | null, r: any) => resolve(err ? { error: "Le serveur n'a pas répondu." } : r)
        );
    });

    if (seq !== joinSeq) return; // annulé par un join plus récent
    joinInFlight = null;

    if (!res || res.stale) return;
    if (res.error) {
        loading.value = false;
        toast.show(res.error, 'error');
        return;
    }

    joinedDMUserId = userId;
    await applyHistory(seq, res, silent);

};

const scrollToSelectedMessage = async () => {

    if (!selectedMessage.value || selectedMessage.value === 'undefined') return;

    await nextTick();

    const targetEl = document.getElementById(`msg-${selectedMessage.value}`);
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

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
    dismissKeyTrustAlert(recipient.value.id);
    keyTrustState.value = 'match';
    toast.show('Nouvelle clé de sécurité approuvée.', 'warning');
};

const sendMessage = async () => {

    if ((!newMessage.value.trim() && selectedFiles.value.length === 0) || !socket.value || !recipient.value) return;

    const clearContent = newMessage.value;
    const tempId = `temp-${Date.now()}`;
    // Jamais d'envoi en clair implicite : chiffrement verrouillé = refus
    // (audit FC7).
    if (isE2EEEnabled.value && !E2EEUnloked.value) {
        toast.show('Déverrouillez le chiffrement (code PIN) pour envoyer ce message.', 'error');
        return;
    }
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

        // Épinglage TOFU explicite : première rencontre épinglée, clé changée
        // refusée (keyTrust.ts, audit FC1).
        let trust: KeyTrustResult = 'match';
        try { await requireTrustedKey(recipient.value.id, recipientPubKey); }
        catch { trust = 'changed'; dismissKeyTrustAlert(recipient.value.id); }
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
        fileProgress.value = selectedFiles.value.map(() => 0);
        try {
            uploadedFiles = await uploadFiles(
                selectedFiles.value,
                { dmPeerId: recipient.value!.id },
                (percent: number) => { fileSendProgress.value = percent; },
                (index: number, percent: number) => { fileProgress.value[index] = percent; }
            );
        } catch (e) {
            console.error('Erreur upload fichiers:', e);
            toast.show('Échec de l\'envoi des pièces jointes.', 'error');
        }
    }
    selectedFiles.value = [];
    fileSendProgress.value = null;

    const payload = {
        recipientId: recipient.value!.id,
        content: finalContent,
        encryptedAesKey: finalEncryptedAesKey,
        selfEncryptedAesKey: selfEncryptedAesKey,
        nonce: finalIv,
        isE2EE: useEncryption,
        replyToId: tempMessage.replyToId,
        references: extractReferenceTokens(clearContent),
    };

    await emitDM(tempId, payload, uploadedFiles);

};

// Délai au-delà duquel un envoi sans réponse du serveur est considéré comme
// perdu. Sans lui, un événement jeté côté serveur (limite de débit,
// coupure réseau pendant l'envoi...) laissait le message "en cours d'envoi"
// indéfiniment, puis il disparaissait au rechargement.
const SEND_TIMEOUT_MS = 10000;

// Le payload déjà chiffré (et les fichiers déjà uploadés) sont gardés sur le
// message temporaire : "Réessayer" renvoie exactement la même chose, sans
// rechiffrer ni ré-uploader.
const emitDM = async (tempId: string, payload: Record<string, any>, uploadedFiles: any[]) => {

    const response: any = await new Promise((resolve) => {
        if (!socket.value) return resolve({ error: "Non connecté au serveur." });
        socket.value.timeout(SEND_TIMEOUT_MS).emit("dm:send-message", payload, (err: Error | null, res: any) => {
            resolve(err ? { error: "Le serveur n'a pas répondu." } : res);
        });
    });

    if (!response?.error) {
        if (uploadedFiles.length && response?.id) {
            socket.value?.emit('edit-dm-message-files', { id: response.id, files: uploadedFiles });
        }
        return;
    }

    const temp = messages.value.find(m => m.id === tempId);
    if (!temp) return; // déjà remplacé par le dm:new-message du serveur
    temp.isSending = false;
    temp.sendFailed = true;
    temp.retry = { payload, uploadedFiles };
    toast.show(`Message non envoyé : ${response.error}`, "error");

};

const retrySend = async (tempId: string) => {
    const temp = messages.value.find(m => m.id === tempId);
    if (!temp?.retry) return;
    temp.sendFailed = false;
    temp.isSending = true;
    await emitDM(tempId, temp.retry.payload, temp.retry.uploadedFiles);
};

const discardFailed = (tempId: string) => {
    messages.value = messages.value.filter(m => m.id !== tempId);
};

const createPrivateMeet = () => {
    const member = openedOrg.value?.members?.find((m: OrgMember) => m.id === route.params.userId);
    if (member) startMeet(member);
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
    const container = e.target as HTMLElement;
    if (container.scrollTop < 100 && !isFetchingMore.value && hasMore.value) {
        loadMoreDM();
    }

    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
    stickToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 120;
    if (isAtBottom) saveLastRead();
};

const loadMoreDM = async () => {
    if (messages.value.length === 0 || isFetchingMore.value || !recipient.value) return;
    
    isFetchingMore.value = true;
    const firstMessageId = messages.value[0]?.id;
    
    if (firstMessageId) {
        loadMoreFor = recipient.value.id;
        socket.value?.emit("load-more-dm", { 
            recipientId: recipient.value.id, 
            before: firstMessageId,
            limit: 20,
            lite: true
        });
    }
};

// Un "isTyping: true" par frappe épuisait à lui seul la limite de débit du
// serveur — on ne le renvoie qu'une fois par TYPING_EMIT_INTERVAL_MS tant que
// l'utilisateur tape, et "false" une seule fois quand il s'arrête.
const TYPING_EMIT_INTERVAL_MS = 2500;
let lastTypingEmit = 0;

const handleTyping = () => {
    if (!socket.value || !recipient.value) return;
    const now = Date.now();
    if (now - lastTypingEmit >= TYPING_EMIT_INTERVAL_MS) {
        lastTypingEmit = now;
        socket.value.emit("dm:typing", { recipientId: recipient.value.id, isTyping: true });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 3000);
};

const stopTyping = () => {
    clearTimeout(typingTimeout);
    if (!lastTypingEmit || !socket.value || !recipient.value) return;
    lastTypingEmit = 0;
    socket.value.emit("dm:typing", { recipientId: recipient.value.id, isTyping: false });
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
    const id = recipient.value?.id;
    // Déjà chargé ou en cours de chargement : pas de second join (cf. joinInFlight).
    // Non attendu : joinDM ne rend la main qu'après tous les paliers de
    // déchiffrement, le focus de la zone de saisie n'a pas à patienter.
    if (id && E2EEUnloked.value && id !== joinedDMUserId && id !== joinInFlight) 
    {
        joinDM(id);
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
    // Sur petit écran, la liste des conversations EST la vue (cf. OrgLayout.vue,
    // ThreadsBar prend toute la largeur) — y rediriger automatiquement masquerait
    // cette liste. Sur desktop, ouvrir directement la dernière conversation
    // évite d'atterrir sur l'écran "Sélectionnez une discussion" à chaque fois.
    if (!route.params.userId && !isLittleScreen.value) {
        await fetchRecentDMs();
        const mostRecentUserId = getMostRecentDMUserId();
        const target = mostRecentUserId
            ? openedOrg.value?.members?.find(m => m.user?.id === mostRecentUserId)
            : openedOrg.value?.members?.[0];
        if (target) router.replace({ params: { ...route.params, userId: target.id }, query: route.query });
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

    // `socket.value` existe dès que le client socket.io est construit —
    // bien avant que la connexion WebSocket ait réellement abouti (attendre
    // juste "non-null", comme avant, ne garantissait donc rien). join-dm
    // finissait par partir en émettant sur un socket pas encore connecté —
    // socket.io met l'émission en file d'attente jusqu'à la connexion, sans
    // aucun retour ni timeout visible : l'écran restait sur le squelette de
    // chargement, parfois de longues secondes, sans explication. Même
    // attente explicite que ThreadView.vue pour les salons. wsRef (pas
    // socket) : même valeur (même instance Socket sous-jacente), mais son
    // type Ref<Socket|null> est exactement celui attendu par
    // waitForSocketConnection puisqu'ils viennent tous deux de
    // useWSocket.ts — évite un conflit de typage structurel entre deux
    // imports distincts du type Socket de socket.io-client.
    const connected = await waitForSocketConnection(wsRef, 15000);
    if (!connected) {
        loading.value = false;
        toast.show('Impossible de se connecter au serveur. Vérifiez votre connexion et réessayez.', 'error');
        return;
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
    // Abandonne un join ou un déchiffrement encore en cours pour ce composant.
    joinSeq++;
    joinInFlight = null;
    removeListeners();
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