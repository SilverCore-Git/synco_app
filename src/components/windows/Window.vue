<template>

    <Teleport to="body">

        <Transition name="fade">

            <div 
                v-if="isOpen" 
                class="fixed inset-0 z-100 flex items-center justify-center p-2 sm:p-4 md:p-10 bg-black/60 backdrop-blur-sm"
                @click.self="emit('close')"
            >

                <Transition name="pop" appear>

                    <div 
                        v-if="isOpen"
                        class="
                            w-full h-full bg-(--bg) border border-white/10 
                            rounded-2xl shadow-2xl overflow-hidden relative
                        "
                    >

                        <div v-if="!hideCloseBtn">

                            <button 
                                @click="emit('close')"
                                class="
                                    absolute right-2.5 top-2.5 p-2 rounded-lg hover:bg-white/10 
                                    bg-(--bg)/60 backdrop-blur-md
                                    text-(--text)/60 hover:text-(--text) z-100
                                    active:scale-90 transition-all duration-200
                                "
                            >
                                <i class="bi bi-x-lg" />
                            </button>

                        </div>

                        <div class="h-full w-full relative">
                            <slot />
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
  hideCloseBtn?: boolean;
}>();

const emit = defineEmits(['close']);

const handleEsc = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close');
};

onMounted(() => window.addEventListener('keydown', handleEsc));
onUnmounted(() => window.removeEventListener('keydown', handleEsc));

</script>