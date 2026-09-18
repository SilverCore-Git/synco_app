<template>

  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-(--bg) select-none">

    <div class="relative flex items-center justify-center overflow-hidden rounded-xl">

      <img src="/assets/logo/synco/favicon_synco.svg" alt="Logo" class="h-20 relative z-10" />

      <div class="shimmer absolute inset-0 z-20 pointer-events-none" />

    </div>

    <div class="w-40 h-1 rounded-full bg-(--text)/10 overflow-hidden mt-6">
      <div
        v-if="progress !== undefined"
        class="h-full rounded-full bg-(--primary) transition-[width] duration-500 ease-out"
        :style="{ width: `${Math.min(100, Math.max(0, progress))}%` }"
      />
      <div v-else class="h-full w-1/3 rounded-full bg-(--primary) progress-indeterminate" />
    </div>

  </div>

</template>

<script setup lang="ts">
// progress: 0-100 pour une barre déterminée (le boot d'App.vue calcule sa
// propre progression par étapes) ; omis => barre indéterminée (durée
// d'attente inconnue, ex. chargement de l'organisation après déverrouillage).
defineProps<{
  progress?: number;
}>();
</script>

<style scoped>

.shimmer {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.464) 50%,
    transparent 100%
  );

  animation: shine 3s infinite linear;
  transform: translateX(-100%);
}

@keyframes shine {
  0% {
    transform: translateX(-100%) skewX(-20deg);
  }
  100% {
    transform: translateX(100%) skewX(-20deg);
  }
}

.progress-indeterminate {
  animation: progress-indeterminate 1.4s ease-in-out infinite;
}

@keyframes progress-indeterminate {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(150%); }
  100% { transform: translateX(150%); }
}

</style>
