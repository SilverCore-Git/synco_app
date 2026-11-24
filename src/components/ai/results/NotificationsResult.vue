<template>

    <div class="flex flex-col gap-2">

    <template v-if="view.kind === 'list'">
        <p v-if="view.unreadCount !== undefined" class="text-[10px] uppercase font-bold tracking-wider text-(--text)/50">
            {{ view.unreadCount }} non lue{{ view.unreadCount > 1 ? 's' : '' }}
        </p>
        <EntityRow
            v-for="row in view.rows" :key="row.id"
            :icon="row.icon"
            :title="row.title"
            :subtitle="row.body"
        />
    </template>

    <p v-else class="text-xs text-(--text2)">{{ view.text }}</p>

    <p v-if="truncated" class="text-xs text-(--text2)">Résultat tronqué : affinez la demande pour voir la suite.</p>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import EntityRow from '@/views/OrgSpace/components/ai/EntityRow.vue';
import { buildNotificationsView, isTruncated } from './notificationsResultModel';

const props = defineProps<{ tool: ToolStep }>();

const view = computed(() => buildNotificationsView(props.tool.name, props.tool.result));
const truncated = computed(() => isTruncated(props.tool.result));

</script>
