<template>
    <div class="flex gap-2 h-44 min-w-0" role="img" :aria-label="ariaLabel">
        <div class="flex flex-col-reverse justify-between text-[10px] text-(--viz-muted) stats-num text-right w-12 shrink-0 pb-5 -mt-1.5">
            <span v-for="t in scale.ticks" :key="t" class="leading-3">{{ format(t) }}</span>
        </div>

        <div class="relative flex-1 min-w-0">
            <div class="absolute inset-x-0 top-0 bottom-5 flex flex-col-reverse justify-between pointer-events-none">
                <div v-for="(t, i) in scale.ticks" :key="t" class="h-px" :style="{ background: i === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)' }" />
            </div>

            <div class="absolute inset-x-0 top-0 bottom-5">
                <svg class="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path :d="areaPath" :style="{ fill: `var(--viz-${slot})`, opacity: 0.1 }" />
                    <polyline
                        :points="points"
                        fill="none"
                        :style="{ stroke: `var(--viz-${slot})` }"
                        stroke-width="2"
                        stroke-linejoin="round"
                        stroke-linecap="round"
                        vector-effect="non-scaling-stroke"
                    />
                </svg>

                <!-- Point final, puis repère de survol (HTML : reste rond quel que soit le ratio) -->
                <div
                    v-if="values.length"
                    class="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 translate-y-1/2 ring-2 ring-(--bg2)"
                    :style="{ left: `${x(values.length - 1)}%`, bottom: `${y(values[values.length - 1]!)}%`, background: `var(--viz-${slot})` }"
                />
                <template v-if="hover !== null">
                    <div class="absolute top-0 bottom-0 w-px bg-(--text)/20 pointer-events-none" :style="{ left: `${x(hover)}%` }" />
                    <div
                        class="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 translate-y-1/2 ring-2 ring-(--bg2) pointer-events-none"
                        :style="{ left: `${x(hover)}%`, bottom: `${y(values[hover] ?? 0)}%`, background: `var(--viz-${slot})` }"
                    />
                </template>

                <div class="absolute inset-0 flex">
                    <div v-for="(_, i) in values" :key="i" class="flex-1" @mouseenter="hover = i" @mouseleave="hover = null" />
                </div>
            </div>

            <div class="absolute inset-x-0 bottom-0 h-5">
                <span
                    v-for="i in [...new Set([...labels, ...narrowLabels])]" :key="i"
                    class="absolute top-1 -translate-x-1/2 text-[10px] text-(--viz-muted) whitespace-nowrap"
                    :class="labels.has(i) && narrowLabels.has(i) ? '' : labels.has(i) ? 'hidden sm:inline' : 'sm:hidden'"
                    :style="{ left: `${x(i)}%` }"
                >
                    {{ bucketLabel(buckets[i]!, granularity) }}
                </span>
            </div>

            <div
                v-if="hover !== null"
                class="absolute top-0 z-10 pointer-events-none bg-(--bg) border border-(--border-color) rounded-xl px-3 py-2 shadow-xl text-xs whitespace-nowrap"
                :style="x(hover) > 70 ? { right: `${100 - x(hover)}%`, marginRight: '10px' } : { left: `${x(hover)}%`, marginLeft: '10px' }"
            >
                <div class="font-bold text-(--text)">{{ bucketLabel(buckets[hover]!, granularity, true) }}</div>
                <div class="text-(--text2)">{{ label }} : <b class="text-(--text) stats-num">{{ format(values[hover] ?? 0) }}</b></div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { niceScale, labelIndices } from './chartScale';
import { bucketLabel, formatCount } from './statsFormat';
import type { Granularity } from './statsTypes';

const props = withDefaults(defineProps<{
    buckets: string[];
    granularity: Granularity;
    values: number[];
    label: string;
    slot?: number;
    format?: (n: number) => string;
    ariaLabel?: string;
}>(), { slot: 1, format: formatCount, ariaLabel: 'Courbe' });

const hover = ref<number | null>(null);
const scale = computed(() => niceScale(Math.max(0, ...props.values)));
const labels = computed(() => labelIndices(props.values.length));
const narrowLabels = computed(() => labelIndices(props.values.length, 4));

const x = (i: number) => (props.values.length <= 1 ? 50 : (i / (props.values.length - 1)) * 100);
const y = (v: number) => (v / scale.value.max) * 100;

const points = computed(() => props.values.map((v, i) => `${x(i)},${100 - y(v)}`).join(' '));
const areaPath = computed(() => {
    if (!props.values.length) return '';
    return `M ${x(0)},100 L ${points.value.replace(/ /g, ' L ')} L ${x(props.values.length - 1)},100 Z`;
});
</script>
