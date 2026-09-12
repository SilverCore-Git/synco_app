<template>
    <div class="time-grid">
        <div class="time-grid-header">
            <div class="time-grid-gutter-header"></div>
            <div
                v-for="day in days"
                :key="'h-' + day.iso"
                class="time-grid-day-header"
                :class="{ 'is-today': day.isToday }"
            >
                <span class="time-grid-day-name">{{ day.weekdayLabel }}</span>
                <span class="time-grid-day-number">{{ day.date.getDate() }}</span>
            </div>
        </div>

        <div class="time-grid-allday">
            <div class="time-grid-gutter-header time-grid-allday-label">Journée</div>
            <div v-for="day in days" :key="'ad-' + day.iso" class="time-grid-allday-cell" @click="emitCreate(allDayDate(day.date), allDayEndDate(day.date), true, $event)">
                <EventChip
                    v-for="occ in day.allDayOccurrences"
                    :key="occ.occurrenceKey"
                    :occurrence="occ"
                    compact
                    @click="emit('open-event', occ)"
                />
            </div>
        </div>

        <div class="time-grid-body">
            <div class="time-grid-gutter-col">
                <div v-for="h in hours" :key="'lbl-' + h" class="time-grid-hour-label" :style="{ height: rowHeight + 'px' }">
                    {{ String(h).padStart(2, '0') }}:00
                </div>
            </div>
            <div
                v-for="day in days"
                :key="'col-' + day.iso"
                class="time-grid-day-col"
                :style="{ height: rowHeight * 24 + 'px' }"
                @mousedown="onPointerDown($event, day)"
            >
                <div v-for="h in hours" :key="'line-' + h" class="time-grid-hour-line" :style="{ height: rowHeight + 'px' }"></div>
                <div
                    v-for="occ in day.timedOccurrences"
                    :key="occ.occurrenceKey"
                    class="time-grid-event"
                    :style="eventStyle(occ)"
                >
                    <EventChip :occurrence="occ" @click="emit('open-event', occ)" />
                </div>

                <div
                    v-if="drag && drag.iso === day.iso"
                    class="time-grid-drag-ghost"
                    :style="ghostStyle"
                >
                    {{ ghostLabel }}
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
}>();

const ROW_HEIGHT = 48;
const rowHeight = ROW_HEIGHT;
const SNAP_MINUTES = 15;
const hours = Array.from({ length: 24 }, (_, i) => i);

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

interface DayColumn {
    date: Date;
    iso: string;
    isToday: boolean;
    weekdayLabel: string;
    allDayOccurrences: OccurrenceInstance[];
    timedOccurrences: OccurrenceInstance[];
}

const days = computed<DayColumn[]>(() => {
    const start = startOfWeek(props.cursorDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const byDay = new Map<string, OccurrenceInstance[]>();
    for (const occ of props.occurrences) {
        const key = isoDay(new Date(occ.startAt));
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key)!.push(occ);
    }

    const list: DayColumn[] = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        const iso = isoDay(date);
        const dayOccurrences = (byDay.get(iso) || []).slice().sort((a, b) => a.startAt.localeCompare(b.startAt));

        list.push({
            date,
            iso,
            isToday: date.getTime() === today.getTime(),
            weekdayLabel: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
            allDayOccurrences: dayOccurrences.filter(o => o.allDay),
            timedOccurrences: dayOccurrences.filter(o => !o.allDay)
        });
    }
    return list;
});

function eventStyle(occ: OccurrenceInstance) {
    const start = new Date(occ.startAt);
    const end = new Date(occ.endAt);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    let durationMinutes = (end.getTime() - start.getTime()) / 60000;
    if (durationMinutes < 20) durationMinutes = 20;

    const top = (startMinutes / 60) * rowHeight;
    const height = (durationMinutes / 60) * rowHeight;

    return {
        top: `${top}px`,
        height: `${height}px`
    };
}

// ── Sélection par glisser (façon Google Agenda) ──────────────────────
interface DragState {
    iso: string;
    date: Date;
    colTop: number;
    startY: number;
    currentY: number;
}

const drag = ref<DragState | null>(null);

function pxToMinutes(px: number): number {
    return Math.max(0, Math.min(24 * 60, (px / rowHeight) * 60));
}

