<template>

    <div v-if="view.kind === 'events'" class="flex flex-col gap-3">
        <div v-for="day in view.days" :key="day.day" class="flex flex-col gap-1.5">
            <p class="text-[10px] uppercase font-bold tracking-wider text-(--text)/50 flex items-center gap-1.5">
                <i class="bi bi-calendar3"></i>
                <span class="truncate">{{ day.day }}</span>
            </p>
            <div v-for="row in day.rows" :key="row.id" class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2">
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-(--text) truncate">{{ row.title }}</p>
                    <p class="text-xs text-(--text2) truncate">{{ row.when }}<template v-if="row.place"> · {{ row.place }}</template></p>
                </div>
            </div>
        </div>
        <p v-if="view.days.length === 0" class="text-xs text-(--text2)">Aucun évènement sur cette période.</p>
        <p v-if="view.truncated" class="text-xs text-(--text2)">{{ view.shown }} évènements affichés sur {{ view.total }}. Réduisez la période pour voir le reste.</p>
    </div>

    <div v-else-if="view.kind === 'event'" class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2.5">
        <div class="w-8 h-8 rounded-lg bg-(--primary)/15 flex items-center justify-center shrink-0">
            <i class="bi bi-calendar-event text-(--primary) text-base"></i>
        </div>
        <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-(--text) truncate">{{ view.row.title }}</p>
            <p class="text-xs text-(--text2) truncate">{{ view.row.when }}<template v-if="view.row.place"> · {{ view.row.place }}</template></p>
        </div>
    </div>

    <div v-else-if="view.kind === 'reminders'" class="flex flex-col gap-1.5">
        <div v-for="row in view.rows" :key="row.id" class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2">
            <i class="bi bi-bell text-(--primary)"></i>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-(--text) truncate">{{ row.title }}</p>
                <p class="text-xs text-(--text2) truncate">{{ row.when }} · {{ row.before }}</p>
            </div>
        </div>
        <p v-if="view.rows.length === 0" class="text-xs text-(--text2)">Aucun rappel à venir.</p>
        <p v-if="view.truncated" class="text-xs text-(--text2)">{{ view.rows.length }} rappels affichés sur {{ view.total }}.</p>
    </div>

    <div v-else-if="view.kind === 'grants'" class="flex flex-col gap-1.5">
        <div v-for="row in view.rows" :key="row.id" class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2">
            <i :class="row.direction === 'owner' ? 'bi-box-arrow-up-right' : 'bi-box-arrow-in-down-left'" class="bi text-(--primary)"></i>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-(--text) truncate">{{ row.who }}</p>
                <p class="text-xs text-(--text2) truncate">{{ row.direction === 'owner' ? 'Voit mon agenda' : 'Partage son agenda' }} · {{ row.level }} · {{ row.status }}</p>
            </div>
        </div>
        <p v-if="view.rows.length === 0" class="text-xs text-(--text2)">Aucun partage d'agenda.</p>
        <p v-if="view.truncated" class="text-xs text-(--text2)">Liste tronquée : seuls les partages les plus récents sont affichés.</p>
    </div>

    <div v-else-if="view.kind === 'connections'" class="flex flex-col gap-1.5">
        <div v-for="row in view.rows" :key="row.id" class="flex items-center gap-3 bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2">
            <i class="bi bi-calendar-plus text-(--primary)"></i>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-(--text) truncate">{{ row.label }}</p>
                <p class="text-xs text-(--text2) truncate">{{ row.provider }} · {{ row.status }}<template v-if="row.lastError"> · {{ row.lastError }}</template></p>
            </div>
        </div>
        <p v-if="view.rows.length === 0" class="text-xs text-(--text2)">Aucun agenda externe connecté.</p>
        <p v-if="view.truncated" class="text-xs text-(--text2)">{{ view.rows.length }} agendas affichés sur {{ view.total }}.</p>
    </div>

    <p v-else class="text-xs text-(--text2)">{{ view.text }}</p>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import { buildAgendaView } from './agendaResultModel';

const props = defineProps<{ tool: ToolStep }>();

const view = computed(() => buildAgendaView(props.tool.name, props.tool.result));

</script>
