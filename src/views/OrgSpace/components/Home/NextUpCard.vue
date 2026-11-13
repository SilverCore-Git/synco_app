<template>
    <section class="next-card">
        <!-- Prochain évènement (ou celui en cours) -->
        <div v-if="loading" class="space-y-2 animate-pulse">
            <div class="h-4 w-32 bg-(--text)/5 rounded"></div>
            <div class="h-7 w-3/4 bg-(--text)/5 rounded-lg"></div>
            <div class="h-4 w-1/2 bg-(--text)/5 rounded"></div>
        </div>

        <template v-else-if="next">
            <div class="flex items-baseline justify-between gap-3 text-xs text-(--text2)">
                <span>{{ isOngoing ? 'En ce moment' : 'Prochain évènement' }}</span>
                <span class="font-semibold text-(--primary) tabular-nums">{{ countdown }}</span>
            </div>
            <div class="min-w-0">
                <h2 class="text-xl font-bold text-(--text) truncate">{{ next.title }}</h2>
                <p class="text-sm text-(--text2) truncate tabular-nums">
                    {{ timeRange }}<template v-if="metaLine"> · {{ metaLine }}</template>
                </p>
            </div>
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="flex">
                    <img
                        v-for="(a, i) in attendeeFaces"
                        :key="a.id"
                        :src="a.avatarUrl || defaultAvatar(a.name)"
                        :title="a.name"
                        alt=""
                        class="w-7 h-7 rounded-full object-cover border-2 border-(--bg2)"
                        :class="i > 0 ? '-ml-2' : ''"
                    />
                    <span
                        v-if="extraAttendees > 0"
                        class="-ml-2 w-7 h-7 rounded-full border-2 border-(--bg2) bg-(--bg3) text-[11px] font-bold text-(--text2) grid place-items-center"
                    >+{{ extraAttendees }}</span>
                </div>
                <RouterLink :to="eventLink" class="next-open">
                    Voir l'évènement <i class="bi bi-arrow-right"></i>
                </RouterLink>
            </div>
        </template>

        <div v-else class="min-w-0">
            <p class="text-xs text-(--text2)">Prochain évènement</p>
            <h2 class="text-xl font-bold text-(--text)">Rien de prévu</h2>
            <p class="text-sm text-(--text2)">Votre agenda est libre pour les prochains jours.</p>
        </div>

        <!-- Salons vocaux occupés en ce moment -->
        <div v-for="room in liveRooms" :key="room.thread.id" class="next-live">
            <span class="live-dot" aria-hidden="true"></span>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-(--text) truncate">{{ room.thread.name }} · {{ room.spaceName }}</p>
                <p class="text-xs text-(--text2) truncate">{{ room.names }}</p>
            </div>
            <div class="hidden sm:flex">
                <img
                    v-for="(p, i) in room.faces"
                    :key="p.identity"
                    :src="p.avatarUrl || defaultAvatar(p.name)"
                    :title="p.name"
                    alt=""
                    class="w-6 h-6 rounded-full object-cover border-2 border-(--bg)"
                    :class="[i > 0 ? '-ml-2' : '', p.isSpeaking ? 'ring-2 ring-(--primary)' : '']"
                />
            </div>
            <button class="next-join" @click="join(room)">
                <i class="bi bi-headset"></i> Rejoindre
            </button>
        </div>
        <p v-if="liveRooms.length === 0" class="next-live text-xs text-(--text2)">
            <i class="bi bi-headset"></i> Aucun salon vocal occupé pour l'instant
        </p>

        <!-- Membres en ligne : quelques visages et le compte, jamais une ligne par membre -->
        <button class="flex items-center gap-2.5 text-xs text-(--text2) hover:text-(--text) transition-colors" @click="$emit('show-members')">
            <div class="flex">
                <img
                    v-for="(m, i) in onlineFaces"
                    :key="m.id"
                    :src="m.avatarUrl || defaultAvatar(m.name)"
                    :title="m.name"
                    alt=""
                    class="w-6 h-6 rounded-full object-cover border-2 border-(--bg2)"
                    :class="i > 0 ? '-ml-2' : ''"
                />
            </div>
            <span class="tabular-nums">{{ onlineCount }} {{ onlineCount > 1 ? 'membres en ligne' : 'membre en ligne' }} sur {{ memberCount }}</span>
        </button>
    </section>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { openedOrg } from '@/assets/var';
import { useVoicePresence } from '@/composables/useVoicePresence';
import { joinVoiceThread } from '@/composables/useVoiceJoin';
import type { OccurrenceInstance } from '@/types/agenda';
import type { Thread } from '@/types/types';

const props = defineProps<{
    next: OccurrenceInstance | null;
    loading: boolean;
    now: number;
}>();

defineEmits<{ (e: 'show-members'): void }>();

const orgId = computed(() => openedOrg.value?.id);

function userById(id: string) {
    return openedOrg.value?.members?.find(m => String(m.userId) === String(id))?.user;
}

// --- Prochain évènement ---

const startMs = computed(() => props.next ? new Date(props.next.startAt).getTime() : 0);
const endMs = computed(() => props.next ? new Date(props.next.endAt).getTime() : 0);
const isOngoing = computed(() => !!props.next && !props.next.allDay && props.now >= startMs.value);

