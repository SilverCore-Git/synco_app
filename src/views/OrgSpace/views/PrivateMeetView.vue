<template>

    <div class="m-6 rounded-2xl shadow-2xl border border-(--text)/20 flex flex-col h-[calc(100vh-3rem)] bg-(--bg3) relative overflow-hidden ">

        <header
            v-if="recipient"
            class="h-14 flex items-center px-4 border-b border-(--border-color) bg-(--bg2)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-3">
                <MobileBackBtn />

                <button
                    @click="showEncryptionInfo = true"
                    class="p-2 rounded-lg hover:bg-(--text)/5 transition-colors"
                    :class="connectionType === 'relay' ? 'text-yellow-500' : 'text-green-500'"
                    :title="connectionType === 'relay' ? 'Chiffré — connexion relayée (en savoir plus)' : 'Chiffré de bout en bout, P2P (en savoir plus)'"
                >
                    <i class="bi" :class="connectionType === 'relay' ? 'bi-shield-exclamation' : 'bi-shield-lock-fill'" />
                </button>

            </div>

            <div class="ml-auto flex items-center gap-4 text-(--text2)">

                <button class="hover:text-(--text) transition-colors">
                    <i
                        @click="requestClose"
                        class="bi bi-telephone-x-fill text-red-400 hover:text-red-500 transition-colors"
                    />
                </button>

            </div>

        </header>

        <!-- Le header ci-dessus (avec le retour habituel) n'est monté que
             tant qu'une session est active pour cette personne — sans lui,
             cet écran "aucune session active" était un cul-de-sac. -->
        <button
            v-if="!recipient && !isMeetConnecting"
            @click="leaveEmptyMeet"
            class="absolute top-4 right-4 z-20 p-2 rounded-lg text-(--text2) hover:text-(--text) hover:bg-(--text)/5 transition-colors"
            title="Fermer"
        >
            <i class="bi bi-x-lg text-lg" />
        </button>

        <template v-if="isMeetConnecting">

            <div class="flex-1 flex items-center justify-center gap-8 flex-col">
                <SpinLoader />
                <span class="text-(--text2) italic">{{ meetLoadingStatus }}</span>
            </div>

        </template>

        <main
            v-else
            ref="messagesContainer"
            class="flex-1 overflow-y-scroll p-4 w-full"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
        >

            <div v-if="recipient" class="flex flex-col justify-end min-h-full w-full relative">

                <div v-if="isDragging" class="absolute inset-0 z-20 bg-(--primary)/10 border-2 border-dashed border-(--primary) rounded-xl flex items-center justify-center pointer-events-none">
                    <p class="text-(--primary) font-bold">Déposer pour envoyer (chiffré, P2P)</p>
                </div>

                <div class="space-y-1 w-full">

                    <div
                        v-for="(msg, index) in messages"
                        :key="index"
                        class="group px-4 py-1.5 flex flex-raw justify-start items-start gap-3 hover:bg-(--text)/2 rounded-lg transition-colors"
                    >

                        <img
                            :src="defaultAvatar(msg.sender)"
                            class="rounded-full w-9 h-9 border border-(--border-color) shrink-0"
                        />

                        <div class="min-w-0 flex-1">

                            <div class="flex items-baseline gap-2">

                                <span class="text-(--primary) font-bold text-xs tracking-tight">
                                    {{ msg.sender || 'Utilisateur' }}
                                </span>

                            </div>

                            <p v-if="msg.kind === 'text'" class="text-(--text) text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                                {{ msg.text || 'Aucun message' }}
                            </p>

                            <!-- Chiffrement/envoi (expéditeur) ou réception en cours -->
                            <div
                                v-else-if="msg.status === 'sending' || msg.status === 'receiving'"
                                class="mt-1 flex items-center gap-3 bg-(--bg)/60 border border-(--border-color) rounded-xl px-3 py-2 max-w-sm"
                            >
                                <div class="relative w-9 h-9 shrink-0 flex items-center justify-center">
                                    <svg class="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" class="text-(--border-color)" stroke-width="3" />
                                        <circle
                                            cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" class="text-(--primary) transition-all duration-200"
                                            stroke-width="3" stroke-linecap="round"
                                            :stroke-dasharray="97.4"
                                            :stroke-dashoffset="97.4 * (1 - (msg.progress || 0) / 100)"
                                        />
                                    </svg>
                                    <span class="absolute text-[9px] font-bold text-(--text2)">{{ msg.progress || 0 }}%</span>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="text-(--text) text-sm font-medium truncate">{{ msg.fileName }}</p>
                                    <p class="text-(--text2) text-xs">
                                        {{ msg.status === 'sending' ? 'Envoi chiffré…' : 'Réception…' }} {{ formatFileSize(msg.fileSize) }}
                                    </p>
                                </div>
                            </div>

                            <!-- Échec de déchiffrement (terminé, mais pas de fileUrl) -->
                            <div
                                v-else-if="!msg.fileUrl"
                                class="mt-1 flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 max-w-sm"
                            >
                                <i class="bi bi-exclamation-triangle-fill text-xl text-red-400" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-(--text) text-sm font-medium truncate">{{ msg.fileName }}</p>
                                    <p class="text-red-400 text-xs">Échec de réception du fichier</p>
                                </div>
                            </div>

                            <a
                                v-else
                                :href="msg.fileUrl"
                                :download="msg.fileName"
                                class="mt-1 flex items-center gap-3 bg-(--bg)/60 border border-(--border-color) rounded-xl px-3 py-2 hover:border-(--primary)/50 transition-colors max-w-sm"
                            >
                                <i class="bi bi-file-earmark-arrow-down text-xl text-(--primary)" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-(--text) text-sm font-medium truncate">{{ msg.fileName }}</p>
                                    <p class="text-(--text2) text-xs">{{ formatFileSize(msg.fileSize) }}</p>
                                </div>
                            </a>

                        </div>

                    </div>

                </div>

            </div>

            <div v-else class="h-full flex flex-col items-center justify-center gap-4">
                <div class="w-20 h-20 rounded-full bg-(--text)/5 flex items-center justify-center text-4xl opacity-20">
                    <i class="bi bi-person-x" />
                </div>
                <p class="text-(--text2) italic font-medium">Aucune session éphémère active avec cette personne.</p>
            </div>

        </main>

        <footer v-if="recipient" class="p-4 bg-transparent mt-auto">

            <div class="relative flex items-center bg-(--bg) border border-(--text)/10 rounded-xl px-4 py-2 focus-within:border-(--primary)/50 transition-all shadow-2xl">

                <input ref="fileInput" type="file" class="hidden" @change="(e) => handleFilePicked((e.target as HTMLInputElement).files)" />

                <button
                    @click="fileInput?.click()"
                    class="mr-2 text-(--text2) hover:text-(--primary) transition-colors"
                    title="Partager un fichier (chiffré, P2P)"
                >
                    <i class="bi bi-paperclip text-lg" />
                </button>

                <ThreadTextarea
                    v-model="newMessage"
                    @send="sendEncryptedMessage(newMessage); newMessage = ''"
                    @input=""
                    ref="inputComponent"
                    :placeholder="'Message @' + $p(recipient.user?.name)"
                />

                <button
                    @click="sendEncryptedMessage(newMessage); newMessage = ''"
                    :disabled="!newMessage.trim()"
                    class="ml-3 transition-all hover:scale-110 disabled:opacity-20 disabled:scale-100"
                    :class="newMessage.trim() ? 'text-(--primary)' : 'text-(--text2)'"
                >
                    <i class="bi bi-send-fill text-lg" />
                </button>

            </div>

        </footer>

        <ConfirmDelete
            :show="showCloseConfirm"
            item-name="la session éphémère"
            title="Fermer la session ?"
            message="Un fichier est en cours de transfert, ou n'a pas encore été confirmé reçu par votre correspondant. Fermer maintenant l'interrompra avant qu'il ne soit intégralement transmis."
            button-text="Fermer quand même"
            @confirm="confirmClose"
            @cancel="showCloseConfirm = false"
        />

        <Popup :isOpen="showEncryptionInfo" @close="showEncryptionInfo = false">
            <template #title>Chiffrement de bout en bout</template>

            <div class="space-y-5 text-sm text-(--text2) leading-relaxed">

                <div class="flex items-start gap-3">
                    <i class="bi bi-router-fill text-lg text-(--primary) mt-0.5 shrink-0" />
                    <div>
                        <p class="text-(--text) font-semibold mb-1">Connexion directe (peer-to-peer)</p>
                        <p>
                            Vos messages et fichiers ne transitent jamais par les serveurs de Synco.
                            Une fois la session établie, votre appareil communique directement avec
                            celui de votre correspondant.
                        </p>
                        <p class="mt-2 flex items-center gap-1.5 text-xs font-medium" :class="connectionType === 'relay' ? 'text-yellow-500' : 'text-green-500'">
                            <i class="bi" :class="connectionType === 'relay' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'" />
                            {{ connectionType === 'relay' ? 'Connexion actuelle : relayée (réseau restrictif)' : connectionType === 'direct' ? 'Connexion actuelle : directe' : 'Connexion en cours de vérification…' }}
                        </p>
                    </div>
                </div>

                <div class="flex items-start gap-3">
                    <i class="bi bi-key-fill text-lg text-(--primary) mt-0.5 shrink-0" />
                    <div>
                        <p class="text-(--text) font-semibold mb-1">Comment ça marche</p>
                        <p>
                            À l'ouverture, vos deux appareils génèrent chacun une paire de clés RSA
                            (4096 bits) et échangent leur clé publique. Chaque message et chaque
                            fichier est ensuite chiffré avec une clé AES-256 unique, elle-même
                            protégée par cette clé publique — seul votre correspondant, avec sa clé
                            privée qui ne quitte jamais son appareil, peut la déchiffrer.
                        </p>
                    </div>
                </div>

                <!-- Code de vérification de la session (audit FC6) -->
                <div class="flex items-start gap-3 pt-3 border-t border-(--border-color)">
                    <i class="bi bi-patch-question-fill text-lg text-(--primary) mt-0.5 shrink-0" />
                    <div class="flex-1">
                        <p class="text-(--text) font-semibold mb-1">Code de vérification</p>
                        <p class="mb-3">
                            Lisez ce code à voix haute avec votre correspondant (appel, en personne) :
                            s'il est identique des deux côtés, personne — pas même le serveur — ne
                            s'est interposé entre vous.
                        </p>
                        <div class="px-4 py-3 rounded-xl bg-(--bg2) border border-(--border-color) text-center">
                            <span class="text-lg font-mono tracking-[0.2em] text-(--text)">{{ meetSasCode || '…' }}</span>
                        </div>
                    </div>
                </div>

                <div class="flex items-start gap-3">
                    <i class="bi bi-hourglass-split text-lg text-(--primary) mt-0.5 shrink-0" />
                    <div>
                        <p class="text-(--text) font-semibold mb-1">Rien n'est conservé</p>
                        <p>
                            Les messages et fichiers ne sont stockés nulle part — ni sur un serveur,
                            ni dans une base de données — seulement en mémoire le temps de la session.
                        </p>
                    </div>
                </div>

            </div>

        </Popup>

    </div>

