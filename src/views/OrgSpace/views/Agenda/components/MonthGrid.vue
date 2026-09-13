<template>
    <div class="month-grid">
        <div class="month-grid-weekdays">
            <div v-for="d in weekdayLabels" :key="d" class="month-grid-weekday">{{ d }}</div>
        </div>
        <div class="month-grid-days">
            <div
                v-for="day in days"
                :key="day.iso"
                class="month-grid-day"
                :class="{
                    'is-other-month': !day.inMonth,
                    'is-today': day.isToday,
                    'is-selected': isInSelection(day.date) || isInPersistedSelection(day.date),
                    'is-move-target': movingEvent && isoDay(movingEvent.targetDate) === day.iso
                }"
                @mousedown="onDayMouseDown($event, day)"
                @mouseenter="onDayMouseEnter(day)"
            >
                <div class="month-grid-day-header">
                    <button
                        type="button"
                        class="month-grid-day-number"
                        @mousedown.stop
                        @click.stop="emit('select-day', day.date)"
                    >
                        {{ day.date.getDate() }}
                    </button>
                </div>
                <div class="month-grid-day-events">
                    <EventChip
                        v-for="occ in day.occurrences.slice(0, maxVisibleEvents)"
                        :key="occ.occurrenceKey"
                        :occurrence="occ"
                        compact
                        :class="{ 'is-event-dragging': movingEvent?.occ.occurrenceKey === occ.occurrenceKey }"
                        @click="emit('open-event', occ)"
                        @mousedown.stop="isTaskDeadlineOccurrence(occ.eventId) ? undefined : startEventMove($event, occ)"
                    />
                    <button
                        v-if="day.occurrences.length > maxVisibleEvents"
                        class="month-grid-more"
                        @mousedown.stop
                        @click.stop="emit('select-day', day.date)"
                    >
                        +{{ day.occurrences.length - maxVisibleEvents }} de plus
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EventChip from './EventChip.vue';
import { isTaskDeadlineOccurrence, type OccurrenceInstance } from '@/types/agenda';
import { isLittleScreen } from '@/assets/var';

// Moins d'événements visibles par jour sur petit écran : les cases restent
// lisibles et de même taille sans avoir à réduire encore la police/padding.
const maxVisibleEvents = computed(() => isLittleScreen.value ? 2 : 3);

const props = defineProps<{
    cursorDate: Date;
    occurrences: OccurrenceInstance[];
    selection?: { start: Date; end: Date; allDay?: boolean } | null;
}>();

const emit = defineEmits<{
    'open-event': [occ: OccurrenceInstance];
    'create': [range: { start: Date; end: Date; allDay?: boolean; clientX?: number; clientY?: number }];
    'select-day': [date: Date];
    'reschedule': [payload: { occ: OccurrenceInstance; start: Date; end: Date }];
}>();

const weekdayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function startOfWeek(d: Date): Date {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; // 0 = Lundi
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
}

function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

interface DayCell {
    date: Date;
    iso: string;
    inMonth: boolean;
    isToday: boolean;
    occurrences: OccurrenceInstance[];
}

const days = computed<DayCell[]>(() => {
    const cursor = props.cursorDate;
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = new Date(monthEnd);
    const endDayOffset = (gridEnd.getDay() + 6) % 7;
    gridEnd.setDate(gridEnd.getDate() + (6 - endDayOffset));
    gridEnd.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Grouper les occurrences par jour local (clé YYYY-MM-DD) — un événement
    // qui dure plusieurs jours est répété dans chaque jour qu'il traverse.
    const byDay = new Map<string, OccurrenceInstance[]>();
    for (const occ of props.occurrences) {
        const cursor = new Date(occ.startAt);
        cursor.setHours(0, 0, 0, 0);
        const endDay = new Date(occ.endAt);
        endDay.setHours(0, 0, 0, 0);

        let guard = 0;
        while (cursor.getTime() <= endDay.getTime() && guard < 366) {
            const key = isoDay(cursor);
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key)!.push(occ);
            cursor.setDate(cursor.getDate() + 1);
            guard++;
        }
    }

    const list: DayCell[] = [];
    const ptr = new Date(gridStart);
    while (ptr.getTime() <= gridEnd.getTime()) {
        const iso = isoDay(ptr);
        const dayOccurrences = (byDay.get(iso) || []).slice().sort((a, b) => a.startAt.localeCompare(b.startAt));
        list.push({
            date: new Date(ptr),
            iso,
            inMonth: ptr.getMonth() === cursor.getMonth(),
            isToday: ptr.getTime() === today.getTime(),
            occurrences: dayOccurrences
        });
        ptr.setDate(ptr.getDate() + 1);
    }

    return list;
});

// ── Sélection par glisser (jour unique = créneau par défaut, plage = journée entière) ──
const dragStart = ref<Date | null>(null);
const dragCurrent = ref<Date | null>(null);
const isDragging = ref(false);

function onDayMouseDown(e: MouseEvent, day: DayCell) {
    if (e.button !== 0) return;
    if (movingEvent.value) return; // un déplacement d'événement est déjà en cours
    isDragging.value = true;
    dragStart.value = day.date;
    dragCurrent.value = day.date;
    window.addEventListener('mouseup', finalizeSelection);
}

function onDayMouseEnter(day: DayCell) {
    if (movingEvent.value) {
        movingEvent.value = { ...movingEvent.value, targetDate: day.date };
        return;
    }
    if (!isDragging.value) return;
    dragCurrent.value = day.date;
}

