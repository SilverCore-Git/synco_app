<template>

  <Teleport to="body">

    <Transition name="fade">

      <div 
        v-if="isOpen" 
        class="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
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
              class="px-6 py-4 bg-(--bg)/70 border-t border-(--border-color) flex justify-end gap-3"
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