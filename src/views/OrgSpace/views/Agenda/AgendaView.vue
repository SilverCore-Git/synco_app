<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full">
        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0 flex-wrap gap-y-2 py-2 w-full">
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
            </div>
        </div>

        <div class="flex flex-1 overflow-hidden">
            <aside class="agenda-sidebar">
                <button @click="openCreateBlank" class="primary-glow !text-sm w-full justify-center">
                    <i class="bi bi-plus-lg"></i>
                    Créer
                </button>
                <MiniCalendar
                    :cursor-date="cursorDate"
                    :occurrences="displayOccurrences"
                    :highlight-start="weekHighlightStart"
                    :highlight-end="weekHighlightEnd"
                    @pick-day="goToDay"
                    @navigate-month="navigateMiniMonth"
                />
                <CalendarAccessPanel :org-id="orgId" @changed="refetch" />
            </aside>

            <main class="flex-1 overflow-hidden w-full h-full">
                <div v-if="loading && occurrences.length === 0" class="w-full h-full flex items-center justify-center">
                    <div class="w-8 h-8 border-4 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin"></div>
                </div>

                <MonthGrid
                    v-else-if="viewMode === 'month'"
                    :cursor-date="cursorDate"
                    :occurrences="displayOccurrences"
                    :selection="selectionRange"
                    @open-event="openEditModal"
                    @create="onGridCreate"
                    @select-day="goToDay"
                    @reschedule="onReschedule"
                />
                <WeekGrid
                    v-else-if="viewMode === 'week'"
                    :cursor-date="cursorDate"
                    :occurrences="displayOccurrences"
                    :selection="selectionRange"
                    @open-event="openEditModal"
                    @create="onGridCreate"
                    @reschedule="onReschedule"
                    @visible-range-change="onWeekVisibleRangeChange"
                />
                <DayGrid
                    v-else
                    :cursor-date="cursorDate"
                    :occurrences="displayOccurrences"
                    :selection="selectionRange"
                    @open-event="openEditModal"
                    @create="onGridCreate"
                    @reschedule="onReschedule"
                />
            </main>
        </div>

        <EventQuickCreate
            :visible="showQuickCreate"
            :org-id="orgId"
            :range="quickCreateRange"
            :anchor="quickCreateAnchor"
            @close="onQuickCreateClose"
            @created="onQuickCreateCreated"
            @more-options="onQuickCreateMoreOptions"
        />

        <EventPanel
            :show="showPanel"
            :org-id="orgId"
            :occurrence="selectedOccurrence"
            :initial-range="createInitialRange"
            @close="onPanelClose"
            @saved="onPanelSaved"
            @deleted="onPanelDeleted"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import MonthGrid from './components/MonthGrid.vue';
import WeekGrid from './components/WeekGrid.vue';
import DayGrid from './components/DayGrid.vue';
import MiniCalendar from './components/MiniCalendar.vue';
import EventQuickCreate from './components/EventQuickCreate.vue';
import EventPanel from './components/EventPanel.vue';
import CalendarAccessPanel from './components/CalendarAccessPanel.vue';
import { useAgenda } from '@/composables/useAgenda';
import { useCalendarAccess } from '@/composables/useCalendarAccess';
import { useAgendaViewMode, type AgendaViewMode } from '@/composables/useAgendaViewMode';
import useWSocket from '@/composables/useWSocket';
import sfetch from '@/assets/utils/sfetch';
import { user, isLittleScreen } from '@/assets/var';
import type { Task, TodoList } from '@/types/types';
import { TASK_DEADLINE_PREFIX, isTaskDeadlineOccurrence, taskIdFromDeadlineEventId, type OccurrenceInstance } from '@/types/agenda';

const route = useRoute();
const router = useRouter();
const orgId = computed(() => route.params.orgId as string);

const { occurrences, loading, fetchRange, updateEvent, updateOccurrence } = useAgenda();
const { sharedOccurrences, fetchGrants, fetchSharedOccurrences } = useCalendarAccess();

// ── Échéances de tâches affichées comme événements dans l'agenda ──────
// Pseudo-occurrences synthétisées côté front à partir des tâches qui me
// sont assignées (ou personnelles) avec une date d'échéance — pas de
// nouvel endpoint backend, on réutilise les tâches déjà chargées ailleurs
// (TasksGlobal/TodosCard) et on les projette sur le jour de l'échéance.
const myTasksWithDeadline = ref<Task[]>([]);

async function loadTaskDeadlines() {
    try {
        const res = await sfetch(`/api/tasks/${orgId.value}/lists/me`);
        if (!res.ok) return;
        const data = await res.json();
        const allTasks: Task[] = [];
        data.lists.forEach((list: TodoList) => list.tasks?.forEach(t => allTasks.push(t)));
        // Les tâches créées hors d'une TodoList explicite (cas courant :
        // "Créer une tâche" dans un espace) arrivent séparément ici.
        data.unlistedTasks?.forEach((t: Task) => allTasks.push(t));

        myTasksWithDeadline.value = allTasks.filter(task => {
            if (task.archived || task.status === 'DONE' || !task.dueDate) return false;
            const isAssignedToMe = task.assignees?.some(a => a.id === user.value?.id);
            const isCreatedByMe = task.creatorId === user.value?.id;
            return isAssignedToMe || isCreatedByMe;
        });
    } catch (e) {
        console.error('[Agenda] Failed to load task deadlines', e);
    }
}

