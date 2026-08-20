<template>

    <div v-if="canAny(['ORG_GENERAL', 'ORG_MEMBERS', 'ORG_ROLES', 'ORG_WEBHOOKS', 'ORG_STORAGE', 'ORG_AI'])" class="flex flex-col h-full bg-(--bg) relative overflow-hidden w-full">
        
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
import { usePermissions } from '@/composables/usePermissions';
import { openedOrg } from '@/assets/var';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import { useUsersBar } from '@/composables/useUsersBar';

const route = useRoute();
const router = useRouter();

const orgId = computed(() => openedOrg.value?.id);
const { canAny, can } = usePermissions(orgId);

const { showUsersBar } = useUsersBar();

const setting = computed(() => {
    return settingsViews.find(view => view.route == route.name);
})

onMounted(() => {
    const hasAnySettingsPerm = canAny(['ORG_GENERAL', 'ORG_MEMBERS', 'ORG_ROLES', 'ORG_WEBHOOKS', 'ORG_STORAGE', 'ORG_AI']);
    if (!hasAnySettingsPerm) return router.push({ name: 'OrgHome' });

    if (route.name === 'OrgSettings') {
        const firstAllowedSetting = settingsViews.find(v => can(v.permission));
        if (!firstAllowedSetting) return router.push({ name: 'OrgHome' });
        router.push({ name: firstAllowedSetting.route, query: route.query });
    } else {
        if (setting.value && !can(setting.value.permission)) {
            const firstAllowedSetting = settingsViews.find(v => can(v.permission));
            if (firstAllowedSetting) router.push({ name: firstAllowedSetting.route, query: route.query });
            else router.push({ name: 'OrgHome' });
        }
    }
});

</script>