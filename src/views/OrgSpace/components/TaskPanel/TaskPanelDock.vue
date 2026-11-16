<template>
    <!-- Bureau : tâches réduites en barres, puis la tâche dépliée au plus près
         du bas. Monté dans la colonne bas-droite d'App.vue, au-dessus de
         l'overlay des transferts : tout s'empile dans la hauteur. -->
    <div v-if="!isLittleScreen && panels.length" class="task-dock">
        <TransitionGroup name="task-bar" tag="div" class="flex flex-col items-end gap-2 shrink-0">
            <div
                v-for="p in minimizedPanels"
                :key="p.task.id"
                class="task-bar"
            >
                <button
                    type="button"
                    class="flex-1 min-w-0 h-full flex items-center gap-2.5 pl-3.5 text-left"
                    :title="`Déplier : ${p.task.title}`"
                    @click="restoreTask(p.task.id)"
                >
                    <i :class="statusIcon(p.task)"></i>
                    <span class="flex-1 min-w-0 truncate text-sm font-semibold text-(--text)">{{ p.task.title }}</span>
                    <span v-if="barDue(p.task)" class="text-[11px] whitespace-nowrap" :class="isTaskOverdue(p.task) ? 'text-red-500 font-bold' : 'text-(--text2)'">{{ barDue(p.task) }}</span>
                </button>
                <button type="button" class="dock-btn mr-1.5" :aria-label="`Fermer : ${p.task.title}`" title="Fermer" @click="closeTask(p.task.id)">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </TransitionGroup>

        <Transition name="task-panel" mode="out-in">
            <section
                v-if="expanded"
                :key="expanded.task.id"
                class="task-panel"
                role="dialog"
                :aria-label="`Tâche : ${expanded.task.title}`"
                @keydown.escape="minimizeTask(expanded.task.id)"
            >
                <header class="flex items-center gap-1.5 pl-4 pr-2 py-2 border-b border-(--border-color) shrink-0">
                    <i :class="statusIcon(expanded.task)"></i>
                    <div class="flex-1 min-w-0 flex items-center gap-1.5 text-xs text-(--text2)">
                        <span class="truncate shrink-0 max-w-[45%]">{{ spaceName(expanded.task) }}</span>
                        <template v-if="expanded.task.parentTask">
                            <i class="bi bi-chevron-right text-[9px]"></i>
                            <button
                                type="button"
                                class="truncate hover:text-(--primary) transition-colors"
                                :title="`Ouvrir la tâche parente : ${expanded.task.parentTask.title}`"
                                @click="openTaskById(orgIdOf(expanded.task), expanded.task.parentTask)"
                            >{{ expanded.task.parentTask.title }}</button>
                        </template>
                    </div>
                    <button type="button" class="dock-btn" title="Réduire" aria-label="Réduire" @click="minimizeTask(expanded.task.id)">
                        <i class="bi bi-dash-lg"></i>
                    </button>
                    <button type="button" class="dock-btn" title="Fermer" aria-label="Fermer" @click="closeTask(expanded.task.id)">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </header>
                <TaskDetails
                    :task="expanded.task"
                    :org-id="orgIdOf(expanded.task)"
                    :edit-title="expanded.editTitle"
                    variant="panel"
                />
            </section>
        </Transition>
    </div>

    <!-- Petit écran : la Popup plein écran habituelle. -->
    <Popup v-if="isLittleScreen" :is-open="!!expanded" @close="expanded && closeTask(expanded.task.id)">
        <template #title>
            <div class="flex flex-col gap-0.5">
                <button
                    v-if="expanded?.task.parentTask"
                    type="button"
                    class="flex items-center gap-1 text-[11px] font-semibold text-(--text2) hover:text-(--primary) transition-colors text-left"
                    @click="openTaskById(orgIdOf(expanded.task), expanded.task.parentTask)"
                >
                    <i class="bi bi-arrow-left-short text-sm"></i> {{ expanded.task.parentTask.title }}
                </button>
                <span class="flex items-center gap-2">
                    <i class="bi bi-check2-square text-(--primary)"></i>
                    {{ expanded ? spaceName(expanded.task) : 'Tâche' }}
                </span>
            </div>
        </template>
        <TaskDetails
            v-if="expanded"
            :key="expanded.task.id"
            :task="expanded.task"
            :org-id="orgIdOf(expanded.task)"
            :edit-title="expanded.editTitle"
            variant="popup"
        />
    </Popup>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import Popup from '@/components/Popup.vue';
