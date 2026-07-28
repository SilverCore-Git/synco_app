<script setup lang="ts">

import Loader from './components/LogoLoader.vue';
//import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { computed, onMounted, ref, watch } from 'vue';
import init, { refetchUser } from './assets/init';
import { isLoaded, user } from './assets/var';
import type { User } from '@/types/types';
import Notifications from './components/overlay/Notifications.vue';
import UserProfile from './components/overlay/UserProfile.vue';
import useSettingsItem from './composables/useSettingsItem';
import { initKC } from './assets/keycloak';
//import { E2EEUnloked, lockSecurity, setupFirstTimeSecurity, unlockSecurity } from './assets/utils/crypto';
import { E2EEUnloked, setupFirstTimeSecurity, unlockSecurity } from './assets/utils/crypto';
import sfetch from './assets/utils/sfetch';
import { useToast } from './composables/useToast';
import TopBar from './components/layout/topBar.vue';
import useSecurePeer from './composables/useSecurePeer';
import CallOverlay from './components/peer/CallOverlay.vue';
import waitFor from './assets/utils/waitfor';
import Popup from './components/Popup.vue';
import { isProfileOpen, profileUser, closeProfile } from './composables/useProfile';
//import { Capacitor } from '@capacitor/core';
//import { App as CapApp, type URLOpenListenerEvent } from '@capacitor/app';
//import { Browser } from '@capacitor/browser';

const toast = useToast();
const { Item: theme } = useSettingsItem('theme', 'dark');
const pin = ref<string>('');
const pinLoading = ref<boolean>(false);

// Initialize P2P peer connection
const { initPeer } = useSecurePeer();

import router from '@/router';
import { openedOrg } from '@/assets/var';

// Handler pour envoyer un message depuis le profil
const handleSendMessageFromProfile = (targetUser: User) => {
  if (openedOrg.value?.id) {
    router.push(`/${openedOrg.value.id}/chat/${targetUser.id}`);
  }
};

watch(() => theme.value, () => {
  document.body.className = theme.value;
})

const authenticated = ref<boolean>(false);
const pinSetup = computed(() =>
  user.value?.pinSalt?.trim() &&
  user.value?.keyIv?.trim() &&
  user.value?.encryptedPrivateKey?.trim()
);
const isResettingPIN = ref<boolean>(false);

const press = (num: string) => {
  if (pin.value.length < 4) {
    pin.value += num;
    if (window.navigator.vibrate) window.navigator.vibrate(10);
    
    if (pin.value.length === 4) {
      setTimeout(() => submit(), 50);
    }
  }
};

