<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full" :class="{ 'stagger-reveal': revealing }">
        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
            <div class="flex items-center gap-3">
                <MobileBackBtn />
                <i class="bi bi-house text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Accueil</h3>
            </div>

            <div class="ml-auto flex items-center gap-4 text-(--text2)">
                <button
                    @click="markAllRead"
                    class="hover:text-(--text) transition-colors"
                    title="Tout marquer comme lu"
                    aria-label="Tout marquer comme lu"
                >
                    <i class="bi bi-check2-all" />
                </button>
                <button
                    @click="showUsersBar = !showUsersBar"
                    class="hover:text-(--text) transition-colors"
                    :class="showUsersBar ? 'text-(--text)' : ''"
                    title="Membres"
                    aria-label="Afficher les membres"
                >
                    <i class="bi bi-people-fill" />
                </button>
            </div>
        </div>

        <main data-reveal-list class="flex-1 overflow-y-auto p-4 md:p-7 flex flex-col gap-5">
            <!-- Maintenant : le salut, le constat du moment et le prochain rendez-vous -->
            <section class="home-hero">
                <div class="flex flex-col justify-center gap-3 min-w-0 py-1">
                    <p class="text-sm text-(--text2) first-letter:uppercase">{{ todayLabel }}</p>
                    <h1 class="home-title">
                        {{ greeting }} <span class="text-(--primary)">{{ firstName }}</span>
                    </h1>
                    <p class="home-finding">
                        <template v-for="(part, i) in findingParts" :key="part.key">
                            <span v-if="i > 0" class="text-(--text2)"> · </span>
                            <span :class="part.tone === 'bad' ? 'text-red-500 font-semibold' : ''">
                                <b v-if="part.strong" class="font-semibold" :class="part.tone === 'bad' ? '' : 'text-(--text)'">{{ part.strong }}</b>{{ part.rest }}
                            </span>
                        </template>
                    </p>
                    <div class="flex flex-wrap gap-2 mt-1">
                        <CreateTaskModal v-if="todoEnabled" @created="onTaskCreated">
                            <button class="home-quick"><i class="bi bi-plus-lg"></i> Nouvelle tâche</button>
                        </CreateTaskModal>
                        <RouterLink v-if="agendaEnabled" :to="{ path: `/${orgId}/agenda`, query: { create: '1' } }" class="home-quick">
                            <i class="bi bi-calendar-plus"></i> Nouvel évènement
                        </RouterLink>
                        <RouterLink v-if="aiEnabled" :to="`/${orgId}/ai`" class="home-quick">
                            <i class="bi bi-stars"></i> Demander à l'IA
                        </RouterLink>
                    </div>
                </div>

                <NextUpCard
                    :next="agendaEnabled ? nextOccurrence : null"
                    :loading="agendaEnabled && agendaLoading"
                    :now="now"
                    @show-members="showUsersBar = true"
                />
            </section>

            <div class="home-grid">
                <NotificationsCard ref="notificationsCard" class="span-7" />
                <UpcomingHoursCard
                    v-if="agendaEnabled"
                    class="span-5"
                    :days="days"
                    :loading="agendaLoading"
                    :error="agendaError"
                    :now="now"
                    @retry="orgId && startAgenda(orgId)"
                />
                <TodosCard v-if="todoEnabled" ref="todosCard" :key="tasksKey" class="span-7" />
                <ActiveSpacesCard class="span-5" />
            </div>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { user, openedOrg, todoEnabled, agendaEnabled, aiEnabled } from '@/assets/var';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import { useStaggerReveal } from '@/composables/useStaggerReveal';
import { useUpcomingAgenda } from '@/composables/useUpcomingAgenda';
import { useUsersBar } from '@/composables/useUsersBar';
import CreateTaskModal from '../components/popup/CreateTaskModal.vue';
import NotificationsCard from '../components/Home/NotificationsCard.vue';
import UpcomingHoursCard from '../components/Home/UpcomingHoursCard.vue';
import TodosCard from '../components/Home/TodosCard.vue';
import NextUpCard from '../components/Home/NextUpCard.vue';
import ActiveSpacesCard from '../components/Home/ActiveSpacesCard.vue';

// Le salut puis chaque bloc apparaissent un par un, à chaque visite de l'accueil (style.css).
const revealing = useStaggerReveal();

const { showUsersBar } = useUsersBar();

const orgId = computed(() => openedOrg.value?.id);

const notificationsCard = useTemplateRef<InstanceType<typeof NotificationsCard>>('notificationsCard');
const todosCard = useTemplateRef<InstanceType<typeof TodosCard>>('todosCard');

async function markAllRead() {
    await Promise.all([
        notificationsCard.value?.markAllRead(),
        todosCard.value?.markAllRead()
    ]);
}

