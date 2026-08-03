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

    </div>

</template>
<script lang="ts" setup>

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import VoiceThreadView from './VoiceThreadView.vue';
import ThreadView from './ThreadView.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import type { Thread, WorkSpace } from '@/types/types';
import { openedOrg } from '@/assets/var';
import SpinLoader from '@/components/SpinLoader.vue';
import useSettingsItem from '@/composables/useSettingsItem';

const route = useRoute();

const isVoice = computed<boolean>(() => route.query.type == 'vocal');
const { Item: showUsersBar } = useSettingsItem('showUsersBar', true);

const thread = computed(() => {

    let allThreads: Thread[] = [];
    const space = openedOrg.value?.spaces?.find((s: WorkSpace) => s.id === route.params.spaceId);
    if (space) allThreads = [...allThreads, ...space.threads];
    
    const org = openedOrg.value;
    if (org && org.home) allThreads = [...allThreads, ...org.home.threads];

    return allThreads.find((t: Thread) => t.id === route.params.threadId);

});

</script>