function isInSelection(date: Date): boolean {
    if (!isDragging.value || !dragStart.value || !dragCurrent.value) return false;
    const a = dragStart.value.getTime();
    const b = dragCurrent.value.getTime();
    const t = date.getTime();
    return t >= Math.min(a, b) && t <= Math.max(a, b);
}

// ── Sélection persistante (reste affichée pendant la création) ────────
function isInPersistedSelection(date: Date): boolean {
    if (!props.selection) return false;
    const a = isoDay(props.selection.start);
    const b = isoDay(props.selection.end);
    const t = isoDay(date);
    return t >= (a < b ? a : b) && t <= (a < b ? b : a);
}

function finalizeSelection(e: MouseEvent) {
    window.removeEventListener('mouseup', finalizeSelection);
    if (!isDragging.value || !dragStart.value) return;
    const a = dragStart.value;
    const b = dragCurrent.value || a;
    isDragging.value = false;

    const start = new Date(Math.min(a.getTime(), b.getTime()));
    const end = new Date(Math.max(a.getTime(), b.getTime()));
    const isRange = start.getTime() !== end.getTime();

    dragStart.value = null;
    dragCurrent.value = null;

    if (isRange) {
        const endOfDay = new Date(end);
        endOfDay.setHours(23, 59, 0, 0);
        emit('create', { start, end: endOfDay, allDay: true, clientX: e.clientX, clientY: e.clientY });
    } else {
        const s = new Date(start);
        s.setHours(9, 0, 0, 0);
        const en = new Date(start);
        en.setHours(10, 0, 0, 0);
        emit('create', { start: s, end: en, allDay: false, clientX: e.clientX, clientY: e.clientY });
    }
}

// ── Déplacement d'un événement existant vers un autre jour ─────────────
interface MovingEventState {
    occ: OccurrenceInstance;
    targetDate: Date;
}

const movingEvent = ref<MovingEventState | null>(null);

function startEventMove(e: MouseEvent, occ: OccurrenceInstance) {
    if (e.button !== 0) return;
    movingEvent.value = { occ, targetDate: new Date(occ.startAt) };
    window.addEventListener('mouseup', finalizeEventMove);
}

function startOfDay(d: Date): Date {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
}

function finalizeEventMove() {
    window.removeEventListener('mouseup', finalizeEventMove);
    if (!movingEvent.value) return;
    const { occ, targetDate } = movingEvent.value;
    movingEvent.value = null;

    const origStart = new Date(occ.startAt);
    const origEnd = new Date(occ.endAt);
    const dayDeltaMs = startOfDay(targetDate).getTime() - startOfDay(origStart).getTime();
    if (dayDeltaMs === 0) return;

    emit('reschedule', {
        occ,
        start: new Date(origStart.getTime() + dayDeltaMs),
        end: new Date(origEnd.getTime() + dayDeltaMs)
    });
}
</script>

<style scoped>
.month-grid {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
}

.month-grid-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
}

.month-grid-weekday {
    padding: 8px;
    text-align: center;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text2);
}

.month-grid-days {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    /* minmax(0, 1fr) et non 1fr seul : avec 1fr, une case dont le contenu
       (événements) dépasse la part équitable de la ligne agrandit CETTE
       ligne par rapport aux autres — les cases n'ont alors plus la même
       taille. minmax(0, ...) force une base de 0, donc les 1fr se
       répartissent toujours à parts strictement égales, indépendamment
       du contenu de chaque jour. */
    grid-auto-rows: minmax(0, 1fr);
    /* Plancher pour rester lisible sur petit écran plutôt que d'écraser
       les 6 lignes du mois : la grille défile verticalement (overflow-y)
       au lieu de rapetisser les cases en dessous de ce seuil. */
    min-height: 480px;
    overflow-y: auto;
    user-select: none;
}

.month-grid-day {
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
    overflow: hidden;
    transition: background 0.15s ease;
}

.month-grid-day:hover {
    background: color-mix(in srgb, var(--text) 4%, transparent);
}

.month-grid-day.is-selected {
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--primary) 50%, transparent);
}

.is-other-month {
    opacity: 0.4;
}

.is-today .month-grid-day-number {
    background: var(--primary);
    color: white;
}

.month-grid-day-header {
    display: flex;
    justify-content: flex-end;
}

.month-grid-day-number {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}
.month-grid-day-number:hover {
    background: color-mix(in srgb, var(--primary) 25%, transparent);
}

.month-grid-day-events {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
}

.month-grid-more {
    font-size: 10px;
    font-weight: 700;
    color: var(--text2);
    text-align: left;
    padding: 2px 4px;
}

.month-grid-more:hover {
    color: var(--text);
}

/* Même palier que .agenda-sidebar (AgendaView.vue) : en dessous, la barre
   latérale disparaît déjà, donc la grille récupère toute la largeur — on
   resserre un peu pour compenser l'espace en moins par colonne. */
@media (max-width: 900px) {
    .month-grid-day {
        padding: 4px;
        gap: 2px;
    }

    .month-grid-days {
        min-height: 380px;
    }

    .month-grid-day-number {
        font-size: 10px;
        width: 20px;
        height: 20px;
    }
}

@media (max-width: 600px) {
    .month-grid-weekday {
        padding: 6px 2px;
        font-size: 9px;
    }

    .month-grid-day {
        padding: 3px;
    }

    .month-grid-days {
        min-height: 320px;
    }

    .month-grid-more {
        font-size: 9px;
        padding: 1px 2px;
    }
}
</style>
