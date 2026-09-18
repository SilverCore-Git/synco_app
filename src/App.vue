<script setup lang="ts">

import Loader from './components/LogoLoader.vue';
//import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import init, { refetchUser } from './assets/init';
import { isLoaded, user } from './assets/var';
import type { User } from '@/types/types';
import Notifications from './components/overlay/Notifications.vue';
import UserProfile from './components/overlay/UserProfile.vue';
import useSettingsItem from './composables/useSettingsItem';
import { initKC, isTauriPlatform, loginWithSystemBrowser } from './assets/keycloak';
import { E2EEUnloked, setupFirstTimeSecurityV3, unlockSecurity, unlockSecurityV3, SALT_V2_PREFIX, SALT_V3_PREFIX } from './assets/utils/crypto';
import sfetch from './assets/utils/sfetch';
import { useToast } from './composables/useToast';
import TopBar from './components/layout/topBar.vue';
import useSecurePeer from './composables/useSecurePeer';
import useAppPresence from './composables/useAppPresence';
import CallOverlay from './components/peer/CallOverlay.vue';
import waitFor from './assets/utils/waitfor';
import Popup from './components/Popup.vue';
import { isProfileOpen, profileUser, closeProfile } from './composables/useProfile';

const toast = useToast();
const { Item: theme } = useSettingsItem('theme', 'dark');
const pin = ref<string>('');
const pinLoading = ref<boolean>(false);

// Initialize P2P peer connection
const { initPeer } = useSecurePeer();

import router from '@/router';
import { openedOrg } from '@/assets/var';
import { SoundService } from '@/services/SoundService';

// Handler pour envoyer un message depuis le profil
const handleSendMessageFromProfile = (targetUser: User) => {
  if (openedOrg.value?.id) {
    router.push(`/${openedOrg.value.id}/chat/${targetUser.id}`);
  }
};

watch(() => theme.value, () => {
  document.body.className = theme.value;
})

watch(() => E2EEUnloked.value, (isUnlocked) => {
  if (!isUnlocked) {
    pin.value = '';
  }
});

const authenticated = ref<boolean>(false);
const isTauri = isTauriPlatform();
const tauriLoginLoading = ref<boolean>(false);
const tauriLoginError = ref<boolean>(false);
const pinSetup = computed(() =>
  user.value?.pinSalt?.trim() &&
  user.value?.keyIv?.trim() &&
  user.value?.encryptedPrivateKey?.trim()
);
const isResettingPIN = ref<boolean>(false);

// Three PIN schemes coexist, detected by the pinSalt prefix (must match
// crypto.ts's SALT_V2_PREFIX/SALT_V3_PREFIX exactly, checked in that order
// so a future v4 salt is never misclassified and legacy/v2 accounts never
// accidentally get routed through v3 logic):
// - legacy (no prefix): the original 4-digit PIN, fully client-side.
// - v2 ("v2:"): 6-10 digit PIN, fully client-side, higher PBKDF2 count.
// - v3 ("v3:"): back to 4 digits — the offline-bruteforce resistance now
//   comes from a server-held wrapSecret gated behind a rate-limited unlock
//   endpoint (see crypto.ts's SALT_V3_PREFIX comment), not from PIN length.
// v3 is the sole target for every new setup and every PIN reset going
// forward, regardless of which scheme the account was on before.
type PinScheme = 'legacy' | 'v2' | 'v3';
const pinScheme = computed<PinScheme>(() => {
  const salt = user.value?.pinSalt || '';
  if (salt.startsWith(SALT_V3_PREFIX)) return 'v3';
  if (salt.startsWith(SALT_V2_PREFIX)) return 'v2';
  return 'legacy';
});
const isUnlockMode = computed(() => pinSetup.value && !isResettingPIN.value);

const MIN_PIN_LENGTH = 6;
const MAX_PIN_LENGTH = 10;
const pinMaxLength = computed(() => {
  if (isResettingPIN.value || !pinSetup.value) return 4; // every new setup/reset targets v3
  return pinScheme.value === 'v2' ? MAX_PIN_LENGTH : 4; // legacy and v3 unlock: 4
});
const canSubmitPin = computed(() => {
  const min = (isResettingPIN.value || !pinSetup.value || pinScheme.value !== 'v2') ? 4 : MIN_PIN_LENGTH;
  return pin.value.length >= min;
});

