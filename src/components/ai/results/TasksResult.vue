<template>

    <div class="flex flex-col gap-2">

    <div v-if="view.kind === 'groups'" class="flex flex-col gap-3">
        <div v-for="group in view.groups" :key="group.id ?? 'unlisted'" class="flex flex-col gap-2">
            <p class="text-[10px] uppercase font-bold tracking-wider text-(--text)/50 flex items-center gap-1.5">
                <i class="bi bi-list-task"></i>
                <span class="truncate">{{ group.title }}</span>
                <span class="opacity-60">{{ group.rows.length }}</span>
            </p>
            <EntityRow
                v-for="row in group.rows" :key="row.id"
                :icon="statusIconOf(row.status)"
                :title="row.title"
                :subtitle="row.subtitle"
                @click="$emit('open-task', row.task)"
            />
            <p v-if="group.rows.length === 0" class="text-xs text-(--text2)">Liste vide.</p>
        </div>
    </div>

    <div v-else-if="view.kind === 'tasks'" class="flex flex-col gap-2">
        <EntityRow
            v-for="row in view.rows" :key="row.id"
            :icon="statusIconOf(row.status)"
            :title="row.title"
            :subtitle="row.subtitle"
            @click="$emit('open-task', row.task)"
        />
    </div>

    <div v-else-if="view.kind === 'list'" class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2.5">
        <div class="w-8 h-8 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0">
            <i class="bi bi-list-task text-(--primary) text-base"></i>
        </div>
        <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-(--text) truncate">{{ view.title }}</p>
            <p v-if="view.subtitle" class="text-xs text-(--text2) truncate">{{ view.subtitle }}</p>
        </div>
    </div>

    <div v-else-if="view.kind === 'tags'" class="flex flex-wrap gap-1.5">
        <span
            v-for="tag in view.tags" :key="tag.id"
            class="inline-flex items-center gap-1.5 text-xs text-(--text) bg-black/20 border border-(--text)/10 rounded-full px-2.5 py-1"
        >
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: tag.color }"></span>
            <span class="truncate max-w-48">{{ tag.name }}</span>
        </span>
    </div>

    <p v-else-if="view.kind === 'file'" class="text-xs text-(--text2) flex items-center gap-1.5">
        <i class="bi bi-paperclip"></i>
        <span class="truncate">{{ view.name }}</span>
    </p>

    <p v-else class="text-xs text-(--text2)">{{ view.text }}</p>

    <p v-if="truncated" class="text-xs text-(--text2)">Résultat tronqué : affinez la demande pour voir la suite.</p>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import EntityRow from '@/views/OrgSpace/components/ai/EntityRow.vue';
import { buildTasksView, isTruncated, statusIconOf } from './tasksResultModel';

const props = defineProps<{ tool: ToolStep }>();
defineEmits<{ (e: 'open-task', task: unknown): void }>();

const view = computed(() => buildTasksView(props.tool.name, props.tool.result));
const truncated = computed(() => isTruncated(props.tool.result));

</script>
