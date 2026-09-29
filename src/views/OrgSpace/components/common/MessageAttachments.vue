<template>

    <div v-if="files.length > 0" class="mt-3 flex flex-col items-start gap-2 min-w-0 max-w-full">

        <div v-if="mediaFiles.length > 0" class="flex flex-wrap items-start gap-2 w-full">
            <MessageMedia
                v-for="file in mediaFiles"
                :key="file.id"
                :file="file"
                @open="(url: string) => lightbox = { url, fileName: file.originalName }"
            />
        </div>

        <div v-if="otherFiles.length > 0" class="flex flex-wrap gap-2 max-w-full">

            <div
                v-for="file in otherFiles"
                :key="file.id"
                class="
                    group/file relative flex items-center gap-3 p-2
                    rounded-lg border border-(--text)/10
                    bg-(--text)/3 hover:bg-(--text)/5 transition-all
                    max-w-full sm:max-w-sm min-w-0 overflow-hidden
                "
                :title="file.originalName"
            >

                <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-(--bg) border border-(--text)/5">

                    <i class="bi text-xl" :class="[ getFileInfo(file).color, getFileInfo(file).icon ]" />

                </div>

                <div class="flex flex-col min-w-0 flex-1 pr-2">
                    <span class="text-xs font-medium text-(--text) truncate min-w-0">
                        {{ file.originalName }}
                    </span>
                    <span class="text-[10px] text-(--text2) uppercase tracking-wider">
                        {{ (file.size / 1024 / 1024).toFixed(2) }} MB
                    </span>
                </div>

                <button
                    @click="downloadFile(file.id)"
                    class="ml-auto p-1.5 rounded-md hover:bg-(--primary)/20 text-(--text2) hover:text-(--primary) transition-colors"
                    title="Télécharger"
                >
                    <i class="bi bi-download" />
                </button>

            </div>

        </div>

        <MediaLightbox
            v-if="lightbox"
            :url="lightbox.url"
            :file-name="lightbox.fileName"
            @close="lightbox = null"
        />

    </div>

</template>

<script setup lang="ts">

// Pièces jointes d'un message (DM comme salon) : les images / audios / vidéos
// de la liste blanche (mediaTypes.ts) sont affichés en ligne via
// MessageMedia, les autres fichiers gardent la carte « nom + taille +
// télécharger ».

import { computed, ref } from 'vue';
import type { StoredFile } from '@/types/types';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile } from '@/assets/utils/downloadFile';
import { getMediaKind } from '@/assets/utils/mediaTypes';
import MessageMedia from './MessageMedia.vue';
import MediaLightbox from './MediaLightbox.vue';

const props = defineProps<{
    files: StoredFile[];
}>();

const lightbox = ref<{ url: string; fileName: string } | null>(null);

const mediaFiles = computed(() => props.files.filter(f => getMediaKind(f.mimeType) !== null));
const otherFiles = computed(() => props.files.filter(f => getMediaKind(f.mimeType) === null));

</script>
