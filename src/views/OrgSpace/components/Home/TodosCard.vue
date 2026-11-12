<template>
    <section class="dash-card">
        <header class="dash-card-header">
            <div class="flex items-center gap-2">
                <i class="bi bi-check2-square text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Mes tâches</h3>
                <span v-if="unreadTaskCount > 0" class="dash-badge">{{ unreadTaskCount }}</span>
                <span v-else-if="myTasks.length > 0" class="dash-count tabular-nums">{{ myTasks.length }}</span>
            </div>
            <div class="flex items-center gap-3">
                <button
                    v-if="hasUnread"
                    @click="markAllRead"
                    class="text-xs text-(--text2) hover:text-(--text)"
                    title="Tout marquer comme lu"
                >
                    <i class="bi bi-check2-all"></i> Tout lu
                </button>
                <RouterLink :to="`/${orgId}/tasks`" class="text-xs text-(--text2) hover:text-(--text)">
                    Toutes les tâches <i class="bi bi-arrow-right"></i>
                </RouterLink>
            </div>
        </header>

        <div v-if="loading" class="dash-card-body space-y-2 animate-pulse">
            <div v-for="i in 4" :key="i" class="h-9 bg-(--text)/5 rounded-xl"></div>
        </div>

        <div v-else-if="groups.length === 0" class="dash-card-empty animate-app-reveal">
            <i class="bi bi-check2-all text-2xl text-(--text2)"></i>
            <p class="font-semibold text-(--text)">Aucune tâche en attente</p>
            <p>Les tâches qui vous sont assignées apparaîtront ici.</p>
        </div>

        <div v-else class="dash-card-body flex flex-col gap-1.5 animate-app-reveal">
            <div v-for="group in groups" :key="group.id" :class="{ 'is-late': group.id === 'late' }">
                <h4 class="task-group-title">
                    {{ group.label }} <span class="tabular-nums">{{ group.tasks.length }}</span>
                </h4>
                <ul>
                    <li v-for="task in group.tasks" :key="task.id" class="task-row" :class="{ 'is-done': completing.has(task.id) }">
                        <button
                            class="task-check"
                            :aria-pressed="completing.has(task.id)"
                            :aria-label="`Terminer : ${task.title}`"
                            :disabled="completing.has(task.id)"
                            @click="complete(task)"
                        >
                            <i class="bi bi-check-lg"></i>
                        </button>
                        <RouterLink :to="taskLink(task)" class="flex-1 min-w-0 flex items-center gap-2">
                            <span class="task-title">{{ task.title }}</span>
                            <span v-if="isNewOrUpdated(task)" class="dash-new-pill">
                                {{ isNewlyAssigned(task) ? 'Nouveau' : 'Mis à jour' }}
                            </span>
                            <span class="task-space hidden sm:inline">{{ task.space?.name || 'Perso' }}</span>
                            <span class="task-due tabular-nums">{{ dueLabel(task) }}</span>
                        </RouterLink>
                    </li>
                </ul>
            </div>
        </div>
    </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { Task, TodoList } from '@/types/types';
import { useNotification } from '@/composables/useNotification';
import { useToast } from '@/composables/useToast';

const orgId = computed(() => openedOrg.value?.id);
const rawTasks = ref<Task[]>([]);
const loading = ref(true);

const { notifications, init: initNotifications, markAsRead } = useNotification();

// Limité à l'organisation ouverte (data.orgId, cf. tasksService.ts /
// tasks.ts côté API) pour que « Tout lu » ici ne touche pas aux autres orgs.
const unreadTaskNotifs = computed(() =>
    notifications.value.filter(n =>
        n.type === 'TASK_ASSIGNED' && !n.isRead && (!n.data?.orgId || n.data.orgId === orgId.value)
    )
);

const unreadTaskCount = computed(() => unreadTaskNotifs.value.length);

// Tâches nouvellement assignées : id de tâche porté par les notifications
// TASK_ASSIGNED non lues (voir tasksService.ts notifyTaskAssignment côté API).
const newlyAssignedTaskIds = computed(() => {
    const ids = new Set<string>();
    unreadTaskNotifs.value.forEach(n => {
        if (n.data?.taskId) ids.add(n.data.taskId);
    });
    return ids;
});

function isNewlyAssigned(task: Task): boolean {
    return newlyAssignedTaskIds.value.has(task.id);
}

