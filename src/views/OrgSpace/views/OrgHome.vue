<template></template>

<script lang="ts" setup>

import { onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { openedOrg } from '@/assets/var';

const router = useRouter();
const route = useRoute();

onMounted(() => {
    // Don't auto-redirect if coming from a thread access error (avoid loop)
    if (route.query.noRedirect === 'true') return;

    const firstCategory = openedOrg.value?.home.categories.find(cat => cat.index == 1);
    const firstThread = openedOrg.value?.home.threads.find(th => th.categoryId == firstCategory?.id && th.index == 1);
    if (!firstCategory || !firstThread) return;

    router.push({
        name: 'OrgThreadHome',
        params: {
            threadId: firstThread?.id
        }
    })

})

</script>