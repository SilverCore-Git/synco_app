<template>

    <ChatTimeline
        ref="timelineRef"
        :channel="channel"
        :unavailable="!thread"
        :loading="loading"
        :placeholder="currentThreadKey ? 'Envoyer un message...' : loading ? 'Génération de la clé...' : (debugMsg || 'Erreur : Clé introuvable, rechargez la page')"
        :selected-message-id="selectedMessage"
        :unread-after-id="showUnreadDelimiterAfterId"
        @read="saveLastRead"
        @message-received="indexReceivedMessage"
        @message-sent="indexSentMessage"
        @jump-to="(id: string) => router.push({ query: { ...route.query, select: id } })"
    >

        <template #header>

            <div class="mb-8 p-4">

                <div class="w-16 h-16 rounded-2xl bg-(--text)/5 flex items-center justify-center mb-4">
                    <i class="bi bi-hash text-4xl text-(--text2)" />
                </div>

                <h1 class="text-3xl font-black text-(--text) mb-2">#{{ thread?.name }}</h1>

                <p class="text-(--text2) flex items-center gap-2">
                    C'est le début de l'histoire de ce thread.
                </p>

            </div>

        </template>

        <template #composer-top>

            <!-- Clé du salon remplacée de manière inattendue (audit FC4) :
                 ni lecture ni envoi tant que l'utilisateur n'a pas tranché. -->
            <div
                v-if="threadKeyChanged"
                class="mb-2 flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20"
            >
                <i class="bi bi-shield-exclamation text-red-400 text-lg mt-0.5 shrink-0" />
                <div class="flex-1 text-xs text-red-400 leading-relaxed">
                    La clé de chiffrement de ce salon a été remplacée depuis votre dernière visite.
                    Vos messages ne seront pas envoyés tant que la situation n'est pas vérifiée
                    auprès d'un administrateur du salon.
                </div>
                <button @click="acceptNewThreadKey" class="danger text-xs shrink-0">
                    Accepter la nouvelle clé
                </button>
            </div>

        </template>

        <template #unavailable>

            <div 
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

        </template>

    </ChatTimeline>

</template>

<script lang="ts" setup>

// Salon de messages d'une organisation. L'affichage et la saisie du fil sont
// dans ChatTimeline, piloté par le canal du salon (createThreadMessageChannel) ;
// ici ne reste que ce qui est propre aux threads : clé du salon (cache,
// épinglage FC4, request-thread-keys), join/rejoin, non-lus, indexation pour
// la recherche locale, suppression du salon.

import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Thread, Message } from '@/types/types';
import useWSocket from '@/composables/useWSocket';
import { privateKey, decryptThreadKeyWithRsa } from '@/assets/utils/crypto';
import { decryptMessages } from '@/assets/utils/decryptMessages';
import { useToast } from '@/composables/useToast';
import { openedOrg, user } from '@/assets/var';
import ChatTimeline from '../components/common/ChatTimeline.vue';
import { waitForSocketConnection } from '@/composables/useWSocket';
import { getCachedThreadKey, setCachedThreadKey, invalidateThreadKey } from '@/assets/utils/threadKeyCache';
import { pinOrCheckKey, repinKey, KeyChangedError } from '@/assets/utils/keyPinning';
import { createThreadMessageChannel } from '@/composables/messageChannel';

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

const timelineRef = ref<InstanceType<typeof ChatTimeline> | null>(null);
const socket = ref<any>(null);
const loading = ref<boolean>(true);
const debugMsg = ref<string>('');
const showUnreadDelimiterAfterId = ref<string | null>(null);

