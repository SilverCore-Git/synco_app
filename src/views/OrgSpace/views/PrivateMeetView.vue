<template>

    <div class="m-6 rounded-2xl shadow-2xl border border-(--text)/20 flex flex-col h-[calc(100vh-3rem)] bg-(--bg3) relative overflow-hidden ">
        
        <header 
            v-if="recipient" 
            class="h-14 flex items-center px-4 border-b border-white/5 bg-(--bg2)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-3">

               <div class="flex items-center gap-1.5 bg-green-500/10 px-3 py-2 rounded-2xl border border-green-500/20">
                    <i class="bi bi-shield-lock-fill text-[12px] text-green-500" />
                    <span class="text-[12px] text-green-500 uppercase tracking-tighter font-bold">
                        Chiffré de bout en bout (P2P)
                    </span>
                </div>

            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text)/40">

                <button class="hover:text-(--text) transition-colors">
                    <i 
                        @click="close" 
                        class="bi bi-telephone-x-fill text-red-400 hover:text-red-500 transition-colors"
                    />
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
            class="flex-1 overflow-y-scroll p-4 w-full"
        >

            <div v-if="recipient" class="flex flex-col justify-end min-h-full w-full">

                <div class="space-y-1 w-full">

                    <div
                        v-for="(msg, index) in messages" 
                        :key="index" 
                        class="group px-4 py-1.5 flex flex-raw justify-start items-start gap-3 hover:bg-white/2 rounded-lg transition-colors"
                    >

                        <img 
                            :src="`https://ui-avatars.com/api/?name=${msg.sender}&background=128a60&color=fff`"
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
                    :placeholder="'Message @' + recipient.user?.name"
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
import { useToast } from '@/composables/useToast';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import { openedOrg, user } from '@/assets/var';
import type { OrgMember } from '@/types/types';
import usePrivateMeet, { isMeeting } from '@/composables/usePrivatMeet';
import SpinLoader from '@/components/SpinLoader.vue';
import useWSocket from '@/composables/useWSocket';
import waitFor from '@/assets/utils/waitfor';

const { messages, isConnected, myPeerId, initPeer, connectToPeer, sendEncryptedMessage, destroyChat } = usePrivateMeet();

const route = useRoute();
const router = useRouter();
const toast = useToast();

const loading = ref<boolean>(true);
const loadingStatus = ref<string>('Initialisation de la conversation...');
const newMessage = ref<string>('');

const recipient = computed(() => {
    const userId = route.params.userId;
    if (!openedOrg.value?.members?.length) return null;
    return openedOrg.value.members.find((m: OrgMember) => m.id == userId);
});

const close = () => router.push({ name: 'OrgThreadChat', params: { userId: recipient.value?.id } });

const mount = async () => {

    await waitFor(() => recipient.value != undefined);

    const socket = await useWSocket();

    const orgMe = openedOrg.value!.members!.find((m: OrgMember) => m.userId == user.value?.id);

    await initPeer(orgMe?.id); 

    await waitFor(() => myPeerId.value !== '');

    socket.value?.off('privateMeet:accepted');
    socket.value?.on('privateMeet:accepted', async () => {
        if (recipient.value?.id)
        {
            connectToPeer(recipient.value.id); 
            loadingStatus.value = "Établissement du canal sécurisé...";
        }
    });

    watch(() => isConnected.value, (connected) => {
        if (connected) 
        {
            loading.value = false;
            isMeeting.value = true;
        }
    });

    if (recipient.value?.id)
    {
        connectToPeer(recipient.value.id);
    }

    socket.value?.on('privateMeet:declined', async () => {
        toast.show('La conversation a été refusée.', "error");
        router.back();
    });

    if (recipient.value) 
    {

        socket.value?.emit('privateMeet:call', { recipientId: recipient.value.userId });
        loadingStatus.value = 'En attente de la réponse...';

        setTimeout(() => {
            if (loading.value) 
            {
                loadingStatus.value = 'Aucune réponse, fermeture de la session.';
                setTimeout(() => {
                    close();
                }, 2000);
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


watch(() => isMeeting.value, (newVal, oldVal) => {
    if (oldVal == true && newVal == false)
    {
        close();
    }
})

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