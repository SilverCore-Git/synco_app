<template>
    <section class="dash-card">
        <header class="dash-card-header">
            <div class="flex items-center gap-2">
                <i class="bi bi-calendar3 text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Les prochaines heures</h3>
            </div>
            <RouterLink :to="agendaLink" class="text-xs text-(--text2) hover:text-(--text)">
                Agenda <i class="bi bi-arrow-right"></i>
            </RouterLink>
        </header>

        <div class="p-4 pb-3 flex flex-col gap-3">
            <!-- Évènements sur la journée entière : hors de la frise horaire -->
            <div v-if="allDayToday.length" class="flex flex-wrap gap-1.5">
                <RouterLink
                    v-for="occ in allDayToday"
                    :key="`${occ.eventId}|${occ.occurrenceKey}`"
                    :to="eventLink(occ)"
                    class="allday"
                    :style="{ '--c': occ.color || 'var(--primary)' }"
                >
                    <i class="bi bi-brightness-high"></i> {{ occ.title }}
                </RouterLink>
            </div>

            <div v-if="loading" class="ruler animate-pulse" :style="{ height: `${HOURS * PX}px` }">
                <div v-for="i in 3" :key="i" class="absolute left-12 right-0 h-10 bg-(--text)/5 rounded-xl" :style="{ top: `${i * 70}px` }"></div>
            </div>

            <div v-else class="ruler" :style="{ height: `${HOURS * PX}px` }">
                <div v-for="h in hourMarks" :key="h.top" class="hour" :style="{ top: `${h.top}px` }">
                    <span class="tabular-nums">{{ h.label }}</span>
                </div>

                <RouterLink
                    v-for="b in blocks"
                    :key="b.key"
                    :to="eventLink(b.occ)"
                    class="evt"
                    :class="{ 'is-past': b.past }"
                    :style="b.style"
                    :title="`${b.occ.title} · ${b.range}`"
                >
                    <span class="font-semibold truncate">{{ b.occ.title }}</span>
                    <span v-if="b.height > 40" class="text-[11px] text-(--text2) truncate tabular-nums">
                        {{ b.range }}<template v-if="b.occ.location"> · {{ b.occ.location }}</template>
                    </span>
                </RouterLink>

                <div class="now-line" :style="{ top: `${nowTop}px` }">
                    <span class="tabular-nums">{{ nowLabel }}</span>
                </div>

                <p v-if="blocks.length === 0 && !error" class="ruler-empty" :style="{ top: `${Math.min(nowTop + 24, HOURS * PX - 48)}px` }">
                    Rien de prévu d'ici {{ endLabel }}
                </p>
                <button v-if="error" class="ruler-empty hover:text-(--text)" :style="{ top: `${Math.min(nowTop + 24, HOURS * PX - 48)}px` }" @click="$emit('retry')">
                    <i class="bi bi-arrow-clockwise"></i> {{ error }} Réessayer
                </button>
            </div>

            <div v-if="!loading" class="tomorrow">
                <template v-if="tomorrow.length">
                    <span>Demain · {{ tomorrow.length }} évènement{{ tomorrow.length > 1 ? 's' : '' }}</span>
                    <span class="truncate"><b class="text-(--text) font-semibold">{{ tomorrow[0]?.title }}</b>{{ tomorrowFirstAt }}</span>
                </template>
                <span v-else>Rien de prévu demain</span>
            </div>
        </div>
    </section>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { openedOrg } from '@/assets/var';
import { dayKeyOf, type UpcomingAgendaDay } from '@/composables/useUpcomingAgenda';
import type { OccurrenceInstance } from '@/types/agenda';

const props = defineProps<{
    days: UpcomingAgendaDay[];
    loading: boolean;
    error: string | null;
    now: number;
}>();

defineEmits<{ (e: 'retry'): void }>();

// Frise de 8 h qui commence une heure avant l'heure en cours : on voit ce qui
// vient de finir, ce qui est en cours et la suite de la journée.
const HOURS = 8;
const PX = 44;

const orgId = computed(() => openedOrg.value?.id);
const agendaLink = computed(() => `/${orgId.value}/agenda`);

function eventLink(occ: OccurrenceInstance) {
    return { path: `/${orgId.value}/agenda`, query: { eventId: occ.eventId } };
}

function hm(d: Date | number) {
    return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const windowStart = computed(() => {
    const d = new Date(props.now);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - 1);
    return d.getTime();
});
const windowEnd = computed(() => windowStart.value + HOURS * 3_600_000);

const yOf = (ms: number) => (ms - windowStart.value) / 3_600_000 * PX;

const hourMarks = computed(() =>
    Array.from({ length: HOURS + 1 }, (_, i) => {
        const d = new Date(windowStart.value + i * 3_600_000);
        return { top: i * PX, label: `${String(d.getHours()).padStart(2, '0')}:00` };
    })
);

const nowTop = computed(() => yOf(props.now));
const nowLabel = computed(() => hm(props.now));
const endLabel = computed(() => hm(windowEnd.value));

