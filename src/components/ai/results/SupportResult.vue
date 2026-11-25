<template>

    <div v-if="view.kind === 'tickets'" class="flex flex-col gap-1.5">
        <div v-for="row in view.rows" :key="row.id" class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2">
            <div class="w-7 h-7 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0"><i class="bi bi-life-preserver text-(--primary)" /></div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-(--text) truncate">Demande {{ row.number !== null ? `n° ${row.number}` : '' }}</p>
                <p class="text-[11px] text-(--text2) truncate">
                    {{ row.status }}<template v-if="row.who"> · pris en charge par {{ row.who }}</template>
                </p>
            </div>
            <span class="text-[11px] text-(--text2) shrink-0">{{ row.when }}</span>
        </div>
        <p v-if="view.truncated" class="text-[11px] text-(--text2)">Liste tronquée : seules les demandes les plus récentes sont affichées.</p>
    </div>

    <div v-else-if="view.kind === 'ticket'" class="flex flex-col gap-1.5">
        <div class="px-1">
            <p class="text-sm font-semibold text-(--text) break-words">
                {{ view.head.title || `Demande ${view.head.number !== null ? `n° ${view.head.number}` : ''}` }}
            </p>
            <p class="text-[11px] text-(--text2)">
                {{ view.head.status }}<template v-if="view.head.who"> · pris en charge par {{ view.head.who }}</template>
            </p>
        </div>
        <div
            v-for="row in view.rows" :key="row.id"
            class="border rounded-xl px-3 py-2"
            :class="row.from === 'team' ? 'bg-(--primary)/5 border-(--primary)/20' : 'bg-black/20 border-(--text)/10'"
        >
            <div class="flex items-center gap-2 text-[11px] text-(--text2)">
                <span class="font-semibold text-(--text) truncate">{{ row.who }}</span>
                <span v-if="row.when">{{ row.when }}</span>
                <span v-if="row.from === 'team'" class="inline-flex items-center gap-1 text-(--primary)/80"><i class="bi bi-life-preserver" />Équipe Synco</span>
            </div>
            <p class="mt-0.5 text-sm text-(--text) whitespace-pre-wrap break-words line-clamp-6">{{ row.text }}</p>
        </div>
        <p v-if="!view.rows.length" class="text-xs text-(--text2)">Aucun échange.</p>
        <p v-if="view.truncated || view.hasMore" class="text-[11px] text-(--text2)">Seuls les échanges les plus récents sont affichés.</p>
    </div>

    <p v-else class="text-xs text-(--text2)">{{ view.text }}</p>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import { buildSupportView } from './supportResultModel';

const props = defineProps<{ tool: ToolStep }>();

const view = computed(() => buildSupportView(props.tool.name, props.tool.result));

</script>
