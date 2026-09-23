<template>

  <div class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none">

    <div class="error-card">

      <div class="error-icon">
        <span class="error-icon-ring" />
        <span class="error-icon-ring error-icon-ring--delay" />
        <div class="error-icon-badge">
          <i class="bi bi-wifi-off" />
        </div>
      </div>

      <h2 class="text-lg font-bold text-(--text) mt-6">
        Connexion impossible
      </h2>

      <p class="text-sm text-(--text2) mt-2 leading-relaxed max-w-[19rem]">
        Impossible de contacter le serveur. Vérifiez votre connexion internet, puis réessayez.
      </p>

      <button
        @click="$emit('retry')"
        class="primary error-retry mt-7"
        :class="{ loader: loading }"
        :disabled="loading"
      >
        <i class="bi bi-arrow-clockwise mr-2" />
        <span>Réessayer</span>
      </button>

    </div>

  </div>

</template>

<script setup lang="ts">
defineProps<{
  loading?: boolean;
}>();

defineEmits<{
  retry: [];
}>();
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

@media (prefers-reduced-motion: reduce) {
  .error-card,
  .error-icon-ring {
    animation: none;
  }
}

</style>