const saveLastRead = () => {
    if (!thread.value) return;
    const lastId = timelineRef.value?.lastMessageId();
    if (!lastId) return;
    localStorage.setItem(`lastRead_${thread.value.id}`, lastId);
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

// Indexation pour la recherche locale (vecteurs) d'un message reçu en direct.
const indexReceivedMessage = (decrypted: Message, msg: Message) => {

    const clearContent = decrypted.content;

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

};

// Indexation (en arrière-plan) d'un message que l'on vient d'envoyer.
const indexSentMessage = ({ message, text, files }: { message: Message; text: string; files: File[] }) => {

    const hasFiles = files.length > 0;
    let vectorText = text;
    if (hasFiles) {
        const fileNames = files.map(f => f.name).join(' ');
        vectorText = text.trim() === '' ? fileNames : `${text}\n${fileNames}`;
        if (!vectorText.trim()) vectorText = 'Fichier joint';
    }

    globalVectorWorker.postMessage({
        id: message.id,
        text: vectorText,
        type: hasFiles ? 'FILE' : 'MESSAGE',
        metadata: { 
            threadId: thread.value?.id,
            senderName: user.value?.name,
            senderAvatar: user.value?.avatarUrl,
            createdAt: new Date().toISOString()
        }
    });

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

// Canal du salon : la timeline et ses messages passent par lui pour tout ce
// qui touche au socket, aux droits et aux mentions.
const channel = createThreadMessageChannel({
    thread,
    spaceId: () => route.params.spaceId as string | undefined,
    encryptionKey: currentThreadKey,
    canWrite: canSpeak,
    socket,
});

const scrollToSelectedMessage = async () => {

    if (!selectedMessage.value || selectedMessage.value === 'undefined') return;

    await nextTick();

    const targetEl = document.getElementById(`msg-${selectedMessage.value}`);
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

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

const removeListeners = () => {
    const sock = socket.value;
    if (!sock) return;
    sock.off("keys-distributed", onKeysDistributed);
    sock.off("connect", onReconnect);
    sock.off("disconnect", onDisconnect);
    sock.off("thread:deleted", onThreadDeleted);
};

const onKeysDistributed = async ({ threadId }: { threadId: string }) => {
    if (threadId === thread.value?.id) {
        // Nouvelle clé distribuée : celle en cache (s'il y en a une) est périmée.
        invalidateThreadKey(threadId);
        joinThread(threadId);
    }
};

// Messages (nouveaux, modifiés, supprimés, réactions, « charger plus ») :
// écoutés par la timeline via le canal du salon.
const initListener = () => {

    if (!socket.value) return;

    removeListeners();

    socket.value.on("connect", onReconnect);
    socket.value.on("disconnect", onDisconnect);
    socket.value.on("thread:deleted", onThreadDeleted);
    socket.value.on("keys-distributed", onKeysDistributed);

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
// Clé servie qui diffère de la clé épinglée (audit FC4) : gardée de côté,
// jamais utilisée sans décision explicite de l'utilisateur.
const threadKeyChanged = ref<boolean>(false);
let pendingThreadKey: { id: string; key: CryptoKey } | null = null;

const acceptNewThreadKey = async () => {
    if (!pendingThreadKey || pendingThreadKey.id !== thread.value?.id) return;
    await repinKey(pendingThreadKey.key, `thread:${pendingThreadKey.id}`, 1);
    pendingThreadKey = null;
    threadKeyChanged.value = false;
    if (thread.value?.id) joinThread(thread.value.id);
};

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
        try {
            await pinOrCheckKey(key, `thread:${id}`, 1);
        } catch (e) {
            if (!(e instanceof KeyChangedError)) throw e;
            // Une autre clé que celle épinglée : on ne bascule pas dessus
            // (audit FC4 — n'importe quel membre pouvait la remplacer).
            invalidateThreadKey(id);
            pendingThreadKey = { id, key };
            threadKeyChanged.value = true;
            currentThreadKey.value = null;
            loading.value = false;
            return null;
        }
        threadKeyChanged.value = false;
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
    const decrypted = await decryptMessages(history, key);
    // Changement de salon pendant le déchiffrement : ces messages ne sont
    // plus ceux du salon affiché.
    if (seq !== joinSeq) return;

    timelineRef.value?.setMessages(decrypted, data.hasMore ?? history.length >= 20);
    loading.value = false;

    // Rejoin silencieux (reconnexion sur le salon déjà affiché) : la liste
    // vient d'être rafraîchie en place, mais forcer le scroll ici jetterait
    // l'utilisateur en bas de la conversation s'il était en train de relire
    // plus haut.
    if (silent) return;
    if (selectedMessage.value && selectedMessage.value !== 'undefined') {
        await scrollToSelectedMessage();
    } else {
        timelineRef.value?.scrollToBottom(true);
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
        timelineRef.value?.reset();

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
        timelineRef.value?.focusComposer();
    }

    // Clé prise dans le cache : revalidée auprès du serveur. Une copie
    // rescellée de la MÊME clé (épinglage OK) est adoptée ; une clé
    // différente n'est jamais adoptée en silence — fetchThreadKey l'a
    // refusée et affiche la bannière (audit FC4).
    if (cached) {
        const fresh = await keyPromise;
        if (seq !== joinSeq) return;
        if (threadKeyChanged.value) { currentThreadKey.value = null; return; }
        if (!fresh || fresh === key) return;
        currentThreadKey.value = fresh;
        await applyHistory(seq, res, fresh, true);
    }

};

watch(() => props.thread?.id, (newId) => {
    if (newId) joinThread(newId as string);
});

onMounted(async () => {
    const ws = await useWSocket();
    socket.value = ws.value;
    
    initListener();
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
    globalVectorWorker.removeEventListener('message', handleWorkerMessage);
});

</script>
