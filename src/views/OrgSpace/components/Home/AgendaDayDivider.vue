<template>
    <div class="day-divider">
        <div class="day-badge" :class="{ 'is-today': isToday }">
            <span class="day-weekday">{{ weekday }}</span>
            <span class="day-number">{{ dayNumber }}</span>
        </div>

        <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-(--text) truncate">{{ label }}</p>
            <p class="text-[11px] text-(--text2)">{{ count }} évènement{{ count > 1 ? 's' : '' }}</p>
        </div>

        <div class="h-px flex-1 bg-(--border-color)"></div>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
    date: Date;
    count: number;
}>();

const dayNumber = computed(() => props.date.getDate());
const weekday = computed(() => props.date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''));

const daysFromToday = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((props.date.getTime() - today.getTime()) / 86400000);
});

const isToday = computed(() => daysFromToday.value === 0);

const label = computed(() => {
    if (daysFromToday.value === 0) return "Aujourd'hui";
    if (daysFromToday.value === 1) return 'Demain';
    const sameYear = props.date.getFullYear() === new Date().getFullYear();
    return props.date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        ...(sameYear ? {} : { year: 'numeric' })
    });
});
</script>

<style scoped>
/* Collant en haut du conteneur scrollable : en défilant, le jour en cours de
   lecture reste identifiable sans remonter jusqu'à son séparateur. */
.day-divider {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.15rem 0.5rem;
    background: var(--bg2);
}

.day-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 2.35rem;
    padding: 0.2rem 0;
    border-radius: 0.7rem;
    border: 1px solid var(--border-color);
    background: var(--surface-sunken);
    flex-shrink: 0;
}

.day-badge.is-today {
    border-color: var(--glow-primary-strong);
    background: var(--glow-primary-faint);
}

.day-weekday {
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text2);
    line-height: 1;
}

.day-badge.is-today .day-weekday,
.day-badge.is-today .day-number {
    color: var(--primary);
}

.day-number {
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--text);
    line-height: 1.2;
}
</style>
