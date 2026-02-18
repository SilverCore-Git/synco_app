<template>
    <div class="flex items-center justify-center w-full h-full opacity-20 ">
        <i class="bi bi-arrow-repeat animate-spin text-2xl" />
    </div>
</template>

<script lang="ts" setup>

import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import organizations from '@/organizations';

const route = useRoute();
const router = useRouter();

onMounted(() => {

    const org = organizations.find(org => org.id == route.params.orgId);
    const firstCategory = org?.home.categories.find(cat => cat.index == 1);
    const firstThread = org?.home.threads.find(th => th.categoryId == firstCategory?.id && th.index == 1);
    router.push({
        name: 'OrgThreadHome',
        params: {
            threadId: firstThread?.id
        }
    })

})

</script>