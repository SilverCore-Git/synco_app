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

        <div v-if="loading" class="dash-card-body space-y-3 animate-pulse">
            <div class="h-2 bg-(--text)/5 rounded-full mx-2 mt-2"></div>
            <div class="h-40 bg-(--text)/5 rounded-xl"></div>
            <div v-for="i in 3" :key="i" class="h-9 bg-(--text)/5 rounded-xl"></div>
        </div>

        <div v-else-if="!lead" class="dash-card-empty animate-app-reveal">
            <i class="bi bi-check2-all text-2xl text-(--text2)"></i>
            <p class="font-semibold text-(--text)">Aucune tâche en attente</p>
            <p v-if="doneTodayCount > 0">{{ doneTodayCount > 1 ? `${doneTodayCount} tâches terminées` : '1 tâche terminée' }} aujourd'hui.</p>
            <p v-else>Les tâches qui vous sont assignées apparaîtront ici.</p>
        </div>

        <!-- Enfants en shrink-0 : TaskCard a overflow:hidden, donc sans ça la
             colonne flex la tasse (boutons coupés) au lieu de faire défiler le corps. -->
        <div v-else class="dash-card-body flex flex-col gap-3 animate-app-reveal [&>*]:shrink-0">
            <!-- La journée en une jauge : mêmes couleurs que TaskProgressGauge / le Kanban. -->
            <div class="px-2 pt-1.5 flex flex-col gap-2">
                <div
                    class="h-2 rounded-full flex overflow-hidden bg-(--surface-sunken)"
                    role="img"
                    :aria-label="`${doneTodayCount} terminées aujourd'hui, ${inProgressCount} en cours, ${todoCount} à faire`"
                >
                    <div class="h-full bg-green-500 transition-all duration-700" :style="{ width: gaugePercent(doneTodayCount) }"></div>
                    <div class="h-full bg-blue-500 transition-all duration-700" :style="{ width: gaugePercent(inProgressCount) }"></div>
                    <div class="h-full bg-gray-400 transition-all duration-700" :style="{ width: gaugePercent(todoCount) }"></div>
                </div>
                <div class="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-(--text2)">
                    <span class="gauge-leg"><i class="bg-green-500"></i><b class="tabular-nums">{{ doneTodayCount }}</b> terminée{{ doneTodayCount > 1 ? 's' : '' }} aujourd'hui</span>
                    <span class="gauge-leg"><i class="bg-blue-500"></i><b class="tabular-nums">{{ inProgressCount }}</b> en cours</span>
                    <span class="gauge-leg"><i class="bg-gray-400"></i><b class="tabular-nums">{{ todoCount }}</b> à faire</span>
                </div>
            </div>

            <!-- La plus urgente, en TaskCard complète (celle du Kanban). -->
            <Transition name="lead" mode="out-in">
                <TaskCard
                    :key="lead.id"
                    :task="lead"
                    featured
                    :class="{ 'is-leaving': finishing.has(lead.id) }"
                    @click="openTask(lead)"
                >
                    <template #header-right>
                        <span v-if="isNewOrUpdated(lead)" class="dash-new-pill mt-1">
                            {{ isNewlyAssigned(lead) ? 'Nouveau' : 'Mis à jour' }}
                        </span>
                    </template>
                    <template #footer>
                        <div class="mt-4 pt-3 border-t border-(--border-color) flex items-center gap-2 flex-wrap" @click.stop>
                            <button
                                v-if="lead.status === 'TODO'"
                                class="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold text-[11px] transition-colors disabled:opacity-50"
                                :disabled="busy.has(lead.id)"
                                @click="setStatus(lead, 'IN_PROGRESS')"
                            >
                                <i class="bi bi-arrow-repeat"></i> En cours
                            </button>
                            <span v-else class="flex items-center gap-1.5 h-8 text-blue-400 font-bold text-[11px]">
                                <i class="bi bi-arrow-repeat"></i> En cours
                            </span>
                            <button
                                class="flex items-center gap-1.5 px-3.5 h-8 rounded-lg bg-(--primary) hover:brightness-110 text-white font-bold text-xs transition active:scale-95 disabled:opacity-50"
                                :disabled="busy.has(lead.id)"
                                @click="setStatus(lead, 'DONE')"
                            >
                                <i class="bi bi-check-lg"></i> Terminer
                            </button>
                            <button
                                type="button"
                                class="ml-auto flex items-center gap-1.5 px-3.5 h-8 rounded-lg bg-(--text)/5 hover:bg-(--text)/10 font-bold text-xs text-(--text) transition-colors"
                                @click="openTask(lead)"
                            >
                                Ouvrir <i class="bi bi-arrow-up-right"></i>
                            </button>
                        </div>
                    </template>
                </TaskCard>
            </Transition>

            <div v-if="nextTasks.length">
                <h4 class="task-group-title">Ensuite</h4>
                <TransitionGroup tag="ul" name="row">
                    <li v-for="task in nextTasks" :key="task.id" class="task-row" :class="{ 'is-done': finishing.has(task.id) }">
                        <button
                            class="task-status"
                            :class="task.status === 'IN_PROGRESS' ? 'text-blue-400' : 'text-gray-400'"
                            :disabled="busy.has(task.id)"
                            :title="task.status === 'TODO' ? 'Passer à « En cours »' : 'Terminer'"
                            :aria-label="`${task.status === 'TODO' ? 'Commencer' : 'Terminer'} : ${task.title}`"
                            @click="advance(task)"
                        >
                            <i v-if="finishing.has(task.id)" class="bi bi-check-circle-fill text-green-500"></i>
                            <i v-else :class="task.status === 'IN_PROGRESS' ? 'bi bi-arrow-repeat' : 'bi bi-circle'"></i>
                        </button>
                        <button type="button" class="flex-1 min-w-0 flex items-center gap-2 text-left" @click="openTask(task)">
                            <span class="task-title">{{ task.title }}</span>
                            <span v-if="isNewOrUpdated(task)" class="dash-new-pill">
                                {{ isNewlyAssigned(task) ? 'Nouveau' : 'Mis à jour' }}
                            </span>
                            <span class="task-space hidden sm:inline">{{ task.space?.name || 'Perso' }}</span>
                            <span v-if="task.dueDate" class="mini-bar hidden sm:block" :title="deadlineProgress(task).text">
                                <i :class="deadlineProgress(task).color" :style="{ width: `${deadlineProgress(task).percent}%` }"></i>
                            </span>
                            <span class="task-due tabular-nums" :class="{ 'is-late': isTaskOverdue(task) }">{{ dueLabel(task) }}</span>
                        </button>
                    </li>
                </TransitionGroup>
                <RouterLink
                    v-if="remainingCount > 0"
                    :to="`/${orgId}/tasks`"
                    class="block mx-2 mt-1 text-xs text-(--text2) hover:text-(--text)"
                >
                    Et {{ remainingCount }} autre{{ remainingCount > 1 ? 's' : '' }}
                </RouterLink>
            </div>
        </div>
    </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { openedOrg, user } from '@/assets/var';
