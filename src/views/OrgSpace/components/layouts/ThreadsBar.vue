<template>

    <div 
        class="h-full w-full bg-(--bg2) border-r border-l border-(--border-color) "
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
                                flex justify-start items-start flex-col flex-1 min-h-0
                                gap-3 w-full px-3 py-5 overflow-scroll
                            "
                            :style="{ paddingBottom: userCardHeight + 'px' }"
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

        <template v-else-if="isSettings && canAny(['ORG_GENERAL', 'ORG_MEMBERS', 'ORG_ROLES', 'ORG_WEBHOOKS', 'ORG_STORAGE', 'ORG_AI'])" class="h-full w-full">

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
                        flex justify-start items-start flex-col flex-1 min-h-0
                        gap-3 w-full px-3 py-5 overflow-scroll
                    "
                    :style="{ paddingBottom: userCardHeight + 'px' }"
                >

                    <template v-for="view in settingsViews" :key="'settings-' + view.name + '-link'">
                        <RouterLink
                            v-if="can(view.permission) && (view.route !== 'OrgSettingsStorage' || filesEnabled)"
                            :to="{ name: view.route, query: { ...route.query, showView: '1' } }"
                            class="w-full"
                        >
                            <SettingsViewBtn
                                :name="view.name"
                                :icon="view.icon"
                                :active="route.name === view.route"
                            />
                        </RouterLink>
                    </template>

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

                <div class="px-3 pb-3 pt-3 w-full border-b border-(--border-color)">
                    <div class="relative w-full">
                        <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs"></i>
                        <input 
                            v-model="searchDMQuery"
                            type="text" 
                            placeholder="Rechercher..." 
                            class="w-full bg-black/20 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-(--text) outline-none focus:border-(--primary) transition-colors placeholder-(--text2)"
                        />
                    </div>
                </div>

                <ul
                    class="
                        flex justify-start items-start flex-col flex-1 min-h-0
                        gap-3 w-full px-3 py-5 overflow-y-auto
                    "
                    :style="{ paddingBottom: userCardHeight + 'px' }"
                >

                    <RouterLink
                        v-for="member in sortedChatMembers"
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

                <div class="p-4 border-b border-(--border-color) w-full" v-if="aiIsLocal">

                    <div v-if="aiIsLocal">
                        <p class="text-[10px] uppercase font-bold text-(--text2) mb-1">Modèle Local</p>
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

                <div class="flex-1 overflow-y-auto p-2 w-full">
                    <p class="text-[10px] uppercase font-bold text-(--text2) px-2 mt-2 mb-3">Historique</p>
                    
                    <div v-if="chatSessions.length === 0" class="text-xs text-center text-(--text2) mt-4 italic">
                        Aucune session
                    </div>

                    <div class="space-y-1">
                        <button
                            @click="startAiSession"
                            class="default w-full flex items-center justify-start! gap-2 mb-4"
                        >
                            <i class="bi bi-plus-lg"></i>
                            <span>
                                Nouveau chat
                            </span>
                        </button>

                        <button
                            v-for="session in chatSessions"
                            :key="session.id"
                            class="tab w-full group flex items-center justify-between"
                            :class="activeSessionId === session.id ? 'active' : ''"
                            @click="selectAiSession(session.id)"
                        >
                            <div class="truncate pr-2 flex-1 text-sm">
                                {{ session.title || 'Nouveau chat' }}
                            </div>
                            <div 
                                @click.stop="handleDeleteClick(session)" 
                                class="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity p-1 rounded hover:bg-white/10"
                                title="Supprimer"
                            >
                                <i class="bi bi-trash"></i>
                            </div>
                        </button>
                    </div>
                </div>

                <ConfirmDelete
                    :show="showConfirmDelete"
                    :itemName="sessionToDelete?.title || 'Nouveau chat'"
                    itemType="la session"
                    buttonText="Supprimer"
                    @confirm="confirmDeleteAction"
                    @cancel="showConfirmDelete = false; sessionToDelete = null"
                />
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
                                flex justify-start items-start flex-col flex-1 min-h-0
                                gap-3 w-full px-3 py-5 overflow-scroll
                            "
                            :style="{ paddingBottom: userCardHeight + 'px' }"
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
                            
                            <draggable
                                v-model="localCategories" 
                                item-key="id"
                                group="categories"
                                @change="onCategoriesChange"
                                ghost-class="opacity-50"
                                drag-class="cursor-grabbing"
                                class="w-full space-y-1 min-h-[10px]"
                                handle=".category-drag-handle"
                            >
                                <template #item="{ element: category }">
                                    <div @contextmenu.stop class="w-full">
                                        <Category 
                                            :category="category"
                                            :threads="threadsByCategory[category.id] || []"
                                        />
                                    </div>
                                </template>
                            </draggable>

                        </ul>

                    </div>

                </template>

            </ThreadBarDropDown>

        </template>

        <SpaceSearchModal :show="showSearchModal" @close="showSearchModal = false" />

    </div>

