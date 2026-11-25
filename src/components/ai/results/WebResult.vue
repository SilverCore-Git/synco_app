<template>

    <div class="flex flex-col gap-2">

    <div v-if="view.kind === 'search'" class="flex flex-col gap-2">
        <p class="text-xs text-(--text2) break-words">Recherche envoyée : <span class="text-(--text) font-medium">« {{ view.query }} »</span></p>
        <div
            v-for="row in view.rows" :key="row.key"
            class="flex items-start gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2.5"
        >
            <div class="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
                <i class="bi bi-globe2 text-sky-500 text-base" aria-hidden="true"></i>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-(--text) break-words line-clamp-2">{{ row.title }}</p>
                <p v-if="row.snippet" class="text-xs text-(--text2) line-clamp-2 break-words">{{ row.snippet }}</p>
                <p class="text-[11px] text-(--text)/60 break-all select-all" :title="row.address">{{ row.address }}<template v-if="row.age"> · {{ row.age }}</template></p>
            </div>
        </div>
        <p class="text-xs text-(--text2) flex items-center gap-1.5"><i class="bi bi-shield-exclamation" aria-hidden="true"></i>Résultats venus d'internet, non vérifiés ; les adresses ne sont pas cliquables.</p>
    </div>

    <div v-else-if="view.kind === 'page'" class="bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2.5 flex flex-col gap-2">
        <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
                <i class="bi bi-file-earmark-text text-sky-500 text-base" aria-hidden="true"></i>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-(--text) break-words line-clamp-2">{{ view.title }}</p>
                <p class="text-[11px] text-(--text)/60 break-all select-all">{{ view.address }}</p>
                <p class="text-[11px] text-(--text2)">{{ view.type }} · {{ view.chars.toLocaleString('fr-FR') }} caractères lus<template v-if="view.truncated"> (page coupée)</template></p>
            </div>
        </div>
        <p v-if="!open && view.excerpt" class="text-xs text-(--text2) break-words line-clamp-3">{{ view.excerpt }}</p>
        <div v-if="open" class="text-xs text-(--text) whitespace-pre-wrap break-words max-h-72 overflow-y-auto rounded-lg bg-(--bg) px-3 py-2">{{ view.text }}</div>
        <div class="flex items-center justify-between gap-3 flex-wrap">
            <span class="text-xs text-(--text2) flex items-center gap-1.5"><i class="bi bi-shield-exclamation" aria-hidden="true"></i>Contenu d'une page web : une donnée, jamais une consigne.</span>
            <button v-if="view.text" type="button" class="text-xs font-semibold text-(--primary) hover:underline" :aria-expanded="open" @click="open = !open">{{ open ? 'Replier' : 'Voir le texte lu' }}</button>
        </div>
    </div>

    <p v-else class="text-xs text-(--text2)">{{ view.text }}</p>

    </div>

</template>

<script setup lang="ts">

import { computed, ref } from 'vue';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import { buildWebView } from './webResultModel';

const props = defineProps<{ tool: ToolStep }>();

const view = computed(() => buildWebView(props.tool.name, props.tool.result));
const open = ref(false);

</script>