// Lockout state for v3 unlock attempts (see submit()'s v3 branch below).
const lockoutCountdown = ref<number>(0);
let lockoutTimer: ReturnType<typeof setInterval> | null = null;
const startLockoutCountdown = (seconds: number) => {
  lockoutCountdown.value = seconds;
  if (lockoutTimer) clearInterval(lockoutTimer);
  lockoutTimer = setInterval(() => {
    lockoutCountdown.value -= 1;
    if (lockoutCountdown.value <= 0) {
      clearInterval(lockoutTimer!);
      lockoutTimer = null;
    }
  }, 1000);
};
const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.ceil(seconds / 3600)}h`;
};

const press = (num: string) => {
  if (pin.value.length < pinMaxLength.value) {
    pin.value += num;
    if (window.navigator.vibrate) window.navigator.vibrate(10);

    // Auto-submit at 4 digits on unlock only (legacy and v3 both use 4
    // digits there) — never during setup/reset, where a manual tap gives
    // the user one guaranteed beat to notice a typo before it becomes their
    // new PIN with no undo. v2 never auto-submits (existing behavior).
    const autoSubmit = isUnlockMode.value && (pinScheme.value === 'legacy' || pinScheme.value === 'v3');
    if (autoSubmit && pin.value.length === 4) {
      setTimeout(() => submit(), 50);
    }
  }
};

const submit = async () => {

  pinLoading.value = true;

  try {

    if (isResettingPIN.value) {
      // Mode réinitialisation : créer de nouvelles clés — toujours en v3,
      // quel que soit le schéma précédent du compte.
      const E2EEThings = await setupFirstTimeSecurityV3(pin.value);

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

      if (pinScheme.value === 'v3') {
        try {
          await unlockSecurityV3(
            pin.value, user.value.pinSalt, user.value.encryptedPrivateKey, user.value.keyIv,
            async (verifier) => {
              const res = await sfetch('/api/users/me/pin/unlock', {
                method: 'POST',
                body: JSON.stringify({ verifier })
              });
              if (res.status === 429) {
                const body = await res.json();
                throw Object.assign(new Error('locked'), { locked: true, retryAfterSeconds: body.retryAfterSeconds });
              }
              if (!res.ok) {
                throw Object.assign(new Error('invalid'), { locked: false });
              }
              return res.json();
            }
          );
          pin.value = '';
        } catch (e: any) {
          pin.value = '';
          if (e?.locked) {
            startLockoutCountdown(e.retryAfterSeconds);
            toast.show(`Trop de tentatives. Réessayez dans ${formatDuration(e.retryAfterSeconds)}.`, 'error', 8000);
          } else {
            toast.show('Code PIN incorrect', 'error');
          }
        }
      } else {
        // legacy / v2 : chemin inchangé, entièrement côté client.
        const success = await unlockSecurity(pin.value, user.value.pinSalt, user.value.encryptedPrivateKey, user.value.keyIv);

        if (!success) {
          toast.show('Code PIN incorrect', 'error');
          console.log('Code PIN incorrect');
          pin.value = '';
        } else {
          pin.value = '';
        }
      }

    }
    else {

      const E2EEThings = await setupFirstTimeSecurityV3(pin.value);

      const res = await sfetch('/api/users/me/initE2EE', {
        method: 'POST',
        body: JSON.stringify(E2EEThings)
      });

      if (res.ok) {
        await refetchUser();
        pinLoading.value = false;
        pin.value = '';
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
  else if (e.key === 'Enter' && canSubmitPin.value) submit();
  else if (e.key === 'Backspace') pin.value = pin.value.slice(0, -1);
}
const finishAuthInit = async () => {
  await init.run();
  await waitFor(() => user.value !== null);
  await initPeer();
  useAppPresence();
};

const handleTauriLogin = async () => {
  tauriLoginLoading.value = true;
  tauriLoginError.value = false;

  try {
    const success = await loginWithSystemBrowser();
    authenticated.value = success;

    if (success) {
      await finishAuthInit();
    } else {
      tauriLoginError.value = true;
    }
  } catch (error) {
    console.error('[DEBUG] Error during Tauri login:', error);
    tauriLoginError.value = true;
  } finally {
    tauriLoginLoading.value = false;
  }
};

const bootError = ref<boolean>(false);
const bootLoading = ref<boolean>(false);

const bootstrap = async () => {
  bootError.value = false;
  bootLoading.value = true;

  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/health`);
    console.log('[DEBUG] health check status:', res.status);
    if (!res.ok) {
      bootError.value = true;
      return toast.show('Api error', 'error', 10000);
    }

    console.log('[DEBUG] calling initKC...');
    authenticated.value = await initKC();
    console.log('[DEBUG] initKC done, authenticated =', authenticated.value);

    if (authenticated.value) {
      await finishAuthInit();
    }

    window.addEventListener('keydown', handleInput);

    const initSound = () => {
      SoundService.init();
      window.removeEventListener('click', initSound);
      window.removeEventListener('keydown', initSound);
    };
    window.addEventListener('click', initSound);
    window.addEventListener('keydown', initSound);
  } catch (error) {
    console.error('[DEBUG] Error in bootstrap:', error);
    bootError.value = true;
    toast.show('Une erreur est survenue lors de l’initialisation.', 'error', 10000);
  } finally {
    bootLoading.value = false;
  }
};

onMounted(async () => {
  console.log('[DEBUG] onMounted start');

  // Le premier rendu réel de l'app a été commité au DOM (on est dans
  // onMounted), mais on attend un vrai cycle de peinture (nextTick + rAF)
  // avant de retirer l'écran de démarrage statique (index.html), pour ne
  // jamais laisser transparaître un rendu non stylé en dessous.
  try {
    await nextTick();
    requestAnimationFrame(() => {
      document.getElementById('boot-loader')?.remove();
    });
  } catch (e) {
    document.getElementById('boot-loader')?.remove();
  }

  await bootstrap();
});

