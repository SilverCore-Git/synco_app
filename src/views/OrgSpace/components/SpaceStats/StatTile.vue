<template>
    <div class="relative overflow-hidden bg-(--bg2) border border-(--border-color) rounded-2xl p-4 flex flex-col gap-1 min-w-0 group hover:border-(--primary)/40 transition-colors">
        <div class="flex items-center gap-2 text-(--text2) text-xs font-bold min-w-0">
            <span
                class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                :class="tone === 'critical' ? 'bg-red-500/15 text-red-400' : tone === 'warning' ? 'bg-amber-500/15 text-amber-400' : 'bg-(--primary)/15 text-(--primary)'"
            >
                <i class="bi" :class="icon" />
            </span>
            <span class="truncate">{{ label }}</span>
        </div>
        <div class="text-2xl sm:text-3xl font-black text-(--text) leading-tight mt-1 truncate">{{ value }}</div>
        <div v-if="deltaRatio !== undefined || hint" class="flex items-center gap-2 text-[11px] min-w-0">
            <span
                v-if="deltaRatio !== undefined && deltaRatio !== null"
                class="font-bold inline-flex items-center gap-0.5 shrink-0"
                :style="{ color: deltaColor }"
                :title="`Par rapport à la période précédente`"
            >
                <i class="bi" :class="deltaRatio > 0 ? 'bi-arrow-up-short' : deltaRatio < 0 ? 'bi-arrow-down-short' : 'bi-dash'" />
                {{ Math.abs(Math.round(deltaRatio * 100)) }} %
            </span>
            <span v-else-if="deltaRatio === null" class="font-bold text-(--text2) shrink-0" title="Rien sur la période précédente">nouveau</span>
            <span v-if="hint" class="text-(--text2) truncate">{{ hint }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    label: string;
    value: string;
    icon: string;
    hint?: string;
    /** Écart relatif vs période précédente (undefined = pas affiché). */
    deltaRatio?: number | null;
    /** Une hausse est-elle une bonne nouvelle ? */
    upIsGood?: boolean;
    tone?: 'default' | 'warning' | 'critical';
}>(), { upIsGood: true, tone: 'default', hint: undefined, deltaRatio: undefined });

const deltaColor = computed(() => {
    const d = props.deltaRatio ?? 0;
    if (d === 0) return 'var(--text2)';
    const good = (d > 0) === props.upIsGood;
    return good ? 'var(--viz-up-good)' : 'var(--viz-critical)';
});
</script>
