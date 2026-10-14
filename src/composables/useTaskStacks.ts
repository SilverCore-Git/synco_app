import { ref, type Ref } from 'vue';
import confetti from 'canvas-confetti';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import type { Task } from '@/types/types';

type Status = Task['status'];
export type DropMode = 'before' | 'after' | 'stack';

/** Un emplacement du Kanban : une tâche seule, ou une pile (≥ 2 tâches de même stackId). */
export interface TaskStackItem {
    key: string;
    stackId: string | null;
    tasks: Task[];
}

/**
 * Regroupe des tâches déjà triées en emplacements : les membres d'une pile
 * sont rassemblés à la position de leur premier membre. Une pile qui n'a plus
 * qu'un membre visible reste un emplacement à une tâche (rendu comme une
 * carte normale).
 */
export function groupIntoStacks(tasks: Task[], stackOf: (t: Task) => string | null | undefined = t => t.stackId): TaskStackItem[] {
    const items: TaskStackItem[] = [];
    const byStack = new Map<string, TaskStackItem>();
    for (const task of tasks) {
        const stackId = stackOf(task);
        if (!stackId) {
            items.push({ key: task.id, stackId: null, tasks: [task] });
            continue;
        }
        const existing = byStack.get(stackId);
        if (existing) {
            existing.tasks.push(task);
            continue;
        }
        const item = { key: `stack-${stackId}`, stackId, tasks: [task] };
        byStack.set(stackId, item);
        items.push(item);
    }
    return items;
}

interface UseTaskStacksOptions {
    orgId: string;
    /** Toutes les tâches chargées de la vue (non filtrées par recherche/filtres). */
    allTasks: Ref<Task[]>;
    /** Tâches visibles d'une colonne, déjà triées. */
    columnTasks: (status: string) => Task[];
    persistOrder: (orderedTaskIds: string[]) => Promise<void>;
}

/**
 * Logique d'empilement du Kanban partagée par « Mes tâches » et les tâches
 * d'un espace : regroupement par stackId, glisser-déposer (une tâche sur une
 * autre = pile, l'en-tête d'une pile = déplacer toute la pile, une tâche
 * d'une pile glissée seule = elle quitte la pile) et changement de statut
 * groupé. Les membres d'une pile partagent toujours le même statut.
 */
