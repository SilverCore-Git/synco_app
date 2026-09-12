<template>
    <div
        class="event-chip"
        :class="[compact ? 'event-chip-compact' : 'event-chip-full', statusClass, { 'event-chip-deadline': isDeadline }]"
        :style="colorStyle"
        :title="tooltip"
        @click.stop="emit('click')"
    >
        <i v-if="isDeadline" class="bi bi-flag-fill event-chip-deadline-icon"></i>
        <span v-if="!occurrence.allDay && !isDeadline" class="event-chip-time">{{ timeLabel }}</span>
        <span class="event-chip-title">{{ occurrence.title }}</span>
        <i v-if="occurrence.isRecurring" class="bi bi-arrow-repeat event-chip-recurring-icon" title="Événement récurrent"></i>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { isTaskDeadlineOccurrence, type OccurrenceInstance } from '@/types/agenda';
import { user } from '@/assets/var';

const props = defineProps<{
    occurrence: OccurrenceInstance;
    compact?: boolean;
}>();

const emit = defineEmits<{
    click: [];
}>();

const isDeadline = computed(() => isTaskDeadlineOccurrence(props.occurrence.eventId));

const myAttendance = computed(() => props.occurrence.attendees.find(a => a.userId === user.value?.id));

const statusClass = computed(() => {
    if (!myAttendance.value) return 'status-default';
    switch (myAttendance.value.status) {
        case 'ACCEPTED': return 'status-accepted';
        case 'DECLINED': return 'status-declined';
        case 'TENTATIVE': return 'status-tentative';
        default: return 'status-pending';
    }
});

const timeLabel = computed(() => {
    const d = new Date(props.occurrence.startAt);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
});

const tooltip = computed(() => {
    const base = props.occurrence.location
        ? `${props.occurrence.title} — ${props.occurrence.location}`
        : props.occurrence.title;
    return isDeadline.value ? `Échéance — ${base}` : base;
});

// La couleur personnalisée ne s'applique que sur les statuts "neutres" —
// décliné/tentative gardent leur code couleur sémantique (rouge/ambre), plus
// important à voir d'un coup d'œil que la couleur de préférence de l'événement.
const colorStyle = computed(() => {
    const c = props.occurrence.color;
    if (!c || statusClass.value === 'status-declined' || statusClass.value === 'status-tentative') return {};
    return {
        borderLeftColor: c,
        backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)`
    };
});
</script>

<style scoped>
.event-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    border-left: 3px solid var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--text);
    transition: background 0.15s ease;
    width: 100%;
}

.event-chip:hover {
    background: color-mix(in srgb, var(--primary) 26%, transparent);
}

.event-chip-full {
    height: 100%;
    align-items: flex-start;
    flex-direction: column;
    padding: 4px 6px;
}

.event-chip-time {
    opacity: 0.75;
    font-weight: 600;
    flex-shrink: 0;
}

.event-chip-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

.event-chip-recurring-icon {
    font-size: 10px;
    opacity: 0.7;
    flex-shrink: 0;
}

.status-declined {
    border-left-color: #ef4444;
    background: color-mix(in srgb, #ef4444 12%, transparent);
    text-decoration: line-through;
    opacity: 0.7;
}

.status-tentative {
    border-left-color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 14%, transparent);
}

.event-chip.is-event-dragging {
    opacity: 0.3;
}

.status-pending {
    border-left-color: var(--text2);
    opacity: 0.85;
}

.event-chip-deadline {
    border-left-style: dashed;
    border-left-color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 14%, transparent);
}

.event-chip-deadline-icon {
    font-size: 9px;
    color: #f59e0b;
    flex-shrink: 0;
}
</style>
