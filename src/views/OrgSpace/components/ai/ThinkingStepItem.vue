<template>

    <div class="flex gap-3">

        <TimelineGutter status="thinking" :is-last="isLast" />

        <div class="flex-1 min-w-0 pb-4">

            <button
                @click="expanded = !expanded"
                class="flex items-center gap-2 text-[13px] text-(--text2) hover:text-(--text) transition-colors group"
            >
                <i class="bi bi-lightbulb text-sm" />
                <span>{{ label }}</span>
                <i class="bi bi-chevron-down text-[10px] opacity-50 transition-transform group-hover:opacity-100" :class="expanded ? 'rotate-180' : ''" />
            </button>

            <div v-if="expanded" class="mt-2 pl-3 border-l border-(--text)/10 text-xs text-(--text2) whitespace-pre-wrap break-words">
                {{ part.text }}
            </div>

        </div>

    </div>

</template>

<script setup lang="ts">

import { ref, computed } from 'vue';
import type { TurnPart } from './agentTypes';
import TimelineGutter from './TimelineGutter.vue';

const props = defineProps<{ part: Extract<TurnPart, { type: 'thinking' }>; isLast?: boolean }>();

// Replié par défaut, façon Claude Code : le raisonnement brut est rarement ce que l'utilisateur
// veut lire en premier, contrairement à un résultat d'outil qui répond directement à sa question.
const expanded = ref(false);

const label = computed(() => {
    if (!props.part.durationMs) return 'Réflexion';
    const seconds = Math.max(1, Math.round(props.part.durationMs / 1000));
    return `Réflexion (${seconds}s)`;
});

</script>