export function useTaskStacks({ orgId, allTasks, columnTasks, persistOrder }: UseTaskStacksOptions) {
    const toast = useToast();

    // État du glisser en cours : dataTransfer n'est lisible qu'au drop, or le
    // survol (dragover) doit déjà savoir ce qui est glissé.
    const drag = ref<{ ids: string[]; stackId: string | null; whole: boolean } | null>(null);
    const dragOverTaskId = ref<string | null>(null);
    const dragOverMode = ref<DropMode | null>(null);

    const columnItems = (status: string) => groupIntoStacks(columnTasks(status));

    const stackMembers = (task: Task): Task[] =>
        task.stackId ? allTasks.value.filter(t => t.stackId === task.stackId && !t.archived) : [task];

    const beginDrag = (e: DragEvent, task: Task) => {
        drag.value = { ids: [task.id], stackId: task.stackId ?? null, whole: false };
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('taskId', task.id);
        }
    };

    const beginStackDrag = (e: DragEvent, item: TaskStackItem) => {
        drag.value = { ids: item.tasks.map(t => t.id), stackId: item.stackId, whole: true };
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('taskId', item.tasks[0]!.id);
        }
    };

    const endDrag = () => {
        drag.value = null;
        dragOverTaskId.value = null;
        dragOverMode.value = null;
    };

    /** Ids glissés (toute la pile si on tient son en-tête), pour corbeille/archives/assignation. */
    const draggedIds = (e: DragEvent): string[] => {
        if (drag.value) return [...drag.value.ids];
        const id = e.dataTransfer?.getData('taskId');
        return id ? [id] : [];
    };

    const patchTask = async (task: Task, patch: { status?: Status; stackId?: string | null }): Promise<boolean> => {
        const previous = { status: task.status, stackId: task.stackId ?? null };
        Object.assign(task, patch);
        try {
            const res = await sfetch(`/api/tasks/${orgId}/tasks/${task.id}`, {
                method: 'PUT',
                body: JSON.stringify(patch)
            });
            if (!res.ok) throw new Error('API Error');
            return true;
        } catch {
            Object.assign(task, previous);
            return false;
        }
    };

    const celebrate = () => {
        try {
            confetti({
                particleCount: 150,
                spread: 80,
                origin: { y: 0.6 },
                colors: ['#4ade80', '#3b82f6', '#fbbf24', '#f87171'],
                zIndex: 10000
            });
        } catch (e) {}
    };

    /** Applique les patchs en parallèle ; renvoie true si tous ont réussi. */
    const applyPatches = async (patches: { task: Task; patch: { status?: Status; stackId?: string | null } }[], failMessage: string) => {
        const results = await Promise.all(patches.map(p => patchTask(p.task, p.patch)));
        const allOk = results.every(Boolean);
        if (!allOk) toast.show(failMessage, 'error');
        return { allOk, results };
    };

    /** Change le statut d'une tâche — de toute sa pile si elle en fait partie (flèches mobile). */
    const changeStatus = async (task: Task, newStatus: string) => {
        const toMove = stackMembers(task).filter(t => t.status !== newStatus);
        if (!toMove.length) return;
        const { results } = await applyPatches(
            toMove.map(t => ({ task: t, patch: { status: newStatus as Status } })),
            'Erreur lors du déplacement'
        );
        if (newStatus === 'DONE' && results.some(Boolean)) celebrate();
    };

    /**
     * Place `movedIds` dans la colonne `status`, à la fin ou relativement à
     * `target` (premier/dernier membre de son emplacement), persiste l'ordre
     * puis met à jour statut/pile. `detach` : les tâches quittent leur pile.
     */
    const placeInColumn = async (
        movedIds: string[],
        status: string,
        target: { task: Task; position: 'before' | 'after' } | null,
        detach: boolean
    ) => {
        const moved = movedIds
            .map(id => allTasks.value.find(t => t.id === id))
            .filter((t): t is Task => !!t);
        if (!moved.length) return;

        const rest = columnTasks(status).filter(t => !movedIds.includes(t.id));
        let insertAt = rest.length;
        if (target) {
            const slot = groupIntoStacks(rest).find(i => i.tasks.some(t => t.id === target.task.id));
            if (slot) {
                const anchor = target.position === 'before' ? slot.tasks[0]! : slot.tasks[slot.tasks.length - 1]!;
                const idx = rest.findIndex(t => t.id === anchor.id);
                insertAt = target.position === 'before' ? idx : idx + 1;
            }
        }
        rest.splice(insertAt, 0, ...moved);
        // Repasse par le regroupement pour que les membres d'une pile restent contigus.
        await persistOrder(groupIntoStacks(rest).flatMap(i => i.tasks.map(t => t.id)));

        const patches = moved
            .map(task => {
                const patch: { status?: Status; stackId?: string | null } = {};
                if (task.status !== status) patch.status = status as Status;
                if (detach && task.stackId) patch.stackId = null;
                return { task, patch };
            })
            .filter(p => Object.keys(p.patch).length > 0);
        if (!patches.length) return;

        const { results } = await applyPatches(patches, 'Erreur lors du déplacement');
        if (status === 'DONE' && patches.some((p, i) => p.patch.status && results[i])) celebrate();
    };

    /** Drop sur le fond d'une colonne : en fin de colonne. */
    const dropOnColumn = async (_e: DragEvent, status: string) => {
        const current = drag.value;
        endDrag();
        if (!current) return;
        await placeInColumn(current.ids, status, null, !current.whole);
    };

    const dragOverCard = (e: DragEvent, task: Task, item: TaskStackItem, index: number) => {
        const current = drag.value;
        // Pas d'indicateur sur soi-même ni sur sa propre pile.
        if (!current || current.ids.includes(task.id) || (current.stackId && current.stackId === task.stackId)) {
            dragOverTaskId.value = null;
            dragOverMode.value = null;
            return;
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        const inStack = item.tasks.length > 1;
        // Bords haut/bas = réordonner ; milieu = empiler. Dans une pile seuls le
        // bord haut du premier et le bord bas du dernier réordonnent.
        let mode: DropMode = 'stack';
        if (ratio < 0.25 && (!inStack || index === 0)) mode = 'before';
        else if (ratio > 0.75 && (!inStack || index === item.tasks.length - 1)) mode = 'after';
        dragOverTaskId.value = task.id;
        dragOverMode.value = mode;
    };

    const dropOnCard = async (_e: DragEvent, target: Task, status: string) => {
        const current = drag.value;
        const mode = dragOverMode.value;
        endDrag();
        if (!current || !mode || current.ids.includes(target.id)) return;
        if (current.stackId && current.stackId === target.stackId) return;

        if (mode !== 'stack') {
            await placeInColumn(current.ids, status, { task: target, position: mode }, !current.whole);
            return;
        }

        // Empiler : la cible garde (ou reçoit) l'id de pile, les tâches glissées
        // la rejoignent et prennent le statut de la cible.
        const stackId = target.stackId ?? crypto.randomUUID();
        const toPatch: Task[] = [
            ...(target.stackId ? [] : [target]),
            ...current.ids
                .map(id => allTasks.value.find(t => t.id === id))
                .filter((t): t is Task => !!t)
        ];
        if (!toPatch.length) return;

        const draggedIdsSet = new Set(current.ids);
        const rest = columnTasks(target.status).filter(t => !draggedIdsSet.has(t.id));
        const lastOfTarget = rest.filter(t => t.id === target.id || (target.stackId && t.stackId === target.stackId)).pop();
        const at = lastOfTarget ? rest.indexOf(lastOfTarget) + 1 : rest.length;
        const dragged = toPatch.filter(t => draggedIdsSet.has(t.id));
        rest.splice(at, 0, ...dragged);
        // Les tâches glissées et la cible prennent la nouvelle pile (pas encore
        // appliquée aux objets : l'optimisme vient après la persistance de l'ordre).
        const orderedIds = groupIntoStacks(
            rest,
            t => (draggedIdsSet.has(t.id) || t.id === target.id ? stackId : t.stackId)
        ).flatMap(i => i.tasks.map(t => t.id));

        await persistOrder(orderedIds);
        await applyPatches(
            toPatch.map(task => ({
                task,
                patch: task.status !== target.status ? { stackId, status: target.status } : { stackId }
            })),
            "Erreur lors de l'empilement"
        );
    };

    /** Sort une tâche de sa pile (menu contextuel). */
    const detachFromStack = async (task: Task) => {
        if (!task.stackId) return;
        await applyPatches([{ task, patch: { stackId: null } }], 'Erreur lors du retrait de la pile');
    };

    const dropIndicatorClass = (task: Task): string => {
        if (dragOverTaskId.value !== task.id) return '';
        if (dragOverMode.value === 'before') return 'border-t-2 border-t-(--primary)';
        if (dragOverMode.value === 'after') return 'border-b-2 border-b-(--primary)';
        if (dragOverMode.value === 'stack') return 'ring-2 ring-(--primary)';
        return '';
    };

    return {
        columnItems,
        stackMembers,
        beginDrag,
        beginStackDrag,
        endDrag,
        draggedIds,
        changeStatus,
        dropOnColumn,
        dragOverCard,
        dropOnCard,
        detachFromStack,
        dropIndicatorClass,
    };
}
