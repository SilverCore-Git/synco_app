<template>
    <div class="rounded-2xl border border-(--text)/10 bg-(--bg2) p-4 text-(--text) max-w-xl">
        <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-bold">{{ title }}</h3>
            <span v-if="progress.failed" class="rounded-full bg-red-500/15 text-red-500 px-2 py-0.5 text-xs font-medium">{{ progress.failed }} échec{{ progress.failed > 1 ? 's' : '' }}</span>
        </div>
        <p v-if="endedAt" class="text-xs text-(--text2)">{{ endedAt }}</p>
        <ul class="mt-3 flex flex-col gap-1.5">
            <li v-for="l in lines" :key="l.n" class="flex items-start gap-2 text-sm">
                <i class="bi mt-0.5 shrink-0" :class="ICON[l.state]" />
                <span class="min-w-0"><span class="break-words" :class="l.state === 'removed' ? 'line-through opacity-60' : ''">{{ l.label }}</span><span v-if="l.reason" class="block text-xs text-(--text2)">{{ l.reason }}</span></span>
            </li>
        </ul>
        <button type="button" class="mt-3 text-sm text-(--primary) underline" @click="emit('review')">Revoir le graphe</button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PlanModel } from './planModel';
import { summaryLines, summaryTitle, type Progress, type ViewState } from './planProgress';

const props = defineProps<{ model: PlanModel; progress: Progress; expired?: boolean; endedAt?: string }>();
const emit = defineEmits<{ (e: 'review'): void }>();

const ICON: Record<ViewState, string> = {
    done: 'bi-check-circle-fill text-emerald-500', failed: 'bi-x-circle-fill text-red-500', skipped: 'bi-slash-circle text-(--text2)',
    unknown_outcome: 'bi-question-circle-fill text-amber-500', removed: 'bi-dash-circle text-(--text2)', pending: 'bi-circle text-(--text2)', executing: 'bi-arrow-repeat text-(--primary)',
};
const title = computed(() => summaryTitle(props.progress, !!props.expired));
const lines = computed(() => summaryLines(props.model, props.progress).map(l => (l.state === 'removed' ? { ...l, reason: 'Retirée par vous' } : l)));
</script>
