<template>

  <Teleport to="body">

    <Transition name="fade">

      <div
        v-if="isOpen"
        class="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
        @click.self="emit('close')"
      >

        <Transition name="popup-card" appear>

          <div
            v-if="isOpen"
            class="w-full sm:max-w-md max-h-[90vh] bg-(--bg) border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >

            <!-- Poignée : n'apparaît que sur mobile, signale une feuille qu'on peut fermer -->
            <div class="flex justify-center pt-2 pb-1 shrink-0 sm:hidden">
              <div class="w-10 h-1.5 rounded-full bg-white/15"></div>
            </div>

            <div class="px-6 py-4 border-b border-(--bg2)/5 flex items-center justify-between shrink-0">

              <h3 class="text-lg font-semibold text-(--text)">
                <slot name="title">Titre par défaut</slot>
              </h3>

              <button
                @click="emit('close')"
                class="
                  p-2 rounded-lg hover:bg-white/5
                  text-(--text2) hover:text-(--text)
                  active:scale-90 transition-all duration-200
                "
              >
                <i class="bi bi-x-lg" />
              </button>

            </div>

            <div class="p-6 overflow-y-auto flex-1 min-h-0">
              <slot />
            </div>

            <div
              v-if="$slots.footer"
              class="px-6 py-4 bg-(--bg)/70 border-t border-(--border-color) flex justify-end gap-3 shrink-0"
            >
              <slot name="footer" />
            </div>

          </div>

        </Transition>

      </div>

    </Transition>

  </Teleport>

</template>

<script setup lang="ts">

import { onMounted, onUnmounted } from 'vue';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);

const handleEsc = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close');
};

onMounted(() => window.addEventListener('keydown', handleEsc));
onUnmounted(() => window.removeEventListener('keydown', handleEsc));

</script>

<style scoped>

/* Feuille qui glisse depuis le bas sur mobile, pop centré classique au-delà
   de sm — transition dédiée (pas la classe globale .pop, partagée par plein
   d'autres composants qui n'ont pas à changer de comportement ici). */
.popup-card-enter-active {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
}

.popup-card-leave-active {
  transition: transform 0.2s ease-in, opacity 0.2s ease;
}

.popup-card-enter-from,
.popup-card-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.popup-card-enter-to,
.popup-card-leave-from {
  transform: translateY(0);
  opacity: 1;
}

@media (min-width: 640px) {
  .popup-card-enter-from,
  .popup-card-leave-to {
    transform: scale(0.9) translateY(10px);
  }
}

</style>
