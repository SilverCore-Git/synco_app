<template>
    <RouterLink :to="to" class="evt" :class="{ 'is-past': isPast }">
        <span class="evt-bar" :style="{ background: accent }"></span>

        <div class="evt-time">
            <template v-if="occurrence.allDay">
                <i class="bi bi-brightness-high text-sm"></i>
                <span class="evt-time-sub">Journée</span>
            </template>
            <template v-else>
                <span class="evt-time-start">{{ startTime }}</span>
                <span class="evt-time-sub">{{ endTime }}</span>
            </template>
        </div>

        <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-(--text) truncate">{{ occurrence.title }}</p>
            <p v-if="metaParts.length" class="text-[11px] text-(--text2) truncate flex items-center gap-1.5">
                <i v-if="occurrence.isRecurring" class="bi bi-arrow-repeat shrink-0"></i>
                <span class="truncate">{{ metaParts.join(' · ') }}</span>
            </p>
        </div>

        <span v-if="isOngoing" class="evt-live">
            <span class="evt-live-dot"></span> En cours
        </span>
    </RouterLink>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import type { OccurrenceInstance } from '@/types/agenda';

const props = defineProps<{
    occurrence: OccurrenceInstance;
    to: RouteLocationRaw;
    // Horloge fournie par le parent (un seul timer pour toute la liste) afin
    // que « en cours » et l'estompage du passé restent justes sans un
    // setInterval par ligne.
    now: number;
}>();

const accent = computed(() => props.occurrence.color || 'var(--primary)');

const startMs = computed(() => new Date(props.occurrence.startAt).getTime());
const endMs = computed(() => new Date(props.occurrence.endAt).getTime());

const isOngoing = computed(() =>
    !props.occurrence.allDay && props.now >= startMs.value && props.now < endMs.value
);

const isPast = computed(() => !props.occurrence.allDay && props.now >= endMs.value);

function formatTime(ms: number): string {
    return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const startTime = computed(() => formatTime(startMs.value));
const endTime = computed(() => formatTime(endMs.value));

const metaParts = computed(() => {
    const parts: string[] = [];
    if (props.occurrence.location) parts.push(props.occurrence.location);
    const attendees = props.occurrence.attendees?.length || 0;
    if (attendees > 0) parts.push(`${attendees} participant${attendees > 1 ? 's' : ''}`);
    if (parts.length === 0 && props.occurrence.isRecurring) parts.push('Récurrent');
    return parts;
});
</script>

<style scoped>
.evt {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.7rem 0.55rem 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 0.85rem;
    background: var(--surface-sunken);
    overflow: hidden;
    transition: border-color 0.15s, transform 0.15s, background-color 0.15s;
}

.evt:hover {
    border-color: var(--glow-primary-strong);
    transform: translateX(2px);
}

.evt.is-past {
    opacity: 0.55;
}

/* Liseré de la couleur de l'évènement — le seul rappel de couleur, pour que la
   liste reste lisible même avec des couleurs très saturées. */
.evt-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    border-radius: 3px;
}

.evt-time {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    width: 3rem;
    flex-shrink: 0;
    color: var(--text);
}

.evt-time-start {
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.1;
}

.evt-time-sub {
    font-size: 0.65rem;
    color: var(--text2);
    line-height: 1.2;
}

.evt-live {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    flex-shrink: 0;
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--primary);
    background: var(--glow-primary-faint);
    border-radius: 999px;
    padding: 0.15rem 0.45rem;
}

.evt-live-dot {
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 999px;
    background: var(--primary);
    animation: evt-pulse 1.8s ease-in-out infinite;
}

@keyframes evt-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
}
</style>
