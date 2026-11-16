import { onUnmounted, ref } from 'vue';
import type { Task } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';

/**
 * Tâches ouvertes dans le dock en bas à droite (TaskPanelDock.vue, monté une
 * fois dans App.vue) : elles restent affichées quand on change de vue.
 *
 * Une seule tâche est dépliée à la fois. Ouvrir une tâche remplace celle qui
 * est dépliée ; les tâches réduites (en barre) restent ouvertes, on peut donc
 * en garder plusieurs sous la main en les réduisant.
 *
 * Sur petit écran, le dock affiche la tâche dépliée dans la Popup plein écran
 * habituelle et ne propose pas de réduire.
 */

export interface TaskPanel {
    task: Task;
    minimized: boolean;
    /** « Renommer » depuis un menu contextuel : le titre s'ouvre en édition. */
    editTitle: boolean;
}

/** Au-delà, la plus ancienne tâche réduite est fermée. */
const MAX_PANELS = 5;

const panels = ref<TaskPanel[]>([]);

type UpdateListener = (task: Task) => void;
type DeleteListener = (taskId: string) => void;
const updateListeners = new Set<UpdateListener>();
const deleteListeners = new Set<DeleteListener>();

function openTask(task: Task, opts: { editTitle?: boolean } = {}) {
    const existing = panels.value.find(p => p.task.id === task.id);
    // Déjà ouverte (réduite) : on la déplie comme depuis sa barre.
    if (existing) {
        existing.task = mergeTask(existing.task, task);
        restoreTask(task.id);
        existing.editTitle = !!opts.editTitle;
        return;
    }
    // La tâche dépliée est remplacée ; les réduites restent ouvertes.
    const kept = panels.value.filter(p => p.minimized);
    panels.value = [...kept, { task, minimized: false, editTitle: !!opts.editTitle }].slice(-MAX_PANELS);
}

/** Ouvre une tâche dont on n'a qu'une version partielle (sous-tâche, tâche parente, résultat IA). */
async function openTaskById(orgId: string, partial: Partial<Task> & { id: string }) {
    try {
        const res = await sfetch(`/api/tasks/${orgId}/tasks/${partial.id}`);
        if (res.ok) {
            openTask(await res.json());
            return;
        }
    } catch (e) {
        console.error('[useTaskPanels] Failed to fetch task', e);
    }
    openTask(partial as Task);
}

function minimizeTask(taskId: string) {
    const p = panels.value.find(p => p.task.id === taskId);
    if (p) p.minimized = true;
}

/** Déplier une tâche réduite : celle qui était dépliée se réduit (elle n'est pas fermée). */
function restoreTask(taskId: string) {
    panels.value.forEach(p => {
        p.minimized = p.task.id !== taskId;
        if (p.task.id === taskId) p.editTitle = false;
    });
    // La tâche dépliée passe en dernier : le dock l'affiche au plus près du bas.
    const idx = panels.value.findIndex(p => p.task.id === taskId);
    if (idx !== -1) panels.value.push(...panels.value.splice(idx, 1));
}

function closeTask(taskId: string) {
    panels.value = panels.value.filter(p => p.task.id !== taskId);
}

function closeAllTasks() {
    panels.value = [];
}

// La réponse du PUT ne contient ni pièces jointes, ni fichiers liés, ni tâche
// parente (cf. updateTask côté API) : on garde ce qu'on avait déjà.
function mergeTask(previous: Task, next: Task): Task {
    return {
        ...previous,
        ...next,
        attachments: next.attachments ?? previous.attachments,
        linkedFiles: next.linkedFiles ?? previous.linkedFiles,
        parentTask: next.parentTask ?? previous.parentTask,
        subtasks: next.subtasks ?? previous.subtasks
    };
}

/** Appelé par le panneau après une modification : met la tâche ouverte à jour et prévient les vues. */
function notifyTaskUpdated(task: Task) {
    const p = panels.value.find(p => p.task.id === task.id);
    if (p) p.task = mergeTask(p.task, task);
    updateListeners.forEach(fn => fn(p?.task ?? task));
}

/** Appelé par le panneau après archivage ou suppression. */
function notifyTaskDeleted(taskId: string) {
    closeTask(taskId);
    deleteListeners.forEach(fn => fn(taskId));
}

/** Pour une vue qui affiche des tâches : être prévenue des modifications faites dans le panneau. */
function onTaskPanelChange(handlers: { update?: UpdateListener; delete?: DeleteListener }) {
    if (handlers.update) updateListeners.add(handlers.update);
    if (handlers.delete) deleteListeners.add(handlers.delete);
    onUnmounted(() => {
        if (handlers.update) updateListeners.delete(handlers.update);
        if (handlers.delete) deleteListeners.delete(handlers.delete);
    });
}

export function useTaskPanels() {
    return {
        panels,
        openTask,
        openTaskById,
        minimizeTask,
        restoreTask,
        closeTask,
        closeAllTasks,
        notifyTaskUpdated,
        notifyTaskDeleted,
        onTaskPanelChange
    };
}
