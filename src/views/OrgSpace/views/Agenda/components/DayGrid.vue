<template>
    <div class="time-grid">
        <div class="time-grid-header">
            <div class="time-grid-gutter-header"></div>
            <div class="time-grid-day-header" :class="{ 'is-today': isToday }">
                <span class="time-grid-day-name">{{ weekdayLabel }}</span>
                <span class="time-grid-day-number">{{ cursorDate.getDate() }}</span>
            </div>
        </div>

        <div class="time-grid-allday">
            <div class="time-grid-gutter-header time-grid-allday-label">Journée</div>
            <div class="time-grid-allday-cell" @click="emitCreate(allDayDate, allDayEnd, true, $event)">
                <EventChip
                    v-for="occ in allDayOccurrences"
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
                class="time-grid-day-col"
                :style="{ height: rowHeight * 24 + 'px' }"
                @mousedown="onPointerDown"
            >
                <div v-for="h in hours" :key="'line-' + h" class="time-grid-hour-line" :style="{ height: rowHeight + 'px' }"></div>

                <div
                    v-for="occ in timedOccurrences"
                    :key="occ.occurrenceKey"
                    class="time-grid-event"
                    :class="{ 'is-event-dragging': eventDrag?.occ.occurrenceKey === occ.occurrenceKey }"
                    :style="eventStyle(occ)"
                >
                    <div v-if="!isMultiDay(occ)" class="time-grid-resize-handle top" @mousedown.stop="startEventDrag($event, occ, 'resize-top')"></div>
                    <EventChip :occurrence="occ" @click="emit('open-event', occ)" @mousedown.stop="isMultiDay(occ) ? undefined : startEventDrag($event, occ, 'move')" />
                    <div v-if="!isMultiDay(occ)" class="time-grid-resize-handle bottom" @mousedown.stop="startEventDrag($event, occ, 'resize-bottom')"></div>
                </div>

                <div v-if="eventDrag" class="time-grid-drag-ghost is-event-preview" :style="eventDragGhostStyle">
                    {{ eventDrag.occ.title }} · {{ eventDragLabel }}
                </div>

                <div v-if="drag" class="time-grid-drag-ghost" :style="ghostStyle">
                    {{ ghostLabel }}
                </div>

                <div v-if="selection && !drag && !selection.allDay" class="time-grid-selection-ghost" :style="selectionStyle"></div>
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
    selection?: { start: Date; end: Date; allDay?: boolean } | null;
}>();

const emit = defineEmits<{
    'open-event': [occ: OccurrenceInstance];
    'create': [range: { start: Date; end: Date; allDay?: boolean; clientX?: number; clientY?: number }];
    'reschedule': [payload: { occ: OccurrenceInstance; start: Date; end: Date }];
}>();

const ROW_HEIGHT = 56;
const rowHeight = ROW_HEIGHT;
const SNAP_MINUTES = 15;
const MIN_DURATION = 15;
const hours = Array.from({ length: 24 }, (_, i) => i);

function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const weekdayLabel = computed(() => props.cursorDate.toLocaleDateString('fr-FR', { weekday: 'long' }));

const isToday = computed(() => {
    const today = new Date();
    return isoDay(today) === isoDay(props.cursorDate);
});

const dayOccurrences = computed(() => {
    const iso = isoDay(props.cursorDate);
    // Un événement multi-jours reste visible sur chaque jour qu'il traverse,
    // pas seulement celui où il démarre.
    return props.occurrences
        .filter(o => {
            const startIso = isoDay(new Date(o.startAt));
            const endIso = isoDay(new Date(o.endAt));
            return iso >= startIso && iso <= endIso;
        })
        .slice()
        .sort((a, b) => a.startAt.localeCompare(b.startAt));
});

function isMultiDay(occ: OccurrenceInstance): boolean {
    return isoDay(new Date(occ.startAt)) !== isoDay(new Date(occ.endAt));
}

const allDayOccurrences = computed(() => dayOccurrences.value.filter(o => o.allDay));
const timedOccurrences = computed(() => dayOccurrences.value.filter(o => !o.allDay));

const allDayDate = computed(() => {
    const d = new Date(props.cursorDate);
    d.setHours(0, 0, 0, 0);
    return d;
});

const allDayEnd = computed(() => {
    const d = new Date(props.cursorDate);
    d.setHours(23, 59, 0, 0);
    return d;
});

function eventStyle(occ: OccurrenceInstance) {
    const start = new Date(occ.startAt);
    const end = new Date(occ.endAt);
    const iso = isoDay(props.cursorDate);
    const startIso = isoDay(start);
    const endIso = isoDay(end);

    const startMinutes = iso === startIso ? start.getHours() * 60 + start.getMinutes() : 0;
    const endMinutes = iso === endIso ? end.getHours() * 60 + end.getMinutes() : 24 * 60;
    let durationMinutes = endMinutes - startMinutes;
    if (durationMinutes < 20) durationMinutes = 20;

    const top = (startMinutes / 60) * rowHeight;
    const height = (durationMinutes / 60) * rowHeight;

    return {
        top: `${top}px`,
        height: `${height}px`,
        '--event-color': occ.color || undefined
    };
}

// ── Sélection persistante (reste affichée pendant la création) ────────
const selectionStyle = computed(() => {
    if (!props.selection) return {};
    const s = props.selection.start;
    const e = props.selection.end;
    const startMin = s.getHours() * 60 + s.getMinutes();
    const endMin = e.getHours() * 60 + e.getMinutes();
    const top = (startMin / 60) * rowHeight;
    const height = Math.max((endMin - startMin) / 60 * rowHeight, (SNAP_MINUTES / 60) * rowHeight);
    return { top: `${top}px`, height: `${height}px` };
});