function snap(minutes: number): number {
    return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function onPointerDown(e: MouseEvent, day: DayColumn) {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;

    drag.value = { iso: day.iso, date: day.date, colTop: rect.top, startY: y, currentY: y };
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
}

function onPointerMove(e: MouseEvent) {
    if (!drag.value) return;
    const y = Math.max(0, Math.min(rowHeight * 24, e.clientY - drag.value.colTop));
    drag.value = { ...drag.value, currentY: y };
}

function onPointerUp(e: MouseEvent) {
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    if (!drag.value) return;

    const d = drag.value;
    drag.value = null;

    const rawStart = snap(pxToMinutes(Math.min(d.startY, d.currentY)));
    let rawEnd = snap(pxToMinutes(Math.max(d.startY, d.currentY)));
    if (rawEnd - rawStart < SNAP_MINUTES) rawEnd = rawStart + 30; // simple clic → créneau de 30 min par défaut

    const start = new Date(d.date);
    start.setHours(0, rawStart, 0, 0);
    const end = new Date(d.date);
    end.setHours(0, rawEnd, 0, 0);

    emit('create', { start, end, clientX: e.clientX, clientY: e.clientY });
}

const ghostStyle = computed(() => {
    if (!drag.value) return {};
    const top = Math.min(drag.value.startY, drag.value.currentY);
    const height = Math.max(Math.abs(drag.value.currentY - drag.value.startY), (SNAP_MINUTES / 60) * rowHeight);
    return { top: `${top}px`, height: `${height}px` };
});

const ghostLabel = computed(() => {
    if (!drag.value) return '';
    const rawStart = snap(pxToMinutes(Math.min(drag.value.startY, drag.value.currentY)));
    let rawEnd = snap(pxToMinutes(Math.max(drag.value.startY, drag.value.currentY)));
    if (rawEnd - rawStart < SNAP_MINUTES) rawEnd = rawStart + 30;
    const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    return `${fmt(rawStart)} – ${fmt(rawEnd)}`;
});

function emitCreate(start: Date, end: Date, allDay: boolean, e: MouseEvent) {
    emit('create', { start, end, allDay, clientX: e.clientX, clientY: e.clientY });
}

function allDayDate(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function allDayEndDate(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 0, 0);
    return d;
}
</script>

<style scoped>
.time-grid {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
}

.time-grid-header {
    display: grid;
    grid-template-columns: 56px repeat(7, 1fr);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
}

.time-grid-gutter-header {
    border-right: 1px solid var(--border-color);
}

.time-grid-day-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 4px;
    gap: 2px;
}

.time-grid-day-name {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text2);
}

.time-grid-day-number {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
}

.is-today .time-grid-day-number {
    color: var(--primary);
}

.time-grid-allday {
    display: grid;
    grid-template-columns: 56px repeat(7, 1fr);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
    min-height: 32px;
}

.time-grid-allday-label {
    font-size: 9px;
    font-weight: 700;
    color: var(--text2);
    display: flex;
    align-items: center;
    justify-content: center;
    text-transform: uppercase;
}

.time-grid-allday-cell {
    border-right: 1px solid var(--border-color);
    padding: 3px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: pointer;
}

.time-grid-body {
    flex: 1;
    display: grid;
    grid-template-columns: 56px repeat(7, 1fr);
    overflow-y: auto;
    position: relative;
}

.time-grid-gutter-col {
    border-right: 1px solid var(--border-color);
}

.time-grid-hour-label {
    font-size: 10px;
    color: var(--text2);
    text-align: right;
    padding-right: 6px;
    transform: translateY(-6px);
}

.time-grid-day-col {
    position: relative;
    border-right: 1px solid var(--border-color);
    cursor: crosshair;
    user-select: none;
}

.time-grid-hour-line {
    border-bottom: 1px solid var(--border-color);
}

.time-grid-event {
    position: absolute;
    left: 2px;
    right: 2px;
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    z-index: 1;
}

.time-grid-drag-ghost {
    position: absolute;
    left: 2px;
    right: 2px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--primary) 32%, transparent);
    border: 1.5px dashed var(--primary);
    z-index: 2;
    pointer-events: none;
    font-size: 10px;
    font-weight: 700;
    color: var(--primary);
    padding: 2px 6px;
    display: flex;
    align-items: flex-start;
}
</style>
