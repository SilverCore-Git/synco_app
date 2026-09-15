<template>
    <div class="time-grid">
        <div class="time-grid-header" ref="headerEl">
            <div class="time-grid-gutter-header sticky-gutter"></div>
            <div
                v-for="day in days"
                :key="'h-' + day.iso"
                class="time-grid-day-header"
                :class="{ 'is-today': day.isToday }"
                :style="{ width: dayWidth + 'px' }"
            >
                <span class="time-grid-day-name">{{ day.weekdayLabel }}</span>
                <span class="time-grid-day-number">{{ day.date.getDate() }}</span>
            </div>
        </div>

        <div class="time-grid-allday" ref="alldayEl">
            <div class="time-grid-gutter-header time-grid-allday-label sticky-gutter">Journée</div>
            <div
                v-for="day in days"
                :key="'ad-' + day.iso"
                class="time-grid-allday-cell"
                :style="{ width: dayWidth + 'px' }"
                @click="emitCreate(allDayDate(day.date), allDayEndDate(day.date), true, $event)"
            >
                <EventChip
                    v-for="occ in day.allDayOccurrences"
                    :key="occ.occurrenceKey"
                    :occurrence="occ"
                    compact
                    @click="emit('open-event', occ)"
                />
            </div>
        </div>

        <div class="time-grid-body" ref="bodyEl" @scroll="onBodyScroll">
            <div class="time-grid-gutter-col sticky-gutter">
                <div v-for="h in hours" :key="'lbl-' + h" class="time-grid-hour-label" :style="{ height: rowHeight + 'px' }">
                    {{ String(h).padStart(2, '0') }}:00
                </div>
            </div>
            <div
                v-for="day in days"
                :key="'col-' + day.iso"
                class="time-grid-day-col"
                :data-iso="day.iso"
                :style="{ height: rowHeight * 24 + 'px', width: dayWidth + 'px' }"
                @mousedown="onPointerDown($event, day)"
            >
                <div v-for="h in hours" :key="'line-' + h" class="time-grid-hour-line" :style="{ height: rowHeight + 'px' }"></div>

                <div
                    v-for="occ in day.timedOccurrences"
                    :key="occ.occurrenceKey + '-' + day.iso"
                    class="time-grid-event"
                    :class="{ 'is-event-dragging': eventDrag?.occ.occurrenceKey === occ.occurrenceKey }"
                    :style="eventStyle(occ, day)"
                >
                    <div v-if="!isLocked(occ)" class="time-grid-resize-handle top" @mousedown.stop="startEventDrag($event, occ, 'resize-top')"></div>
                    <EventChip :occurrence="occ" @click="emit('open-event', occ)" @mousedown.stop="isLocked(occ) ? undefined : startEventDrag($event, occ, 'move')" />
                    <div v-if="!isLocked(occ)" class="time-grid-resize-handle bottom" @mousedown.stop="startEventDrag($event, occ, 'resize-bottom')"></div>
                </div>

                <div
                    v-if="eventDrag && eventDrag.currentIso === day.iso"
                    class="time-grid-drag-ghost is-event-preview"
                    :style="eventDragGhostStyle"
                >
                    {{ eventDrag.occ.title }} · {{ eventDragLabel }}
                </div>

                <div
                    v-if="dragGhosts.get(day.iso)"
                    class="time-grid-drag-ghost"
                    :style="dragGhosts.get(day.iso)!.style"
                >
                    {{ dragGhosts.get(day.iso)!.label }}
                </div>

                <div
                    v-if="!drag && !selection?.allDay && selectionSpans.get(day.iso)"
                    class="time-grid-selection-ghost"
                    :style="{ top: selectionSpans.get(day.iso)!.top + 'px', height: selectionSpans.get(day.iso)!.height + 'px' }"
                ></div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import EventChip from './EventChip.vue';
import { isTaskDeadlineOccurrence, type OccurrenceInstance } from '@/types/agenda';

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

const ROW_HEIGHT = 48;
const rowHeight = ROW_HEIGHT;
const SNAP_MINUTES = 15;
const MIN_DURATION = 15;
const hours = Array.from({ length: 24 }, (_, i) => i);
const GUTTER_WIDTH = 56;
const VISIBLE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
}

