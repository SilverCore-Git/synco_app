<template>

  <div class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none">

    <div class="error-card">

      <div class="error-icon" :class="`error-icon--${status}`">
        <span v-if="status === 'offline'" class="error-icon-ring" />
        <span v-if="status === 'offline'" class="error-icon-ring error-icon-ring--delay" />
        <div class="error-icon-badge">
          <Transition name="icon-swap" mode="out-in">
            <i v-if="status === 'offline'" key="offline" class="bi bi-wifi-off" />
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
// Trois temps de l'écran, pilotés par App.vue :
// - offline : le health check échoue, retry manuel + polling silencieux en fond
// - reconnecting : le polling silencieux vient de détecter un serveur qui
//   répond de nouveau, le vrai bootstrap() est en cours
// - success : bootstrap() a réussi, bref instant avant que le parent bascule
//   bootError à false et révèle l'écran de chargement habituel
withDefaults(defineProps<{
  status?: 'offline' | 'reconnecting' | 'success';
  loading?: boolean;
}>(), {
  status: 'offline',
});

defineEmits<{
  retry: [];
}>();

const titles: Record<'offline' | 'reconnecting' | 'success', string> = {
  offline: 'Connexion impossible',
  reconnecting: 'Reconnexion...',
  success: 'Connecté',
};

const messages: Record<'offline' | 'reconnecting' | 'success', string> = {
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
  .error-spinner {
    animation: none;
  }
}

</style>