import { deadlineProgress, isTaskOverdue } from '@/assets/utils/taskOverdue';
import TaskCard from '../SpaceTasks/TaskCard.vue';
import { useTaskPanels } from '@/composables/useTaskPanels';
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
                // Les tâches d'une liste n'embarquent pas leur espace : c'est
                // la liste qui le porte (listMyTasks côté API).
                list.tasks?.forEach(t => allTasks.push(t.space || !list.space ? t : { ...t, space: list.space }));
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

const isMine = (task: Task) =>
    task.assignees?.some(a => a.id === user.value?.id) || task.creatorId === user.value?.id;

const myTasks = computed(() =>
    rawTasks.value.filter(task => !task.archived && task.status !== 'DONE' && isMine(task))
);

function startOfDay(d: Date): number {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
}

const DAY_MS = 86_400_000;

// Ordre d'urgence : échéance la plus proche d'abord (le retard en tête), puis
// les tâches avec une actualité (nouvelle ou mise à jour), puis les plus
// récentes ; les tâches sans échéance ferment la marche.
const ordered = computed(() =>
    [...myTasks.value].sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (da !== db) return da - db;
        const fa = isNewOrUpdated(a) ? 0 : 1;
        const fb = isNewOrUpdated(b) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
);

const lead = computed(() => ordered.value[0] ?? null);

const NEXT_ROWS = 4;
const nextTasks = computed(() => ordered.value.filter(t => t.id !== lead.value?.id).slice(0, NEXT_ROWS));
const remainingCount = computed(() => Math.max(0, myTasks.value.length - 1 - nextTasks.value.length));

// --- Jauge du jour ---
const todoCount = computed(() => myTasks.value.filter(t => t.status === 'TODO').length);
const inProgressCount = computed(() => myTasks.value.filter(t => t.status === 'IN_PROGRESS').length);
const doneTodayCount = computed(() => {
    const today = startOfDay(new Date());
    return rawTasks.value.filter(t =>
        t.status === 'DONE' && !t.archived && isMine(t)
        && t.statusChangedAt && new Date(t.statusChangedAt).getTime() >= today
    ).length;
});
function gaugePercent(n: number): string {
    const total = todoCount.value + inProgressCount.value + doneTodayCount.value;
    return total ? `${(n / total) * 100}%` : '0%';
}

