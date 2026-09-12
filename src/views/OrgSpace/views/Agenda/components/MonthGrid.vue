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
                :class="{ 'is-other-month': !day.inMonth, 'is-today': day.isToday, 'is-selected': isInSelection(day.date) }"
                @mousedown="onDayMouseDown($event, day)"
                @mouseenter="onDayMouseEnter(day)"
            >
                <div class="month-grid-day-header">
                    <span class="month-grid-day-number">{{ day.date.getDate() }}</span>
                </div>
                <div class="month-grid-day-events">
                    <EventChip
                        v-for="occ in day.occurrences.slice(0, 3)"
                        :key="occ.occurrenceKey"
                        :occurrence="occ"
                        compact
                        @click="emit('open-event', occ)"
                    />
                    <button
                        v-if="day.occurrences.length > 3"
                        class="month-grid-more"
                        @mousedown.stop
                        @click.stop="emit('select-day', day.date)"
                    >
                        +{{ day.occurrences.length - 3 }} de plus
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EventChip from './EventChip.vue';
import type { OccurrenceInstance } from '@/types/agenda';

const props = defineProps<{
    cursorDate: Date;
    occurrences: OccurrenceInstance[];
}>();

const emit = defineEmits<{
    'open-event': [occ: OccurrenceInstance];
    'create': [range: { start: Date; end: Date; allDay?: boolean; clientX?: number; clientY?: number }];
    'select-day': [date: Date];
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

    // Grouper les occurrences par jour local (clé YYYY-MM-DD)
    const byDay = new Map<string, OccurrenceInstance[]>();
    for (const occ of props.occurrences) {
        const key = isoDay(new Date(occ.startAt));
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key)!.push(occ);
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
    isDragging.value = true;
    dragStart.value = day.date;
    dragCurrent.value = day.date;
    window.addEventListener('mouseup', finalizeSelection);
}

function onDayMouseEnter(day: DayCell) {
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
    grid-auto-rows: 1fr;
    overflow-y: auto;
    user-select: none;
}

.month-grid-day {
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    padding: 6px;
    min-height: 100px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
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
</style>
