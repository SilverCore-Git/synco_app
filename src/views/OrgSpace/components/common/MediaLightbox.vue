<template>

    <Teleport to="body">
        <div class="fixed inset-0 z-2500 flex flex-col bg-(--bg)/90 backdrop-blur-sm" @click.self="emit('close')">

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
                        @click="emit('close')"
                        class="p-2 rounded-lg hover:bg-(--text)/10 text-(--text2) hover:text-(--text) transition-colors"
                        title="Fermer"
                    >
                        <i class="bi bi-x-lg text-xl" />
                    </button>
                </div>
            </div>

            <div class="flex-1 min-h-0 flex items-center justify-center p-4" @click.self="emit('close')">
                <img :src="url" :alt="fileName" class="max-w-full max-h-full object-contain rounded-lg shadow-xl" />
            </div>

        </div>
    </Teleport>

</template>

<script setup lang="ts">

// Visionneuse plein écran d'une image jointe à un message. Réutilise l'URL
// blob: déjà déchiffrée par MessageMedia (qui en garde la référence tant que
// le message est monté) : rien n'est retéléchargé.

import { onBeforeUnmount, onMounted } from 'vue';
import { saveObjectUrl } from '@/assets/utils/downloadFile';

defineProps<{
    url: string;
    fileName: string;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
}>();

const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') emit('close');
};

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

</script>
