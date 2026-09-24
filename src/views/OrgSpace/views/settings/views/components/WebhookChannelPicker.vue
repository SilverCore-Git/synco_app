<template>

    <div class="rounded-xl border border-(--border-color) bg-(--bg) overflow-hidden">

        <!-- Recherche : affichée seulement quand la liste est assez longue pour
             qu'on ait besoin de filtrer (un workspace peut avoir des dizaines
             de salons, mais en afficher une barre pour trois serait du bruit). -->
        <div v-if="channels.length > 6" class="relative border-b border-(--border-color)">
            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-(--text2)" />
            <input
                v-model="query"
                type="search"
                placeholder="Rechercher un salon..."
                class="w-full bg-transparent pl-8 pr-3 py-2.5 text-sm text-(--text) outline-none placeholder-(--text2)/60"
            />
        </div>

        <div v-if="loading" class="px-4 py-6 flex items-center justify-center gap-3 text-sm text-(--text2)">
            <span class="w-4 h-4 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
            Chargement des salons...
        </div>

        <div v-else-if="channels.length === 0" class="px-4 py-6 text-center text-sm text-(--text2)">
            Aucun salon textuel dans ce workspace.
        </div>

        <div v-else-if="filtered.length === 0" class="px-4 py-6 text-center text-sm text-(--text2)">
            Aucun salon ne correspond à « {{ query }} ».
        </div>

        <div v-else class="max-h-52 overflow-y-auto p-1.5 flex flex-col gap-0.5">
            <button
                v-for="channel in filtered"
                :key="channel.id"
                type="button"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors"
                :class="channel.id === modelValue
                    ? 'bg-(--primary)/10 text-(--primary) font-semibold'
                    : 'text-(--text) hover:bg-(--text)/5'"
                @click="emit('update:modelValue', channel.id)"
            >
                <i class="bi bi-hash text-(--text2) shrink-0" :class="channel.id === modelValue ? 'text-(--primary)' : ''" />
                <span class="truncate">{{ channel.name }}</span>
                <i v-if="channel.id === modelValue" class="bi bi-check-lg ml-auto shrink-0" />
            </button>
        </div>

    </div>

</template>

<script lang="ts" setup>

import { computed, ref } from 'vue';
import type { WebhookTargetChannel } from '@/types/webhooks';

const props = defineProps<{
    modelValue: string;
    channels: WebhookTargetChannel[];
    loading?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();

const query = ref<string>('');

const filtered = computed<WebhookTargetChannel[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return props.channels;
    return props.channels.filter(c => c.name.toLowerCase().includes(q));
});

</script>
