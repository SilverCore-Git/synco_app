<template>

    <div ref="rootEl" class="relative max-w-full" :class="kind === 'audio' ? 'w-full sm:w-96' : ''">

        <!-- Prêt : le média déchiffré, servi par une URL blob: -->
        <template v-if="state === 'ready' && url">

            <div v-if="kind === 'audio'" class="flex flex-col gap-2 p-2 rounded-lg border border-(--border-color) bg-(--text)/3">
                <div class="flex items-center gap-2 min-w-0">
                    <i class="bi text-lg shrink-0" :class="[ fileInfo.icon, fileInfo.color ]" />
                    <span class="text-xs font-medium text-(--text) truncate min-w-0 flex-1" :title="file.originalName">
                        {{ file.originalName }}
                    </span>
                    <span class="text-[10px] text-(--text2) uppercase tracking-wider shrink-0">{{ sizeLabel }}</span>
                    <button v-if="file.workspaceId" @click="reveal" class="p-1.5 rounded-md hover:bg-(--primary)/20 text-(--text2) hover:text-(--primary) transition-colors shrink-0" title="Afficher dans les fichiers">
                        <i class="bi bi-folder2-open" />
                    </button>
                    <button @click="download" class="p-1.5 rounded-md hover:bg-(--primary)/20 text-(--text2) hover:text-(--primary) transition-colors shrink-0" title="Télécharger">
                        <i class="bi bi-download" />
                    </button>
                </div>
                <audio :src="url" controls preload="metadata" class="w-full h-10" @loadedmetadata="notifyLoaded" @error="onMediaError" />
            </div>

            <div v-else class="group/media relative rounded-lg overflow-hidden border border-(--border-color) bg-(--bg3)">

                <button v-if="kind === 'image'" type="button" class="block cursor-zoom-in" :title="file.originalName" @click="emit('open', url)">
                    <img :src="url" :alt="file.originalName" class="block max-w-full sm:max-w-sm max-h-80 object-contain" @load="notifyLoaded" @error="onMediaError" />
                </button>

                <video
                    v-else
                    :src="url"
                    controls
                    playsinline
                    preload="metadata"
                    class="block max-w-full sm:max-w-md max-h-80"
                    @loadedmetadata="notifyLoaded"
                    @error="onMediaError"
                />

                <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/media:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                        v-if="file.workspaceId"
                        @click="reveal"
                        class="p-1.5 rounded-md bg-(--bg)/80 text-(--text2) hover:text-(--primary)"
                        title="Afficher dans les fichiers"
                    >
                        <i class="bi bi-folder2-open" />
                    </button>
                    <button
                        @click="download"
                        class="p-1.5 rounded-md bg-(--bg)/80 text-(--text2) hover:text-(--primary)"
                        title="Télécharger"
                    >
                        <i class="bi bi-download" />
                    </button>
                </div>

            </div>

        </template>

        <!-- Chargement d'une image / vidéo : cadre de taille fixe pour limiter
             le saut de mise en page quand le média arrive. -->
        <div
            v-else-if="state === 'loading' && kind !== 'audio'"
            class="w-64 max-w-full h-40 flex flex-col items-center justify-center gap-2 rounded-lg border border-(--border-color) bg-(--bg3) text-(--text2)"
            :title="file.originalName"
        >
            <div class="w-6 h-6 rounded-full border-2 border-(--primary) border-t-transparent animate-spin" />
            <span class="text-[10px] px-3 truncate max-w-full">Déchiffrement…</span>
        </div>

        <!-- Au repos (> 15 Mo), chargement d'un audio, ou échec : carte fichier -->
        <div
            v-else
            class="flex items-center gap-3 p-2 rounded-lg border border-(--border-color) bg-(--text)/3 max-w-full sm:max-w-sm min-w-0 overflow-hidden"
            :title="file.originalName"
        >

            <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-(--bg) border border-(--text)/5">
                <i class="bi text-xl" :class="[ fileInfo.color, fileInfo.icon ]" />
            </div>

            <div class="flex flex-col min-w-0 flex-1 pr-2">
                <span class="text-xs font-medium text-(--text) truncate min-w-0">{{ file.originalName }}</span>
                <span v-if="state === 'error'" class="text-[10px] text-red-400 truncate">{{ errorMessage }}</span>
                <span v-else class="text-[10px] text-(--text2) uppercase tracking-wider">{{ sizeLabel }}</span>
            </div>

            <div v-if="state === 'loading'" class="w-5 h-5 shrink-0 rounded-full border-2 border-(--primary) border-t-transparent animate-spin" />

            <button
                v-else-if="state === 'idle'"
                @click="load"
                class="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-(--primary)/15 text-(--primary) hover:bg-(--primary)/25 text-xs font-medium transition-colors"
            >
                <i class="bi bi-shield-lock" />
                Déchiffrer
            </button>

            <button
                v-else-if="state === 'error'"
                @click="load"
                class="shrink-0 p-1.5 rounded-md hover:bg-(--primary)/20 text-(--text2) hover:text-(--primary) transition-colors"
                title="Réessayer"
            >
                <i class="bi bi-arrow-clockwise" />
            </button>

            <button
                v-if="file.workspaceId"
                @click="reveal"
                class="shrink-0 p-1.5 rounded-md hover:bg-(--primary)/20 text-(--text2) hover:text-(--primary) transition-colors"
                title="Afficher dans les fichiers"
            >
                <i class="bi bi-folder2-open" />
            </button>

            <button
                @click="download"
                class="shrink-0 p-1.5 rounded-md hover:bg-(--primary)/20 text-(--text2) hover:text-(--primary) transition-colors"
                title="Télécharger"
            >
                <i class="bi bi-download" />
            </button>

        </div>

    </div>

