<template>

    <div
        class="
            h-full min-w-60 bg-(--bg) border-r border-(--text)/5
            flex justify-start items-start flex-col relative
        "
    >

        <div class="p-5 flex justify-center items-center flex-row gap-3 ">
            <img v-if="icon && icon.startsWith('http')" :src="icon" />
            <i v-else-if="icon" class="bi" :class="icon" />
            <h3 class="font-semibold">
                {{ title }}
            </h3>
        </div>

        <hr class=" w-full h-0.5 bg-(--text)/40 border-none rounded-full" />

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


<script lang="ts" setup>

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import Category from '../CanalBar/Category.vue';
import type { Thread, WorkSpace } from '@/types/types';
import { openedOrg } from '@/assets/var';


const route = useRoute();


const title = computed(() => {
    if (route.name == 'OrgHome' || route.name == 'OrgThreadHome') return 'Accueil';
    if (route.name == 'OrgChat') return 'Messages privés';
    else
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return 'Inconu';
        return space.name;
    }
})

const icon = computed(() => {
    if (route.name == 'OrgHome' || route.name == 'OrgThreadHome') return 'bi-house';
    if (route.name == 'OrgChat') return 'bi-chat-dots';
    else
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return 'Inconu';
        return space.logo;
    }
})

const threads = computed(() => {
    if (route.name == 'OrgHome' || route.name == 'OrgThreadHome')
    {
        return openedOrg.value?.home.threads || [];
    }
    else if (route.name == 'OrgChat') return []
    else if (route.name == 'SpaceView' || route.name == 'SpaceThreadView')
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return [];
        return space.threads;
    }
});


const categories = computed(() => {
    if (route.name == 'OrgHome' || route.name == 'OrgThreadHome')
    {
        return openedOrg.value?.home.categories || [];
    }
    else if (route.name == 'OrgChat') return []
    else if (route.name == 'SpaceView' || route.name == 'SpaceThreadView')
    {
        const space = openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
        if (!space) return [];
        return space.categories;
    }
});

</script>