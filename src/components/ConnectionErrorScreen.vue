<template>

  <div class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none">

    <div class="error-card">

      <div class="error-icon" :class="`error-icon--${status}`">
        <span v-if="status === 'offline'" class="error-icon-ring" />
        <span v-if="status === 'offline'" class="error-icon-ring error-icon-ring--delay" />
        <div class="error-icon-badge">
          <Transition name="icon-swap" mode="out-in">
            <i v-if="status === 'disconnecting' || status === 'offline'" key="wifi-off" class="bi bi-wifi-off" />
            <span v-else-if="status === 'reconnecting'" key="reconnecting" class="error-spinner" />
            <i v-else key="success" class="bi bi-check-lg" />
          </Transition>
        </div>
      </div>

      <Transition name="text-swap" mode="out-in">

        <div :key="status" class="flex flex-col items-center">

          <h2 class="text-lg font-bold text-(--text) mt-6">
            {{ titles[status] }}
          </h2>

          <p class="text-sm text-(--text2) mt-2 leading-relaxed max-w-[19rem]">
            {{ messages[status] }}
          </p>

        </div>

      </Transition>

      <button
        v-if="status === 'offline'"
        @click="$emit('retry')"
        class="primary error-retry mt-7"
        :class="{ loader: loading }"
        :disabled="loading"
      >
        <i class="bi bi-arrow-clockwise mr-2" />
        <span>Réessayer</span>
      </button>

      <div v-else class="mt-7 error-retry-placeholder" />

    </div>

  </div>

</template>

<script setup lang="ts">
// Quatre temps de l'écran, pilotés par App.vue :
// - disconnecting : bref instant juste après la perte de connexion, avant de
//   s'installer dans l'état "offline" stable — évite le flash brutal d'un
//   overlay complet qui apparaît d'un coup
// - offline : le health check échoue, retry manuel + polling silencieux en fond
// - reconnecting : le polling silencieux vient de détecter un serveur qui
//   répond de nouveau, le vrai bootstrap() est en cours
// - success : bootstrap() a réussi, bref instant avant que le parent bascule
//   bootError à false et révèle l'écran de chargement habituel
type Status = 'disconnecting' | 'offline' | 'reconnecting' | 'success';

withDefaults(defineProps<{
  status?: Status;
  loading?: boolean;
}>(), {
  status: 'offline',
});

defineEmits<{
  retry: [];
}>();

const titles: Record<Status, string> = {
  disconnecting: 'Connexion interrompue',
  offline: 'Connexion impossible',
  reconnecting: 'Reconnexion...',
  success: 'Connecté',
};

const messages: Record<Status, string> = {
  disconnecting: 'On dirait que ça vient de couper...',
  offline: 'Impossible de contacter le serveur. Vérifiez votre connexion internet, puis réessayez.',
  reconnecting: 'Le serveur répond de nouveau, reconnexion en cours.',
  success: 'C’est reparti !',
};
</script>

<style scoped>

.error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: error-card-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes error-card-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.error-icon {
  position: relative;
  width: 4.25rem;
  height: 4.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-icon-badge {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  border: 1px solid var(--border-color);
  font-size: 1.5rem;
  color: var(--text2);
  transition: background 0.4s ease, border-color 0.4s ease, color 0.4s ease;
}

.error-icon--success .error-icon-badge {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  border-color: color-mix(in srgb, var(--primary) 45%, transparent);
  color: var(--primary);
  transform: scale(1.06);
}

.error-icon--reconnecting .error-icon-badge {
  color: var(--primary);
}

.error-icon--disconnecting .error-icon-badge {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  border-color: color-mix(in srgb, #ef4444 40%, transparent);
  color: #ef4444;
  animation: error-icon-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes error-icon-shake {
  0%, 100% { transform: translateX(0) rotate(0); }
  20% { transform: translateX(-4px) rotate(-4deg); }
  40% { transform: translateX(3px) rotate(3deg); }
  60% { transform: translateX(-3px) rotate(-2deg); }
  80% { transform: translateX(2px) rotate(1deg); }
}

.error-spinner {
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 999px;
  border: 2.5px solid color-mix(in srgb, var(--primary) 25%, transparent);
  border-top-color: var(--primary);
  animation: error-spin 0.7s linear infinite;
}

@keyframes error-spin {
  to { transform: rotate(360deg); }
}

.error-icon-ring {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  border: 1.5px solid color-mix(in srgb, var(--text) 16%, transparent);
  animation: error-ring-pulse 2.4s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

.error-icon-ring--delay {
  animation-delay: 1.2s;
}

@keyframes error-ring-pulse {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.9);
    opacity: 0;
  }
}

.error-retry {
  min-width: 9.5rem;
  position: relative;
  box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--primary) 60%, transparent);
}

.error-retry-placeholder {
  height: 2.5em;
}

.icon-swap-enter-active,
.icon-swap-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.icon-swap-enter-from,
.icon-swap-leave-to {
  opacity: 0;
  transform: scale(0.6);
}

.text-swap-enter-active,
.text-swap-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.text-swap-enter-from,
.text-swap-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .error-card,
  .error-icon-ring,
  .error-spinner,
  .error-icon--disconnecting .error-icon-badge {
    animation: none;
  }
}

</style>
