<template></template>

<script lang="ts" setup>

import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { openedOrg } from '@/assets/var';

const route = useRoute();
const router = useRouter();

onMounted(() => {

    const spaceId = route.params.spaceId;
    const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);

    if (!space) {
        return router.push({ name: 'OrgHome' });
    }

    const thread = route.params.threadId;
    if (thread) return;

    const textThreads = space.threads
        .filter(th => th.type === 'text')
        .sort((a, b) => {
            const catA = space.categories.find(c => c.id === a.categoryId)?.index || 0;
            const catB = space.categories.find(c => c.id === b.categoryId)?.index || 0;
            if (catA !== catB) return catA - catB;
            return a.index - b.index;
        });

    const targetThread = textThreads[0];

    if (targetThread)
    {
        router.replace({
            name: 'SpaceThreadView',
            params: {
                orgId: route.params.orgId,
                spaceId: space.id,
                threadId: targetThread.id
            }
        });
    }

});

</script>