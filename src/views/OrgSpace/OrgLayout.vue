<script setup lang="ts">

import { onMounted } from 'vue';
import ThreadsBar from './components/layouts/ThreadsBar.vue';
import SpaceBar from './components/layouts/spaceBar.vue';
import UserCard from './components/layouts/UserCard.vue';
import UsersBar from './components/layouts/UsersBar.vue';
import { openedOrg } from '@/assets/var';
import Loader from '@/components/Loader.vue';
import sfetch from '@/assets/utils/sfetch';

const props = defineProps<{
    orgId: string;
}>();

onMounted(async() => {
   openedOrg.value = await sfetch(`/api/orgs/${props.orgId}`).then(res => res.json()); 
});

</script>

<template>

    <div
        v-if="openedOrg"
        class="
            h-full w-full 
            flex flex-row 
            relative
        "
    >

        <SpaceBar />
        <ThreadsBar class="h-full" />

        <div class="h-full w-full ">
            <RouterView />
        </div>

        <UsersBar />

        <UserCard />

    </div>

    <div v-else>
        <Loader />
    </div>

</template>