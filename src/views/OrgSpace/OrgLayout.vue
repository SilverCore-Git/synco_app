<script setup lang="ts">

import CanalBar from './components/layouts/CanalBar.vue';
import SpaceBar from './components/layouts/spaceBar.vue';
import UsersBar from './components/layouts/UsersBar.vue';

</script>

<template>

    <div
        class="
            h-fill w-full relative
            flex justify-center items-center
            flex-raw
        "
    >

        <SpaceBar />
        <CanalBar />

        <RouterView />

        <UsersBar />

    </div>

</template>