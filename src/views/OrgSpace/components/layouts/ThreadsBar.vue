<template>

    <div
        class="
            h-full min-w-60 bg-(--bg) border-r border-(--text)/5
            flex justify-start items-start flex-col relative
        "
    >

        <h3 class="p-5  font-semibold">{{ title }}</h3>

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
            />

        </ul>

    </div>

</template>


<script lang="ts" setup>

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { workSpaces } from '@/organizations';
import type { WorkSpace } from '@/types/workSpace';
import Category from '../CanalBar/Category.vue';
import organizations from '../../../../organizations';
import type { Org } from '../../../../types/org';

const route = useRoute();

const title = computed(() => {
    if (route.name == 'OrgHome' || route.name == 'OrgThreadHome') return 'Accueil';
    if (route.name == 'OrgChat') return 'Messages privés';
    if (route.name == 'OrgCalendar') return 'Calendrier';
    else
    {
        const space = workSpaces.find((space: WorkSpace) => space.id == route.params.spaceId && space.org_id == route.params.orgId);
        if (!space) return 'Inconu';
        return space.name;
    }
})

const categories = computed(() => {
    if (route.name == 'OrgHome' || route.name == 'OrgThreadHome')
    {
        const org = organizations.find((org: Org) => org.id == route.params.orgId);
        if (!org) return [];
        return org.home;
    }
    else if (route.name == 'OrgChat') return []
    else if (route.name == 'OrgCalendar') return []
    else if (route.name == 'SpaceView' || route.name == 'SpaceThreadView')
    {
        const space = workSpaces.find((space: WorkSpace) => space.id == route.params.spaceId && space.org_id == route.params.orgId);
        if (!space) return [];
        return space.categories;
    }
});

</script>