<template>

    <div class="flex flex-col items-center w-4 shrink-0 pt-1.5">
        <div class="w-2 h-2 rounded-full shrink-0" :class="dotClass" />
        <div v-if="!isLast" class="w-px flex-1 mt-1" :class="lineClass" />
    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { TimelineDotStatus } from './agentTypes';

const props = defineProps<{ status: TimelineDotStatus; isLast?: boolean }>();

const dotClass = computed(() => {
    switch (props.status) {
        case 'done': return 'bg-(--primary)';
        case 'text': return 'bg-(--text2)/50';
        case 'thinking': return 'bg-violet-400/70';
        case 'error': return 'bg-red-400';
        case 'rejected': return 'bg-(--text2)';
        case 'executing': return 'bg-(--primary) animate-pulse';
        default: return 'bg-(--text2)/40 ring-1 ring-(--text2)/40';
    }
});

// 'done'/'text' partagent la même teinte de ligne : un segment de texte déjà rendu est, par
// nature, toujours "terminé" — il n'a pas d'état intermédiaire comme un tool (pending/executing).
const lineClass = computed(() => (props.status === 'done' || props.status === 'text' ? 'bg-(--primary)/25' : 'bg-(--text)/10'));

</script>