</script>

<template>

  <div class="w-screen h-[100dvh] relative flex flex-col overflow-hidden">

    <div class="w-full">
      <TopBar />
    </div>

    <!-- Monté même avant l'authentification, pour pouvoir afficher les
         erreurs de démarrage (health check, initKC) via un toast plutôt
         qu'un alert() natif. -->
    <Notifications />

    <div v-if="authenticated" class="h-full w-full">

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

          <div v-if="pinLoading || !user"
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

              <p v-if="!pinSetup || isResettingPIN" class="text-sm text-(--text2) mt-2 leading-relaxed">
                Ce code PIN est la clé de vos conversations. <br />
                <span class="text-amber-500/80 font-medium">S'il est perdu, elles resteront illisibles.</span>
                <br />
                <span class="text-(--text2)">Code à 4 chiffres.</span>
              </p>
              <p v-if="isResettingPIN" class="text-sm text-amber-500/80 mt-2 font-medium">
                Attention : vos anciens messages deviendront indéchiffrables.
              </p>

            </div>

            <div v-if="pinMaxLength === 4" class="flex gap-4 mb-10 transition-transform duration-300">

              <div v-for="i in 4" :key="i"
                class="w-14 h-18 border-2 rounded-2xl flex items-center justify-center text-2xl transition-all duration-150"
                :class="[
                  pin.length >= i
                    ? 'border-(--primary) bg-(--primary)/10 scale-105'
                    : 'border-(--border-color) bg-(--text)/5'
                ]">
                <div class="w-3 h-3 rounded-full transition-all duration-300"
                  :class="pin.length >= i ? 'bg-(--primary)' : 'bg-(--text)/10'" />
              </div>

            </div>

            <div v-else class="flex flex-wrap justify-center gap-2 mb-10 max-w-xs">

              <div v-for="i in MAX_PIN_LENGTH" :key="i"
                class="w-6 h-8 border-b-2 flex items-center justify-center text-xl transition-all duration-150"
                :class="[
                  pin.length >= i
                    ? 'border-(--primary)'
                    : 'border-(--border-color)'
                ]">
                <div v-if="pin.length >= i" class="w-2.5 h-2.5 rounded-full bg-(--primary)" />
              </div>

            </div>

            <div v-if="lockoutCountdown > 0" class="text-center mb-10">
              <p class="text-amber-500 font-medium">Trop de tentatives incorrectes.</p>
              <p class="text-(--text2) text-sm mt-1">Réessayez dans {{ formatDuration(lockoutCountdown) }}</p>
            </div>

            <div v-else class="grid grid-cols-3 gap-4 max-w-xs w-full">

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

              <button @click="submit" class="primary" :disabled="!canSubmitPin">
                <span class="font-bold tracking-widest text-lg">OK</span>
              </button>

            </div>

            <button v-if="pinSetup && !isResettingPIN" @click="pinForgot"
              class="mt-10 text-xs font-bold uppercase tracking-widest text-(--text2) hover:text-(--primary) transition-colors">
              Code PIN oublié ?
            </button>

            <Popup :isOpen="showResetConfirm" @close="showResetConfirm = false">
              <template #title>Réinitialiser le code PIN</template>
              <p class="text-(--text) text-sm">
                Cela réinitialisera votre clé de chiffrement.
                <span class="text-amber-500 font-medium">Tous vos anciens messages deviendront illisibles.</span>
              </p>
              <p class="text-(--text2) text-xs mt-4">
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

    <div v-else class="h-full w-full">

      <div v-if="isTauri"
        class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none">

        <div class="mb-8 text-center max-w-lg">

          <div class="flex flex-col items-center gap-4 mb-3">
            <img src="/banner.svg" alt="Logo" class="h-16" />
          </div>

          <h2 class="text-xl font-bold text-(--text)">
            Connectez-vous à votre compte
          </h2>

          <p class="text-sm text-(--text2) mt-2 leading-relaxed">
            La connexion se fait dans votre navigateur, pour plus de sécurité.
          </p>

        </div>

        <button
          @click="handleTauriLogin"
          class="primary"
          :class="{ loader: tauriLoginLoading }"
          :disabled="tauriLoginLoading"
        >
          <i class="bi bi-box-arrow-up-right mr-2" />
          <span class="font-bold tracking-wide">Se connecter</span>
        </button>

        <p v-if="tauriLoginLoading" class="text-xs text-(--text2) mt-6 uppercase tracking-widest font-bold">
          En attente de connexion dans le navigateur...
        </p>

        <p v-if="tauriLoginError" class="text-xs text-red-400 mt-6 font-medium">
          La connexion a échoué. Réessayez.
        </p>

      </div>

      <div v-else-if="bootError"
        class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none text-center">
        <p class="text-sm text-(--text2) mb-4 max-w-sm">
          Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.
        </p>
        <button @click="bootstrap" class="primary" :class="{ loader: bootLoading }" :disabled="bootLoading">
          Réessayer
        </button>
      </div>

      <Loader v-else />

    </div>

  </div>

</template>