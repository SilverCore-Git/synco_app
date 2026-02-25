<script setup lang="ts">

import { SignedIn, SignedOut, useUser } from '@clerk/vue';
import SignIn from './views/auth/SignIn.vue';
import Loader from './components/Loader.vue';
import { onMounted } from 'vue';
import waitFor from './assets/utils/waitfor';
import init from './assets/init';
import { isLoaded } from './assets/var';
import Toast from './components/common/Toast.vue';

const { isLoaded: isClerkLoaded } = useUser();

onMounted(async () => {
  await waitFor(() => isClerkLoaded.value == true, 10000);
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
      v-if="isClerkLoaded"
      class="w-full h-full"
    >
      
      <SignedIn>

        <div v-if="isLoaded" class="w-full h-full">
          <RouterView />
        </div>

        <div v-else class="w-full h-full">
          <Loader />
        </div>

      </SignedIn>

      <SignedOut>
        <SignIn />
      </SignedOut>

    </div>

  </div>

</template>