</template>

<script lang="ts" setup>

import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from '@/composables/useToast';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import { openedOrg } from '@/assets/var';
import type { OrgMember } from '@/types/types';
import usePrivateMeet from '@/composables/usePrivatMeet';
import SpinLoader from '@/components/SpinLoader.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import Popup from '@/components/Popup.vue';

const {
    messages,
    activeMeetPeerId,
    isMeetConnecting,
    meetLoadingStatus,
    isConnected,
    hasPendingFileTransfer,
    sendEncryptedMessage,
    sendEncryptedFile,
    endMeet,
    getConnectionType,
    meetSasCode
} = usePrivateMeet();

const route = useRoute();
const router = useRouter();
const toast = useToast();

const newMessage = ref<string>('');
const isDragging = ref<boolean>(false);
const fileInput = ref<HTMLInputElement | null>(null);
const connectionType = ref<'direct' | 'relay' | 'unknown' | null>(null);
const showCloseConfirm = ref<boolean>(false);
const showEncryptionInfo = ref<boolean>(false);

watch(() => isConnected.value, async (connected) => {
    connectionType.value = connected ? await getConnectionType() : null;
});

// Cette vue ne fait plus qu'observer l'état partagé (comme CallOverlay.vue
// lit useSecurePeer()) — elle ne possède plus le cycle de vie de la
// connexion. Démarrer/accepter une session se fait depuis ChatView.vue
// (bouton "Session éphémère") et Notifications.vue (Répondre), pas ici :
// c'est ce qui permet à la session de survivre à la navigation entre routes
// au lieu de mourir à chaque démontage de ce composant.
const recipient = computed(() => {
    if (activeMeetPeerId.value !== route.params.userId) return null;
    if (!openedOrg.value?.members?.length) return null;
    return openedOrg.value.members.find((m: OrgMember) => m.id == route.params.userId);
});

