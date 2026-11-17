import { markRaw, onUnmounted, reactive, ref } from 'vue';
import type { Task } from '@/types/types';
import type { EventPanelState } from './useEventPanels';
import sfetch from '@/assets/utils/sfetch';
import { user } from '@/assets/var';

/**
 * Tâches ouvertes dans le dock en bas à droite (TaskPanelDock.vue, monté une
 * fois dans App.vue) : elles restent affichées quand on change de vue.
 *
 * Une seule entrée est dépliée à la fois. Ouvrir une tâche remplace celle qui
 * est dépliée ; les entrées réduites (en barre) restent ouvertes, on peut donc
 * en garder plusieurs sous la main en les réduisant.
 *
 * Une entrée est soit une tâche existante (`task`), soit un brouillon de
 * création (`draft`, cf. TaskCreateForm.vue) : le formulaire vit ici, pour
 * survivre à la réduction du panneau.
 *
 * Le dock accueille aussi les événements de l'agenda (`event`, cf.
 * useEventPanels.ts et EventDetails.vue) : mêmes barres, même règle d'une
 * seule entrée dépliée.
 *
 * Sur petit écran, le dock affiche l'entrée dépliée dans la Popup plein écran
 * habituelle et ne propose pas de réduire.
 */

export interface StagedFile {
    file: File;
    /** URL blob: d'aperçu pour les images, sinon null. */
    previewUrl: string | null;
}

export interface TaskDraft {
    defaultSpaceId: string | null;
    hideSpaceSelect: boolean;
    parentTaskId: string | null;
    todoListId: string | null;
    onCreated?: (task: Task) => void;
    form: {
        title: string;
        description: string;
        status: Task['status'];
        dueDate: string;
        dueTime: string;
        spaceId: string | null;
        assigneeIds: string[];
        tagIds: string[];
    };
    files: StagedFile[];
}

export interface TaskPanel {
    /** id de la tâche, `draft-<n>` pour un brouillon, `event-…` pour un événement. */
    id: string;
    task?: Task;
    draft?: TaskDraft;
    event?: EventPanelState;
    /** Appelé quand l'entrée est fermée (ex. : supprimer un événement créé puis vidé de son titre). */
    onClose?: () => void;
    minimized: boolean;
    /** « Renommer » depuis un menu contextuel : le titre s'ouvre en édition. */
    editTitle: boolean;
}

/** Au-delà, la plus ancienne entrée réduite est fermée. */
const MAX_PANELS = 5;

const panels = ref<TaskPanel[]>([]);
let draftSeq = 0;

type UpdateListener = (task: Task) => void;
type DeleteListener = (taskId: string) => void;
const updateListeners = new Set<UpdateListener>();
const deleteListeners = new Set<DeleteListener>();

/** Ajoute une entrée dépliée : celle qui était dépliée est remplacée, les réduites restent. */
function pushExpanded(panel: TaskPanel) {
    const kept = panels.value.filter(p => p.minimized);
    const next = [...kept, panel].slice(-MAX_PANELS);
    const dropped = panels.value.filter(p => !next.includes(p));
    panels.value = next;
    dropped.forEach(p => {
        releaseDraftFiles(p.draft);
        p.onClose?.();
    });
}

function openTask(task: Task, opts: { editTitle?: boolean } = {}) {
    const existing = panels.value.find(p => p.task?.id === task.id);
    // Déjà ouverte (réduite) : on la déplie comme depuis sa barre.
    if (existing) {
        existing.task = mergeTask(existing.task!, task);
        restoreTask(existing.id);
        existing.editTitle = !!opts.editTitle;
        return;
    }
    pushExpanded({ id: task.id, task, minimized: false, editTitle: !!opts.editTitle });
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

/** Nouvelle tâche : un brouillon s'ouvre dans le dock (remplace l'ancienne Popup de création). */
function openDraft(opts: {
    defaultSpaceId?: string | null;
    hideSpaceSelect?: boolean;
    parentTaskId?: string | null;
    todoListId?: string | null;
    onCreated?: (task: Task) => void;
} = {}) {
    const draft: TaskDraft = reactive({
        defaultSpaceId: opts.defaultSpaceId ?? null,
        hideSpaceSelect: !!opts.hideSpaceSelect,
        parentTaskId: opts.parentTaskId ?? null,
        todoListId: opts.todoListId ?? null,
        onCreated: opts.onCreated ? markRaw(opts.onCreated) : undefined,
        form: {
            title: '',
            description: '',
            status: 'TODO',
            dueDate: '',
            dueTime: '',
            spaceId: opts.defaultSpaceId ?? null,
            assigneeIds: user.value?.id ? [user.value.id] : [],
            tagIds: []
        },
        files: []
    }) as TaskDraft;
    pushExpanded({ id: `draft-${++draftSeq}`, draft, minimized: false, editTitle: false });
}

/** Le brouillon est devenu une vraie tâche : son panneau affiche maintenant la tâche. */
function finishDraft(draftId: string, task: Task) {
    const p = panels.value.find(p => p.id === draftId);
    const onCreated = p?.draft?.onCreated;
    if (p) {
        releaseDraftFiles(p.draft);
        p.id = task.id;
        p.task = task;
        p.draft = undefined;
    }
    onCreated?.(task);
}

function releaseDraftFiles(draft?: TaskDraft) {
    draft?.files.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
}

function minimizeTask(id: string) {
    const p = panels.value.find(p => p.id === id);
    if (p) p.minimized = true;
}

/** Déplier une entrée réduite : celle qui était dépliée se réduit (elle n'est pas fermée). */
function restoreTask(id: string) {
    panels.value.forEach(p => {
        p.minimized = p.id !== id;
        if (p.id === id) p.editTitle = false;
    });
    // L'entrée dépliée passe en dernier : le dock l'affiche au plus près du bas.
    const idx = panels.value.findIndex(p => p.id === id);
    if (idx !== -1) panels.value.push(...panels.value.splice(idx, 1));
}

function closeTask(id: string) {
    const p = panels.value.find(p => p.id === id);
    releaseDraftFiles(p?.draft);
    panels.value = panels.value.filter(p => p.id !== id);
    p?.onClose?.();
}

function closeAllTasks() {
    const closed = panels.value;
    closed.forEach(p => releaseDraftFiles(p.draft));
    panels.value = [];
    closed.forEach(p => p.onClose?.());
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
    const p = panels.value.find(p => p.task?.id === task.id);
    if (p?.task) p.task = mergeTask(p.task, task);
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
        pushExpanded,
        openTask,
        openTaskById,
        openDraft,
        finishDraft,
        minimizeTask,
        restoreTask,
        closeTask,
        closeAllTasks,
        notifyTaskUpdated,
        notifyTaskDeleted,
        onTaskPanelChange
    };
}