function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ── Défilement horizontal fluide et "infini" ────────────────────────────
// Contrairement à une semaine calendaire figée, la grille affiche une
// fenêtre glissante de jours consécutifs bien plus large que les 7 jours
// visibles à l'écran (INITIAL_HALF de chaque côté du curseur), avec un
// vrai scroll natif du navigateur (aucune interception de wheel, aucun
// saut discret) — c'est ça qui rend le défilement lisse. Approcher un
// bord de cette fenêtre l'étend silencieusement (ajout de jours), jusqu'à
// un plafond (MAX_HALF) qui borne le nombre de colonnes réellement
// présentes dans le DOM. Les données (props.occurrences) couvrent déjà
// cette plage large (voir AgendaView.vue::computeRangeISO), donc étendre
// la fenêtre n'a jamais besoin d'aller chercher de nouvelles données.
const INITIAL_HALF = 45;
const MAX_HALF = 120;
const EDGE_MARGIN = 10;
const EXTEND_CHUNK = 30;

const bufferStart = ref<Date>(startOfDay(props.cursorDate));
const bufferDayCount = ref(INITIAL_HALF * 2 + 1);
let originalCenter = startOfDay(props.cursorDate);

function resetBuffer(center: Date) {
    originalCenter = startOfDay(center);
    const start = new Date(originalCenter);
    start.setDate(start.getDate() - INITIAL_HALF);
    bufferStart.value = start;
    bufferDayCount.value = INITIAL_HALF * 2 + 1;
}

const headerEl = ref<HTMLElement | null>(null);
const alldayEl = ref<HTMLElement | null>(null);
const bodyEl = ref<HTMLElement | null>(null);
const dayWidth = ref(120);

function measureDayWidth() {
    if (!bodyEl.value) return;
    const available = bodyEl.value.clientWidth - GUTTER_WIDTH;
    dayWidth.value = Math.max(80, Math.floor(available / VISIBLE_DAYS));
}

function scrollToCenter() {
    if (!bodyEl.value) return;
    bodyEl.value.scrollLeft = INITIAL_HALF * dayWidth.value;
    if (headerEl.value) headerEl.value.scrollLeft = bodyEl.value.scrollLeft;
    if (alldayEl.value) alldayEl.value.scrollLeft = bodyEl.value.scrollLeft;
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
    measureDayWidth();
    resizeObserver = new ResizeObserver(() => {
        measureDayWidth();
    });
    if (bodyEl.value) resizeObserver.observe(bodyEl.value);
    nextTick(scrollToCenter);
});

onUnmounted(() => {
    resizeObserver?.disconnect();
});

// Un changement de cursorDate (bouton précédent/suivant, "Aujourd'hui",
// passage dans un autre mode puis retour) recentre la fenêtre et resynchronise
// le scroll ; le défilement horizontal lui-même ne touche jamais cursorDate
// (voir onBodyScroll/maybeExtendBuffer), donc aucun risque de boucle ou de
// rechargement de données pendant qu'on scroll.
watch(() => props.cursorDate, (newDate) => {
    resetBuffer(newDate);
    nextTick(scrollToCenter);
});

let rafScheduled = false;
function onBodyScroll() {
    if (!bodyEl.value) return;
    if (headerEl.value) headerEl.value.scrollLeft = bodyEl.value.scrollLeft;
    if (alldayEl.value) alldayEl.value.scrollLeft = bodyEl.value.scrollLeft;

    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
        rafScheduled = false;
        maybeExtendBuffer();
    });
}

