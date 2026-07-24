<template>
    <div v-if="!hasThreads" class="flex flex-col items-center justify-center h-full w-full bg-(--bg3) text-(--text) p-6 relative">
        <div class="absolute top-4 left-4 z-50">
            <MobileBackBtn />
        </div>
        <i class="bi bi-chat-dots text-6xl text-white/10 mb-4"></i>
        <h2 class="text-xl font-bold mb-2 text-center">Aucun salon</h2>
        <p class="text-white/40 text-center max-w-sm">
            Cet espace ne contient aucun salon textuel.
        </p>
    </div>
</template>

<script lang="ts" setup>

import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { openedOrg } from '@/assets/var';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';

const route = useRoute();
const router = useRouter();
const hasThreads = ref(true);

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
            },
            query: route.query
        });
    }
    else
    {
        hasThreads.value = false;
    }

});

</script>