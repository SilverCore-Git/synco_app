<template>

    <div 
        class="h-full w-full pb-20 bg-(--bg2) border-r border-l border-white/5 "
        :class="isDesktopApp() ? 'border-t' : ''"
    >

        <!-- loader -->
        <template v-if="openedOrg == null" class="h-full w-full">
            
            <ThreadBarDropDown class="h-full w-full">

                <template #trigger>

                    <div
                        class="
                            h-full 
                            flex justify-start items-start flex-col relative
                        "
                        @contextmenu.prevent="showDropDown = !showDropDown"
                    >

                        <div 
                            class="
                                min-h-14 pl-5 px-3 flex justify-between items-center
                                flex-row w-full border-b border-white/5
                            "
                        >

                            <div class="flex justify-center items-center flex-row gap-3 ">
                                <div class=" rounded-lg bg-(--white)/6 h-6 w-6 animate-pulse" />
                                <div class=" rounded-lg bg-(--white)/6 h-5 w-40 animate-pulse" />
                            </div>
                        
                        </div>

                        <ul
                            class="
                                flex justify-start items-start flex-col mb-11
                                gap-3 h-full w-full px-3 py-5 overflow-scroll 
                            "
                        >

                            <div 
                                v-for="i in 13"
                                :key="i"
                                class=" rounded-lg bg-(--white)/4 h-6 w-full animate-pulse" 
                            />

                        </ul>

                    </div>

                </template>

            </ThreadBarDropDown>

        </template>

        <template v-else-if="isSettings && isAdmin" class="h-full w-full">

            <div
                class="
                    h-full w-full relative
                    flex justify-start items-start flex-col 
                "
            >

                <div 
                    class="
                        min-h-14 pl-5 px-3 flex justify-between items-center
                        flex-row w-full border-b border-white/5
                    "
                >

                    <div class="flex justify-center items-center flex-row gap-3 ">
                        <img v-if="icon && icon.startsWith('http')" :src="icon" />
                        <i v-else-if="icon" class="bi" :class="icon" />
                        <h3 class="font-semibold">
                            {{ title }}
                        </h3>
                    </div>
                        
                </div>

                <ul
                    class="
                        flex justify-start items-start flex-col mb-11
                        gap-3 h-full w-full px-3 py-5 overflow-scroll
                    "
                >

                    <RouterLink
                        v-for="view in settingsViews"
                        :key="'settings-' + view.name + '-link'"
                        :to="{ name: view.route, query: { ...route.query, showView: '1' } }"
                        class="w-full"
                    >
                        <SettingsViewBtn
                            :key="'settings-' + view.name + '-btn'"
                            :name="view.name"
                            :icon="view.icon"
                            :active="
                                route.name == view.route
                            "
                        />
                    </RouterLink>

                </ul>

            </div>


        </template>

        <template v-else-if="isChat" class="h-full w-full">

            <div
                class="
                    h-full 
                    flex justify-start items-start flex-col relative
                "
            >

                <div 
                    class="
                        min-h-14 pl-5 px-3 flex justify-between items-center
                        flex-row w-full border-b border-white/5
                    "
                >

                    <div class="flex justify-center items-center flex-row gap-3 ">
                        <img v-if="icon && icon.startsWith('http')" :src="icon" />
                        <i v-else-if="icon" class="bi" :class="icon" />
                        <h3 class="font-semibold">
                            {{ title }}
                        </h3>
                    </div>
                        
                </div>

                <ul
                    class="
                        flex justify-start items-start flex-col mb-11
                        gap-3 h-full w-full px-3 py-5 overflow-scroll
                    "
                >

                    <RouterLink
                        v-for="member in openedOrg?.members"
                        :key="member.id + '-link'"
                        :to="{ name: 'OrgThreadChat', params: { userId: member.id }, query: { showView: '1' } }"
                        class="w-full"
                    >
                        <ChatUserBtn
                            :key="member.id + '-btn'"
                            :user="member"
                            :active="route.params.userId == member.id"
                        />
                    </RouterLink>

                </ul>

            </div>


        </template>

        <template v-else class="h-full w-full">
            
            <ThreadBarDropDown class="h-full w-full">

                <template #trigger>

                    <div
                        class="
                            h-full 
                            flex justify-start items-start flex-col relative
                        "
                        @contextmenu.prevent="showDropDown = !showDropDown"
                    >

                        <div 
                            class="
                                min-h-14 pl-5 px-3 flex justify-between items-center
                                flex-row w-full border-b border-white/5
                            "
                        >

                            <div class="flex justify-start items-center flex-row gap-3" :title="title">
                                <img v-if="icon && icon.startsWith('http')" :src="icon" class="w-6 h-6 rounded-sm" />
                                <i v-else-if="icon" class="bi" :class="icon" />
                                <h3 class="font-semibold text-ellipsis overflow-hidden whitespace-nowrap max-w-[120px]">
                                    {{ title }}
                                </h3>
                            </div>

                            <ThreadDropDown />
                        
                        </div>

                        <ul
                            class="
                                flex justify-start items-start flex-col mb-11
                                gap-3 h-full w-full px-3 py-5 overflow-scroll 
                            "
                        >

                            <SettingsViewBtn 
                                v-if="!isHome"
                                name="Rechercher"
                                icon="bi-search"
                                :active="showSearchModal"
                                @click="showSearchModal = true"
                            />

                            <SettingsViewBtn 
                                v-if="!isHome && filesEnabled"
                                name="Fichiers"
                                icon="bi-file-earmark"
                                :active="route.name == 'SpaceFiles'"
                                @click="router.push({ name: 'SpaceFiles', query: { showView: '1' } })"
                            />

                            <SettingsViewBtn 
                                v-if="!isHome && todoEnabled"
                                name="Tâches"
                                icon="bi-check2-square"
                                :active="route.name == 'TasksSpace'"
                                @click="router.push({ name: 'TasksSpace', query: { showView: '1' } })"
                            />

                            <hr v-if="!isHome" class=" w-full h-0.5 bg-(--text)/50 border-none rounded-full my-1" />
                            
                            <div  
                                v-for="category in categories" 
                                :key="'category-' + category.id"
                                @contextmenu.stop
                                class="w-full"
                            >
                                <Category 
                                    :category="category"
                                    :threads="threadsByCategory[category.id] || []"
                                />
                            </div>

                        </ul>

                    </div>

                </template>

            </ThreadBarDropDown>

        </template>

        <SpaceSearchModal :show="showSearchModal" @close="showSearchModal = false" />

    </div>

