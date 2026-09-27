<template>

    <div
        class="relative rounded-full overflow-hidden bg-(--bg3) border border-(--border-color) shrink-0"
        :style="{ width: `${size}px`, height: `${size}px` }"
    >
        <img
            :src="src"
            :alt="name || 'Webhook'"
            class="w-full h-full object-cover"
            @error="onImageError"
        />

        <!-- Pastille d'état, optionnelle : reprend le vocabulaire des avatars
             membres (pastille en bas à droite) plutôt qu'un badge textuel. -->
        <span
            v-if="status"
            class="absolute bottom-0 right-0 rounded-full border-2 border-(--bg2)"
            :style="{ width: `${dotSize}px`, height: `${dotSize}px` }"
            :class="status === 'active' ? 'bg-green-500' : 'bg-(--text2)'"
            :title="status === 'active' ? 'Actif' : 'En pause'"
        />
    </div>

</template>

<script lang="ts" setup>

import { computed, ref, watch } from 'vue';
import { useWebhooks } from '@/composables/useWebhooks';

const props = withDefaults(defineProps<{
    avatarUrl?: string | null;
    name?: string;
    size?: number;
    status?: 'active' | 'paused' | null;
}>(), {
    size: 40,
    status: null
});

const { webhookAvatarFallback } = useWebhooks();

// Une data URL invalide (ou une URL distante morte) ne doit pas laisser un
// carré cassé : on bascule sur l'avatar généré une fois pour toutes, et on
// réarme dès que la source change.
const failed = ref<boolean>(false);
watch(() => props.avatarUrl, () => { failed.value = false; });

const src = computed<string>(() => {
    if (props.avatarUrl && !failed.value) return props.avatarUrl;
    return webhookAvatarFallback(props.name);
});

const dotSize = computed<number>(() => Math.max(8, Math.round(props.size * 0.28)));

const onImageError = () => { failed.value = true; };

</script>
