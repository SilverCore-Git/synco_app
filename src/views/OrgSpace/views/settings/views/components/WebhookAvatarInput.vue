<template>

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
                <i v-if="!working" class="bi bi-camera-fill text-white" :style="{ fontSize: `${size * 0.3}px` }" />
                <span v-else class="border-2 border-white/30 border-t-white rounded-full animate-spin" :style="{ width: `${size * 0.3}px`, height: `${size * 0.3}px` }" />
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

import { ref } from 'vue';
import WebhookAvatar from './WebhookAvatar.vue';
import { imageToAvatarDataUrl } from '@/assets/utils/imageToAvatarDataUrl';
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
const working = ref<boolean>(false);

// 8 Mo avant redimensionnement : au-delà, le décodage canvas d'une image de
// cette taille fige l'onglet pour rien, la sortie faisant de toute façon
// 256×256.
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const pickFile = () => fileInput.value?.click();

const clear = () => emit('update:modelValue', null);

const onFileChange = async (event: Event) => {

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    // On réarme l'input tout de suite : sans ça, re-sélectionner le même
    // fichier après un retrait n'émettrait aucun événement `change`.
    input.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
        toast.show('Ce fichier n\'est pas une image', 'error');
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        toast.show('Image trop lourde (8 Mo maximum)', 'error');
        return;
    }

    working.value = true;

    try {
        const dataUrl = await imageToAvatarDataUrl(file);
        emit('update:modelValue', dataUrl);
    } catch (err) {
        console.error('[Webhooks] Erreur de traitement de l\'avatar:', err);
        toast.show('Impossible de lire cette image', 'error');
    } finally {
        working.value = false;
    }

};

</script>
