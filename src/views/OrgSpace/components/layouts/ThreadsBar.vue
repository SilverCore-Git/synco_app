<template>

    <div v-if="isChat" class="h-full">

        <div
            class="
                h-full min-w-60 bg-(--bg) border-r border-(--text)/5
                flex justify-start items-start flex-col relative
            "
        >

            <div 
                class="
                    p-3 flex justify-between items-center
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
                    flex justify-start items-start flex-col mb-18
                    gap-3 h-full w-full px-3 py-5 overflow-scroll
                "
            >

                <ChatUserBtn 
                    v-for="member in openedOrg?.members"
                    :key="member.id"
                    :user="member"
                    @click="router.push({ name: 'OrgThreadChat', params: { userId: member.id } })"
                />

            </ul>

        </div>


    </div>

    <div v-else class="h-full">
        
        <ThreadBarDropDown class="h-full">

            <template #trigger>

                <div
                    class="
                        h-full min-w-60 bg-(--bg) border-r border-(--text)/5
                        flex justify-start items-start flex-col relative
                    "
                    @contextmenu.prevent="showDropDown = !showDropDown"
                >

                    <div 
                        class="
                            min-h-14 px-3 flex justify-between items-center
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

                        <ThreadDropDown />
                    
                    </div>

                    <ul
                        class="
                            flex justify-start items-start flex-col mb-18
                            gap-3 h-full w-full px-3 py-5 overflow-scroll
                        "
                    >

                        <Category 
                            v-for="category in categories" 
                            :key="'category-' + category.id" 
                            :category="category"
                            :threads="threads?.filter((th: Thread) => th.categoryId == category.id) || []"
                        />

                    </ul>

                </div>

            </template>

        </ThreadBarDropDown>

    </div>

</template>


<script lang="ts" setup>

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Category from '../CanalBar/Category.vue';
import type { Thread, WorkSpace } from '@/types/types';
import { openedOrg } from '@/assets/var';
import ThreadDropDown from '../dropdown/ThreadDropDown.vue';
import ThreadBarDropDown from '../dropdown/ThreadBarDropDown.vue';
import ChatUserBtn from '../CanalBar/ChatUserBtn.vue';


const route = useRoute();
const router = useRouter();
const isChat = computed(() => route.name == 'OrgChat' || route.name == 'OrgThreadChat');
const isHome = computed(()=> route.name == 'OrgHome' || route.name == 'OrgThreadHome');
const showDropDown = ref<boolean>(false);


const title = computed(() => {
    if (isHome.value) return 'Accueil';
    if (isChat.value) return 'Messages privés';
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
    else
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return 'Inconu';
        return space.logo;
    }
})

const threads = computed(() => {
    if (isHome.value)
    {
        return openedOrg.value?.home?.threads || [];
    }
    else if (isChat.value) return []
    else
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return [];
        return space.threads;
    }
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