const submit = async () => {

  pinLoading.value = true;

  try {

    if (isResettingPIN.value) {
      // Mode réinitialisation : créer de nouvelles clés
      const E2EEThings = await setupFirstTimeSecurity(pin.value);

      const res = await sfetch('/api/users/me/resetE2EE', {
        method: 'POST',
        body: JSON.stringify(E2EEThings)
      });

      if (res.ok) {
        await refetchUser();
        isResettingPIN.value = false;
        const response = await res.json();
        toast.show(response.message || 'PIN réinitialisé.', 'warning', 10000);
        pin.value = '';
      } else {
        const err = (await res.json()).error;
        toast.show(err || 'Erreur lors de la réinitialisation', 'error');
        isResettingPIN.value = false; // Réinitialiser le mode même en cas d'erreur
        pin.value = '';
      }
      return;
    }

    if (pinSetup.value) {

      console.log('Connection...');

      if (!user.value?.pinSalt || !user.value?.encryptedPrivateKey || !user.value?.keyIv) return;

      const success = await unlockSecurity(pin.value, user.value.pinSalt, user.value.encryptedPrivateKey, user.value.keyIv);

      if (!success) {
        toast.show('Code PIN incorrect', 'error');
        console.log('Code PIN incorrect');
        pin.value = '';
      }

    }
    else {

      const E2EEThings = await setupFirstTimeSecurity(pin.value);

      const res = await sfetch('/api/users/me/initE2EE', {
        method: 'POST',
        body: JSON.stringify(E2EEThings)
      });

      if (res.ok) {
        await refetchUser();
        pinLoading.value = false;
      }
      else {
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

const showResetConfirm = ref<boolean>(false);

const pinForgot = () => {
  showResetConfirm.value = true;
};

const resetPIN = async () => {
  showResetConfirm.value = false;
  isResettingPIN.value = true;
  pin.value = '';
  toast.show('Veuillez définir un nouveau code PIN', 'info');
};

const handleInput = (e: KeyboardEvent) => {
  if (e.key >= '0' && e.key <= '9') press(e.key);
  else if (e.key === 'Enter' && pin.value.length >= 4) submit();
  else if (e.key === 'Backspace') pin.value = pin.value.slice(0, -1);
}
onMounted(async () => {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/health`, { credentials: 'include' });
  if (!res.ok) return alert('Api error');

  authenticated.value = await initKC();

  if (authenticated.value) {
    await init.run();
    await waitFor(() => user.value !== null);
    await initPeer();
  }

  window.addEventListener('keydown', handleInput);
});

</script>

<template>

  <Notifications />

  <div
    class="w-screen h-[100dvh] relative flex flex-col overflow-hidden"
  >

    <div class="w-full">
      <TopBar />
    </div>

    <div v-if="authenticated" class="h-full w-full">

      <Notifications />
      <CallOverlay />
      <UserProfile :isOpen="isProfileOpen" :profileUser="profileUser" @close="closeProfile"
        @send-message="handleSendMessageFromProfile" />

      <Transition name="page-lock" mode="out-in">

        <div v-if="E2EEUnloked && !pinLoading" class="w-full h-full" key="app">

          <div v-if="isLoaded" class="w-full h-full">
            <RouterView />
          </div>

          <div v-else class="w-full h-full">
            <Loader />
          </div>

        </div>

        <div class="w-full h-full" key="lock" v-else>

          <div v-if="pinLoading"
            class="w-full h-full flex flex-col items-center justify-center bg-(--bg3) p-6 select-none">
            <Loader />
          </div>

          <div v-else class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none">

            <div class="mb-8 text-center max-w-lg">

              <div class="flex flex-col items-center gap-4 mb-3">

                <img src="/banner.svg" alt="Logo" class=" h-16" />

              </div>

              <h2 class="text-xl font-bold text-(--text)">
                {{ isResettingPIN ? 'Définissez un nouveau code PIN' : pinSetup ? 'Déverrouillez votre session' :
                  'Configurez votre accès sécurisé' }}
              </h2>

              <p v-if="!pinSetup || isResettingPIN" class="text-sm text-(--text)/50 mt-2 leading-relaxed">
                Ce code PIN est la clé de vos conversations. <br />
                <span class="text-amber-500/80 font-medium">S'il est perdu, elles resteront illisibles.</span>
              </p>
              <p v-if="isResettingPIN" class="text-sm text-amber-500/80 mt-2 font-medium">
                Attention : vos anciens messages deviendront indéchiffrables.
              </p>

            </div>

            <div class="flex gap-4 mb-10 transition-transform duration-300">

                <div 
                    v-for="i in 4" :key="i"
                    class="w-14 h-18 border-2 rounded-2xl flex items-center justify-center text-2xl transition-all duration-150"
                    :class="[
                      pin.length >= i 
                        ? 'border-(--primary) bg-(--primary)/10 scale-105' 
                        : 'border-(--border-color) bg-white/5'
                    ]"
                >
                    <div 
                      class="w-3 h-3 rounded-full transition-all duration-300"
                      :class="pin.length >= i ? 'bg-(--primary)' : 'bg-white/10'"
                    />
                </div>

            </div>

            <div class="grid grid-cols-3 gap-4 max-w-xs w-full">

              <button v-for="num in [1, 2, 3, 4, 5, 6, 7, 8, 9]" :key="num" @click="press(num.toString())"
                class="h-16 default-primary border-none">
                {{ num }}
              </button>

              <button @click="pin = ''" class="default">
                EFFACER
              </button>

              <button @click="press('0')" class="h-16 default-primary border-none">
                0
              </button>

              <button @click="submit" class="primary" :disabled="pin.length < 4">
                <span class="font-bold tracking-widest text-lg">OK</span>
              </button>

            </div>

            <button v-if="pinSetup && !isResettingPIN" @click="pinForgot"
              class="mt-10 text-xs font-bold uppercase tracking-widest text-(--text)/30 hover:text-(--primary) transition-colors">
              Code PIN oublié ?
            </button>

            <Popup :isOpen="showResetConfirm" @close="showResetConfirm = false">
              <template #title>Réinitialiser le code PIN</template>
              <p class="text-(--text)/80 text-sm">
                Cela réinitialisera votre clé de chiffrement.
                <span class="text-amber-500 font-medium">Tous vos anciens messages deviendront illisibles.</span>
              </p>
              <p class="text-(--text)/60 text-xs mt-4">
                Cette action ne peut pas être annulée.
              </p>
              <template #footer>
                <button @click="showResetConfirm = false" class="default">Annuler</button>
                <button @click="resetPIN" class="danger">Réinitialiser</button>
              </template>
            </Popup>

          </div>

        </div>

      </Transition>

    </div>

    <div v-else>
      <Loader />
    </div>

  </div>

</template>