<template>

    <div v-if="canAny(['ORG_GENERAL', 'ORG_MEMBERS', 'ORG_ROLES', 'ORG_WEBHOOKS', 'ORG_STORAGE', 'ORG_AI'])" class="flex flex-col h-full bg-(--bg) relative overflow-hidden w-full">
        
        <header 
            class="min-h-14 flex items-center px-4 border-b border-(--border-color) bg-(--bg2) backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-2">

                <MobileBackBtn />

                <!-- L'en-tête reste en place d'un onglet à l'autre : seuls l'icône et le titre se relaient -->
                <Transition name="title-swap" mode="out-in">
                    <div :key="setting?.route" class="flex items-center gap-2">
                        <i class="bi text-2xl text-(--text2)" :class="setting?.icon" />
                        <h2 class="font-bold text-(--text) tracking-wide lowercase">
                            {{ setting?.name }}
                        </h2>
                    </div>
                </Transition>
                
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

        <!-- flex-1 min-h-0 (et non h-full) : sous l'en-tête, h-full dépassait de sa hauteur vers le bas -->
        <main class="flex-1 min-h-0 w-full overflow-auto bg-(--bg3) relative">
            <RouterView v-slot="{ Component }">
                <Transition :name="isLittleScreen ? mobilePageTransition : 'view-swap'">
                    <component :is="Component" :key="route.name" />
                </Transition>
            </RouterView>
        </main>

    </div>

</template>

<script lang="ts" setup>

import { computed, inject, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { settingsViews } from './settings';
import { usePermissions } from '@/composables/usePermissions';
import { openedOrg, isLittleScreen } from '@/assets/var';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import { useUsersBar } from '@/composables/useUsersBar';

const route = useRoute();
// Petit écran : transition choisie par OrgLayout selon que le panneau reste ouvert, s'ouvre ou se ferme.
const mobilePageTransition = inject<Ref<string>>('mobilePageTransition', ref(''));
const router = useRouter();

const orgId = computed(() => openedOrg.value?.id);
const { canAny, can } = usePermissions(orgId);

const { showUsersBar } = useUsersBar();

const setting = computed(() => {
    return settingsViews.find(view => view.route == route.name);
})

// Rejoué à chaque onglet : SettingsLayout n'est plus recréé en changeant d'onglet (clé de vue d'OrgLayout).
watch(() => route.name, () => {
    // En quittant les paramètres, la route change avant le démontage : rien à vérifier.
    if (!route.matched.some(r => r.name === 'OrgSettings')) return;
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
}, { immediate: true });

</script>