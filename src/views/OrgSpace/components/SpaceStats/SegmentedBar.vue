<template>
    <div class="flex flex-col gap-3 min-w-0">
        <div class="flex h-3 w-full gap-[2px] rounded-full overflow-hidden bg-(--text)/5" role="img" :aria-label="ariaLabel">
            <div
                v-for="p in visible" :key="p.key"
                class="h-full transition-[width] duration-500 first:rounded-l-full last:rounded-r-full"
                :style="{ width: `${(p.value / total) * 100}%`, background: `var(--viz-${p.slot})` }"
                :title="`${p.label} : ${format(p.value)} (${pct(p.value)})`"
            />
        </div>
        <ul class="grid gap-x-5 gap-y-1.5" :class="columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'">
            <li v-for="p in parts" :key="p.key" class="flex items-center gap-2 text-xs min-w-0">
                <span class="w-2.5 h-2.5 rounded-[3px] shrink-0" :style="{ background: `var(--viz-${p.slot})` }" />
                <i v-if="p.icon" class="bi text-(--text2)" :class="p.icon" />
                <span class="text-(--text2) truncate">{{ p.label }}</span>
                <span class="ml-auto text-(--text) font-bold stats-num shrink-0">{{ format(p.value) }}</span>
                <span class="text-(--text2) stats-num w-10 text-right shrink-0">{{ pct(p.value) }}</span>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatCount } from './statsFormat';

export interface Part {
    key: string;
    label: string;
    value: number;
    slot: number;
    icon?: string;
}

const props = withDefaults(defineProps<{
    parts: Part[];
    format?: (n: number) => string;
    columns?: 1 | 2;
    ariaLabel?: string;
}>(), { format: formatCount, columns: 1, ariaLabel: 'Répartition' });

const total = computed(() => props.parts.reduce((a, p) => a + p.value, 0) || 1);
const visible = computed(() => props.parts.filter(p => p.value > 0));
const pct = (v: number) => `${Math.round((v / total.value) * 100)} %`;
</script>