// Pas de notification dédiée pour une simple mise à jour (titre, échéance,
// statut...) — on compare plutôt updatedAt à la dernière visite de cette
// carte, mémorisée en local. Se remet à zéro à chaque démontage du widget,
// donc une tâche reste "mise à jour" jusqu'à la prochaine visite de Home.
const LAST_SEEN_KEY = 'todosCardLastSeenAt';
const lastSeenAt = ref<number>(Number(localStorage.getItem(LAST_SEEN_KEY)) || 0);

function isNewOrUpdated(task: Task): boolean {
    if (isNewlyAssigned(task)) return true;
    return new Date(task.updatedAt).getTime() > lastSeenAt.value;
}

const loadTasks = async () => {
    if (!orgId.value) return;
    try {
        const res = await sfetch(`/api/tasks/${orgId.value}/lists/me`);
        if (res.ok) {
            const data = await res.json();
            const allTasks: Task[] = [];
            data.lists.forEach((list: TodoList) => {
                list.tasks?.forEach(t => allTasks.push(t));
            });
            // Les tâches créées hors d'une TodoList explicite (cas courant :
            // "Créer une tâche" dans un espace) arrivent séparément ici.
            data.unlistedTasks?.forEach((t: Task) => allTasks.push(t));
            rawTasks.value = allTasks;
        }
    } catch (e) {
        console.error('[TodosCard] Failed to load tasks', e);
    }
};

onMounted(async () => {
    await initNotifications();
    await loadTasks();
    loading.value = false;
});

onUnmounted(() => {
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
});

const hasUnread = computed(() => myTasks.value.some(t => isNewOrUpdated(t)));

// Acquitte à la fois les assignations (notifications TASK_ASSIGNED) et les
// simples mises à jour (lastSeenAt avancé tout de suite plutôt qu'au
// démontage) — exposé aussi pour le « Tout marquer comme lu » d'OrgHome.
async function markAllRead() {
    lastSeenAt.value = Date.now();
    localStorage.setItem(LAST_SEEN_KEY, String(lastSeenAt.value));
    await Promise.all(unreadTaskNotifs.value.map(n => markAsRead(n.id)));
}

// Une tâche assignée en temps réel (utilisateur déjà connecté) doit
// apparaître ici sans recharger la page — notifications.value est un
// singleton partagé sur lequel useNotification() préfixe les nouvelles
// notifications reçues via le socket 'notification:push'.
watch(
    () => notifications.value[0]?.id,
    (latestId, previousId) => {
        if (!latestId || latestId === previousId) return;
        if (notifications.value[0]?.type === 'TASK_ASSIGNED') loadTasks();
    }
);

const myTasks = computed(() => {
    return rawTasks.value.filter(task => {
        if (task.archived || task.status === 'DONE') return false;
        const isAssignedToMe = task.assignees?.some(a => a.id === user.value?.id);
        const isCreatedByMe = task.creatorId === user.value?.id;
        return isAssignedToMe || isCreatedByMe;
    });
});

