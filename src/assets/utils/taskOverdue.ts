import type { Task } from '@/types/types';

/** Échéance dépassée et tâche pas encore terminée. */
export const isTaskOverdue = (task: Pick<Task, 'dueDate' | 'status'>): boolean =>
    !!task.dueDate && task.status !== 'DONE' && new Date(task.dueDate).getTime() < Date.now();

/** « En retard de 3j » / « En retard de 5h » (ou « En retard » sous l'heure). */
export const overdueLabel = (dueDate: string | Date): string => {
    const lateHours = Math.floor((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60));
    if (lateHours < 1) return 'En retard';
    return lateHours < 24 ? `En retard de ${lateHours}h` : `En retard de ${Math.floor(lateHours / 24)}j`;
};

// Classes de la carte : bordure + halo rouges quand la tâche est en retard,
// pour qu'elle saute aux yeux dans le Kanban. Le ring épaissit le contour sans
// décaler la mise en page (contrairement à border-2).
export const TASK_CARD_NORMAL_CLASS = 'bg-(--bg2) border-(--text)/10 hover:border-(--primary)/50 shadow-lg hover:shadow-[0_8px_30px_var(--shadow-elevated)]';
export const TASK_CARD_OVERDUE_CLASS = 'bg-red-500/[0.07] border-red-500 ring-1 ring-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_28px_rgba(239,68,68,0.45)]';
