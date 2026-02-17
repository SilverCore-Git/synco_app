<script setup lang="ts">

import { computed } from 'vue';
import CanalBar from './components/layouts/CanalBar.vue';
import SpaceBar from './components/layouts/spaceBar.vue';
import UserCard from './components/layouts/UserCard.vue';
import UsersBar from './components/layouts/UsersBar.vue';
import organizations from '../../organizations';

const props = defineProps<{
    orgId: string;
}>();

const organization = computed(() => organizations.find((org) => org.id === props.orgId));

</script>

<template>

    <div
        class="
            h-full w-full 
            flex flex-row 
            relative
        "
    >

        <SpaceBar
            :organization="organization"
        />
        <CanalBar />

        <div class="h-full w-full ">
            <RouterView />
        </div>

        <UsersBar />

        <UserCard />

    </div>

</template>