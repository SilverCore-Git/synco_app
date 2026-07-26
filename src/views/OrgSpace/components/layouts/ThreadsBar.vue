<template>

    <div 
        class="h-full w-full pb-20 bg-(--bg2) border-r border-l border-(--border-color) "
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
                                flex-row w-full border-b border-(--border-color)
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
                        flex-row w-full border-b border-(--border-color)
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
                        v-show="view.route !== 'OrgSettingsStorage' || filesEnabled"
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
                        flex-row w-full border-b border-(--border-color)
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

        <template v-else-if="isAI" class="h-full w-full">
            <div class="h-full flex justify-start items-start flex-col relative">
                <div class="min-h-14 pl-5 px-3 flex justify-between items-center flex-row w-full border-b border-(--border-color)">
                    <div class="flex justify-center items-center flex-row gap-3">
                        <i class="bi bi-robot"></i>
                        <h3 class="font-semibold">{{ title }}</h3>
                    </div>
                </div>

                <div class="p-4 border-b border-(--border-color) w-full">
                    <button
                        @click="newSession"
                        class="w-full bg-(--primary)/10 text-(--primary) hover:bg-(--primary)/20 border border-(--primary)/20 px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2"
                    >
                        <i class="bi bi-plus-lg"></i>
                        Nouvelle session
                    </button>

                    <div class="mt-4" v-if="aiIsLocal">
                        <p class="text-[10px] uppercase font-bold text-(--text)/50 mb-1">Modèle Local</p>
                        <select 
                            v-model="selectedModelId"
                            class="w-full bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-(--primary) transition-colors"
                        >
                            <option v-for="model in availableModels" :key="model.id" :value="model.id">
                            Tier {{ model.tier }} - {{ model.name }}
                            </option>
                        </select>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-2 space-y-1 w-full">
                    <p class="text-[10px] uppercase font-bold text-(--text)/50 px-2 mt-2 mb-1">Historique</p>
                    
                    <div v-if="chatSessions.length === 0" class="text-xs text-center text-(--text)/40 mt-4 italic">
                        Aucune session
                    </div>

                    <div 
                        v-for="session in chatSessions" 
                        :key="session.id"
                        class="group flex items-center justify-between px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors"
                        :class="activeSessionId === session.id ? 'bg-(--primary)/20 text-(--primary)' : 'text-(--text)/70 hover:bg-white/5 hover:text-(--text)'"
                        @click="loadSession(session.id)"
                    >
                        <div class="truncate pr-2 flex-1">
                            {{ session.title || 'Nouvelle session' }}
                        </div>
                        <button 
                            @click.stop="deleteSession(session.id)" 
                            class="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity p-1"
                            title="Supprimer"
                        >
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
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
                                flex-row w-full border-b border-(--border-color)
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
import { chatSessions, activeSessionId, newSession, deleteSession, loadSession, aiIsLocal, selectedModelId } from '@/services/AIService';
import { availableModels } from '@/services/LocalLLMService';


const route = useRoute();
const router = useRouter();

const isChat = computed(() => route.name == 'OrgChat' || route.name == 'OrgThreadChat' || route.name == 'OrgThreadChatPrivateMeet');
const isHome = computed(()=> route.name == 'OrgHome' || route.name == 'OrgThreadHome');
const isSettings = computed(()=> route.name?.toString().startsWith('OrgSettings'));
const isAI = computed(() => route.name === 'OrgAI');
const showDropDown = ref<boolean>(false);
const showSearchModal = ref<boolean>(false);


const title = computed<string>(() => {
    if (isHome.value) return 'Accueil';
    else if (isChat.value) return 'Messages privés';
    else if (isSettings.value) return 'Paramètres';
    else if (isAI.value) return 'Synco AI';
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
    else if (isAI.value) return 'bi-robot';
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
    else if (isSettings.value || isAI.value) return []
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
    else if (isChat.value || isAI.value) return []
    else
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return [];
        return space.categories;
    }
});

</script>