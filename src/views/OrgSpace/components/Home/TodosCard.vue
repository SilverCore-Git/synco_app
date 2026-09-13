<template>
    <section class="dash-card">
        <header class="dash-card-header">
            <div class="flex items-center gap-2">
                <i class="bi bi-check2-square text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Tâches</h3>
            </div>
            <RouterLink :to="`/${orgId}/tasks`" class="text-xs text-(--text2) hover:text-(--text)">
                Voir tout <i class="bi bi-arrow-right"></i>
            </RouterLink>
        </header>

        <div v-if="loading" class="dash-card-body space-y-2 animate-pulse">
            <div v-for="i in 3" :key="i" class="h-12 bg-white/5 rounded-xl"></div>
        </div>

        <div v-else-if="items.length === 0" class="dash-card-empty">
            <i class="bi bi-emoji-sunglasses text-2xl text-(--text2)"></i>
            <p>Aucune tâche en attente</p>
        </div>

        <ul v-else class="dash-card-body space-y-1">
            <li v-for="task in items" :key="task.id">
                <RouterLink :to="taskLink(task)" class="dash-row">
                    <i class="bi bi-circle text-(--text2) shrink-0"></i>
                    <div class="flex-1 min-w-0 text-left">
                        <p class="text-sm font-medium text-(--text) truncate">{{ task.title }}</p>
                        <p class="text-xs text-(--text2) truncate">{{ task.space?.name || 'Tâche personnelle' }}</p>
                    </div>
                    <span v-if="task.dueDate" class="text-[11px] font-semibold shrink-0" :class="dueInfo(task).color">
                        {{ dueInfo(task).text }}
                    </span>
                </RouterLink>
            </li>
        </ul>
    </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { Task, TodoList } from '@/types/types';

const orgId = computed(() => openedOrg.value?.id);
const rawTasks = ref<Task[]>([]);
const loading = ref(true);

onMounted(async () => {
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
    } finally {
        loading.value = false;
    }
});

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

function dueInfo(task: Task): { text: string; color: string } {
    const end = new Date(task.dueDate!).getTime();
    const now = Date.now();
    const remainingMs = end - now;

    if (remainingMs <= 0) return { text: 'En retard', color: 'text-red-500' };

    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    if (remainingHours < 24) return { text: `${remainingHours}h restantes`, color: 'text-orange-400' };

    const remainingDays = Math.floor(remainingHours / 24);
    return { text: `${remainingDays}j restants`, color: remainingDays <= 2 ? 'text-orange-400' : 'text-(--text2)' };
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

.dash-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.5rem 0.6rem;
    border-radius: 0.75rem;
    text-align: left;
    transition: background-color 0.15s;
}
.dash-row:hover {
    background: rgba(255, 255, 255, 0.04);
}
</style>