// Une tâche créée depuis l'accueil : on recharge la carte (elle refait son fetch).
const tasksKey = ref(0);
function onTaskCreated() {
    tasksKey.value++;
}

// --- Horloge partagée (compte à rebours, ligne « maintenant ») ---

const now = ref(Date.now());
const clock = window.setInterval(() => { now.value = Date.now(); }, 30_000);
onBeforeUnmount(() => window.clearInterval(clock));

// --- Agenda : une seule source pour le prochain évènement et la frise ---

const {
    days,
    loading: agendaLoading,
    error: agendaError,
    start: startAgenda
} = useUpcomingAgenda();

watch([orgId, agendaEnabled], ([id, enabled]) => {
    if (id && enabled) startAgenda(id);
}, { immediate: true });

// Le prochain évènement chronométré pas encore terminé ; à défaut, la
// première journée entière d'aujourd'hui ou plus tard.
const nextOccurrence = computed(() => {
    const all = days.value.flatMap(d => d.occurrences);
    const timed = all
        .filter(o => !o.allDay && new Date(o.endAt).getTime() > now.value)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return timed[0] || all.find(o => o.allDay) || null;
});

// --- En-tête ---

const { proxy } = getCurrentInstance()!;

const firstName = computed(() => {
    const name = String((proxy as any)?.$p?.(user.value?.name) ?? user.value?.name ?? '');
    return name.split(' ')[0];
});

const greeting = computed(() => {
    const hour = new Date(now.value).getHours();
    return hour >= 6 && hour < 18 ? 'Bonjour' : 'Bonsoir';
});

const todayLabel = computed(() =>
    new Date(now.value).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
);

function relIn(ms: number): string {
    const min = Math.max(1, Math.round(ms / 60_000));
    if (min < 60) return `dans ${min} min`;
    const h = Math.floor(min / 60);
    return `dans ${h} h${min % 60 ? ' ' + String(min % 60).padStart(2, '0') : ''}`;
}

// Le constat : ce qui vous attend, dans l'ordre d'urgence, en une ligne.
const findingParts = computed(() => {
    const parts: { key: string; strong: string; rest: string; tone?: 'bad' }[] = [];

    const unread = notificationsCard.value?.totalUnread ?? 0;
    if (unread > 0) {
        parts.push({
            key: 'inbox',
            strong: unread > 1 ? `${unread} éléments attendent` : '1 élément attend',
            rest: ' votre réponse'
        });
    }

    const next = nextOccurrence.value;
    if (agendaEnabled.value && next && !next.allDay) {
        const start = new Date(next.startAt).getTime();
        const inMs = start - now.value;
        if (inMs <= 0) parts.push({ key: 'event', strong: next.title, rest: ' est en cours' });
        else if (inMs < 12 * 3_600_000) parts.push({ key: 'event', strong: next.title, rest: ` ${relIn(inMs)}` });
    }

    const late = todosCard.value?.lateCount ?? 0;
    if (late > 0) {
        parts.push({ key: 'late', strong: late > 1 ? `${late} tâches en retard` : '1 tâche en retard', rest: '', tone: 'bad' });
    }

    if (parts.length === 0) {
        parts.push({ key: 'calm', strong: '', rest: 'Rien ne vous attend pour le moment.' });
    }
    return parts;
});
</script>

<style scoped>
.home-hero {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 1.25rem;
    align-items: stretch;
}

.home-title {
    font-size: clamp(1.9rem, 3.6vw, 2.9rem);
    line-height: 1;
    font-weight: 800;
    letter-spacing: -0.025em;
    text-transform: uppercase;
    color: var(--text);
    text-wrap: balance;
}

.home-finding {
    font-size: 1.05rem;
    line-height: 1.5;
    color: var(--text2);
    max-width: 36em;
}

.home-quick {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    height: 2.1rem;
    padding: 0 0.85rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border-color);
    background: var(--bg2);
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 500;
    transition: border-color 0.15s, color 0.15s, transform 0.1s;
}
.home-quick:hover {
    border-color: rgba(var(--primary-rgb), 0.5);
    color: var(--primary);
}
.home-quick:active { transform: scale(0.95); }

.home-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 1.25rem;
    align-items: start;
}
.span-7 { grid-column: span 7; }
.span-5 { grid-column: span 5; }

/* Cartes à défilement interne : la page garde ses deux rangées lisibles. */
.home-grid > * {
    max-height: min(34rem, calc(100vh - 160px));
}

/* Une carte seule sur sa rangée (module désactivé) prend toute la largeur. */
.home-grid > .span-7:last-child,
.home-grid > .span-7:has(+ .span-7),
.home-grid > .span-5 + .span-5 {
    grid-column: 1 / -1;
}

@media (max-width: 1100px) {
    .home-hero { grid-template-columns: 1fr; }
    .span-7, .span-5 { grid-column: 1 / -1; }
    .home-grid > * { max-height: none; }
}
</style>
