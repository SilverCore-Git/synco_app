<template>

    <div class="flex flex-col gap-2">

        <template v-for="(part, i) in parts" :key="i">

            <div v-if="part.type === 'text' && part.text" class="flex gap-3">
                <TimelineGutter status="text" :is-last="isLastPart(i)" />
                <MarkdownRender :content="part.text" class="flex-1 min-w-0 pb-4" />
            </div>

            <ToolStepItem
                v-else-if="part.type === 'tool'"
                :tool="part.tool"
                :is-last="isLastPart(i)"
                @accept="$emit('accept', part.tool)"
                @reject="$emit('reject', part.tool)"
                @open-task="(t) => $emit('open-task', t)"
                @provide-image="(base64: string) => $emit('provide-image', part.tool, base64)"
            />

            <ThinkingStepItem
                v-else-if="part.type === 'thinking'"
                :part="part"
                :is-last="isLastPart(i)"
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
import ThinkingStepItem from './ThinkingStepItem.vue';
import TimelineGutter from './TimelineGutter.vue';
import MarkdownRender from '../../views/MarkdownRender.vue';

const props = defineProps<{ parts: TurnPart[]; isGenerating?: boolean }>();
defineEmits<{
    accept: [tool: ToolStep];
    reject: [tool: ToolStep];
    'open-task': [task: any];
    'provide-image': [tool: ToolStep, base64: string];
}>();

// Chaque part (texte, tool, thinking) a désormais son propre point dans la timeline, donc "dernier"
// se résume à "dernier élément du tableau" — plus besoin de ne regarder que les parts de type tool.
function isLastPart(index: number) {
    return index === props.parts.length - 1;
}

</script>
