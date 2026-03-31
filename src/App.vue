<script setup lang="ts">

import Loader from './components/LogoLoader.vue';
import { onMounted } from 'vue';
import init from './assets/init';
import { isLoaded } from './assets/var';

onMounted(async () => {
  await init.run();
})

</script>

<template>

  <Toast />

  <div
    class="w-screen h-screen relative"
  >

    <div>
      <!-- top bar for desktop app -->
    </div>
      
    <div
      class="w-full h-full"
    >

      <div v-if="isLoaded" class="w-full h-full">
        <RouterView />
      </div>

      <div v-else class="w-full h-full">
        <Loader />
      </div>

    </div>

  </div>

</template>