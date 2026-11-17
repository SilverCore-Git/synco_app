import { markRaw, onUnmounted, reactive, ref } from 'vue';
import type { Task } from '@/types/types';
import type { EventPanelState } from './useEventPanels';
import sfetch from '@/assets/utils/sfetch';
import { user } from '@/assets/var';

/**
 * Tâches ouvertes dans le dock en bas à droite (TaskPanelDock.vue, monté une
 * fois dans App.vue) : elles restent affichées quand on change de vue.
 *
 * Ouvrir une tâche remplace celles qui sont dépliées ; les entrées réduites (en
 * barre) restent ouvertes, on peut donc en garder plusieurs sous la main en
 * les réduisant. Ctrl+clic (⌘+clic sur macOS) l'ouvre à côté de celles déjà
 * dépliées, sans les remplacer : plusieurs panneaux côte à côte.
 *
 * Une entrée est soit une tâche existante (`task`), soit un brouillon de
 * création (`draft`, cf. TaskCreateForm.vue) : le formulaire vit ici, pour
 * survivre à la réduction du panneau.
 *
 * Le dock accueille aussi les événements de l'agenda (`event`, cf.
 * useEventPanels.ts et EventDetails.vue) : mêmes barres, même règle d'une
 * entrée dépliée par défaut, Ctrl+clic pour en ouvrir une de plus.
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

/** Au-delà, la plus ancienne entrée est fermée. */
const MAX_PANELS = 8;

/** Largeur d'un panneau du dock (25rem) et écart entre deux, cf. TaskPanelDock.vue. */
const PANEL_WIDTH_PX = 400;
const PANEL_GAP_PX = 12;

/** Panneaux dépliés côte à côte : autant que la fenêtre en laisse passer, en gardant la barre latérale visible. */
function maxExpanded() {
    if (typeof window === 'undefined') return 1;
    return Math.max(1, Math.floor((window.innerWidth - 32 - 320 + PANEL_GAP_PX) / (PANEL_WIDTH_PX + PANEL_GAP_PX)));
}

// Ctrl+clic (⌘+clic) sur une tâche ou un événement : ouvrir à côté. Les
// points d'entrée sont nombreux (Kanban, listes, accueil, agenda…) ; plutôt que
// de faire passer l'événement souris partout, on note la touche au moment du
// clic (phase de capture, avant les gestionnaires des vues).
let modifierClickAt = 0;
if (typeof window !== 'undefined') {
    window.addEventListener('click', e => {
        modifierClickAt = e.ctrlKey || e.metaKey ? performance.now() : 0;
    }, true);
}

/** Le clic en cours (ou tout juste passé) demandait-il d'ouvrir à côté ? */
export function wantsAlongside(): boolean {
    return modifierClickAt > 0 && performance.now() - modifierClickAt < 500;
}

const panels = ref<TaskPanel[]>([]);
let draftSeq = 0;

type UpdateListener = (task: Task) => void;
type DeleteListener = (taskId: string) => void;
const updateListeners = new Set<UpdateListener>();
const deleteListeners = new Set<DeleteListener>();

/** Les plus anciens panneaux dépliés se réduisent tant qu'il y en a trop pour la largeur. */
function fitExpanded() {
    const expanded = panels.value.filter(p => !p.minimized);
    const extra = expanded.length - maxExpanded();
    expanded.slice(0, Math.max(0, extra)).forEach(p => { p.minimized = true; });
}

/**
 * Ajoute une entrée dépliée. Par défaut celle qui était dépliée est remplacée
 * (les réduites restent) ; `alongside` (Ctrl+clic) la garde et ouvre la nouvelle à côté.
 */
function pushExpanded(panel: TaskPanel, alongside = wantsAlongside()) {
    const kept = alongside ? panels.value : panels.value.filter(p => p.minimized);
    const next = [...kept, panel].slice(-MAX_PANELS);
    const dropped = panels.value.filter(p => !next.includes(p));
    panels.value = next;
    dropped.forEach(p => {
        releaseDraftFiles(p.draft);
        p.onClose?.();
    });
    if (alongside) fitExpanded();
}

function openTask(task: Task, opts: { editTitle?: boolean; alongside?: boolean } = {}) {
    const alongside = opts.alongside ?? wantsAlongside();
    const existing = panels.value.find(p => p.task?.id === task.id);
    // Déjà ouverte (réduite) : on la déplie comme depuis sa barre.
    if (existing) {
        existing.task = mergeTask(existing.task!, task);
        restoreTask(existing.id, alongside);
        existing.editTitle = !!opts.editTitle;
        return;
    }
    pushExpanded({ id: task.id, task, minimized: false, editTitle: !!opts.editTitle }, alongside);
}

/** Ouvre une tâche dont on n'a qu'une version partielle (sous-tâche, tâche parente, résultat IA). */
async function openTaskById(orgId: string, partial: Partial<Task> & { id: string }) {
    // Lu avant la requête : le Ctrl+clic est loin une fois la réponse arrivée.
    const alongside = wantsAlongside();
    try {
        const res = await sfetch(`/api/tasks/${orgId}/tasks/${partial.id}`);
        if (res.ok) {
            openTask(await res.json(), { alongside });
            return;
        }
    } catch (e) {
        console.error('[useTaskPanels] Failed to fetch task', e);
    }
    openTask(partial as Task, { alongside });
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

/**
 * Déplier une entrée réduite : celle qui était dépliée se réduit (elle n'est
 * pas fermée), sauf avec `alongside` (Ctrl+clic) où elle reste à côté.
 */
function restoreTask(id: string, alongside = wantsAlongside()) {
    panels.value.forEach(p => {
        if (p.id === id) {
            p.minimized = false;
            p.editTitle = false;
        } else if (!alongside) {
            p.minimized = true;
        }
    });
    // L'entrée dépliée passe en dernier : le dock l'affiche au plus près du coin.
    const idx = panels.value.findIndex(p => p.id === id);
    if (idx !== -1) panels.value.push(...panels.value.splice(idx, 1));
    if (alongside) fitExpanded();
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
