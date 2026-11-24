<template>

    <div class="flex flex-col gap-2">

    <div v-if="view.kind === 'files'" class="flex flex-col gap-2">
        <div
            v-for="row in view.rows" :key="row.id"
            class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2.5"
        >
            <div class="w-8 h-8 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0">
                <i :class="row.icon" class="text-(--primary) text-base"></i>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-(--text) truncate">{{ row.name }}</p>
                <p v-if="row.detail" class="text-xs text-(--text2) truncate">{{ row.detail }}</p>
            </div>
        </div>
        <p v-if="view.total !== undefined && view.total > view.rows.length" class="text-xs text-(--text2)">{{ view.rows.length }} sur {{ view.total }} fichiers.</p>
    </div>

    <div v-else-if="view.kind === 'folders'" class="flex flex-col gap-2">
        <div
            v-for="row in view.rows" :key="row.id"
            class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2.5"
        >
            <div class="w-8 h-8 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0">
                <i class="bi bi-folder text-(--primary) text-base"></i>
            </div>
            <p class="text-sm font-medium text-(--text) truncate min-w-0 flex-1">{{ row.name }}</p>
        </div>
    </div>

    <div v-else-if="view.kind === 'references'" class="flex flex-col gap-1.5">
        <p class="text-xs text-(--text2)">
            <span class="font-medium text-(--text)">{{ view.file }}</span>
            : cité dans {{ view.messageCount }} message{{ view.messageCount > 1 ? 's' : '' }} de salon<template v-if="view.directMessageCount"> et {{ view.directMessageCount }} message{{ view.directMessageCount > 1 ? 's' : '' }} privé{{ view.directMessageCount > 1 ? 's' : '' }}</template>.
        </p>
        <p v-for="t in view.threads" :key="t.id" class="text-xs text-(--text2) flex items-center gap-1.5">
            <i class="bi bi-hash"></i><span class="truncate">{{ t.name }}</span>
        </p>
    </div>

    <div v-else-if="view.kind === 'content'" class="flex flex-col gap-1.5">
        <p class="text-xs text-(--text2) flex items-center gap-1.5">
            <i class="bi bi-file-earmark-text"></i>
            <span class="truncate">{{ view.name }}</span>
            <span class="opacity-60 shrink-0">{{ view.length }} caractères</span>
        </p>
        <pre class="text-xs text-(--text) bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2 whitespace-pre-wrap break-words max-h-40 overflow-auto">{{ view.excerpt }}</pre>
    </div>

    <p v-else class="text-xs text-(--text2)">{{ view.text }}</p>

    <p v-if="truncated" class="text-xs text-(--text2)">Résultat tronqué : affinez la demande pour voir la suite.</p>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import { buildFilesView, isTruncated } from './filesResultModel';
import { rememberFileNames } from '../summaries/fileNames';

const props = defineProps<{ tool: ToolStep }>();

// Les cartes de confirmation suivantes montrent le nom plutôt que l'identifiant.
rememberFileNames(props.tool.name, props.tool.result);
const view = computed(() => buildFilesView(props.tool.name, props.tool.result));
const truncated = computed(() => isTruncated(props.tool.result));

</script>
