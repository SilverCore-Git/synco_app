<template>

    <div v-if="view.kind === 'messages'" class="flex flex-col gap-1.5">
        <div v-for="row in view.rows" :key="row.id" class="bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2">
            <div class="flex items-center gap-2 text-[11px] text-(--text2)">
                <span class="font-semibold text-(--text) truncate">{{ row.who }}</span>
                <span v-if="row.when">{{ row.when }}</span>
                <span v-if="row.agent" class="inline-flex items-center gap-1 text-(--primary)/80">
                    <i class="bi bi-stars" />{{ row.agent === 'ai' ? 'avec Synco AI' : 'avec Synco AI · mode autonome' }}
                </span>
            </div>
            <p class="mt-0.5 text-sm text-(--text) whitespace-pre-wrap break-words line-clamp-6">{{ row.text }}</p>
            <p v-if="row.warning" class="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <i class="bi bi-exclamation-triangle-fill" />{{ row.warning }}
            </p>
        </div>
        <p v-if="view.truncated" class="text-[11px] text-(--text2)">Liste tronquée : seuls les messages les plus récents sont affichés.</p>
    </div>

    <div v-else-if="view.kind === 'reactions'" class="flex flex-wrap items-center gap-1.5">
        <span
            v-for="chip in view.chips" :key="chip.emoji"
            class="inline-flex items-center gap-1 rounded-full bg-black/20 border border-(--text)/10 px-2 py-0.5 text-sm"
            :title="chip.names"
        >{{ chip.emoji }} <span class="text-xs text-(--text2)">{{ chip.count }}</span></span>
        <span v-if="view.note" class="text-xs text-(--text2)">{{ view.note }}</span>
    </div>

    <div v-else-if="view.kind === 'dms'" class="flex flex-col gap-1.5">
        <div v-for="row in view.rows" :key="row.id" class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2">
            <div class="w-7 h-7 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0"><i class="bi bi-envelope text-(--primary)" /></div>
            <p class="min-w-0 flex-1 text-sm font-medium text-(--text) truncate">{{ row.who }}</p>
            <span class="text-[11px] text-(--text2) shrink-0">{{ row.when }}</span>
        </div>
        <p v-if="view.truncated" class="text-[11px] text-(--text2)">Liste tronquée.</p>
    </div>

    <p v-else class="text-xs text-(--text2)">{{ view.text }}</p>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import { buildMessagesView } from './messagesResultModel';

const props = defineProps<{ tool: ToolStep }>();

const view = computed(() => buildMessagesView(props.tool.name, props.tool.result));

</script>
