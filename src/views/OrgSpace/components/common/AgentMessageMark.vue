<template>
    <span v-if="view" class="ml-1 inline-flex flex-col align-baseline">
        <span class="inline-flex items-center gap-1 text-[10px] font-medium text-(--primary)/80" :title="view.tooltip">
            <i class="bi bi-stars" />{{ view.label }}
        </span>
        <span
            v-if="view.warning"
            class="mt-0.5 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
            :title="view.detail ?? undefined"
            role="alert"
        >
            <i class="bi bi-exclamation-triangle-fill" />{{ view.warning }}
        </span>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AgentMark } from '@/assets/utils/messageAuth';
import { agentMarkView } from './agentMessageMark';

const props = defineProps<{
    mark?: AgentMark;
    nonce?: string | null;
    authState?: 'legacy' | 'unsigned' | 'verified' | 'invalid';
    senderName?: string | null;
}>();

const view = computed(() => agentMarkView({ mark: props.mark, nonce: props.nonce, authState: props.authState, senderName: props.senderName }));
</script>
