<template>

    <div class="flex flex-col gap-4">

        <div class="flex items-center gap-4">

            <button
                type="button"
                class="relative group rounded-full shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)"
                :style="{ width: `${size}px`, height: `${size}px` }"
                :title="modelValue ? 'Changer la photo' : 'Ajouter une photo'"
                @click="pickFile"
            >
                <WebhookAvatar :avatar-url="modelValue" :name="name" :size="size" />

                <span
                    class="absolute inset-0 rounded-full bg-black/55 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <i class="bi bi-camera-fill text-white" :style="{ fontSize: `${size * 0.3}px` }" />
                </span>
            </button>

            <div class="min-w-0">
                <p class="text-sm font-semibold text-(--text)">Photo de profil</p>
                <p class="text-xs text-(--text2) mt-0.5 leading-snug">
                    Elle s'affiche à côté de chaque message envoyé par ce webhook.
                </p>

                <div class="flex items-center gap-3 mt-2">
                    <button
                        type="button"
                        class="text-xs font-semibold text-(--primary) hover:underline"
                        @click="pickFile"
                    >
                        {{ modelValue ? 'Remplacer' : 'Choisir une image' }}
                    </button>
                    <button
                        v-if="modelValue"
                        type="button"
                        class="text-xs font-semibold text-(--text2) hover:text-red-500 transition-colors"
                        @click="clear"
                    >
                        Retirer
                    </button>
                </div>
            </div>

        </div>

        <!-- Recadrage, dans le flux plutôt qu'en pop-up : ce composant est
             lui-même monté à l'intérieur de la pop-up de création, où deux
             calques Teleportés n'ont aucun ordre d'empilement garanti. -->
        <div v-if="imageSrc" class="flex flex-col gap-3 p-3 rounded-xl border border-(--border-color) bg-(--bg)">

            <p class="text-xs text-(--text2)">
                Glissez et zoomez pour cadrer.
            </p>

            <div class="h-[220px] w-full overflow-hidden rounded-lg bg-black/20">
                <cropper
                    ref="cropperRef"
                    class="w-full h-full"
                    :src="imageSrc"
                    :stencil-component="CircleStencil"
                    :stencil-props="{ aspectRatio: 1 }"
                    image-restriction="stencil"
                />
            </div>

            <div class="flex justify-end gap-2">
                <button
                    type="button"
                    class="px-4 py-2 text-xs font-semibold text-(--text2) hover:text-(--text) transition-colors"
                    @click="cancelCrop"
                >
                    Annuler
                </button>
                <button
                    type="button"
                    class="primary !text-xs !py-2 !px-4 flex items-center gap-2"
                    @click="applyCrop"
                >
                    <i class="bi bi-crop" />
                    Valider le recadrage
                </button>
            </div>

        </div>

        <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onFileChange"
        />

    </div>

</template>

<script lang="ts" setup>

import { ref, onUnmounted } from 'vue';
import { Cropper, CircleStencil } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';
import WebhookAvatar from './WebhookAvatar.vue';
import { canvasToAvatarDataUrl } from '@/assets/utils/avatarDataUrl';
import { useToast } from '@/composables/useToast';

withDefaults(defineProps<{
    modelValue?: string | null;
    name?: string;
    size?: number;
}>(), {
    size: 72
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: string | null): void;
}>();

const toast = useToast();

const fileInput = ref<HTMLInputElement | null>(null);
const cropperRef = ref<any>(null);
const imageSrc = ref<string | null>(null);

// 8 Mo avant recadrage : au-delà, décoder l'image fige l'onglet pour rien,
// la sortie faisant de toute façon 256×256.
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const pickFile = () => fileInput.value?.click();

const clear = () => {
    releaseImage();
    emit('update:modelValue', null);
};

const releaseImage = () => {
    if (!imageSrc.value) return;
    URL.revokeObjectURL(imageSrc.value);
    imageSrc.value = null;
};

const cancelCrop = () => releaseImage();

const onFileChange = (event: Event) => {

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    // On réarme l'input tout de suite : sans ça, re-sélectionner le même
    // fichier après une annulation n'émettrait aucun événement `change`.
    input.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
        toast.show("Ce fichier n'est pas une image", 'error');
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        toast.show('Image trop lourde (8 Mo maximum)', 'error');
        return;
    }

    releaseImage();
    imageSrc.value = URL.createObjectURL(file);

};

const applyCrop = () => {

    const result = cropperRef.value?.getResult();

    if (!result?.canvas) {
        toast.show('Recadrage impossible sur cette image', 'error');
        return;
    }

    try {
        emit('update:modelValue', canvasToAvatarDataUrl(result.canvas));
        releaseImage();
    } catch (err) {
        console.error('[Webhooks] Erreur de recadrage:', err);
        toast.show('Impossible de traiter cette image', 'error');
    }

};

onUnmounted(releaseImage);

</script>