// ── Sélection par glisser (façon Google Agenda) ──────────────────────
interface DragState {
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

function onPointerDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;

    drag.value = { colTop: rect.top, startY: y, currentY: y };
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
    if (rawEnd - rawStart < SNAP_MINUTES) rawEnd = rawStart + 30;

    const start = new Date(props.cursorDate);
    start.setHours(0, rawStart, 0, 0);
    const end = new Date(props.cursorDate);
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

// ── Déplacement / redimensionnement d'un événement existant ───────────
type EventDragMode = 'move' | 'resize-top' | 'resize-bottom';

interface EventDragState {
    occ: OccurrenceInstance;
    mode: EventDragMode;
    pointerStartY: number;
    origStartMin: number;
    origEndMin: number;
    currentStartMin: number;
    currentEndMin: number;
}

const eventDrag = ref<EventDragState | null>(null);

function minutesOfDay(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
}

function startEventDrag(e: MouseEvent, occ: OccurrenceInstance, mode: EventDragMode) {
    if (e.button !== 0) return;
    const start = new Date(occ.startAt);
    const end = new Date(occ.endAt);

    eventDrag.value = {
        occ,
        mode,
        pointerStartY: e.clientY,
        origStartMin: minutesOfDay(start),
        origEndMin: minutesOfDay(end),
        currentStartMin: minutesOfDay(start),
        currentEndMin: minutesOfDay(end)
    };
    window.addEventListener('mousemove', onEventDragMove);
    window.addEventListener('mouseup', onEventDragEnd);
}

function onEventDragMove(e: MouseEvent) {
    if (!eventDrag.value) return;
    const d = eventDrag.value;
    const deltaMin = snap((e.clientY - d.pointerStartY) / rowHeight * 60);

    if (d.mode === 'move') {
        const duration = d.origEndMin - d.origStartMin;
        let newStart = d.origStartMin + deltaMin;
        let newEnd = newStart + duration;
        if (newStart < 0) { newStart = 0; newEnd = duration; }
        if (newEnd > 24 * 60) { newEnd = 24 * 60; newStart = 24 * 60 - duration; }
        eventDrag.value = { ...d, currentStartMin: newStart, currentEndMin: newEnd };
    } else if (d.mode === 'resize-top') {
        const newStart = Math.min(d.origEndMin - MIN_DURATION, Math.max(0, d.origStartMin + deltaMin));
        eventDrag.value = { ...d, currentStartMin: newStart, currentEndMin: d.origEndMin };
    } else {
        const newEnd = Math.max(d.origStartMin + MIN_DURATION, Math.min(24 * 60, d.origEndMin + deltaMin));
        eventDrag.value = { ...d, currentStartMin: d.origStartMin, currentEndMin: newEnd };
    }
}

function onEventDragEnd() {
    window.removeEventListener('mousemove', onEventDragMove);
    window.removeEventListener('mouseup', onEventDragEnd);
    if (!eventDrag.value) return;

    const d = eventDrag.value;
    eventDrag.value = null;

    const newStart = new Date(props.cursorDate);
    newStart.setHours(0, d.currentStartMin, 0, 0);
    const newEnd = new Date(props.cursorDate);
    newEnd.setHours(0, d.currentEndMin, 0, 0);

    const origStart = new Date(d.occ.startAt);
    const origEnd = new Date(d.occ.endAt);
    if (newStart.getTime() === origStart.getTime() && newEnd.getTime() === origEnd.getTime()) return;

    emit('reschedule', { occ: d.occ, start: newStart, end: newEnd });
}

const eventDragGhostStyle = computed(() => {
    if (!eventDrag.value) return {};
    const top = (eventDrag.value.currentStartMin / 60) * rowHeight;
    const height = ((eventDrag.value.currentEndMin - eventDrag.value.currentStartMin) / 60) * rowHeight;
    return { top: `${top}px`, height: `${height}px` };
});

const eventDragLabel = computed(() => {
    if (!eventDrag.value) return '';
    const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    return `${fmt(eventDrag.value.currentStartMin)} – ${fmt(eventDrag.value.currentEndMin)}`;
});
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
    grid-template-columns: 56px 1fr;
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
    grid-template-columns: 56px 1fr;
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
    grid-template-columns: 56px 1fr;
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
    cursor: crosshair;
    user-select: none;
}

.time-grid-hour-line {
    border-bottom: 1px solid var(--border-color);
}

.time-grid-event {
    position: absolute;
    left: 4px;
    right: 4px;
    border-radius: 6px;
    overflow: visible;
    cursor: grab;
    z-index: 1;
}

.time-grid-event.is-event-dragging {
    opacity: 0.3;
    pointer-events: none;
}

.time-grid-resize-handle {
    position: absolute;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
    z-index: 3;
}
.time-grid-resize-handle.top { top: -2px; }
.time-grid-resize-handle.bottom { bottom: -2px; }

.time-grid-drag-ghost {
    position: absolute;
    left: 4px;
    right: 4px;
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
    overflow: hidden;
    white-space: nowrap;
}

.time-grid-drag-ghost.is-event-preview {
    z-index: 4;
    background: color-mix(in srgb, var(--primary) 45%, transparent);
}

.time-grid-selection-ghost {
    position: absolute;
    left: 4px;
    right: 4px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--primary) 22%, transparent);
    border: 1.5px solid var(--primary);
    z-index: 1;
    pointer-events: none;
}
</style>
