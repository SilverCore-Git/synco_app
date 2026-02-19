<template>

  <Teleport to="body">

    <Transition name="fade">

      <div 
        v-if="isOpen" 
        class="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        @click.self="emit('close')"
      >

        <Transition name="pop" appear>

          <div 
            v-if="isOpen"
            class="w-full max-w-md bg-(--bg) border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >

            <div class="px-6 py-4 border-b border-(--bg2)/5 flex items-center justify-between">

              <h3 class="text-lg font-semibold text-(--text)">
                <slot name="title">Titre par défaut</slot>
              </h3>

              <button 
                @click="emit('close')"
                class="
                  p-2 rounded-lg hover:bg-white/5 
                  text-(--text)/40 hover:text-(--text)
                  active:scale-90 transition-all duration-200
                "
              >
                <i class="bi bi-x-lg" />
              </button>

            </div>

            <div class="p-6">
              <slot />
            </div>

            <div 
              v-if="$slots.footer" 
              class="px-6 py-4 bg-(--bg)/70 border-t border-white/5 flex justify-end gap-3"
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

.fade-enter-active, .fade-leave-active { 
  transition: opacity 0.3s ease; 
}
.fade-enter-from, .fade-leave-to { 
  opacity: 0; 
}

.pop-enter-active {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
}

.pop-leave-active {
  transition: transform 0.2s ease-in, opacity 0.2s ease;
}

.pop-enter-from, .pop-leave-to { 
  transform: scale(0.85);
  opacity: 0; 
}

.pop-enter-to, .pop-leave-from {
  transform: scale(1);
  opacity: 1;
}

</style>