<script setup lang="ts">

import Loader from './components/LogoLoader.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import init, { refetchUser } from './assets/init';
import { isLoaded, user } from './assets/var';
import Notifications from './components/overlay/Notifications.vue';
import useSettingsItem from './composables/useSettingsItem';
import keycloak, { initKC } from './assets/keycloak';
import { E2EEUnloked, lockSecurity, setupFirstTimeSecurity, unlockSecurity } from './assets/utils/crypto';
import sfetch from './assets/utils/sfetch';
import { useToast } from './composables/useToast';
import TopBar from './components/layout/topBar.vue';
import useSecurePeer from './composables/useSecurePeer';
import CallOverlay from './components/peer/CallOverlay.vue';
import waitFor from './assets/utils/waitfor';

const toast = useToast();
const { Item: theme } = useSettingsItem('theme', 'dark');
const pin = ref<string>('');
const pinLoading = ref<boolean>(false);

// Initialize P2P peer connection
const { initPeer } = useSecurePeer();

watch(() => theme.value, () => {
  document.body.className = theme.value;
})

const authenticated = ref<boolean>(false);
const pinSetup = computed(() => user.value?.pinSalt && user.value?.keyIv);

const press = (num: string) => {
  if (pin.value.length < 4) 
  {
    pin.value += num;
    if (window.navigator.vibrate) window.navigator.vibrate(10);
  }
};

const submit = async () => {

  pinLoading.value = true;

  try {

    if (pinSetup.value) 
    {

      console.log('Connection...');

      if (!user.value?.pinSalt || !user.value?.encryptedPrivateKey || !user.value?.keyIv) return;
      
      const success = await unlockSecurity(pin.value, user.value.pinSalt, user.value.encryptedPrivateKey, user.value.keyIv);
      
      if (!success)
      {
        toast.show('Code PIN incorrect', 'error');
        console.log('Code PIN incorrect');
        pin.value = '';
      }

    } 
    else 
    {

      const E2EEThings = await setupFirstTimeSecurity(pin.value);

      const res = await sfetch('/api/users/me/initE2EE', {
        method: 'POST',
        body: JSON.stringify(E2EEThings)      
      });

      if (res.ok)
      {
        await refetchUser();
        pinLoading.value = false;
      }
      else
      {
        toast.show('Une erreur est survenue lors de l\'initialisation du code pin.', 'error');
      }

    }

  } catch (e) {
    toast.show('Erreur de déchiffrement', 'error');
  } finally {
    pinLoading.value = false;
    window.removeEventListener('keydown', handleInput);
  }

}

const pinForgot = () => {
  alert('t mort');
}

const handleInput = (e: KeyboardEvent) => {
  if (e.key >= '0' && e.key <= '9') press(e.key);
  else if (e.key === 'Enter' && pin.value.length >= 4) submit();
  else if (e.key === 'Backspace') pin.value = pin.value.slice(0, -1);
}

onMounted(async () => {

  const res = await fetch(`${import.meta.env.VITE_API_URL}/health`);

  if (!res.ok) return alert('Api error');

  authenticated.value = await keycloak.init({
      onLoad: "login-required",
      checkLoginIframe: false
  });

  await initKC();

  if (authenticated.value) {
      await init.run();
      // Initialize P2P peer connection after user is loaded
      await waitFor(() => user.value !== null);
      await initPeer();
  }

  window.addEventListener('keydown', handleInput);

})

onUnmounted(() => {
  lockSecurity(); 
  window.removeEventListener('keydown', handleInput);
});

</script>

<template>

  <Toast />

  <div
    class="w-screen h-screen relative flex flex-col"
  >

    <div class="w-full">
      <TopBar />
    </div>

    <div v-if="authenticated" class="h-full w-full">

      <Notifications />
      <CallOverlay />
      
      <Transition name="page-lock" mode="out-in">

        <div
          v-if="E2EEUnloked && !pinLoading"
          class="w-full h-full"
          key="app"
        >

          <div v-if="isLoaded" class="w-full h-full">
              <RouterView />
          </div>

          <div v-else class="w-full h-full">
            <Loader />
          </div>

        </div>

        <div class="w-full h-full" key="lock" v-else>

          <div v-if="pinLoading" class="w-full h-full flex flex-col items-center justify-center bg-(--bg3) p-6 select-none" >
            <Loader />
          </div>
        
          <div v-else class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none">
            
            <div class="mb-8 text-center max-w-lg">

                <div class="flex flex-col items-center gap-4 mb-3">

                  <img 
                    src="/banner.svg" 
                    alt="Logo" 
                    class=" h-16" 
                  />

                </div>

                <h2 class="text-xl font-bold text-(--text)">
                  {{ pinSetup ? 'Déverrouillez votre session' : 'Configurez votre accès sécurisé' }}
                </h2>

                <p v-if="!pinSetup" class="text-sm text-(--text)/50 mt-2 leading-relaxed">
                  Ce code PIN est la clé de vos conversations. <br/>
                  <span class="text-amber-500/80 font-medium">S'il est perdu, elles resteront illisibles.</span>
                </p>

            </div>

            <div 
              class="flex gap-4 mb-10 transition-transform duration-300"
            >

                <div 
                    v-for="i in 4" :key="i"
                    class="w-14 h-18 border-2 rounded-2xl flex items-center justify-center text-2xl transition-all duration-150"
                    :class="[
                      pin.length >= i 
                        ? 'border-(--primary) bg-(--primary)/10 scale-105' 
                        : 'border-white/5 bg-white/5'
                    ]"
                >
                    <div 
                      class="w-3 h-3 rounded-full transition-all duration-300"
                      :class="pin.length >= i ? 'bg-(--primary)' : 'bg-white/10'"
                    />
                </div>

            </div>

            <div class="grid grid-cols-3 gap-4 max-w-xs w-full">

                <button 
                    v-for="num in [1,2,3,4,5,6,7,8,9]" :key="num"
                    @click="press(num.toString())"
                    class="h-16 default-primary border-none"
                >
                    {{ num }}
                </button>
                
                <button @click="pin = ''" class="default">
                    EFFACER
                </button>
                
                <button @click="press('0')" class="h-16 default-primary border-none">
                    0
                </button>
                
                <button 
                  @click="submit" 
                  class="primary"
                  :disabled="pin.length < 4"
                >
                    <span class="font-bold tracking-widest text-lg">OK</span>
                </button>

            </div>

            <button 
              v-if="pinSetup" 
              @click="pinForgot"
              class="mt-10 text-xs font-bold uppercase tracking-widest text-(--text)/30 hover:text-(--primary) transition-colors"
            >
                Code PIN oublié ?
            </button>
            
          </div>

        </div>

      </Transition>

    </div>

    <div v-else>
      <Loader />
    </div>

  </div>

</template>