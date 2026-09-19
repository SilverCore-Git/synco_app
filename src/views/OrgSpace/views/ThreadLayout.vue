<template>

    <div class="flex flex-col h-full relative overflow-hidden w-full">

        <header
            class="h-14 flex items-center px-4 border-b border-(--border-color) bg-(--bg2) backdrop-blur-md z-10"
        >

            <div v-if="thread && openedOrg" class="flex items-center gap-2">

                <MobileBackBtn />

                <i v-if="thread.type === 'text'" class="bi bi-hash text-2xl text-(--text2)" />
                <i v-else class="bi bi-volume-up-fill text-xl text-(--text2)" />

                <h2 class="font-bold text-(--text) tracking-wide lowercase">
                    {{ thread.name }}
                </h2>

                <!-- Bouclier discret (même traitement que les appels DM et les
                     sessions éphémères) : au clic, explique le chiffrement de
                     ce salon plutôt que d'afficher un badge texte en continu. -->
                <button
                    @click="showEncryptionInfo = true"
                    class="p-1.5 rounded-lg text-green-500 hover:bg-white/5 transition-colors shrink-0"
                    title="Chiffré de bout en bout (en savoir plus)"
                >
                    <i class="bi bi-shield-lock-fill text-sm" />
                </button>

            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text2)">
                <button 
                    @click="showUsersBar = !showUsersBar"
                    class="hover:text-(--text) transition-colors"
                    :class="showUsersBar ? 'text-(--text)' : ''"
                >
                    <i class="bi bi-people-fill" />
                </button>
            </div>

        </header>

        <template v-if="isVoice && openedOrg">
            <VoiceThreadView :thread="thread" />
        </template>

        <template v-else-if="!isVoice && openedOrg">
            <ThreadView :thread="thread" />
        </template>

        <template v-else>
            <div class="flex justify-center items-center h-full">
                <SpinLoader />
            </div>
        </template>

        <Popup :isOpen="showEncryptionInfo" @close="showEncryptionInfo = false">
            <template #title>Chiffrement de bout en bout</template>

            <div class="space-y-5 text-sm text-(--text2) leading-relaxed">

                <div class="flex items-start gap-3">
                    <i class="bi bi-key-fill text-lg text-(--primary) mt-0.5 shrink-0" />
                    <div>
                        <p class="text-(--text) font-semibold mb-1">Une clé propre à ce salon</p>
                        <p>
                            Ce salon a sa propre clé de chiffrement, distribuée à chaque membre
                            chiffrée individuellement avec sa clé publique RSA — seuls les membres
                            du salon peuvent la reconstituer.
                        </p>
                    </div>
                </div>

                <div class="flex items-start gap-3">
                    <i class="bi" :class="thread?.type === 'text' ? 'bi-chat-left-text-fill text-lg text-(--primary) mt-0.5 shrink-0' : 'bi-mic-fill text-lg text-(--primary) mt-0.5 shrink-0'" />
                    <div>
                        <p class="text-(--text) font-semibold mb-1">
                            {{ thread?.type === 'text' ? 'Vos messages' : 'Votre voix et votre image' }}
                        </p>
                        <p v-if="thread?.type === 'text'">
                            Chaque message est chiffré avec cette clé directement sur votre
                            appareil avant d'être envoyé. Le serveur ne stocke et ne relaie que du
                            contenu chiffré — il ne peut jamais le lire.
                        </p>
                        <p v-else>
                            Le son (et la vidéo) sont chiffrés directement sur votre appareil avec
                            cette même clé avant d'être envoyés. Le serveur qui relaie l'appel
                            entre les participants ne peut jamais le déchiffrer.
                        </p>
                    </div>
                </div>

                <div class="flex items-start gap-3 pt-3 border-t border-(--border-color)">
                    <i class="bi bi-hourglass-split text-lg text-(--text2) mt-0.5 shrink-0" />
                    <div>
                        <p class="text-(--text) font-semibold mb-1">Historique conservé, contenu illisible</p>
                        <p>
                            Contrairement à un appel privé ou une session éphémère, ce salon garde
                            un historique — mais toujours sous forme chiffrée : même en cas d'accès
                            à la base de données, son contenu reste illisible sans les clés privées
                            des membres.
                        </p>
                    </div>
                </div>

            </div>

        </Popup>

    </div>

</template>
<script lang="ts" setup>

import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import VoiceThreadView from './VoiceThreadView.vue';
import ThreadView from './ThreadView.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import Popup from '@/components/Popup.vue';
import type { Thread, WorkSpace } from '@/types/types';
import { openedOrg } from '@/assets/var';
import SpinLoader from '@/components/SpinLoader.vue';
import { useUsersBar } from '@/composables/useUsersBar';

const route = useRoute();

const isVoice = computed<boolean>(() => route.query.type == 'vocal');
const { showUsersBar } = useUsersBar();
const showEncryptionInfo = ref<boolean>(false);

const thread = computed(() => {

    let allThreads: Thread[] = [];
    const space = openedOrg.value?.spaces?.find((s: WorkSpace) => s.id === route.params.spaceId);
    if (space) allThreads = [...allThreads, ...space.threads];
    
    const org = openedOrg.value;
    if (org && org.home) allThreads = [...allThreads, ...org.home.threads];

    return allThreads.find((t: Thread) => t.id === route.params.threadId);

});

</script>