function maybeExtendBuffer() {
    if (!bodyEl.value || dayWidth.value <= 0) return;
    const leftIndex = bodyEl.value.scrollLeft / dayWidth.value;

    // Bord gauche : ajoute des jours avant, en compensant scrollLeft pour
    // qu'aucun saut visuel ne se produise (le contenu déjà visible ne bouge pas).
    if (leftIndex < EDGE_MARGIN) {
        const earliestAllowed = new Date(originalCenter);
        earliestAllowed.setDate(earliestAllowed.getDate() - MAX_HALF);
        const currentSpan = (bufferStart.value.getTime() - earliestAllowed.getTime()) / DAY_MS;
        const add = Math.max(0, Math.min(EXTEND_CHUNK, Math.floor(currentSpan)));
        if (add > 0) {
            bufferStart.value = new Date(bufferStart.value.getTime() - add * DAY_MS);
            bufferDayCount.value += add;
            nextTick(() => {
                if (!bodyEl.value) return;
                const delta = add * dayWidth.value;
                bodyEl.value.scrollLeft += delta;
                if (headerEl.value) headerEl.value.scrollLeft = bodyEl.value.scrollLeft;
                if (alldayEl.value) alldayEl.value.scrollLeft = bodyEl.value.scrollLeft;
            });
        }
        return;
    }

    // Bord droit : ajoute des jours après (aucune compensation nécessaire,
    // le contenu existant ne se déplace pas quand on ajoute à la suite).
    if (leftIndex > bufferDayCount.value - VISIBLE_DAYS - EDGE_MARGIN) {
        const latestAllowedEnd = new Date(originalCenter);
        latestAllowedEnd.setDate(latestAllowedEnd.getDate() + MAX_HALF);
        const bufferEnd = new Date(bufferStart.value.getTime() + bufferDayCount.value * DAY_MS);
        const currentSpan = (latestAllowedEnd.getTime() - bufferEnd.getTime()) / DAY_MS;
        const add = Math.max(0, Math.min(EXTEND_CHUNK, Math.floor(currentSpan)));
        if (add > 0) bufferDayCount.value += add;
    }
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Un événement qui dure plusieurs jours est répété dans chaque colonne
    // de jour qu'il traverse (pas seulement sa colonne de départ).
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

    const list: DayColumn[] = [];
    for (let i = 0; i < bufferDayCount.value; i++) {
        const date = new Date(bufferStart.value);
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

function isMultiDay(occ: OccurrenceInstance): boolean {
    return isoDay(new Date(occ.startAt)) !== isoDay(new Date(occ.endAt));
}

// Ni un événement multi-jours (glisser un segment corromprait la série),
// ni une échéance de tâche (pas un vrai CalendarEvent) ne sont déplaçables
// par glisser-déposer dans la grille.
function isLocked(occ: OccurrenceInstance): boolean {
    return isMultiDay(occ) || isTaskDeadlineOccurrence(occ.eventId);
}

// Découpe la portion d'un événement (éventuellement multi-jours) visible
// dans une colonne de jour donnée.
function eventStyle(occ: OccurrenceInstance, day: DayColumn) {
    const start = new Date(occ.startAt);
    const end = new Date(occ.endAt);
    const startIso = isoDay(start);
    const endIso = isoDay(end);

    const startMinutes = day.iso === startIso ? start.getHours() * 60 + start.getMinutes() : 0;
    const endMinutes = day.iso === endIso ? end.getHours() * 60 + end.getMinutes() : 24 * 60;
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

// ── Géométrie partagée : découpe un intervalle [start, end] (qui peut
// traverser plusieurs jours) en un rectangle par colonne de jour traversée.
function combineDateAndMinutes(date: Date, minutes: number): Date {
    const d = new Date(date);
    d.setHours(0, minutes, 0, 0);
    return d;
}

function buildDaySpans(start: Date, end: Date): Map<string, { top: number; height: number }> {
    const startIso = isoDay(start);
    const endIso = isoDay(end);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    const map = new Map<string, { top: number; height: number }>();
    for (const day of days.value) {
        if (day.iso < startIso || day.iso > endIso) continue;
        const topMin = day.iso === startIso ? startMinutes : 0;
        const bottomMin = day.iso === endIso ? endMinutes : 24 * 60;
        const top = (topMin / 60) * rowHeight;
        const height = Math.max(((bottomMin - topMin) / 60) * rowHeight, (SNAP_MINUTES / 60) * rowHeight);
        map.set(day.iso, { top, height });
    }
    return map;
}

// ── Sélection persistante (reste affichée pendant la création) ────────
const selectionSpans = computed(() => {
    if (!props.selection || props.selection.allDay) return new Map<string, { top: number; height: number }>();
    return buildDaySpans(props.selection.start, props.selection.end);
});

// ── Sélection par glisser (façon Google Agenda) — peut traverser
// plusieurs colonnes de jour, ex: mardi 8h → samedi 20h.
interface DragState {
    anchorIso: string;
    anchorDate: Date;
    colTop: number;
    startY: number;
    currentY: number;
    currentIso: string;
    currentDate: Date;
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

    drag.value = {
        anchorIso: day.iso,
        anchorDate: day.date,
        colTop: rect.top,
        startY: y,
        currentY: y,
        currentIso: day.iso,
        currentDate: day.date
    };
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
}

function onPointerMove(e: MouseEvent) {
    if (!drag.value) return;
    const y = Math.max(0, Math.min(rowHeight * 24, e.clientY - drag.value.colTop));

    const hovered = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.time-grid-day-col') as HTMLElement | null;
    const hoveredIso = hovered?.dataset.iso;
    const hoveredDay = hoveredIso ? days.value.find(d => d.iso === hoveredIso) : null;

    drag.value = {
        ...drag.value,
        currentY: y,
        currentIso: hoveredDay?.iso || drag.value.currentIso,
        currentDate: hoveredDay?.date || drag.value.currentDate
    };
}

// Résout le point de départ/fin chronologique réel d'un glisser (l'ancre
// n'est pas toujours le point le plus tôt : on peut glisser vers la gauche
// ou vers le haut).
const dragSpan = computed(() => {
    if (!drag.value) return null;
    const d = drag.value;
    const anchorMinutes = snap(pxToMinutes(d.startY));
    const currentMinutes = snap(pxToMinutes(d.currentY));
    const dtAnchor = combineDateAndMinutes(d.anchorDate, anchorMinutes);
    const dtCurrent = combineDateAndMinutes(d.currentDate, currentMinutes);
    const reversed = dtCurrent.getTime() < dtAnchor.getTime();

    return {
        start: reversed ? dtCurrent : dtAnchor,
        end: reversed ? dtAnchor : dtCurrent,
        startMinutes: reversed ? currentMinutes : anchorMinutes,
        endMinutes: reversed ? anchorMinutes : currentMinutes
    };
});

function onPointerUp(e: MouseEvent) {
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    if (!drag.value || !dragSpan.value) { drag.value = null; return; }

    const span = dragSpan.value;
    drag.value = null;

    let { start, end } = span;
    if (end.getTime() - start.getTime() < SNAP_MINUTES * 60000) {
        end = new Date(start.getTime() + 30 * 60000); // simple clic → créneau de 30 min par défaut
    }

    emit('create', { start, end, clientX: e.clientX, clientY: e.clientY });
}

const dragGhosts = computed(() => {
    const span = dragSpan.value;
    if (!span) return new Map<string, { style: Record<string, string>; label: string }>();

    const spans = buildDaySpans(span.start, span.end);
    const startIso = isoDay(span.start);
    const endIso = isoDay(span.end);
    const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

    const map = new Map<string, { style: Record<string, string>; label: string }>();
    for (const [iso, geom] of spans) {
        let label = '';
        if (startIso === endIso) label = `${fmt(span.startMinutes)} – ${fmt(span.endMinutes)}`;
        else if (iso === startIso) label = `${fmt(span.startMinutes)} →`;
        else if (iso === endIso) label = `→ ${fmt(span.endMinutes)}`;
        map.set(iso, { style: { top: `${geom.top}px`, height: `${geom.height}px` }, label });
    }
    return map;
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

// ── Déplacement / redimensionnement d'un événement existant ───────────
type EventDragMode = 'move' | 'resize-top' | 'resize-bottom';

interface EventDragState {
    occ: OccurrenceInstance;
    mode: EventDragMode;
    pointerStartY: number;
    origStartMin: number;
    origEndMin: number;
    origIso: string;
    currentStartMin: number;
    currentEndMin: number;
    currentIso: string;
}

const eventDrag = ref<EventDragState | null>(null);

function minutesOfDay(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
}

function startEventDrag(e: MouseEvent, occ: OccurrenceInstance, mode: EventDragMode) {
    if (e.button !== 0) return;
    const start = new Date(occ.startAt);
    const end = new Date(occ.endAt);
    const iso = isoDay(start);

    eventDrag.value = {
        occ,
        mode,
        pointerStartY: e.clientY,
        origStartMin: minutesOfDay(start),
        origEndMin: minutesOfDay(end),
        origIso: iso,
        currentStartMin: minutesOfDay(start),
        currentEndMin: minutesOfDay(end),
        currentIso: iso
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

        const hovered = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.time-grid-day-col') as HTMLElement | null;
        const iso = hovered?.dataset.iso || d.currentIso;

        eventDrag.value = { ...d, currentStartMin: newStart, currentEndMin: newEnd, currentIso: iso };
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

    const targetIso = d.mode === 'move' ? d.currentIso : d.origIso;
    const [y, m, day] = targetIso.split('-').map(Number) as [number, number, number];
    const newStart = new Date(y, m - 1, day);
    newStart.setHours(0, d.currentStartMin, 0, 0);
    const newEnd = new Date(y, m - 1, day);
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
    display: flex;
    overflow: hidden;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
}

.sticky-gutter {
    position: sticky;
    left: 0;
    z-index: 5;
    background: var(--bg);
    flex-shrink: 0;
    width: 56px;
}

.time-grid-gutter-header {
    border-right: 1px solid var(--border-color);
}

.time-grid-day-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
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
    display: flex;
    overflow: hidden;
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
    flex-shrink: 0;
    border-right: 1px solid var(--border-color);
    padding: 3px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: pointer;
}

.time-grid-body {
    flex: 1;
    display: flex;
    overflow: auto;
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
    flex-shrink: 0;
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
    overflow: hidden;
    white-space: nowrap;
}

.time-grid-drag-ghost.is-event-preview {
    z-index: 4;
    background: color-mix(in srgb, var(--primary) 45%, transparent);
}

.time-grid-selection-ghost {
    position: absolute;
    left: 2px;
    right: 2px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--primary) 22%, transparent);
    border: 1.5px solid var(--primary);
    z-index: 1;
    pointer-events: none;
}
</style>
