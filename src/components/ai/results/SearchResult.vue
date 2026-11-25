<template>

    <div class="flex flex-col gap-2">

    <div v-if="view.kind === 'hits'" class="flex flex-col gap-2">
        <div
            v-for="row in view.rows" :key="row.ref"
            class="flex items-start gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2.5"
        >
            <div class="w-8 h-8 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0">
                <i :class="row.icon" class="text-(--primary) text-base"></i>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-(--text) truncate">{{ row.title }}</p>
                <p v-if="row.snippet" class="text-xs text-(--text2) line-clamp-2 break-words">{{ row.snippet }}</p>
                <p class="text-[10px] uppercase font-bold tracking-wider text-(--text)/50 truncate">
                    {{ row.module }}<template v-if="row.date"> · {{ row.date }}</template>
                </p>
            </div>
        </div>
        <p v-for="note in view.notes" :key="note" class="text-xs text-(--text2)">{{ note }}</p>
        <p v-if="view.truncated" class="text-xs text-(--text2)">Résultats tronqués : affinez la recherche pour voir la suite.</p>
    </div>

    <div v-else-if="view.kind === 'item'" class="flex items-start gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2.5">
        <div class="w-8 h-8 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0">
            <i :class="view.icon" class="text-(--primary) text-base"></i>
        </div>
        <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-(--text) truncate">{{ view.title }}</p>
            <p v-if="view.module" class="text-[10px] uppercase font-bold tracking-wider text-(--text)/50 truncate">{{ view.module }}</p>
            <dl v-if="view.lines.length" class="mt-1 flex flex-col gap-0.5">
                <div v-for="line in view.lines" :key="line.label" class="flex gap-2 text-xs">
                    <dt class="text-(--text2) shrink-0">{{ line.label }}</dt>
                    <dd class="text-(--text) min-w-0 break-words">{{ line.value }}</dd>
                </div>
            </dl>
        </div>
    </div>

    <p v-else class="text-xs text-(--text2)">{{ view.text }}</p>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import { buildSearchView } from './searchResultModel';

const props = defineProps<{ tool: ToolStep }>();

const view = computed(() => buildSearchView(props.tool.name, props.tool.result));

</script>
