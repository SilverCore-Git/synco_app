<template>
    <section class="dash-card">
        <header class="dash-card-header">
            <div class="flex items-center gap-2">
                <i class="bi bi-check2-square text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Tâches</h3>
                <span v-if="unreadTaskCount > 0" class="dash-badge">{{ unreadTaskCount }}</span>
            </div>
            <RouterLink :to="`/${orgId}/tasks`" class="text-xs text-(--text2) hover:text-(--text)">
                Voir tout <i class="bi bi-arrow-right"></i>
            </RouterLink>
        </header>

        <div v-if="loading" class="dash-card-body space-y-2 animate-pulse">
            <div v-for="i in 3" :key="i" class="h-12 bg-white/5 rounded-xl"></div>
        </div>

        <div v-else-if="items.length === 0" class="dash-card-empty animate-app-reveal">
            <i class="bi bi-emoji-sunglasses text-2xl text-(--text2)"></i>
            <p>Aucune tâche en attente</p>
        </div>

        <ul v-else class="dash-card-body space-y-2 animate-app-reveal">
            <li v-for="task in items" :key="task.id">
                <RouterLink :to="taskLink(task)" class="block">
                    <TaskCard :task="task" :class="isNewOrUpdated(task) ? 'ring-2 ring-(--primary)/60' : ''">
                        <template #header-right>
                            <div class="flex items-center gap-1.5 shrink-0">
                                <span v-if="isNewOrUpdated(task)" class="dash-new-pill">
                                    {{ isNewlyAssigned(task) ? 'Nouveau' : 'Mis à jour' }}
                                </span>
                                <span class="text-[9px] font-bold text-(--text2) uppercase truncate max-w-20">
                                    {{ task.space?.name || 'Perso' }}
                                </span>
                            </div>
                        </template>
                    </TaskCard>
                </RouterLink>
            </li>
        </ul>
    </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { Task, TodoList } from '@/types/types';
import { useNotification } from '@/composables/useNotification';
import TaskCard from '../SpaceTasks/TaskCard.vue';

const orgId = computed(() => openedOrg.value?.id);
const rawTasks = ref<Task[]>([]);
const loading = ref(true);

const { notifications, init: initNotifications } = useNotification();

const unreadTaskCount = computed(() =>
    notifications.value.filter(n => n.type === 'TASK_ASSIGNED' && !n.isRead).length
);

// Tâches nouvellement assignées : id de tâche porté par les notifications
// TASK_ASSIGNED non lues (voir tasksService.ts notifyTaskAssignment côté API).
const newlyAssignedTaskIds = computed(() => {
    const ids = new Set<string>();
    notifications.value.forEach(n => {
        const taskId = n.data?.taskId;
        if (n.type === 'TASK_ASSIGNED' && !n.isRead && taskId) {
            ids.add(taskId);
        }
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

const items = computed(() => {
    const withDue = myTasks.value
        .filter(t => !!t.dueDate)
        .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

    const withoutDue = myTasks.value
        .filter(t => !t.dueDate)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return [...withDue, ...withoutDue].slice(0, 8);
});

function taskLink(task: Task): string {
    return task.spaceId ? `/${orgId.value}/${task.spaceId}/tasks` : `/${orgId.value}/tasks`;
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
</style>