import TaskDetails from './TaskDetails.vue';
import type { Task } from '@/types/types';
import { isLittleScreen, openedOrg } from '@/assets/var';
import { isTaskOverdue, overdueLabel } from '@/assets/utils/taskOverdue';
import { useTaskPanels } from '@/composables/useTaskPanels';

const route = useRoute();
const { panels, openTaskById, minimizeTask, restoreTask, closeTask, closeAllTasks } = useTaskPanels();

const expanded = computed(() => panels.value.find(p => !p.minimized) ?? null);
const minimizedPanels = computed(() => panels.value.filter(p => p.minimized));

// Les tâches appartiennent à une organisation (membres, espaces, droits) :
// en changer ferme le dock plutôt que d'afficher des listes qui ne collent plus.
watch(() => route.params.orgId, (orgId, previous) => {
    if (orgId !== previous) closeAllTasks();
});

const orgIdOf = (task: Task) => task.organizationId || String(route.params.orgId || openedOrg.value?.id || '');

const spaceName = (task: Task) => {
    if (!task.spaceId) return 'Général';
    return task.space?.name || openedOrg.value?.spaces?.find(s => s.id === task.spaceId)?.name || 'Espace';
};

const statusIcon = (task: Task) => {
    if (task.status === 'DONE') return 'bi bi-check-circle-fill text-green-500 shrink-0';
    if (task.status === 'IN_PROGRESS') return 'bi bi-arrow-repeat text-blue-400 shrink-0';
    return 'bi bi-circle text-gray-400 shrink-0';
};

const barDue = (task: Task) => {
    if (task.status === 'DONE') return 'Terminée';
    if (!task.dueDate) return '';
    if (isTaskOverdue(task)) return overdueLabel(task.dueDate);
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(due).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
    if (days === 0) {
        const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
        return hasTime ? due.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : "Aujourd'hui";
    }
    if (days === 1) return 'Demain';
    return due.toLocaleDateString('fr-FR', days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
};
</script>

<style scoped>
.task-dock {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
    min-height: 0;
    width: 25rem;
    max-width: calc(100vw - 2rem);
    pointer-events: none;
}
.task-dock > *,
.task-dock :deep(.task-bar) { pointer-events: auto; }

.task-panel {
    pointer-events: auto;
    width: 100%;
    min-height: 0;
    max-height: 44rem;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border-color);
    border-radius: 1.1rem;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.12);
    overflow: hidden;
}

.task-bar {
    width: 20rem;
    max-width: 100%;
    height: 2.75rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--bg);
    border: 1px solid var(--border-color);
    border-radius: 0.9rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
    transition: border-color 0.15s, transform 0.15s;
}
.task-bar:hover { border-color: color-mix(in srgb, var(--primary) 50%, transparent); transform: translateX(-2px); }

.dock-btn {
    width: 1.9rem;
    height: 1.9rem;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 0.55rem;
    color: var(--text2);
    font-size: 0.85rem;
    transition: background-color 0.15s, color 0.15s;
}
.dock-btn:hover { background: color-mix(in srgb, var(--text) 10%, transparent); color: var(--text); }

.task-panel-enter-active, .task-panel-leave-active { transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); }
.task-panel-enter-from { opacity: 0; transform: translateY(16px) scale(0.98); }
.task-panel-leave-to { opacity: 0; transform: translateY(12px) scale(0.98); }

.task-bar-enter-active, .task-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.task-bar-enter-from, .task-bar-leave-to { opacity: 0; transform: translateY(8px); }
.task-bar-move { transition: transform 0.2s ease; }

@media (prefers-reduced-motion: reduce) {
    .task-panel-enter-active, .task-panel-leave-active,
    .task-bar-enter-active, .task-bar-leave-active, .task-bar-move { transition: none; }
}
</style>