const taskDeadlineOccurrences = computed<OccurrenceInstance[]>(() => {
    return myTasksWithDeadline.value.map(task => {
        const due = new Date(task.dueDate!).toISOString();
        return {
            occurrenceKey: `${TASK_DEADLINE_PREFIX}${task.id}`,
            eventId: `${TASK_DEADLINE_PREFIX}${task.id}`,
            title: task.title,
            description: task.description || null,
            location: null,
            startAt: due,
            endAt: due,
            allDay: true,
            color: null,
            isRecurring: false,
            isException: false,
            creatorId: task.creatorId,
            attendees: []
        };
    });
});

// Fusion événements réels (mon agenda + agendas partagés visibles, voir
// useCalendarAccess.ts) + échéances de tâches pour l'affichage dans les grilles.
const displayOccurrences = computed(() => [...occurrences.value, ...sharedOccurrences.value, ...taskDeadlineOccurrences.value]);

const { viewMode } = useAgendaViewMode();
const cursorDate = ref<Date>(new Date());

const views: { id: AgendaViewMode; label: string }[] = [
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

// Position réellement visible dans WeekGrid — mise à jour en direct pendant
// le scroll horizontal (débattu, voir WeekGrid.vue::emitVisibleRangeChange),
// jamais utilisée pour le fetch (qui reste ancré sur cursorDate, voir
// computeRangeISO). Sert uniquement à garder l'en-tête et le bandeau du
// MiniCalendar synchronisés avec ce qu'on voit réellement à l'écran.
const weekVisibleStart = ref<Date | null>(null);
function onWeekVisibleRangeChange(start: Date) {
    weekVisibleStart.value = start;
}
const weekWindowStart = computed(() => weekVisibleStart.value || cursorDate.value);

const periodLabel = computed(() => {
    if (viewMode.value === 'month') {
        return cursorDate.value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
    if (viewMode.value === 'week') {
        // Fenêtre glissante de 7 jours (pas calée sur lundi-dimanche, voir
        // WeekGrid.vue::startOfDay), suit la position réellement visible.
        const start = new Date(weekWindowStart.value);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const startLabel = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        const endLabel = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
        return `${startLabel} - ${endLabel}`;
    }
    return cursorDate.value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
});

const weekHighlightStart = computed(() => (viewMode.value === 'week' ? weekWindowStart.value : null));
const weekHighlightEnd = computed(() => {
    if (viewMode.value !== 'week') return null;
    const end = new Date(weekWindowStart.value);
    end.setDate(end.getDate() + 6);
    return end;
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
        // La grille affiche une fenêtre glissante bien plus large que 7 jours
        // (défilement horizontal fluide, voir WeekGrid.vue) : on charge tout
        // ce qu'elle peut atteindre par scroll (±120j, son MAX_HALF) en une
        // fois, pour ne jamais avoir besoin de recharger pendant qu'on scroll.
        const WEEK_VIEW_FETCH_HALF_DAYS = 120;
        const start = new Date(cursorDate.value);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - WEEK_VIEW_FETCH_HALF_DAYS);
        const end = new Date(cursorDate.value);
        end.setDate(end.getDate() + WEEK_VIEW_FETCH_HALF_DAYS);
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
    await Promise.all([
        fetchRange(orgId.value, from, to),
        fetchSharedOccurrences(orgId.value, from, to)
    ]);
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

function navigateMiniMonth(delta: number) {
    const d = new Date(cursorDate.value);
    d.setMonth(d.getMonth() + delta);
    cursorDate.value = d;
}

// ── Création rapide (glisser sur la grille) — la zone reste visuellement
// sélectionnée tant que la popover ou le panneau de création est ouvert.
interface Range { start: Date; end: Date; allDay?: boolean }

const selectionRange = ref<Range | null>(null);

const showQuickCreate = ref(false);
const quickCreateRange = ref<Range | null>(null);
const quickCreateAnchor = ref<{ x: number; y: number } | null>(null);

function onGridCreate(range: Range & { clientX?: number; clientY?: number }) {
    const r = { start: range.start, end: range.end, allDay: !!range.allDay };

    // Le popover flottant ancré au point de clic n'a pas de bon sens sur un
    // petit écran (marges trop courtes, positionnement anecdotique au
    // toucher) — le panneau plein écran est directement la meilleure
    // option, pas besoin d'une étape intermédiaire.
    if (isLittleScreen.value) {
        openCreatePanel(r);
        return;
    }

    quickCreateRange.value = r;
    selectionRange.value = r;
    quickCreateAnchor.value = (range.clientX != null && range.clientY != null)
        ? { x: range.clientX, y: range.clientY }
        : null;
    showQuickCreate.value = true;
}

function onQuickCreateClose() {
    showQuickCreate.value = false;
    selectionRange.value = null;
}

function onQuickCreateCreated() {
    showQuickCreate.value = false;
    selectionRange.value = null;
    refetch();
}

function onQuickCreateMoreOptions(range: Range) {
    showQuickCreate.value = false;
    openCreatePanel(range);
}

// ── Panneau latéral événement (édition complète) ─────────────────────
const showPanel = ref(false);
const selectedOccurrence = ref<OccurrenceInstance | null>(null);
const createInitialRange = ref<Range | null>(null);

function openCreatePanel(range: Range) {
    selectedOccurrence.value = null;
    createInitialRange.value = range;
    selectionRange.value = range;
    showPanel.value = true;
}

function openCreateBlank() {
    const start = new Date();
    const minutes = start.getMinutes();
    start.setMinutes(minutes < 30 ? 30 : 60, 0, 0);
    const end = new Date(start.getTime() + 60 * 60000);
    openCreatePanel({ start, end, allDay: false });
}

function openEditModal(occ: OccurrenceInstance) {
    if (isTaskDeadlineOccurrence(occ.eventId)) {
        openTaskDeadline(occ);
        return;
    }
    showQuickCreate.value = false;
    selectedOccurrence.value = occ;
    createInitialRange.value = null;
    showPanel.value = true;
}

// Une échéance de tâche n'est pas un vrai événement : on renvoie vers la
// tâche elle-même (liste personnelle ou liste de l'espace) plutôt que
// d'ouvrir le panneau d'édition d'événement.
function openTaskDeadline(occ: OccurrenceInstance) {
    const taskId = taskIdFromDeadlineEventId(occ.eventId);
    const task = myTasksWithDeadline.value.find(t => t.id === taskId);
    router.push(task?.spaceId ? `/${orgId.value}/${task.spaceId}/tasks` : `/${orgId.value}/tasks`);
}

function clearSelectionIfCreating() {
    if (!selectedOccurrence.value) selectionRange.value = null;
}

function onPanelClose() {
    showPanel.value = false;
    clearSelectionIfCreating();
}

function onPanelSaved() {
    // Le panneau reste ouvert (autosave) : on ne touche pas à la sélection
    // affichée, seulement aux occurrences pour refléter la modification.
    refetch();
}

function onPanelDeleted() {
    clearSelectionIfCreating();
    refetch();
}

// ── Déplacement / redimensionnement d'un événement existant ───────────
async function onReschedule({ occ, start, end }: { occ: OccurrenceInstance; start: Date; end: Date }) {
    const dto = { startAt: start.toISOString(), endAt: end.toISOString() };
    if (occ.isRecurring) {
        await updateOccurrence(orgId.value, occ.eventId, occ.startAt, dto);
    } else {
        await updateEvent(orgId.value, occ.eventId, dto);
    }
    refetch();
}

watch([viewMode, cursorDate], () => {
    refetch();
});

// Un changement d'accès (demande acceptée/refusée, partage retiré...)
// affecte quels agendas sont superposables : on recharge la liste des
// accès puis les occurrences partagées visibles en découlent.
async function onAccessUpdated() {
    await fetchGrants(orgId.value);
    refetch();
}

onMounted(async () => {
    await fetchGrants(orgId.value);
    refetch();
    loadTaskDeadlines();

    const socket = await useWSocket();
    socket.value?.on('agenda:event-created', refetch);
    socket.value?.on('agenda:event-updated', refetch);
    socket.value?.on('agenda:event-deleted', refetch);
    socket.value?.on('agenda:occurrence-updated', refetch);
    socket.value?.on('agenda:occurrence-cancelled', refetch);
    socket.value?.on('agenda:rsvp-updated', refetch);
    socket.value?.on('agenda:access-updated', onAccessUpdated);
});

onUnmounted(async () => {
    const socket = await useWSocket();
    socket.value?.off('agenda:event-created', refetch);
    socket.value?.off('agenda:event-updated', refetch);
    socket.value?.off('agenda:event-deleted', refetch);
    socket.value?.off('agenda:occurrence-updated', refetch);
    socket.value?.off('agenda:occurrence-cancelled', refetch);
    socket.value?.off('agenda:rsvp-updated', refetch);
    socket.value?.off('agenda:access-updated', onAccessUpdated);
});
</script>

<style scoped>
.agenda-sidebar {
    width: 15rem; /* = w-60, même largeur que la ThreadsBar (OrgLayout.vue) */
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border-right: 1px solid var(--border-color);
    background: var(--bg2);
    overflow-y: auto;
}

@media (max-width: 900px) {
    .agenda-sidebar {
        display: none;
    }
}
</style>
