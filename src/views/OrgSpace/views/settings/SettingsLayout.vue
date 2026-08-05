<template>

    <div v-if="isAdmin" class="flex flex-col h-full bg-(--bg) relative overflow-hidden w-full">
        
        <header 
            class="min-h-14 flex items-center px-4 border-b border-(--border-color) bg-(--bg2) backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-2">

                <MobileBackBtn />

                <i class="bi text-2xl text-(--text2)" :class="setting?.icon" />
                <h2 class="font-bold text-(--text) tracking-wide lowercase">
                    {{ setting?.name }}
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

        <main class="h-full w-full overflow-auto bg-(--bg3)">
            <RouterView />
        </main>

    </div>

</template>

<script lang="ts" setup>

import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { settingsViews } from './settings';
import isAdmin from '@/assets/isAdmin';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import useSettingsItem from '@/composables/useSettingsItem';

const route = useRoute();
const router = useRouter();

const { Item: showUsersBar } = useSettingsItem('showUsersBar', true);

const setting = computed(() => {
    return settingsViews.find(view => view.route == route.name);
})

onMounted(() => {

    if (!isAdmin.value) return router.push({ name: 'OrgHome' });

    if (route.name === 'OrgSettings') {
        const firstSetting = settingsViews[0];
        if (!firstSetting) return;
        router.push({ name: firstSetting.route, query: route.query });
    }

});

</script>