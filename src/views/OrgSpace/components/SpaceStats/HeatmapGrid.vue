<template>
    <div class="flex flex-col gap-2 min-w-0">
        <div class="overflow-x-auto overflow-y-hidden py-1">
            <div class="grid gap-[2px] min-w-[520px]" style="grid-template-columns: 2.5rem repeat(24, minmax(0, 1fr));" role="img" :aria-label="ariaLabel">
                <template v-for="(row, d) in grid" :key="d">
                    <span class="text-[10px] text-(--viz-muted) self-center">{{ WEEKDAYS[d] }}</span>
                    <div
                        v-for="(v, h) in row" :key="h"
                        class="h-4 sm:h-5 rounded-[3px] transition-transform hover:scale-110"
                        :style="{ background: v ? `rgba(var(--viz-heat-rgb), ${0.15 + 0.85 * (v / max)})` : 'var(--viz-heat-0)' }"
                        :title="`${WEEKDAYS[d]} ${h} h – ${h + 1} h : ${v} ${unit}`"
                    />
                </template>
                <span />
                <span v-for="h in 24" :key="'h' + h" class="text-[9px] text-(--viz-muted) text-center">{{ (h - 1) % 3 === 0 ? h - 1 : '' }}</span>
            </div>
        </div>
        <div class="flex items-center gap-2 text-[10px] text-(--viz-muted) self-end">
            Moins
            <span v-for="s in [0, 0.25, 0.5, 0.75, 1]" :key="s" class="w-3 h-3 rounded-[3px]" :style="{ background: s ? `rgba(var(--viz-heat-rgb), ${0.15 + 0.85 * s})` : 'var(--viz-heat-0)' }" />
            Plus
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { WEEKDAYS } from './statsFormat';

const props = withDefaults(defineProps<{
    grid: number[][];
    unit?: string;
    ariaLabel?: string;
}>(), { unit: 'tâches', ariaLabel: 'Activité par jour et par heure' });

const max = computed(() => Math.max(1, ...props.grid.flat()));
</script>
