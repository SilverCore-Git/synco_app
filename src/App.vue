<script setup lang="ts">

import { SignedIn, SignedOut, useUser } from '@clerk/vue';
import SignIn from './views/auth/SignIn.vue';
import Loader from './components/Loader.vue';
import { onMounted } from 'vue';
import waitFor from './assets/utils/waitfor';
import init from './assets/init';
import { isLoaded } from './assets/var';

const { isLoaded: isClerkLoaded } = useUser();

onMounted(async () => {
  await waitFor(() => isClerkLoaded.value == true, 10000);
  await init.run();
})

</script>

<template>

  <div
    class="w-screen h-screen relative"
  >

    <div>
      <!-- top bar for desktop app -->
    </div>
      
    <div v-if="isLoaded && isClerkLoaded">
      
      <SignedIn>
        <RouterView />
      </SignedIn>

      <SignedOut>
        <SignIn />
      </SignedOut>

    </div>

    <div v-else>
      <Loader />
    </div>

  </div>

</template>