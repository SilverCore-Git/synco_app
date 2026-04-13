<script setup lang="ts">

import { SignedIn, SignedOut, useUser } from '@clerk/vue';
import SignIn from './views/auth/SignIn.vue';
import Loader from './components/LogoLoader.vue';
import { onMounted, watch } from 'vue';
import waitFor from './assets/utils/waitfor';
import init from './assets/init';
import { isLoaded } from './assets/var';
import { StarportCarrier } from 'vue-starport';
import Notifications from './components/overlay/Notifications.vue';
import useSettingsItem from './composables/useSettingsItem';

const { isLoaded: isClerkLoaded } = useUser();

const { Item: theme } = useSettingsItem('theme', 'dark');

watch(() => theme.value, () => {
  document.body.className = theme.value;
})

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
          <StarportCarrier>
            <RouterView />
          </StarportCarrier>
        </div>

        <div v-else class="w-full h-full">
          <Loader />
        </div>

        <Notifications />

      </SignedIn>

      <SignedOut>
        <SignIn />
      </SignedOut>

    </div>

  </div>

</template>