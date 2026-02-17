<template>

    <div
        class="
            h-full min-w-60 bg-(--bg) border-r border-(--text)/5
            flex justify-start items-start flex-col
        "
    >

        <h3 class="p-6 pb-[22px] text-lg font-semibold">{{ title }}</h3>

        <hr class=" w-full h-0.5 bg-(--text)/40 border-none rounded-full mb-6" />


    </div>

</template>


<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { workSpace } from '../../../../organizations';

const route = useRoute();

const title = computed(() => {
    if (route.name == 'OrgHome') return 'Accueil';
    if (route.name == 'OrgChat') return 'Messages privés';
    if (route.name == 'OrgCalendar') return 'Calendrier';
    else
    {
        const space = workSpace.find(space => space.id == route.params.spaceId && space.org_id == route.params.orgId);
        if (!space) return 'Inconue';
        return space.name;
    }
})

</script>