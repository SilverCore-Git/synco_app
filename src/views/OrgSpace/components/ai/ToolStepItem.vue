<template>

    <div class="flex gap-3">

        <TimelineGutter :status="tool.status" :is-last="isLast" />

        <div class="flex-1 min-w-0 pb-4">

            <button
                @click="expanded = !expanded"
                class="flex items-center gap-2 text-[13px] group"
                :class="tool.status === 'rejected' || tool.status === 'error' ? 'text-red-400/80' : 'text-(--text2) hover:text-(--text)'"
            >
                <i :class="icon" class="text-sm" />
                <span>{{ label }}</span>
                <div v-if="tool.status === 'executing'" class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
                <i class="bi bi-chevron-down text-[10px] opacity-50 transition-transform group-hover:opacity-100" :class="expanded ? 'rotate-180' : ''" />
            </button>

            <p v-if="(tool.name === 'search_messages' || tool.name === 'search_documentation') && searchQuery" class="text-xs text-(--text2) mt-1">
                "<span class="text-(--text)">{{ searchQuery }}</span>"
            </p>

            <p v-if="tool.name === 'read_documentation' && readDocId" class="text-xs text-(--text2) mt-1">
                Chapitre : <span class="text-(--text)">{{ readDocId }}</span>
            </p>

            <div v-if="tool.status === 'pending' && tool.interactive" class="mt-2">
                <IconSelector model-value="" @on-base64="(base64: string) => $emit('provide-image', base64)" />
            </div>

            <div v-else-if="tool.status === 'pending' && tool.mutating" class="flex gap-2 mt-2">
                <button
                    @click="$emit('accept')"
                    class="bg-green-500/15 text-green-400 border border-green-500/25 px-3 py-1 rounded-lg text-xs font-medium hover:bg-green-500/25 transition-colors"
                >Accepter</button>
                <button
                    @click="$emit('reject')"
                    class="bg-red-500/15 text-red-400 border border-red-500/25 px-3 py-1 rounded-lg text-xs font-medium hover:bg-red-500/25 transition-colors"
                >Refuser</button>
            </div>

            <div v-if="expanded" class="mt-2 pl-3 border-l border-(--text)/10">
                <ToolResultBody :tool="tool" @open-task="(t) => $emit('open-task', t)" />
            </div>

        </div>

    </div>

</template>

<script setup lang="ts">

import { ref, computed } from 'vue';
import type { ToolStep } from './agentTypes';
import { toolLabel } from './agentTypes';
import ToolResultBody from './ToolResultBody.vue';
import TimelineGutter from './TimelineGutter.vue';
import IconSelector from '@/components/common/IconSelector.vue';

const props = defineProps<{ tool: ToolStep; isLast?: boolean }>();
defineEmits(['accept', 'reject', 'open-task', 'provide-image']);

// Les tools de lecture (non mutants) affichent directement leur résultat — c'est ce que
// l'utilisateur a demandé. Les tools mutants restent repliés : leur confirmation textuelle suffit.
const expanded = ref(!props.tool.mutating);

const { label, icon } = toolLabel(props.tool.name);

function parsedArgs(): any {
    try {
        return typeof props.tool.args === 'string' ? JSON.parse(props.tool.args) : props.tool.args;
    } catch {
        return null;
    }
}

const searchQuery = computed(() => parsedArgs()?.query || '');
const readDocId = computed(() => parsedArgs()?.docId || '');

</script>
