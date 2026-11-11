<template>
    <div class="flex flex-col gap-3 min-w-0">
        <div v-if="series.length > 1" class="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span v-for="s in series" :key="s.key" class="inline-flex items-center gap-2 text-(--text2)">
                <span class="w-2.5 h-2.5 rounded-[3px]" :style="{ background: `var(--viz-${s.slot})` }" />
                {{ s.label }}
                <b class="text-(--text) stats-num">{{ format(sum(s.values)) }}</b>
            </span>
        </div>

        <div class="flex gap-2 h-48 min-w-0" role="img" :aria-label="ariaLabel">
            <div class="flex flex-col-reverse justify-between text-[10px] text-(--viz-muted) stats-num text-right w-10 shrink-0 pb-5 -mt-1.5">
                <span v-for="t in scale.ticks" :key="t" class="leading-3">{{ format(t) }}</span>
            </div>

            <div class="relative flex-1 min-w-0">
                <div class="absolute inset-x-0 top-0 bottom-5 flex flex-col-reverse justify-between pointer-events-none">
                    <div v-for="(t, i) in scale.ticks" :key="t" class="h-px" :style="{ background: i === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)' }" />
                </div>

                <div class="absolute inset-x-0 top-0 bottom-5 flex items-end">
                    <div
                        v-for="(bucket, i) in buckets" :key="bucket"
                        class="flex-1 h-full flex items-end justify-center gap-[2px] px-px rounded-md transition-colors cursor-default"
                        :class="hover === i ? 'bg-(--text)/5' : ''"
                        @mouseenter="hover = i"
                        @mouseleave="hover = null"
                    >
                        <div
                            v-for="s in series" :key="s.key"
                            class="flex-1 max-w-6 rounded-t-[4px] transition-[height] duration-500"
                            :style="{ height: barHeight(s.values[i] ?? 0), background: `var(--viz-${s.slot})` }"
                        />
                    </div>
                </div>

                <div class="absolute inset-x-0 bottom-0 h-5 flex">
                    <div v-for="(bucket, i) in buckets" :key="bucket" class="flex-1 relative">
                        <span v-if="labels.has(i) || narrowLabels.has(i)" class="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-(--viz-muted) whitespace-nowrap" :class="axisLabelClass(i)">
                            {{ bucketLabel(bucket, granularity) }}
                        </span>
                    </div>
                </div>

                <div
                    v-if="hover !== null"
                    class="absolute top-0 z-10 pointer-events-none bg-(--bg) border border-(--border-color) rounded-xl px-3 py-2 shadow-xl text-xs min-w-36"
                    :style="tooltipStyle"
                >
                    <div class="font-bold text-(--text) mb-1">{{ bucketLabel(buckets[hover]!, granularity, true) }}</div>
                    <div v-for="s in series" :key="s.key" class="flex items-center gap-2 text-(--text2)">
                        <span class="w-2 h-2 rounded-[2px]" :style="{ background: `var(--viz-${s.slot})` }" />
                        <span class="flex-1">{{ s.label }}</span>
                        <b class="text-(--text) stats-num">{{ format(s.values[hover] ?? 0) }}</b>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { niceScale, labelIndices } from './chartScale';
import { bucketLabel, formatCount } from './statsFormat';
import type { Granularity } from './statsTypes';

export interface ColumnSeries {
    key: string;
    label: string;
    /** Emplacement de la palette (1-8), fixe par entité. */
    slot: number;
    values: number[];
}

const props = withDefaults(defineProps<{
    buckets: string[];
    granularity: Granularity;
    series: ColumnSeries[];
    format?: (n: number) => string;
    ariaLabel?: string;
}>(), { format: formatCount, ariaLabel: 'Histogramme' });

const hover = ref<number | null>(null);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const scale = computed(() => niceScale(Math.max(0, ...props.series.flatMap(s => s.values))));
const labels = computed(() => labelIndices(props.buckets.length));
const narrowLabels = computed(() => labelIndices(props.buckets.length, 4));
// 6 libellés en grand écran, 4 en écran étroit.
const axisLabelClass = (i: number) =>
    labels.value.has(i) && narrowLabels.value.has(i) ? '' : labels.value.has(i) ? 'hidden sm:inline' : 'sm:hidden';

const barHeight = (v: number) => (v <= 0 ? '0' : `max(2px, ${(v / scale.value.max) * 100}%)`);

const tooltipStyle = computed(() => {
    const i = hover.value ?? 0;
    const pos = ((i + 0.5) / props.buckets.length) * 100;
    if (pos > 70) return { right: `${100 - pos}%`, transform: 'translateX(12px)' };
    return { left: `${pos}%`, transform: 'translateX(-12px)' };
});
</script>