// Tri d'un groupe : les tâches avec une actualité (nouvelle ou mise à jour,
// cf. isNewOrUpdated) d'abord, puis par échéance la plus proche, puis les
// plus récentes pour celles sans échéance.
function sortGroup(list: Task[]): Task[] {
    return [...list].sort((a, b) => {
        const fa = isNewOrUpdated(a) ? 0 : 1;
        const fb = isNewOrUpdated(b) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

function startOfDay(d: Date): number {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
}

const DAY_MS = 86_400_000;

type GroupId = 'late' | 'today' | 'week' | 'later';

function groupOf(task: Task): GroupId {
    if (!task.dueDate) return 'later';
    const due = new Date(task.dueDate);
    const today = startOfDay(new Date());
    if (due.getTime() < today) return 'late';
    if (due.getTime() < today + DAY_MS) return 'today';
    if (due.getTime() < today + 7 * DAY_MS) return 'week';
    return 'later';
}

// Plafond de lignes sur l'accueil : le retard et le jour passent en premier.
const MAX_ROWS = 8;

const groups = computed(() => {
    const defs: { id: GroupId; label: string }[] = [
        { id: 'late', label: 'En retard' },
        { id: 'today', label: "Aujourd'hui" },
        { id: 'week', label: 'Cette semaine' },
        { id: 'later', label: 'Plus tard' }
    ];
    let budget = MAX_ROWS;
    return defs
        .map(def => {
            const tasks = sortGroup(myTasks.value.filter(t => groupOf(t) === def.id)).slice(0, Math.max(0, budget));
            budget -= tasks.length;
            return { ...def, tasks };
        })
        .filter(g => g.tasks.length > 0);
});

const lateCount = computed(() => myTasks.value.filter(t => groupOf(t) === 'late').length);

defineExpose({ markAllRead, lateCount });

function dueLabel(task: Task): string {
    if (!task.dueDate) return '—';
    const due = new Date(task.dueDate);
    const today = startOfDay(new Date());
    const dayDiff = Math.round((startOfDay(due) - today) / DAY_MS);
    if (dayDiff === -1) return 'Hier';
    if (dayDiff < -1) return `Il y a ${-dayDiff} j`;
    if (dayDiff === 0) {
        const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
        return hasTime ? due.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "Aujourd'hui";
    }
    if (dayDiff === 1) return 'Demain';
    if (dayDiff < 7) return due.toLocaleDateString('fr-FR', { weekday: 'short' });
    return due.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Terminer une tâche depuis l'accueil : coche visible un instant, puis la
// ligne disparaît (la tâche passe en DONE, filtrée par myTasks).
const toast = useToast();
const completing = ref(new Set<string>());

async function complete(task: Task) {
    if (completing.value.has(task.id)) return;
    completing.value = new Set(completing.value).add(task.id);
    try {
        const res = await sfetch(`/api/tasks/${orgId.value}/tasks/${task.id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'DONE' })
        });
        if (!res.ok) throw new Error('API Error');
        await new Promise(r => setTimeout(r, 450));
        task.status = 'DONE';
        toast.show('Tâche terminée', 'success');
    } catch (e) {
        toast.show('Impossible de terminer la tâche', 'error');
    } finally {
        const next = new Set(completing.value);
        next.delete(task.id);
        completing.value = next;
    }
}

function taskLink(task: Task): string {
    // ?select= : TasksSpace.vue / TasksGlobal.vue ouvrent la tâche et
    // mettent sa carte en surbrillance (scroll + glow) à l'arrivée.
    const base = task.spaceId ? `/${orgId.value}/${task.spaceId}/tasks` : `/${orgId.value}/tasks`;
    return `${base}?select=${task.id}`;
}
</script>

<style scoped>
.dash-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    background: var(--bg2);
    overflow: hidden;
    min-height: 0;
}

.dash-card-header {
    min-height: 3rem;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-color);
}

.dash-card-body {
    flex: 1;
    min-height: 0;
    padding: 0.5rem;
    overflow-y: auto;
}

.dash-card-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    color: var(--text2);
    font-size: 0.8rem;
}

.dash-new-pill {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: var(--primary);
    color: var(--white);
    white-space: nowrap;
    flex-shrink: 0;
}

.dash-count {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text2);
    background: var(--bg3);
    border-radius: 999px;
    padding: 0.05rem 0.5rem;
}

.task-group-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.35rem 0.5rem 0.2rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text2);
}
.is-late .task-group-title { color: #ef4444; }

.task-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 0.5rem;
    border-radius: 0.75rem;
    transition: background-color 0.15s, opacity 0.3s;
}
.task-row:hover { background: var(--bg); }

.task-check {
    width: 1.2rem;
    height: 1.2rem;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 0.4rem;
    border: 1.5px solid var(--text2);
    color: transparent;
    font-size: 0.8rem;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
}
.task-check:hover { border-color: var(--primary); color: rgba(var(--primary-rgb), 0.6); }
.task-check:active { transform: scale(0.85); }
.is-done .task-check { background: var(--primary); border-color: var(--primary); color: #fff; }
.is-done .task-title { text-decoration: line-through; color: var(--text2); }

.task-title {
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.task-space {
    flex-shrink: 0;
    max-width: 7rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    background: var(--bg3);
    font-size: 0.7rem;
    color: var(--text2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.task-due {
    flex-shrink: 0;
    min-width: 3.5rem;
    text-align: right;
    font-size: 0.75rem;
    color: var(--text2);
}
.is-late .task-due { color: #ef4444; font-weight: 600; }
</style>
