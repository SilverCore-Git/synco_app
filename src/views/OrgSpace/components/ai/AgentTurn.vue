<template>

    <div class="flex flex-col gap-2">

        <template v-for="(part, i) in parts" :key="i">

            <MarkdownRender v-if="part.type === 'text' && part.text" :content="part.text" />

            <ToolStepItem
                v-else-if="part.type === 'tool'"
                :tool="part.tool"
                :is-last="isLastTool(i)"
                @accept="$emit('accept', part.tool)"
                @reject="$emit('reject', part.tool)"
                @open-task="(t) => $emit('open-task', t)"
                @provide-image="(base64: string) => $emit('provide-image', part.tool, base64)"
            />

        </template>

        <div v-if="parts.length === 0 && isGenerating" class="flex gap-1 py-1">
            <div class="w-1.5 h-1.5 bg-(--text2)/60 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
            <div class="w-1.5 h-1.5 bg-(--text2)/60 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
            <div class="w-1.5 h-1.5 bg-(--text2)/60 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
        </div>

    </div>

</template>

<script setup lang="ts">

import type { TurnPart, ToolStep } from './agentTypes';
import ToolStepItem from './ToolStepItem.vue';
import MarkdownRender from '../../views/MarkdownRender.vue';

const props = defineProps<{ parts: TurnPart[]; isGenerating?: boolean }>();
defineEmits<{
    accept: [tool: ToolStep];
    reject: [tool: ToolStep];
    'open-task': [task: any];
    'provide-image': [tool: ToolStep, base64: string];
}>();

function isLastTool(index: number) {
    for (let j = index + 1; j < props.parts.length; j++) {
        if (props.parts[j].type === 'tool') return false;
    }
    return true;
}

</script>
