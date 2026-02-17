<script setup lang="ts">

import CanalBar from './components/layouts/CanalBar.vue';
import SpaceBar from './components/layouts/spaceBar.vue';
import UserCard from './components/layouts/UserCard.vue';
import UsersBar from './components/layouts/UsersBar.vue';

</script>

<template>

    <div
        class="
            h-full w-full 
            flex flex-row 
            relative
        "
    >

        <SpaceBar />
        <CanalBar />

        <div class="h-full w-full ">
            <RouterView />
        </div>

        <UsersBar />

        <UserCard />

    </div>

</template>