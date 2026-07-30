<template>
    <div v-if="!hasThreads" class="flex flex-col items-center justify-center h-full w-full bg-(--bg3) text-(--text) p-6 relative">
        <div class="absolute top-4 left-4 z-50">
            <MobileBackBtn />
        </div>
        <i class="bi bi-house text-6xl text-white/10 mb-4"></i>
        <h2 class="text-xl font-bold mb-2 text-center">Bienvenue !</h2>
        <p class="text-white/40 text-center max-w-sm">
            <!-- mettre phrase de bienvenue  -->
            
        </p>
    </div>
</template>

<script lang="ts" setup>

import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { openedOrg } from '@/assets/var';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';

const router = useRouter();
const route = useRoute();
const hasThreads = ref(true);

onMounted(() => {
    // Don't auto-redirect if coming from a thread access error (avoid loop)
    if (route.query.noRedirect === 'true') {
        hasThreads.value = false;
        return;
    }

    const homeThreads = openedOrg.value?.home.threads?.filter((th: any) => th.type === 'text');
    const firstThread = homeThreads && homeThreads.length > 0 ? homeThreads[0] : null;
    
    if (!firstThread) {
        hasThreads.value = false;
        return;
    }

    router.replace({
        name: 'OrgThreadHome',
        params: {
            threadId: firstThread.id
        },
        query: route.query
    })

})

</script>