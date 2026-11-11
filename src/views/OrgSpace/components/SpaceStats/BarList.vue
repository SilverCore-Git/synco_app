<template>
    <ul class="flex flex-col gap-2.5 min-w-0">
        <li v-for="row in rows" :key="row.key" class="flex flex-col gap-1 min-w-0" :title="row.title">
            <div class="flex items-center gap-2 text-xs min-w-0">
                <slot name="label" :row="row">
                    <span class="text-(--text) truncate">{{ row.label }}</span>
                </slot>
                <span class="ml-auto font-bold text-(--text) stats-num shrink-0">{{ format(row.value) }}</span>
                <span v-if="row.extra" class="text-(--text2) stats-num shrink-0">{{ row.extra }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-(--text)/5 overflow-hidden">
                <div
                    class="h-full rounded-full transition-[width] duration-500"
                    :style="{ width: `${max ? (row.value / max) * 100 : 0}%`, background: `var(--viz-${row.slot ?? slot})` }"
                />
            </div>
        </li>
        <li v-if="rows.length === 0" class="text-xs text-(--text2) italic text-center py-4">{{ empty }}</li>
    </ul>
</template>

<script setup lang="ts" generic="R extends BarRow">
import { computed } from 'vue';
import { formatCount } from './statsFormat';

export interface BarRow {
    key: string;
    label: string;
    value: number;
    extra?: string;
    title?: string;
    slot?: number;
}

const props = withDefaults(defineProps<{
    rows: R[];
    format?: (n: number) => string;
    slot?: number;
    empty?: string;
}>(), { format: formatCount, slot: 1, empty: 'Aucune donnée' });

defineSlots<{ label(props: { row: R }): unknown }>();

const max = computed(() => Math.max(0, ...props.rows.map(r => r.value)));
</script>
