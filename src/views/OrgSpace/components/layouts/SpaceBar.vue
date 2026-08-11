<script setup lang="ts">

import SpaceBarBTN from '../common/SpaceBarBTN.vue';
import { useRoute, useRouter } from 'vue-router';
import CreateNewSpace from '../popup/CreateNewSpace.vue';
import { openedOrg, todoEnabled, aiEnabled, user } from '@/assets/var';
import isAdmin from '@/assets/isAdmin';
import { useNotification } from '@/composables/useNotification';
import draggable from 'vuedraggable';
import { ref, watch } from 'vue';
import type { WorkSpace } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';

const router = useRouter();
const route = useRoute();
const { getUnreadCountBySpaceId, getUnreadCountForTasks, getUnreadCountForDMs } = useNotification();

const localSpaces = ref<WorkSpace[]>([]);

watch(() => openedOrg.value?.spaces, () => {
    if (!openedOrg.value) return;
    const order = user.value?.data?.workspaceOrder?.[openedOrg.value.id] || [];
    localSpaces.value = [...(openedOrg.value.spaces || [])].sort((a, b) => {
        const indexA = order.indexOf(a.id);
        const indexB = order.indexOf(b.id);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
}, { immediate: true, deep: true });

const onSpaceOrderChange = async () => {
    if (!openedOrg.value) return;
    if (!user.value) return;
    
    const newOrder = localSpaces.value.map(s => s.id);
    
    if (!user.value.data) user.value.data = { status: 'online' };
    if (!user.value.data.workspaceOrder) user.value.data.workspaceOrder = {};
    user.value.data.workspaceOrder[openedOrg.value.id] = newOrder;
    
    await sfetch('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
            data: {
                workspaceOrder: user.value.data.workspaceOrder
            }
        })
    });
};


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

            <RouterLink :to="`/${openedOrg.id}/chat?showView=0`" class="relative">
                <SpaceBarBTN
                    icon="bi-chat-dots"
                    label="Messages privées"
                    :active="route.name === 'OrgChat' || route.name === 'OrgThreadChat'"
                    iconFillOnActive
                />
                <div 
                    v-if="getUnreadCountForDMs > 0" 
                    class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"
                ></div>
            </RouterLink>

            <RouterLink v-if="todoEnabled" :to="`/${openedOrg.id}/tasks?showView=1`">
                <SpaceBarBTN
                    icon="bi-list-check"
                    label="Mes Tâches"
                    :active="route.name === 'TasksGlobal'"
                    :hasUnread="getUnreadCountForTasks > 0"
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

            <draggable
                v-model="localSpaces"
                item-key="id"
                group="workspaces"
                @change="onSpaceOrderChange"
                ghost-class="opacity-50"
                drag-class="cursor-grabbing"
                class="flex flex-col gap-2 w-full"
            >
                <template #item="{ element: space }">
                    <RouterLink
                        :to="`/${openedOrg.id}/${space.id}?showView=0`"
                        class="w-full flex justify-center cursor-grab active:cursor-grabbing"
                    >
                        <SpaceBarBTN
                            :key="'space-' + space.id + '-btn'"
                            :icon="space.logo!"
                            :label="space.name"
                            :active="route.path.includes(space.id)"
                            :hasUnread="getUnreadCountBySpaceId(space.id).value > 0 || space.threads?.some((t: any) => t.hasUnread)"
                        />
                    </RouterLink>
                </template>
            </draggable>

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