const lateCount = computed(() => myTasks.value.filter(t => isTaskOverdue(t)).length);

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

// Changer le statut depuis l'accueil (mêmes étapes que le Kanban). Terminer :
// la coche reste visible un instant, puis la tâche quitte la carte.
const toast = useToast();
const busy = ref(new Set<string>());
// Sous-ensemble de busy : celles en train d'être terminées (coche, fondu).
const finishing = ref(new Set<string>());

function setBusy(id: string, on: boolean) {
    const next = new Set(busy.value);
    if (on) next.add(id); else next.delete(id);
    busy.value = next;
}

async function setStatus(task: Task, status: 'IN_PROGRESS' | 'DONE') {
    if (busy.value.has(task.id)) return;
    setBusy(task.id, true);
    if (status === 'DONE') finishing.value = new Set(finishing.value).add(task.id);
    try {
        const res = await sfetch(`/api/tasks/${orgId.value}/tasks/${task.id}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        if (!res.ok) throw new Error('API Error');
        if (status === 'DONE') await new Promise(r => setTimeout(r, 450));
        task.status = status;
        task.statusChangedAt = new Date().toISOString();
        if (status === 'DONE') toast.show('Tâche terminée', 'success');
    } catch (e) {
        toast.show(status === 'DONE' ? 'Impossible de terminer la tâche' : 'Impossible de changer le statut', 'error');
    } finally {
        setBusy(task.id, false);
        if (finishing.value.has(task.id)) {
            const next = new Set(finishing.value);
            next.delete(task.id);
            finishing.value = next;
        }
    }
}

function advance(task: Task) {
    setStatus(task, task.status === 'TODO' ? 'IN_PROGRESS' : 'DONE');
}

// Ouvrir une tâche : dans le dock en bas à droite, on reste sur l'accueil.
const { openTask, onTaskPanelChange } = useTaskPanels();

// Modifications faites dans le panneau (statut, titre, échéance…) : la carte suit.
onTaskPanelChange({
    update: task => {
        const idx = rawTasks.value.findIndex(t => t.id === task.id);
        if (idx !== -1) rawTasks.value[idx] = { ...rawTasks.value[idx], ...task };
    },
    delete: taskId => {
        rawTasks.value = rawTasks.value.filter(t => t.id !== taskId);
    }
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

.task-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 0.5rem;
    border-radius: 0.75rem;
    transition: background-color 0.15s, opacity 0.3s;
}
.task-row:hover { background: var(--bg); }

/* Icône de statut du Kanban (bi-circle / bi-arrow-repeat) : un clic fait
   avancer la tâche d'un cran. */
.task-status {
    width: 1.65rem;
    height: 1.65rem;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 0.5rem;
    font-size: 0.95rem;
    transition: background-color 0.15s, transform 0.1s;
}
.task-status:hover { background: rgba(var(--primary-rgb), 0.1); }
.task-status:active { transform: scale(0.85); }
.is-done { opacity: 0.5; }
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
.task-due.is-late { color: #ef4444; font-weight: 600; }

.mini-bar {
    flex-shrink: 0;
    width: 3.5rem;
    height: 0.375rem;
    border-radius: 999px;
    background: var(--surface-sunken);
    overflow: hidden;
}
.mini-bar i { display: block; height: 100%; border-radius: 999px; }

.gauge-leg { display: inline-flex; align-items: center; gap: 0.4rem; }
.gauge-leg i { width: 0.5rem; height: 0.5rem; border-radius: 999px; }
.gauge-leg b { color: var(--text); font-weight: 600; }

/* La tâche à la une : fondu à la fin, la suivante prend sa place. */
.is-leaving { opacity: 0.55; transition: opacity 0.3s; }
.lead-enter-active, .lead-leave-active { transition: opacity 0.25s, transform 0.25s; }
.lead-enter-from { opacity: 0; transform: translateY(8px); }
.lead-leave-to { opacity: 0; transform: scale(0.98); }

.row-leave-active { transition: opacity 0.25s, transform 0.25s; }
.row-leave-to { opacity: 0; transform: translateX(12px); }
.row-move { transition: transform 0.25s; }

@media (prefers-reduced-motion: reduce) {
    .lead-enter-active, .lead-leave-active, .row-leave-active, .row-move { transition: none; }
}
</style>