const todayKey = computed(() => dayKeyOf(new Date(props.now)));
const tomorrowKey = computed(() => {
    const d = new Date(props.now);
    d.setDate(d.getDate() + 1);
    return dayKeyOf(d);
});

const allOccurrences = computed(() => props.days.flatMap(d => d.occurrences));

const allDayToday = computed(() =>
    props.days.find(d => d.key === todayKey.value)?.occurrences.filter(o => o.allDay) || []
);

// Évènements chronométrés qui touchent la fenêtre, répartis en colonnes quand
// ils se chevauchent (même principe que la vue jour de l'agenda).
const blocks = computed(() => {
    const seen = new Set<string>();
    const timed = allOccurrences.value
        .filter(o => {
            if (o.allDay) return false;
            const key = `${o.eventId}|${o.occurrenceKey}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return new Date(o.endAt).getTime() > windowStart.value && new Date(o.startAt).getTime() < windowEnd.value;
        })
        .map(o => ({ occ: o, s: new Date(o.startAt).getTime(), e: new Date(o.endAt).getTime() }))
        .sort((a, b) => a.s - b.s || b.e - a.e);

    const placed: { item: typeof timed[number]; lane: number; group: number }[] = [];
    const groupLanes: number[] = [];
    let group = -1;
    let groupEnd = -Infinity;
    let laneEnds: number[] = [];

    for (const item of timed) {
        if (item.s >= groupEnd) {
            group++;
            laneEnds = [];
            groupLanes[group] = 0;
        }
        let lane = laneEnds.findIndex(end => end <= item.s);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.e); } else laneEnds[lane] = item.e;
        groupLanes[group] = Math.max(groupLanes[group] ?? 0, laneEnds.length);
        groupEnd = Math.max(groupEnd, item.e);
        placed.push({ item, lane, group });
    }

    const max = HOURS * PX;
    return placed.map(({ item, lane, group }) => {
        const top = Math.max(0, yOf(item.s));
        const bottom = Math.min(max, yOf(item.e));
        const height = Math.max(22, bottom - top - 3);
        const lanes = groupLanes[group] ?? 1;
        return {
            key: `${item.occ.eventId}|${item.occ.occurrenceKey}`,
            occ: item.occ,
            past: item.e <= props.now,
            height,
            range: `${hm(item.s)} – ${hm(item.e)}`,
            style: {
                top: `${top + 1}px`,
                height: `${height}px`,
                left: `calc(3rem + (100% - 3rem) * ${lane / lanes})`,
                width: `calc((100% - 3rem) / ${lanes} - 4px)`,
                '--c': item.occ.color || 'var(--primary)'
            }
        };
    });
});

const tomorrow = computed(() => props.days.find(d => d.key === tomorrowKey.value)?.occurrences || []);
const tomorrowFirstAt = computed(() => {
    const first = tomorrow.value[0];
    if (!first) return '';
    return first.allDay ? ' · journée entière' : ` à ${hm(new Date(first.startAt))}`;
});
</script>

<style scoped>
.dash-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    background: var(--bg2);
    overflow: hidden;
    min-width: 0;
}

.dash-card-header {
    min-height: 3rem;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-color);
}

.ruler {
    position: relative;
    margin-top: 0.5rem;
}

.hour {
    position: absolute;
    left: 2.6rem;
    right: 0;
    border-top: 1px solid var(--border-color);
    opacity: 0.6;
}
.hour span {
    position: absolute;
    left: -2.6rem;
    top: -0.45rem;
    font-size: 0.68rem;
    color: var(--text2);
}

.evt {
    position: absolute;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0.2rem 0.6rem;
    border-radius: 0.6rem;
    border-left: 3px solid var(--c);
    background: color-mix(in srgb, var(--c) 16%, var(--bg2));
    color: var(--text);
    font-size: 0.8rem;
    overflow: hidden;
    transition: transform 0.15s, filter 0.15s;
}
.evt:hover { transform: translateX(2px); filter: brightness(1.1); }
.evt.is-past { opacity: 0.45; }

.now-line {
    position: absolute;
    left: 2.4rem;
    right: 0;
    border-top: 2px solid var(--primary);
    z-index: 2;
    pointer-events: none;
}
.now-line::before {
    content: '';
    position: absolute;
    left: -5px;
    top: -6px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--primary);
    box-shadow: 0 0 10px var(--glow-primary-strong);
}
.now-line span {
    position: absolute;
    right: 0;
    top: -1.15rem;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--primary);
}

.ruler-empty {
    position: absolute;
    left: 3rem;
    right: 0;
    padding: 0.6rem;
    border: 1px dashed var(--border-color);
    border-radius: 0.75rem;
    background: var(--bg2);
    text-align: center;
    font-size: 0.8rem;
    color: var(--text2);
}

.allday {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 100%;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 16%, transparent);
    color: var(--text);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.tomorrow {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.55rem 0.75rem;
    border-radius: 0.75rem;
    background: var(--bg);
    font-size: 0.8rem;
    color: var(--text2);
    min-width: 0;
}
.tomorrow > span:first-child { flex-shrink: 0; }
</style>
