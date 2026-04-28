<template>

    <div class="flex flex-col h-full bg-(--bg3) relative overflow-hidden w-full">
        
        <header 
            v-if="recipient" 
            class="h-14 flex items-center px-4 border-b border-white/5 bg-(--bg2)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-3">

                <img 
                    :src="recipient.avatarUrl" 
                    :alt="recipient.name"
                    class="w-9 h-9 rounded-full border border-white/10"
                />

                <div class="flex flex-col">

                    <h2 class="font-bold text-(--text) tracking-wide leading-none mb-1">
                        {{ recipient.name }}
                    </h2>

                    <div class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full" :class="getColorByStatus(recipient.data.status)" />
                        <span class="text-[10px] text-(--text)/40 uppercase tracking-tighter font-bold">
                            {{ getTextByStatus(recipient.data.status) }}
                        </span>
                    </div>

                </div>

            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text)/40">

                <button class="hover:text-(--text) transition-colors">
                    <i class="bi bi-telephone-fill" />
                </button>

            </div>

        </header>

        <template v-if="loading">

            <div class="flex-1 flex items-center justify-center gap-8 flex-col">
                <SpinLoader />
                <span class="text-(--text)/50 italic">{{ loadingStatus }}</span>
            </div>

        </template>

        <main 
            v-else
            ref="messagesContainer"
            class="flex-1 overflow-y-auto p-4 custom-scrollbar w-full"
        >

            <div v-if="recipient" class="flex flex-col justify-end min-h-full w-full">
                
                <div class="mb-8 p-6 border-b border-white/5 bg-white/1 rounded-2xl mx-4">
                    <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 overflow-hidden border-2 border-white/10">
                        <img :src="recipient.avatarUrl" class="w-full h-full object-cover" />
                    </div>
                    <h1 class="text-3xl font-black text-(--text) mb-2">{{ recipient.name }}</h1>
                    <p class="text-(--text)/50 text-sm">
                        C'est le début de votre historique de messages directs avec <b>@{{ recipient.name }}</b>.
                    </p>
                </div>

                <div class="space-y-1 w-full">

                    <div
                        v-for="(msg, index) in messages" 
                        :key="index" 
                        class="group px-4 py-1.5 flex flex-raw justify-start items-start gap-3 hover:bg-white/2 rounded-lg transition-colors"
                    >

                        <img 
                            src="https://cdn.silvercore.fr/static/files/silverteams/avatar/default.png"
                            class="rounded-full w-9 h-9 border border-white/5 shrink-0"
                        />

                        <div class="min-w-0 flex-1">

                            <div class="flex items-baseline gap-2">

                                <span class="text-(--primary) font-bold text-xs tracking-tight">
                                    {{ msg.sender || 'Utilisateur' }}
                                </span>

                            </div>

                            <p class="text-(--text)/85 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                                {{ msg.text || 'Aucun message' }}
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

        <footer v-if="recipient" class="p-4 bg-transparent mt-auto">

            <div class="relative flex items-center bg-(--bg) border border-white/10 rounded-xl px-4 py-2 focus-within:border-(--primary)/50 transition-all shadow-2xl">
                
                <ThreadTextarea
                    v-model="newMessage"
                    @send="sendEncryptedMessage(newMessage); newMessage = ''"
                    @input=""
                    ref="inputComponent"
                    :placeholder="'Message @' + recipient.name"
                />

                <button 
                    @click="sendEncryptedMessage(newMessage); newMessage = ''"
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

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import getColorByStatus from '@/assets/utils/getColorByStatus';
import getTextByStatus from '@/assets/utils/getTextByStatus';
import { useToast } from '@/composables/useToast';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import { openedOrg } from '@/assets/var';
import type { OrgMember } from '@/types/types';
import usePrivateMeet from '@/composables/usePrivatMeet';
import SpinLoader from '@/components/SpinLoader.vue';
import useWSocket from '@/composables/useWSocket';

const { messages, initPeer, connectToPeer, sendEncryptedMessage, destroyChat } = usePrivateMeet();

const route = useRoute();
const router = useRouter();
const toast = useToast();

const loading = ref<boolean>(true);
const loadingStatus = ref<string>('Initialisation de la conversation...');
const newMessage = ref<string>('');

const recipient = computed(() => {
    const userId = route.params.userId;
    if (!openedOrg.value?.members) return null;
    return openedOrg.value.members.find((m: OrgMember) => m.id === userId)?.user;
});

const mount = async () => {

    const socket = await useWSocket();

    socket.value?.on('privateMeet:accepted', async () => {
        if (recipient.value?.id) connectToPeer(recipient.value.id);
        loading.value = false;
    });

    socket.value?.on('privateMeet:declined', async () => {
        toast.show('La conversation a été refusée.', "error");
        router.back();
    });

    await initPeer();

    if (recipient.value) 
    {

        socket.value?.emit('privateMeet:call', { recipientId: recipient.value.id });
        loadingStatus.value = 'En attente de la réponse...';

        setTimeout(() => {
            if (loading.value) 
            {
                loadingStatus.value = 'Aucun réponse...';
            }
        }, 10000);

    } 
    else 
    {
        toast.show('Utilisateur introuvable.', "error");
        router.back();
    }

};

watch(() => route.params.userId, () => mount());


onMounted(async () => {
    await mount();
});

onUnmounted(async () => {

    destroyChat()

    const socket = await useWSocket();

    socket.value?.off('privateMeet:accepted');
    socket.value?.off('privateMeet:declined');

});

</script>