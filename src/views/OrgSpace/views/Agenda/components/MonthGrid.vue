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
                :class="{ 'is-other-month': !day.inMonth, 'is-today': day.isToday }"
                @click="emit('create', day.date)"
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
import { computed } from 'vue';
import EventChip from './EventChip.vue';
import type { OccurrenceInstance } from '@/types/agenda';

const props = defineProps<{
    cursorDate: Date;
    occurrences: OccurrenceInstance[];
}>();

const emit = defineEmits<{
    'open-event': [occ: OccurrenceInstance];
    'create': [date: Date];
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
