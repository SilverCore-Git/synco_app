<template>

    <div v-if="view.kind === 'cards'" class="flex flex-col gap-2">
        <div
            v-for="card in view.cards" :key="card.id"
            class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2.5"
        >
            <div class="w-8 h-8 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0">
                <i :class="card.icon" class="text-(--primary) text-base"></i>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-(--text) truncate">{{ card.title }}</p>
                <p v-if="card.subtitle" class="text-xs text-(--text2) truncate">{{ card.subtitle }}</p>
            </div>
        </div>
    </div>

    <dl v-else-if="view.kind === 'stats'" class="grid grid-cols-2 gap-2">
        <div v-for="row in view.rows" :key="row.label" class="bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2">
            <dt class="text-[10px] uppercase font-bold tracking-wider text-(--text)/50 truncate">{{ row.label }}</dt>
            <dd class="text-sm font-medium text-(--text)">{{ row.value }}</dd>
        </div>
    </dl>

    <p v-else class="text-xs text-(--text2)">{{ view.text }}</p>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import { buildSpacesView } from './spacesResultModel';

const props = defineProps<{ tool: ToolStep }>();

const view = computed(() => buildSpacesView(props.tool.name, props.tool.result));

</script>
