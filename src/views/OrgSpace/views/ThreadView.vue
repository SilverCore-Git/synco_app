<template>
    
    <div v-if="thread">
        {{ thread.name }}
    </div>

    <div v-else class="text-(--text)/40 italic">
        Thread introuvable...
    </div>

</template>

<script lang="ts" setup>

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import organizations, { workSpaces } from '@/organizations';
import type { Thread, WorkSpace } from '@/types/workSpace';
import type { Org } from '@/types/org';

const route = useRoute();

const thread = computed(() => {

    let allThreads: Thread[] = [];

    const space = workSpaces.find((s: WorkSpace) => s.id === route.params.spaceId);
    if (space) 
    {
        allThreads = [...allThreads, ...space.threads];
    }

    const org = organizations.find((o: Org) => o.id === route.params.orgId);
    if (org && org.home) 
    {
        allThreads = [...allThreads, ...org.home.threads];
    }

    return allThreads.find((t: Thread) => t.id === route.params.threadId);

});

</script>