function hm(ms: number) {
    return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date) {
    return a.toDateString() === b.toDateString();
}

const timeRange = computed(() => {
    if (!props.next) return '';
    const start = new Date(startMs.value);
    const today = new Date(props.now);
    const tomorrow = new Date(props.now); tomorrow.setDate(tomorrow.getDate() + 1);
    const day = isSameDay(start, today) ? '' : isSameDay(start, tomorrow) ? 'Demain, '
        : start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ';
    if (props.next.allDay) return (day ? day.replace(/, $/, '') : "Aujourd'hui") + ' · journée entière';
    return `${day}${hm(startMs.value)} – ${hm(endMs.value)}`;
});

const countdown = computed(() => {
    if (!props.next) return '';
    if (props.next.allDay) return isSameDay(new Date(startMs.value), new Date(props.now)) ? "aujourd'hui" : '';
    if (isOngoing.value) return 'en cours';
    const min = Math.max(1, Math.round((startMs.value - props.now) / 60_000));
    if (min < 60) return `dans ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `dans ${h} h${min % 60 ? ' ' + String(min % 60).padStart(2, '0') : ''}`;
    const d = Math.round(h / 24);
    return `dans ${d} jour${d > 1 ? 's' : ''}`;
});

const attendeeUsers = computed(() =>
    (props.next?.attendees || [])
        .filter(a => a.status !== 'DECLINED')
        .map(a => userById(a.userId))
        .filter((u): u is NonNullable<typeof u> => !!u)
);
const attendeeFaces = computed(() => attendeeUsers.value.slice(0, 5));
const extraAttendees = computed(() => Math.max(0, attendeeUsers.value.length - 5));

const metaLine = computed(() => {
    const parts: string[] = [];
    if (props.next?.location) parts.push(props.next.location);
    const n = attendeeUsers.value.length;
    if (n > 0) parts.push(`${n} participant${n > 1 ? 's' : ''}`);
    return parts.join(' · ');
});

// AgendaView ouvre l'évènement ciblé par ?eventId= (même chemin que les notifications).
const eventLink = computed(() => ({
    path: `/${orgId.value}/agenda`,
    query: props.next ? { eventId: props.next.eventId } : {}
}));

// --- Vocal en cours ---

const { voiceByThread, refreshForOrg } = useVoicePresence();

watch(orgId, id => { if (id) refreshForOrg(); }, { immediate: true });

const liveRooms = computed(() => {
    const rooms: { thread: Thread; spaceId: string; spaceName: string; names: string; faces: { identity: string; name: string; avatarUrl?: string; isSpeaking?: boolean }[] }[] = [];
    for (const space of openedOrg.value?.spaces || []) {
        for (const thread of space.threads || []) {
            if (thread.type !== 'vocal') continue;
            const participants = voiceByThread.value.get(thread.id) || [];
            if (participants.length === 0) continue;
            const faces = participants.map(p => {
                const u = userById(p.identity);
                return { identity: p.identity, name: u?.name || 'Anonyme', avatarUrl: u?.avatarUrl, isSpeaking: p.isSpeaking };
            });
            const firstNames = faces.map(f => f.name.split(' ')[0]);
            const names = firstNames.length > 3
                ? `${firstNames.slice(0, 3).join(', ')} et ${firstNames.length - 3} autre${firstNames.length - 3 > 1 ? 's' : ''}`
                : firstNames.join(', ');
            rooms.push({ thread, spaceId: space.id, spaceName: space.name, names, faces: faces.slice(0, 4) });
        }
    }
    return rooms.slice(0, 2);
});

async function join(room: { thread: Thread; spaceId: string }) {
    await joinVoiceThread(room.thread, room.spaceId);
}

// --- Présence ---

const onlineMembers = computed(() =>
    (openedOrg.value?.members || [])
        .map(m => m.user)
        .filter((u): u is NonNullable<typeof u> => !!u && !!u.data?.status && u.data.status !== 'offline')
);
const onlineCount = computed(() => onlineMembers.value.length || openedOrg.value?.stats?.onlineCount || 0);
const memberCount = computed(() => openedOrg.value?.members?.length || openedOrg.value?.stats?.memberCount || 0);
const onlineFaces = computed(() => onlineMembers.value.slice(0, 4));
</script>

<style scoped>
.next-card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.1rem;
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    background: var(--bg2);
    min-width: 0;
}

.next-open {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--primary);
}
.next-open:hover { text-decoration: underline; }

.next-live {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.85rem;
    background: var(--bg);
}

.next-join {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.8rem;
    border-radius: 0.65rem;
    border: 1px solid rgba(var(--primary-rgb), 0.5);
    color: var(--primary);
    font-size: 0.8rem;
    font-weight: 600;
    transition: background-color 0.15s, transform 0.1s;
}
.next-join:hover { background: rgba(var(--primary-rgb), 0.1); }
.next-join:active { transform: scale(0.94); }

.live-dot {
    width: 0.5rem;
    height: 0.5rem;
    flex-shrink: 0;
    border-radius: 999px;
    background: var(--primary);
    animation: live-pulse 1.8s infinite;
}
@keyframes live-pulse {
    0% { box-shadow: 0 0 0 0 var(--glow-primary-strong); }
    70% { box-shadow: 0 0 0 7px transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
}
@media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } }
</style>