</template>


<script lang="ts" setup>

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Thread, WorkSpace } from '@/types/types';
import { openedOrg, todoEnabled, filesEnabled } from '@/assets/var';
import ThreadDropDown from '../dropdown/ThreadDropDown.vue';
import ThreadBarDropDown from '../dropdown/ThreadBarDropDown.vue';
import ChatUserBtn from '../CanalBar/ChatUserBtn.vue';
import SettingsViewBtn from '../CanalBar/SettingsViewBtn.vue';
import { settingsViews } from '../../views/settings/settings';
import isAdmin from '@/assets/isAdmin';
import Category from '../CanalBar/Category.vue';
import isDesktopApp from '@/assets/isDesktopApp';
import SpaceSearchModal from '../popup/SpaceSearchModal.vue';


const route = useRoute();
const router = useRouter();

const isChat = computed(() => route.name == 'OrgChat' || route.name == 'OrgThreadChat' || route.name == 'OrgThreadChatPrivateMeet');
const isHome = computed(()=> route.name == 'OrgHome' || route.name == 'OrgThreadHome');
const isSettings = computed(()=> route.name?.toString().startsWith('OrgSettings'));
const showDropDown = ref<boolean>(false);
const showSearchModal = ref<boolean>(false);


const title = computed<string>(() => {
    if (isHome.value) return 'Accueil';
    else if (isChat.value) return 'Messages privés';
    else if (isSettings.value) return 'Paramètres';
    else 
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return 'Inconu';
        return space.name;
    }
})

const icon = computed(() => {
    if (isHome.value) return 'bi-house';
    else if (isChat.value) return 'bi-chat-dots';
    else if (isSettings.value) return 'bi-gear';
    else
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return 'Inconu';
        return space.logo;
    }
})

const threads = computed<Thread[]>(() => {
    if (isHome.value)
    {
        return openedOrg.value?.home?.threads || [];
    }
    else if (isChat.value) return []
    else if (isSettings.value) return []
    else
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return [];
        return space.threads;
    }
});


const threadsByCategory = computed(() => {

    const map: Record<string, Thread[]> = {};
    
    categories.value.forEach(cat => map[cat.id] = []);
    
    threads.value.forEach(thread => {
        if (map[thread.categoryId]) {
            map[thread.categoryId]?.push(thread);
        }
    });
    
    return map;

});


const categories = computed(() => {
    if (isHome.value)
    {
        return openedOrg.value?.home?.categories || [];
    }
    else if (isChat.value) return []
    else
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return [];
        return space.categories;
    }
});

</script>