<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full">
        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0 flex-wrap gap-y-2 py-2">
            <div class="flex items-center gap-3">
                <MobileBackBtn />
                <i class="bi bi-calendar3 text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Agenda</h3>
            </div>

            <div class="flex items-center gap-2">
                <button @click="goToday" class="default !text-xs !px-3 !py-1.5">Aujourd'hui</button>
                <button @click="goPrev" class="default !text-xs !px-2 !py-1.5"><i class="bi bi-chevron-left"></i></button>
                <button @click="goNext" class="default !text-xs !px-2 !py-1.5"><i class="bi bi-chevron-right"></i></button>
                <span class="text-sm font-bold text-(--text) capitalize px-2 whitespace-nowrap">{{ periodLabel }}</span>
            </div>

            <div class="ml-auto flex items-center gap-3 flex-wrap">
                <div class="flex items-center gap-1 bg-(--bg) border border-(--border-color) rounded-xl p-1">
                    <button
                        v-for="v in views"
                        :key="v.id"
                        @click="viewMode = v.id"
                        class="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                        :class="viewMode === v.id ? 'bg-(--primary) text-white' : 'text-(--text2) hover:text-(--text)'"
                    >
                        {{ v.label }}
                    </button>
                </div>

                <button @click="openCreateModal(new Date())" class="primary-glow !text-sm">
                    <i class="bi bi-plus-lg"></i>
                    Nouvel événement
                </button>
            </div>
        </div>

        <main class="flex-1 overflow-hidden w-full h-full">
            <div v-if="loading && occurrences.length === 0" class="w-full h-full flex items-center justify-center">
                <div class="w-8 h-8 border-4 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin"></div>
            </div>

            <MonthGrid
                v-else-if="viewMode === 'month'"
                :cursor-date="cursorDate"
                :occurrences="occurrences"
                @open-event="openEditModal"
                @create="openCreateModal"
                @select-day="goToDay"
            />
            <WeekGrid
                v-else-if="viewMode === 'week'"
                :cursor-date="cursorDate"
                :occurrences="occurrences"
                @open-event="openEditModal"
                @create="openCreateModal"
            />
            <DayGrid
                v-else
                :cursor-date="cursorDate"
                :occurrences="occurrences"
                @open-event="openEditModal"
                @create="openCreateModal"
            />
        </main>

        <EventModal
            :show="showModal"
            :org-id="orgId"
            :occurrence="selectedOccurrence"
            :initial-date="createInitialDate"
            @close="showModal = false"
            @saved="refetch"
            @deleted="refetch"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import MonthGrid from './components/MonthGrid.vue';
import WeekGrid from './components/WeekGrid.vue';
import DayGrid from './components/DayGrid.vue';
import EventModal from './components/EventModal.vue';
import { useAgenda } from '@/composables/useAgenda';
import useWSocket from '@/composables/useWSocket';
import type { OccurrenceInstance } from '@/types/agenda';

const route = useRoute();
const orgId = computed(() => route.params.orgId as string);

const { occurrences, loading, viewingUserId, fetchRange } = useAgenda();

type ViewMode = 'month' | 'week' | 'day';
const viewMode = ref<ViewMode>('month');
const cursorDate = ref<Date>(new Date());

const views: { id: ViewMode; label: string }[] = [
    { id: 'month', label: 'Mois' },
    { id: 'week', label: 'Semaine' },
    { id: 'day', label: 'Jour' }
];

function startOfWeek(d: Date): Date {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; // 0 = Lundi
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
}

const periodLabel = computed(() => {
    if (viewMode.value === 'month') {
        return cursorDate.value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
    if (viewMode.value === 'week') {
        const start = startOfWeek(cursorDate.value);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const startLabel = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        const endLabel = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
        return `${startLabel} - ${endLabel}`;
    }
    return cursorDate.value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
});

function computeRangeISO(): { from: string; to: string } {
    if (viewMode.value === 'month') {
        const monthStart = new Date(cursorDate.value.getFullYear(), cursorDate.value.getMonth(), 1);
        const monthEnd = new Date(cursorDate.value.getFullYear(), cursorDate.value.getMonth() + 1, 0);
        const gridStart = startOfWeek(monthStart);
        const gridEnd = new Date(monthEnd);
        const endOffset = (gridEnd.getDay() + 6) % 7;
        gridEnd.setDate(gridEnd.getDate() + (6 - endOffset));
        gridEnd.setHours(23, 59, 59, 999);
        return { from: gridStart.toISOString(), to: gridEnd.toISOString() };
    }
    if (viewMode.value === 'week') {
        const start = startOfWeek(cursorDate.value);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { from: start.toISOString(), to: end.toISOString() };
    }
    const start = new Date(cursorDate.value);
    start.setHours(0, 0, 0, 0);
    const end = new Date(cursorDate.value);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
}

async function refetch() {
    const { from, to } = computeRangeISO();
    await fetchRange(orgId.value, from, to);
}

function goPrev() {
    const d = new Date(cursorDate.value);
    if (viewMode.value === 'month') d.setMonth(d.getMonth() - 1);
    else if (viewMode.value === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    cursorDate.value = d;
}

function goNext() {
    const d = new Date(cursorDate.value);
    if (viewMode.value === 'month') d.setMonth(d.getMonth() + 1);
    else if (viewMode.value === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    cursorDate.value = d;
}

function goToday() {
    cursorDate.value = new Date();
}

function goToDay(date: Date) {
    cursorDate.value = date;
    viewMode.value = 'day';
}

// ── Modale événement ───────────────────────────────────────────────
const showModal = ref(false);
const selectedOccurrence = ref<OccurrenceInstance | null>(null);
const createInitialDate = ref<Date | null>(null);

function openCreateModal(date: Date) {
    selectedOccurrence.value = null;
    createInitialDate.value = date;
    showModal.value = true;
}

function openEditModal(occ: OccurrenceInstance) {
    selectedOccurrence.value = occ;
    createInitialDate.value = null;
    showModal.value = true;
}

watch([viewMode, cursorDate, viewingUserId], () => {
    refetch();
});

onMounted(async () => {
    refetch();

    const socket = await useWSocket();
    socket.value?.on('agenda:event-created', refetch);
    socket.value?.on('agenda:event-updated', refetch);
    socket.value?.on('agenda:event-deleted', refetch);
    socket.value?.on('agenda:occurrence-updated', refetch);
    socket.value?.on('agenda:occurrence-cancelled', refetch);
    socket.value?.on('agenda:rsvp-updated', refetch);
});

onUnmounted(async () => {
    const socket = await useWSocket();
    socket.value?.off('agenda:event-created', refetch);
    socket.value?.off('agenda:event-updated', refetch);
    socket.value?.off('agenda:event-deleted', refetch);
    socket.value?.off('agenda:occurrence-updated', refetch);
    socket.value?.off('agenda:occurrence-cancelled', refetch);
    socket.value?.off('agenda:rsvp-updated', refetch);
});
</script>
