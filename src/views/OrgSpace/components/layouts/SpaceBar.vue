<script setup lang="ts">

import SpaceBarBTN from '../common/SpaceBarBTN.vue';
import { useRoute, useRouter } from 'vue-router';
import CreateNewSpace from '../popup/CreateNewSpace.vue';
import { openedOrg, todoEnabled, aiEnabled } from '@/assets/var';
import isAdmin from '@/assets/isAdmin';
import { useNotification } from '@/composables/useNotification';

const router = useRouter();
const route = useRoute();
const { getUnreadCountBySpaceId } = useNotification();

</script>

<template>

    <nav
        v-if="openedOrg"
        class="
            h-full min-w-17 bg-(--bg)
            flex justify-start items-center flex-col pt-2.5
        "
    >

        <ul class="flex justify-start items-center flex-col gap-2 h-full w-full">

            <RouterLink to="/">
                <SpaceBarBTN
                    icon="bi-arrow-bar-left"
                    label="Revenir aux organisation"
                    redhover
                    @click="openedOrg = null"
                />
            </RouterLink>

            <RouterLink v-if="isAdmin" :to="`/${openedOrg.id}/settings?showView=0`">
                <SpaceBarBTN
                    icon="bi-gear"
                    label="Paramètres"
                    :active="route.name?.toString().startsWith('OrgSettings')"
                    iconFillOnActive
                />
            </RouterLink>

            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <RouterLink :to="`/${openedOrg.id}/home?showView=0`">
                <SpaceBarBTN
                    icon="bi-house"
                    label="Général"
                    iconFillOnActive
                    :active="route.name === 'OrgHome' || route.name === 'OrgThreadHome'"
                />
            </RouterLink>

            <RouterLink :to="`/${openedOrg.id}/chat?showView=0`">
                <SpaceBarBTN
                    icon="bi-chat-dots"
                    label="Messages privées"
                    iconFillOnActive
                    :active="route.name === 'OrgChat' || route.name === 'OrgThreadChat'"
                />
            </RouterLink>

            <RouterLink v-if="todoEnabled" :to="`/${openedOrg.id}/tasks`">
                <SpaceBarBTN
                    icon="bi-list-check"
                    label="Mes Tâches"
                    :active="route.name === 'TasksGlobal'"
                />
            </RouterLink>
            
            <RouterLink v-if="aiEnabled" :to="`/${openedOrg.id}/ai?showView=0`">
                <SpaceBarBTN
                    icon="bi-robot"
                    label="Synco AI"
                    :active="route.name === 'OrgAI'"
                />
            </RouterLink>
            
            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <RouterLink
                v-for="space in openedOrg?.spaces" 
                :key="'space-' + space.id + '-link'" 
                :to="`/${openedOrg.id}/${space.id}?showView=0`"
            >
                <SpaceBarBTN
                    :key="'space-' + space.id + '-btn'"
                    :icon="space.logo!"
                    :label="space.name"
                    :active="route.path.includes(space.id)"
                    :hasUnread="getUnreadCountBySpaceId(space.id).value > 0"
                />
            </RouterLink>

            <CreateNewSpace>
                <SpaceBarBTN
                    icon="bi-plus"
                    label="Créer un nouvel espace"
                />
            </CreateNewSpace>

        </ul>

    </nav>

    <!-- loader -->
    <nav
        v-else
        class="
            h-full min-w-17 bg-(--bg) border-r border-(--border-color)
            flex justify-start items-center flex-col pt-2.5
        "
    >

        <ul class="flex justify-start items-center flex-col gap-2 h-full w-full ">

            <SpaceBarBTN
                icon="bi-arrow-bar-left"
                label="Revenir aux organisation"
                redhover
                @click="openedOrg = null, router.push('/')"
            />

            <div
                v-if="isAdmin"
                class="                
                    relative flex items-center justify-center 
                    w-12 h-12 cursor-pointer transition-all duration-300 ease-out
                    bg-(--bg2) rounded-xl overflow-hidden border border-(--primary-dark) animate-pulse
                "
            />

            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <div 
                v-for="i in 2"
                :key="i"
                class="                
                    relative flex items-center justify-center 
                    w-12 h-12 cursor-pointer transition-all duration-300 ease-out
                    bg-(--bg2) rounded-xl overflow-hidden border border-(--primary-dark) animate-pulse
                "
            />
            
            <hr class=" w-8 h-0.5 bg-(--text)/50 border-none rounded-full my-2" />

            <div 
                v-for="i in 5"
                :key="i"
                class="                
                    relative flex items-center justify-center 
                    w-12 h-12 cursor-pointer transition-all duration-300 ease-out
                    bg-(--bg2) rounded-xl overflow-hidden border border-(--primary-dark) animate-pulse
                "
            />


        </ul>

    </nav>

</template>