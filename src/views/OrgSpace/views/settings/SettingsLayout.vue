<template>

    <div class="flex flex-col h-full bg-(--bg) relative overflow-hidden w-full">
        
        <header 
            class="min-h-14 flex items-center px-4 border-b border-white/5 bg-(--bg)/80 backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-2">
                <i class="bi text-2xl text-(--text)/40" :class="setting?.icon" />
                <h2 class="font-bold text-(--text) tracking-wide lowercase">
                    {{ setting?.name }}
                </h2>
            </div>

        </header>

        <main class="h-full w-full overflow-auto">
            <RouterView />
        </main>

    </div>

</template>

<script lang="ts" setup>

import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { settingsViews } from './settings';

const route = useRoute();
const router = useRouter();

const setting = computed(() => {
    return settingsViews.find(view => view.route == route.name);
})

onMounted(() => {
    const firstSetting = settingsViews[0];
    if (!firstSetting) return;
    router.push({ name: firstSetting.route });
});


</script>