</template>


<script lang="ts" setup>

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Thread, WorkSpace, Category as CategoryType } from '@/types/types';
import { openedOrg, todoEnabled, filesEnabled, userCardHeight } from '@/assets/var';
import draggable from 'vuedraggable';
import useWSocket from '@/composables/useWSocket';
import ThreadDropDown from '../dropdown/ThreadDropDown.vue';
import ThreadBarDropDown from '../dropdown/ThreadBarDropDown.vue';
import ChatUserBtn from '../CanalBar/ChatUserBtn.vue';
import SettingsViewBtn from '../CanalBar/SettingsViewBtn.vue';
import { settingsViews } from '../../views/settings/settings';
import { usePermissions } from '@/composables/usePermissions';
import Category from '../CanalBar/Category.vue';
import isDesktopApp from '@/assets/isDesktopApp';
import SpaceSearchModal from '../popup/SpaceSearchModal.vue';
import { chatSessions, activeSessionId, newSession, deleteSession, loadSession, aiIsLocal, selectedModelId } from '@/services/AIService';
import { availableModels } from '@/services/LocalLLMService';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { useRecentDMs } from '@/composables/useRecentDMs';

const orgId = computed(() => openedOrg.value?.id);
const { canAny, can } = usePermissions(orgId);

const route = useRoute();
const router = useRouter();

const isChat = computed(() => route.name == 'OrgChat' || route.name == 'OrgThreadChat' || route.name == 'OrgThreadChatPrivateMeet');
const isHome = computed(()=> route.name == 'OrgHome' || route.name == 'OrgThreadHome');
const isSettings = computed(()=> route.name?.toString().startsWith('OrgSettings'));
const isAI = computed(() => route.name === 'OrgAI');

const selectAiSession = (sessionId: string) => {
    loadSession(sessionId);
    router.push({ query: { ...route.query, showView: '1' } });
};

const startAiSession = () => {
    newSession();
    router.push({ query: { ...route.query, showView: '1' } });
};

const showDropDown = ref<boolean>(false);
const showSearchModal = ref<boolean>(false);

const searchDMQuery = ref('');

// État partagé (survit au démontage/remontage de ThreadsBar entre les
// sections Tasks/Agenda/Home et le reste) — chargé une fois par session dans
// OrgLayout.vue, tenu à jour par son listener socket persistant. Avant ce
// changement, chaque ouverture du panneau DM refaisait l'appel réseau et
// repartait d'une liste vide, d'où le délai visible et le tri qui "sautait"
// une fois la réponse arrivée.
const { recentDMUsers } = useRecentDMs();

const sortedChatMembers = computed(() => {
    let members = openedOrg.value?.members || [];
    
    if (searchDMQuery.value) {
        const q = searchDMQuery.value.toLowerCase();
        members = members.filter(m => 
            m.user?.name?.toLowerCase().includes(q) || 
            m.user?.pseudo?.toLowerCase().includes(q)
        );
    }

    return [...members].sort((a, b) => {
        const aRecent = recentDMUsers.value.find(r => r.userId === a.userId);
        const bRecent = recentDMUsers.value.find(r => r.userId === b.userId);
        
        if (aRecent && bRecent) return new Date(bRecent.lastInteraction).getTime() - new Date(aRecent.lastInteraction).getTime();
        if (aRecent) return -1;
        if (bRecent) return 1;
        return 0;
    });
});

const showConfirmDelete = ref(false);
const sessionToDelete = ref<any>(null);

const handleDeleteClick = (session: any) => {
    sessionToDelete.value = session;
    showConfirmDelete.value = true;
};

const confirmDeleteAction = async () => {
    if (sessionToDelete.value) {
        await deleteSession(sessionToDelete.value.id);
        showConfirmDelete.value = false;
        sessionToDelete.value = null;
    }
};

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

const localCategories = ref<CategoryType[]>([...categories.value].sort((a, b) => a.index - b.index));

watch(categories, (newVal) => {
    localCategories.value = [...newVal].sort((a, b) => a.index - b.index);
}, { deep: true, immediate: true });

const onCategoriesChange = async () => {
    const socket = await useWSocket();
    
    const updatedCategories = localCategories.value.map((cat, index) => ({
        ...cat,
        index
    }));

    socket.value?.emit('update-categories', {
        orgId: route.params.orgId,
        spaceId: route.params.spaceId || null,
        categories: updatedCategories
    });
};

</script>