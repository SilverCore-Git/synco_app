<script setup lang="ts">

import Loader from './components/LogoLoader.vue';
import SpinLoader from './components/SpinLoader.vue';
import ConnectionErrorScreen from './components/ConnectionErrorScreen.vue';
//import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import init, { refetchUser } from './assets/init';
import { isLoaded, user } from './assets/var';
import type { User } from '@/types/types';
import Notifications from './components/overlay/Notifications.vue';
import TransfersPanel from './components/overlay/TransfersPanel.vue';
import ConnectionStatusBanner from './components/overlay/ConnectionStatusBanner.vue';
import AiGatewayConsent from './components/common/AiGatewayConsent.vue';
import UserProfile from './components/overlay/UserProfile.vue';
import useSettingsItem from './composables/useSettingsItem';
import { initKC, isTauriPlatform, loginWithSystemBrowser } from './assets/keycloak';
import { E2EEUnloked, setupFirstTimeSecurityV3, unlockSecurity, unlockSecurityV3, SALT_V2_PREFIX, SALT_V3_PREFIX, privateKey, lockSecurity, assertOwnPublicKeyMatches, OwnKeyMismatchError } from './assets/utils/crypto';
import sfetch from './assets/utils/sfetch';
import { useToast } from './composables/useToast';
import TopBar from './components/layout/topBar.vue';
import useSecurePeer from './composables/useSecurePeer';
import useAppPresence from './composables/useAppPresence';
import CallOverlay from './components/peer/CallOverlay.vue';
import waitFor from './assets/utils/waitfor';
import { debugLog } from './assets/utils/debugLog';
import Popup from './components/Popup.vue';
import BannedScreen from './components/BannedScreen.vue';
import { isProfileOpen, profileUser, closeProfile } from './composables/useProfile';
import useFavicon from './composables/useFavicon';
import { banned } from './composables/useBanStatus';

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

      debugLog('Connection...');

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

    // Après tout déverrouillage : la clé publique servie doit correspondre à
    // la clé privée, sinon on reverrouille (audit FC1 §4).
    if (privateKey.value) {
      await assertOwnPublicKeyMatches(user.value?.publicKey, privateKey.value);
    }

  } catch (e) {
    if (e instanceof OwnKeyMismatchError) {
      lockSecurity();
      toast.show("Alerte de sécurité : la clé publique fournie par le serveur ne correspond pas à votre clé privée. Le chiffrement reste verrouillé ; contactez votre administrateur.", 'error', 20000);
    } else {
      toast.show('Erreur de déchiffrement', 'error');
    }
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
// Progression du tout premier chargement (écran affiché avant même le PIN,
// v-if="pinLoading || !user" dans le template) — étapes pondérées à la main
// plutôt qu'un vrai pourcentage d'octets transférés, qui n'a pas de sens ici
// (peu de requêtes, surtout de la latence réseau/Keycloak).
const bootProgress = ref(0);

const finishAuthInit = async () => {
  // init.run() lance 3 requêtes en parallèle (user, orgs, org ouverte) —
  // sans ça la barre restait figée à 50% pendant tout ce temps puis sautait
  // d'un coup à 85%. On avance plutôt à chaque requête qui termine, dans
  // l'ordre où elles arrivent (pas forcément 1-2-3).
  let completedInitSteps = 0;
  await init.run(() => {
    completedInitSteps++;
    bootProgress.value = 50 + (completedInitSteps / 3) * 35;
  });
  // Compte banni : l'API a refusé chaque requête d'init, il n'y a ni
  // utilisateur ni organisation à attendre. Ouvrir le pair P2P et la présence
  // pour un compte qui n'a plus le droit d'être joint n'aurait aucun sens.
  if (banned.value) {
    bootProgress.value = 100;
    return;
  }

  await waitFor(() => user.value !== null);
  bootProgress.value = 90;
  await initPeer();
  bootProgress.value = 95;
  useAppPresence();
  bootProgress.value = 100;
};

const handleTauriLogin = async () => {
  tauriLoginLoading.value = true;
  tauriLoginError.value = false;

  try {
    const success = await loginWithSystemBrowser();
    authenticated.value = success;

    if (success) {
      // bootstrap() a pu déjà pousser bootProgress vers 100 (tentative
      // d'auto-connexion échouée, cf. branche isTauri && !authenticated) —
      // sans ce reset, finishAuthInit() partirait de 100 pour retomber vers
      // 50-85, donc la barre reculerait visuellement après le clic.
      bootProgress.value = 50;
      await finishAuthInit();
    } else {
      tauriLoginError.value = true;
    }
  } catch (error) {
    console.error('Error during Tauri login:', error);
    tauriLoginError.value = true;
  } finally {
    tauriLoginLoading.value = false;
  }
};

const bootError = ref<boolean>(false);
const bootLoading = ref<boolean>(false);

// `silent`: utilisé par le polling automatique en arrière-plan (voir plus
// bas) pour retenter le vrai bootstrap sans spammer un toast d'erreur à
// chaque tentative infructueuse — seul le clic manuel sur "Réessayer" doit
// notifier l'échec.
const bootstrap = async (options?: { silent?: boolean }) => {
  const silent = options?.silent ?? false;

  bootError.value = false;
  bootLoading.value = true;
  bootProgress.value = 5;

  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/health`);
    debugLog('[boot] health check status:', res.status);
    if (!res.ok) {
      bootError.value = true;
      if (!silent) toast.show('Api error', 'error', 10000);
      return;
    }
    bootProgress.value = 25;

    debugLog('[boot] calling initKC...');
    authenticated.value = await initKC();
    debugLog('[boot] initKC done, authenticated =', authenticated.value);
    bootProgress.value = 50;

    if (authenticated.value) {
      await finishAuthInit();
    } else {
      bootProgress.value = 100;
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
    console.error('Error in bootstrap:', error);
    bootError.value = true;
    if (!silent) toast.show('Une erreur est survenue lors de l’initialisation.', 'error', 10000);
  } finally {
    bootLoading.value = false;
  }
};

// Polling silencieux pendant que l'écran d'erreur est affiché : toutes les
// 4s, on sonde /health sans notification. Dès que le serveur répond, on
// relance le vrai bootstrap() avec une transition (roue qui tourne, puis
// check) au lieu de faire disparaître l'écran d'erreur d'un coup sec.
const AUTO_RETRY_INTERVAL_MS = 4000;
const RECONNECT_TRANSITION_MS = 700;
let autoRetryTimer: ReturnType<typeof setInterval> | null = null;
const reconnectStatus = ref<'offline' | 'reconnecting' | 'success'>('offline');

const stopAutoRetry = () => {
  if (autoRetryTimer) {
    clearInterval(autoRetryTimer);
    autoRetryTimer = null;
  }
};

const probeServerHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
};

// Partagée entre le polling silencieux et le clic manuel sur "Réessayer" :
// dans les deux cas, on veut d'abord voir tourner la roue (reconnecting),
// puis soit le check de succès (avant de repasser, en fondu, sur le loader),
// soit — en cas d'échec — revenir direct à "offline" (le watch(bootError)
// ci-dessous s'en charge).
const runReconnectAttempt = async (silent: boolean) => {
  stopAutoRetry();
  reconnectStatus.value = 'reconnecting';
  await bootstrap({ silent });

  if (bootError.value) {
    return;
  }

  reconnectStatus.value = 'success';
  await new Promise((resolve) => setTimeout(resolve, RECONNECT_TRANSITION_MS));
  reconnectStatus.value = 'offline';
};

const attemptSilentReconnect = async () => {
  if (!(await probeServerHealth())) return;
  await runReconnectAttempt(true);
};

// Le clic manuel passe par le même va-et-vient "reconnecting -> succès/échec"
// que le polling automatique, plutôt que de juste faire tourner le bouton
// sans que le reste de l'écran ne bouge.
const manualRetry = () => runReconnectAttempt(false);

// bootError passe à true : l'écran d'erreur est directement dans son état
// stable "offline" (déjà tout en place, pas d'anim d'entrée à part le fondu
// logo <-> écran d'erreur porté par le <Transition name="boot-fade"> du
// template) et le polling silencieux démarre.
watch(bootError, (isError) => {
  stopAutoRetry();
  if (!isError) return;

  reconnectStatus.value = 'offline';
  autoRetryTimer = setInterval(attemptSilentReconnect, AUTO_RETRY_INTERVAL_MS);
});

onUnmounted(stopAutoRetry);

const { initFavicon } = useFavicon();

onMounted(async () => {
  debugLog('[boot] onMounted start');

  // Favicon réactive : branchée avant bootstrap() pour que l'icône reflète
  // le compteur de non-lus dès le premier chargement des notifications.
  initFavicon();

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
    <TransfersPanel />
    <ConnectionStatusBanner />
    <AiGatewayConsent />

    <!-- Compte banni : prioritaire sur tout le reste. Un compte banni ne
         charge jamais `user` (l'API refuse chaque requête, cf. banMiddleware
         côté synco_api), donc sans cette branche en premier l'utilisateur
         resterait bloqué sur l'écran de chargement sans explication — et s'il
         est banni en cours de session, cet écran remplace immédiatement
         l'app. Il arrive donc bien avant l'écran de code PIN. -->
    <div v-if="banned" class="h-full w-full">
      <BannedScreen />
    </div>

    <!-- Écran de connexion Tauri (bureau) : authenticated est déjà à false
         ici, mais tant que l'utilisateur n'a pas cliqué "Se connecter" on
         reste sur ce bouton plutôt que le loader ci-dessous. -->
    <div v-else-if="isTauri && !authenticated" class="h-full w-full">

      <div class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none">

        <div class="mb-8 text-center max-w-lg">

          <div class="flex flex-col items-center gap-4 mb-3">
            <img :src="theme === 'light' ? '/assets/logo/synco/light_banner_synco.svg' : '/banner.svg'" alt="Logo" class="h-16" />
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

    </div>

    <!-- Fenêtre de démarrage : soit le loader (logo + barre de progression),
         soit l'écran "connexion impossible" — un seul <Transition> partagé
         entre les deux pour un fondu fluide au lieu du coup sec d'un
         v-if/v-else-if séparé. Même garde qu'avant (!authenticated || !user) :
         bootError ne peut redevenir true qu'avant d'atteindre l'app (cf.
         bootstrap()/attemptSilentReconnect), jamais une fois dedans. -->
    <div v-else-if="!authenticated || !user" class="h-full w-full bg-(--bg3)">
      <Transition name="boot-fade" mode="out-in">
        <ConnectionErrorScreen
          v-if="bootError || reconnectStatus !== 'offline'"
          key="boot-error"
          :status="reconnectStatus"
          :loading="bootLoading"
          @retry="manualRetry"
        />
        <div
          v-else
          key="boot-loading"
          class="h-full w-full flex flex-col items-center justify-center p-6 select-none animate-app-reveal"
        >
          <Loader :progress="bootProgress" />
        </div>
      </Transition>
    </div>

    <div v-else class="h-full w-full">

      <CallOverlay />
      <UserProfile :isOpen="isProfileOpen" :profileUser="profileUser" @close="closeProfile"
        @send-message="handleSendMessageFromProfile" />

      <Transition name="page-lock" mode="out-in" appear>

        <div v-if="E2EEUnloked && !pinLoading" class="w-full h-full" key="app">

          <!-- Une fois déverrouillé, les données d'org sont presque toujours déjà
               chargées (elles se chargent en parallèle depuis avant l'écran PIN) ;
               ce court instant d'attente reste discret plutôt que de réafficher
               le plein écran logo+barre, qui donnait l'impression d'un rechargement. -->
          <Transition name="fade" mode="out-in">
            <div v-if="isLoaded" class="w-full h-full animate-app-reveal" key="loaded">
              <RouterView />
            </div>

            <div v-else class="w-full h-full flex items-center justify-center bg-(--bg)" key="loading">
              <SpinLoader />
            </div>
          </Transition>

        </div>

        <div class="w-full h-full" key="lock" v-else>

          <Transition name="fade" mode="out-in">
          <div v-if="pinLoading" key="pin-loading"
            class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none animate-app-reveal">
            <SpinLoader />
          </div>

          <div v-else key="pin-form" class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none">

            <div class="mb-8 text-center max-w-lg">

              <div class="flex flex-col items-center gap-4 mb-3 pin-step pin-step-0">

                <img :src="theme === 'light' ? '/assets/logo/synco/light_banner_synco.svg' : '/banner.svg'" alt="Logo" class=" h-16" />

              </div>

              <h2 class="text-xl font-bold text-(--text) pin-step pin-step-1">
                {{ isResettingPIN ? 'Définissez un nouveau code PIN' : pinSetup ? 'Déverrouillez votre session' :
                  'Configurez votre accès sécurisé' }}
              </h2>

              <p v-if="!pinSetup || isResettingPIN" class="text-sm text-(--text2) mt-2 leading-relaxed pin-step pin-step-2">
                Ce code PIN est la clé de vos conversations. <br />
                <span class="text-amber-500/80 font-medium">S'il est perdu, elles resteront illisibles.</span>
                <br />
                <span class="text-(--text2)">Code à 4 chiffres.</span>
              </p>
              <p v-if="isResettingPIN" class="text-sm text-amber-500/80 mt-2 font-medium pin-step pin-step-2">
                Attention : vos anciens messages deviendront indéchiffrables.
              </p>

            </div>

            <div v-if="pinMaxLength === 4" class="flex gap-4 mb-10 transition-transform duration-300 pin-step pin-step-3">

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

            <div v-else class="flex flex-wrap justify-center gap-2 mb-10 max-w-xs pin-step pin-step-3">

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

            <div v-if="lockoutCountdown > 0" class="text-center mb-10 pin-step pin-step-4">
              <p class="text-amber-500 font-medium">Trop de tentatives incorrectes.</p>
              <p class="text-(--text2) text-sm mt-1">Réessayez dans {{ formatDuration(lockoutCountdown) }}</p>
            </div>

            <div v-else class="grid grid-cols-3 gap-4 max-w-xs w-full pin-step pin-step-4">

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
              class="mt-10 text-xs font-bold uppercase tracking-widest text-(--text2) hover:text-(--primary) transition-colors pin-step pin-step-5">
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
          </Transition>

        </div>

      </Transition>

    </div>

  </div>

</template>

<style scoped>

/* Écran PIN : au lieu d'un seul bloc qui apparaît d'un coup, chaque groupe
   (logo, titre, texte, pastilles, clavier, lien "oublié") entre en cascade
   — réutilise le keyframe app-reveal-in (global, style.css) avec un délai
   croissant par étape plutôt qu'une nouvelle animation par groupe. */
.pin-step {
  animation: app-reveal-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.pin-step-0 { animation-delay: 0ms; }
.pin-step-1 { animation-delay: 90ms; }
.pin-step-2 { animation-delay: 150ms; }
.pin-step-3 { animation-delay: 220ms; }
.pin-step-4 { animation-delay: 300ms; }
.pin-step-5 { animation-delay: 380ms; }

@media (prefers-reduced-motion: reduce) {
  .pin-step {
    animation: none;
  }
}

.boot-fade-enter-active,
.boot-fade-leave-active {
  transition: opacity 0.35s ease, filter 0.35s ease;
}
.boot-fade-enter-from,
.boot-fade-leave-to {
  opacity: 0;
  filter: blur(6px);
}

@media (prefers-reduced-motion: reduce) {
  .boot-fade-enter-active,
  .boot-fade-leave-active {
    transition: opacity 0.2s ease;
  }
  .boot-fade-enter-from,
  .boot-fade-leave-to {
    filter: none;
  }
}

</style>