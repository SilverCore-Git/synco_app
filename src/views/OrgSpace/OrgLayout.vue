<script setup lang="ts">

import { computed, onMounted } from 'vue';
import ThreadsBar from './components/layouts/ThreadsBar.vue';
import SpaceBar from './components/layouts/spaceBar.vue';
import UserCard from './components/layouts/UserCard.vue';
import UsersBar from './components/layouts/UsersBar.vue';
import organizations from '../../organizations';
import { openedOrg } from '@/assets/var';
import Loader from '@/components/Loader.vue';
import sfetch from '@/assets/utils/sfetch';

const props = defineProps<{
    orgId: string;
}>();

const organization = computed(() => organizations.find((org) => org.id === props.orgId));

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

        <SpaceBar
            :organization="openedOrg"
        />
        <ThreadsBar />

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