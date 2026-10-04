<template>

    <button
        type="button"
        class="w-full flex items-center gap-3 bg-black/20 border border-(--text)/10 hover:border-(--primary)/40 hover:bg-black/30 rounded-xl px-3 py-2.5 text-left transition-colors group"
    >
        <img v-if="avatarUrl" :src="avatarUrl" class="w-8 h-8 rounded-full object-cover shrink-0" />
        <div v-else-if="logoImage" class="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-black/30">
            <img :src="logoImage" class="w-full h-full object-cover" />
        </div>
        <div v-else class="w-8 h-8 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0">
            <i :class="icon || 'bi-app'" class="text-(--primary) text-base"></i>
        </div>

        <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-(--text) truncate">{{ title }}</p>
            <p v-if="subtitle" class="text-xs text-(--text2) truncate">{{ subtitle }}</p>
        </div>

        <i class="bi bi-chevron-right text-(--text2) opacity-0 group-hover:opacity-100 transition-opacity shrink-0"></i>

    </button>

</template>

<script setup lang="ts">

import { computed } from 'vue';

const props = defineProps<{
    icon?: string;
    avatarUrl?: string;
    logo?: string;
    title: string;
    subtitle?: string;
}>();

const logoImage = computed(() => (props.logo && props.logo.startsWith('data:image') ? props.logo : null));

</script>
