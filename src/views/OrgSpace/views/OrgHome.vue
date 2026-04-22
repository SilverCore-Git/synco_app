<template></template>

<script lang="ts" setup>

import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { openedOrg } from '@/assets/var';

const router = useRouter();

onMounted(() => {

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