</template>

<script setup lang="ts">

// Aperçu d'une pièce jointe image / audio / vidéo dans un message.
// ≤ AUTO_LOAD_MAX_BYTES : chargé + déchiffré dès le montage (après le premier
// rendu) ; au-delà, seulement sur demande. Les octets passent par
// mediaCache, qui partage les URL blob: et les révoque à l'éviction : on y
// prend une référence (acquire) et on la rend au démontage (release).

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { StoredFile } from '@/types/types';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile, saveObjectUrl } from '@/assets/utils/downloadFile';
import { revealFileInFiles } from '@/composables/useReferenceNavigation';
import { useRouter } from 'vue-router';
import { AUTO_LOAD_MAX_BYTES, getMediaKind, type MediaKind } from '@/assets/utils/mediaTypes';
import { mediaCache, MediaPreviewError } from '@/assets/utils/mediaPreview';

const props = defineProps<{
    file: StoredFile;
}>();

const emit = defineEmits<{
    (e: 'open', url: string): void;
}>();

type PreviewState = 'idle' | 'loading' | 'ready' | 'error';

const rootEl = ref<HTMLElement | null>(null);
const state = ref<PreviewState>('idle');
const url = ref<string | null>(null);
// Format réellement détecté dans les octets déchiffrés (cf. mediaTypes.ts) :
// il prime sur le type déclaré, qui n'est que l'extension choisie par
// l'expéditeur — un « .gif » peut être un JPEG, voire une vidéo MP4.
const detectedMime = ref<string | null>(null);
const errorMessage = ref<string>('');

// MessageAttachments ne rend ce composant que pour un type de la liste blanche.
const kind = computed<MediaKind>(() => getMediaKind(detectedMime.value ?? props.file.mimeType) ?? 'image');
const fileInfo = computed(() => getFileInfo(props.file));
const sizeLabel = computed(() => `${(props.file.size / 1024 / 1024).toFixed(2)} MB`);

let holdsReference = false;
let disposed = false;

const releaseReference = () => {
    if (holdsReference) {
        mediaCache.release(props.file.id);
        holdsReference = false;
    }
    url.value = null;
    detectedMime.value = null;
};

const load = async () => {
    if (state.value === 'loading' || state.value === 'ready') return;
    state.value = 'loading';

    try {
        const media = await mediaCache.acquire(props.file.id);
        if (disposed) {
            mediaCache.release(props.file.id);
            return;
        }
        holdsReference = true;
        url.value = media.url;
        detectedMime.value = media.mimeType;
        state.value = 'ready';
    } catch (e) {
        if (disposed) return;
        console.error('[MessageMedia] Failed to load media preview', e);
        errorMessage.value = e instanceof MediaPreviewError ? e.message : 'Impossible de charger ce fichier';
        state.value = 'error';
    }
};

// Le navigateur n'arrive pas à décoder le média (codec non supporté, fichier
// tronqué…) : on retombe sur la carte fichier, le téléchargement reste possible.
const onMediaError = () => {
    releaseReference();
    errorMessage.value = 'Format non lisible par le navigateur';
    state.value = 'error';
};

// Événement DOM qui remonte jusqu'au conteneur de messages (ChatView /
// ThreadView), pour qu'il se recolle en bas si l'utilisateur y était.
const notifyLoaded = () => {
    rootEl.value?.dispatchEvent(new CustomEvent('media-loaded', { bubbles: true }));
};

const download = () => {
    if (url.value) saveObjectUrl(url.value, props.file.originalName);
    else downloadFile(props.file.id);
};

// Emplacement du fichier dans le gestionnaire de fichiers de son espace.
const router = useRouter();
const reveal = () => {
    if (props.file.workspaceId) revealFileInFiles(router, { id: props.file.id, spaceId: props.file.workspaceId });
};

onMounted(() => {
    if (props.file.size <= AUTO_LOAD_MAX_BYTES) load();
});

onBeforeUnmount(() => {
    disposed = true;
    releaseReference();
});

</script>
