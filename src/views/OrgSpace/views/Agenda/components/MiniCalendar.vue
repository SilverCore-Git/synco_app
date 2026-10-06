<template>
    <div class="mini-cal">
        <div class="mini-cal-header">
            <span class="mini-cal-month">{{ monthLabel }}</span>
            <div class="flex items-center gap-1">
                <button class="mini-cal-nav" @click="emit('navigate-month', -1)"><i class="bi bi-chevron-left"></i></button>
                <button class="mini-cal-nav" @click="emit('navigate-month', 1)"><i class="bi bi-chevron-right"></i></button>
            </div>
        </div>

        <div class="mini-cal-weekdays">
            <span v-for="d in weekdayLabels" :key="d">{{ d }}</span>
        </div>

        <div class="mini-cal-days">
            <button
                v-for="day in days"
                :key="day.iso"
                class="mini-cal-day"
                :class="{
                    'is-other-month': !day.inMonth,
                    'is-today': day.isToday,
                    'is-selected': day.isSelected,
                    'has-events': day.hasEvents,
                    'is-in-range': day.inRange,
                    'is-range-start': day.rangeStart,
                    'is-range-end': day.rangeEnd
                }"
                @click="emit('pick-day', day.date)"
            >
                {{ day.date.getDate() }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OccurrenceInstance } from '@/types/agenda';

const props = defineProps<{
    cursorDate: Date;
    occurrences: OccurrenceInstance[];
    // Semaine actuellement visible dans WeekGrid (fenêtre glissante, pas
    // forcément lundi-dimanche) — affichée comme un bandeau plutôt qu'un
    // simple jour sélectionné, et mise à jour en direct pendant le scroll
    // (voir AgendaView.vue). Absent/null en mode mois ou jour.
    highlightStart?: Date | null;
    highlightEnd?: Date | null;
}>();

const emit = defineEmits<{
    'pick-day': [date: Date];
    'navigate-month': [delta: number];
}>();

const weekdayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function startOfWeek(d: Date): Date {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7;
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

const monthLabel = computed(() => props.cursorDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));

interface MiniDay {
    date: Date;
    iso: string;
    inMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
    hasEvents: boolean;
    // Semaine affichée dans WeekGrid (fenêtre glissante, pas forcément
    // lundi-dimanche) — teinte directement le bouton du jour plutôt qu'un
    // rectangle superposé par-dessus (qui ignorait la forme ronde des
    // boutons et rendait mal, voir git log). rangeStart/rangeEnd ne
    // marquent les coins arrondis qu'aux deux bouts réels de la semaine
    // (ou de la ligne de grille, si la semaine traverse deux lignes) pour
    // former un bandeau continu plutôt que 7 carrés séparés.
    inRange: boolean;
    rangeStart: boolean;
    rangeEnd: boolean;
}

const days = computed<MiniDay[]>(() => {
    const cursor = props.cursorDate;
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = new Date(monthEnd);
    const endOffset = (gridEnd.getDay() + 6) % 7;
    gridEnd.setDate(gridEnd.getDate() + (6 - endOffset));
    gridEnd.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Le bandeau de semaine (inRange ci-dessous) remplace le simple point
    // "jour sélectionné" pendant qu'un range est actif — évite la
    // redondance visuelle avec cursorDate qui, lui, reste figé sur le point
    // de départ de la navigation (voir AgendaView.vue).
    const selectedIso = props.highlightStart ? null : isoDay(cursor);
    const rangeStartIso = props.highlightStart ? isoDay(props.highlightStart) : null;
    const rangeEndIso = props.highlightEnd ? isoDay(props.highlightEnd) : null;

    const eventDays = new Set(props.occurrences.map(o => isoDay(new Date(o.startAt))));

    const list: MiniDay[] = [];
    const ptr = new Date(gridStart);
    let col = 0;
    while (ptr.getTime() <= gridEnd.getTime()) {
        const iso = isoDay(ptr);
        const inRange = rangeStartIso !== null && rangeEndIso !== null && iso >= rangeStartIso && iso <= rangeEndIso;
        list.push({
            date: new Date(ptr),
            iso,
            inMonth: ptr.getMonth() === cursor.getMonth(),
            isToday: ptr.getTime() === today.getTime(),
            isSelected: iso === selectedIso,
            hasEvents: eventDays.has(iso),
            inRange,
            // col === 0/6 : début/fin de la ligne de grille (la semaine
            // continue sur la ligne suivante) ; iso === rangeStartIso/EndIso :
            // véritable début/fin de la semaine affichée.
            rangeStart: inRange && (col === 0 || iso === rangeStartIso),
            rangeEnd: inRange && (col === 6 || iso === rangeEndIso)
        });
        ptr.setDate(ptr.getDate() + 1);
        col = (col + 1) % 7;
    }
    return list;
});
</script>

<style scoped>
.mini-cal {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
}

.mini-cal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.mini-cal-month {
    font-size: 12px;
    font-weight: 800;
    color: var(--text);
    text-transform: capitalize;
}

.mini-cal-nav {
    color: var(--text2);
    font-size: 11px;
    padding: 3px;
    border-radius: 6px;
}
.mini-cal-nav:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.06);
}

.mini-cal-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
}
.mini-cal-weekdays span {
    text-align: center;
    font-size: 9px;
    font-weight: 700;
    color: var(--text2);
    text-transform: uppercase;
}

.mini-cal-days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    row-gap: 2px;
}

.mini-cal-day {
    position: relative;
    z-index: 1;
    aspect-ratio: 1;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--text);
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.mini-cal-day:hover {
    background: rgba(255, 255, 255, 0.08);
}

.mini-cal-day.is-other-month {
    color: var(--text2);
    opacity: 0.45;
}

/* Semaine affichée dans WeekGrid : bandeau continu formé par les fonds des
   boutons eux-mêmes (coins carrés) avec les deux bouts arrondis — pas de
   calque séparé par-dessus, donc jamais de décalage avec la forme ronde
   des jours. */
.mini-cal-day.is-in-range {
    border-radius: 0;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
}
.mini-cal-day.is-range-start {
    border-radius: 999px 0 0 999px;
}
.mini-cal-day.is-range-end {
    border-radius: 0 999px 999px 0;
}

.mini-cal-day.is-today {
    border-radius: 999px;
    background: var(--primary);
    color: white;
    font-weight: 800;
}

.mini-cal-day.is-selected {
    background: var(--primary);
    color: white;
}

.mini-cal-day.has-events:not(.is-selected):not(.is-today)::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 3px;
    height: 3px;
    border-radius: 999px;
    background: var(--primary);
}
</style>
