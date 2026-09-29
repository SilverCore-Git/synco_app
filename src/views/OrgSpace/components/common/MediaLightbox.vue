<template>

    <Teleport to="body">
        <Transition name="fade" appear @after-leave="emit('close')">
            <div v-if="visible" class="fixed inset-0 z-2500 flex flex-col bg-(--bg)/90 backdrop-blur-sm" @click.self="close">

                <div class="px-6 py-4 flex items-center justify-between gap-4 shrink-0">
                    <span class="text-sm font-semibold text-(--text) truncate min-w-0" :title="fileName">{{ fileName }}</span>
                    <div class="flex items-center gap-2 shrink-0">
                        <button
                            @click="saveObjectUrl(url, fileName)"
                            class="p-2 rounded-lg hover:bg-(--text)/10 text-(--text2) hover:text-(--text) transition-colors"
                            title="Télécharger"
                        >
                            <i class="bi bi-download text-lg" />
                        </button>
                        <button
                            @click="close"
                            class="p-2 rounded-lg hover:bg-(--text)/10 text-(--text2) hover:text-(--text) transition-colors"
                            title="Fermer"
                        >
                            <i class="bi bi-x-lg text-xl" />
                        </button>
                    </div>
                </div>

                <div class="flex-1 min-h-0 flex items-center justify-center p-4" @click.self="close">
                    <Transition name="lightbox-zoom" appear>
                        <img v-if="visible" :src="url" :alt="fileName" class="max-w-full max-h-full object-contain rounded-lg shadow-xl" />
                    </Transition>
                </div>

            </div>
        </Transition>
    </Teleport>

</template>

<script setup lang="ts">

// Visionneuse plein écran d'une image jointe à un message. Réutilise l'URL
// blob: déjà déchiffrée par MessageMedia (qui en garde la référence tant que
// le message est monté) : rien n'est retéléchargé.
// La fermeture joue d'abord l'animation de sortie, puis émet `close` pour que
// le parent démonte le composant.

import { onBeforeUnmount, onMounted, ref } from 'vue';
import { saveObjectUrl } from '@/assets/utils/downloadFile';

defineProps<{
    url: string;
    fileName: string;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
}>();

const visible = ref(true);
const close = () => { visible.value = false; };

const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
};

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

</script>

<style scoped>

.lightbox-zoom-enter-active {
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease;
}

.lightbox-zoom-leave-active {
    transition: transform 0.2s ease-in, opacity 0.2s ease;
}

.lightbox-zoom-enter-from,
.lightbox-zoom-leave-to {
    transform: scale(0.94);
    opacity: 0;
}

</style>
