<script setup lang="ts">

import Loader from './components/LogoLoader.vue';
import { onMounted, ref, watch } from 'vue';
import init from './assets/init';
import { isLoaded } from './assets/var';
import { StarportCarrier } from 'vue-starport';
import Notifications from './components/overlay/Notifications.vue';
import useSettingsItem from './composables/useSettingsItem';
import keycloak, { initKC } from './assets/keycloak';
import LogoLoader from './components/LogoLoader.vue';

const { Item: theme } = useSettingsItem('theme', 'dark');

watch(() => theme.value, () => {
  document.body.className = theme.value;
})

const authenticated = ref<boolean>(false);

onMounted(async () => {

  authenticated.value = await keycloak.init({
      onLoad: "login-required",
      checkLoginIframe: false
  });

  await initKC();

  if (authenticated.value) await init.run();

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
      
      <div v-if="authenticated">

        <div v-if="isLoaded" class="w-full h-full">
          <StarportCarrier>
            <RouterView />
          </StarportCarrier>
        </div>

        <div v-else class="w-full h-full">
          <Loader />
        </div>

        <Notifications />

      </div>

      <div v-else>
        <LogoLoader />
      </div>

    </div>

  </div>

</template>