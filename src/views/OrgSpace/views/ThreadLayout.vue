<template>

    <div class="flex flex-col h-full bg-(--bg) relative overflow-hidden w-full">

        <header 
            v-if="thread" 
            class="h-14 flex items-center px-4 border-b border-white/5 bg-(--bg)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-2">
                <i v-if="thread.type === 'text'" class="bi bi-hash text-2xl text-(--text)/40" />
                <i v-else class="bi bi-volume-up-fill text-xl text-(--text)/40" />
                <h2 class="font-bold text-(--text) tracking-wide lowercase">
                    {{ thread.name }}
                </h2>
            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text)/40">
                <button class="hover:text-(--text) transition-colors">
                    <i class="bi bi-bell-fill" />
                </button>
                <button class="hover:text-(--text) transition-colors">
                    <i class="bi bi-people-fill" />
                </button>
            </div>

        </header>

        <template v-if="isVoice">
            <VoiceThreadView :thread="thread" />
        </template>

        <template v-else>
            <ThreadView :thread="thread" />
        </template>

    </div>

</template>
<script lang="ts" setup>

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import VoiceThreadView from './VoiceThreadView.vue';
import ThreadView from './ThreadView.vue';
import type { Thread, WorkSpace } from '@/types/types';
import { openedOrg } from '@/assets/var';

const route = useRoute();
const isVoice = computed<boolean>(() => route.query.type == 'vocal');

const thread = computed(() => {

    let allThreads: Thread[] = [];
    const space = openedOrg.value?.spaces?.find((s: WorkSpace) => s.id === route.params.spaceId);
    if (space) allThreads = [...allThreads, ...space.threads];
    
    const org = openedOrg.value;
    if (org && org.home) allThreads = [...allThreads, ...org.home.threads];

    return allThreads.find((t: Thread) => t.id === route.params.threadId);

});

</script>