const close = async () => {
    endMeet();
    await router.push({ name: 'OrgThreadChat', params: { userId: route.params.userId } });
};

// Écran "aucune session active" (pas de connexion à couper, juste revenir
// au DM normal de cette personne) — endMeet() n'a rien à faire ici puisque
// justement aucune session n'est active.
const leaveEmptyMeet = () => {
    router.push({ name: 'OrgThreadChat', params: { userId: route.params.userId } });
};

// Un fichier en cours d'envoi/réception (ou envoyé mais pas encore confirmé
// reçu par le correspondant) serait interrompu net par une fermeture
// immédiate — on demande confirmation dans ce cas plutôt que de le perdre
// sans prévenir.
const requestClose = () => {
    if (hasPendingFileTransfer.value) {
        showCloseConfirm.value = true;
    } else {
        close();
    }
};

const confirmClose = () => {
    showCloseConfirm.value = false;
    close();
};

const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

const handleFilePicked = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
        const { error } = await sendEncryptedFile(file);
        if (error) toast.show(error, 'error');
    }
    if (fileInput.value) fileInput.value.value = '';
};

const handleDrop = async (e: DragEvent) => {
    isDragging.value = false;
    if (e.dataTransfer?.files) await handleFilePicked(e.dataTransfer.files);
};

// Si la session se termine (l'autre côté ferme, ou expiration faute de
// réponse) pendant qu'on la regarde, `recipient` ci-dessus redevient null
// automatiquement (activeMeetPeerId est remis à null par endMeet()/la
// fermeture du canal dans usePrivatMeet.ts), et l'UI retombe sur l'état
// "Aucune session active" sans navigation forcée à gérer ici.
//
// privateMeet:declined n'est plus géré ici (et n'a plus besoin de l'être) :
// usePrivatMeet.ts l'écoute une fois pour toute la session org, donc un
// refus est visible même si on a navigué ailleurs en attendant la réponse.

</script>
