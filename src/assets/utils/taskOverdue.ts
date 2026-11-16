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

export interface DeadlineProgress {
    percent: number;
    text: string;
    /** Classe Tailwind de fond (bg-green-500 / bg-orange-400 / bg-red-500…). */
    color: string;
}

/** Temps écoulé entre la création et l'échéance : barre « Échéance » de TaskCard
 *  et mini-barres de l'accueil. Verte, orange au-delà de 60 %, rouge au-delà de 85 %. */
export const deadlineProgress = (task: Pick<Task, 'dueDate' | 'createdAt'>): DeadlineProgress => {
    if (!task.dueDate) return { percent: 0, text: '', color: 'bg-green-500' };
    const start = new Date(task.createdAt || Date.now()).getTime();
    const end = new Date(task.dueDate).getTime();
    const now = Date.now();

    if (now > end) return { percent: 100, text: overdueLabel(task.dueDate), color: 'bg-red-500' };

    const total = end - start;
    const percent = total > 0 ? Math.max(0, ((now - start) / total) * 100) : 100;

    const remainingHours = Math.floor((end - now) / (1000 * 60 * 60));
    const text = remainingHours < 24 ? `${remainingHours}h restantes` : `${Math.floor(remainingHours / 24)}j restants`;

    let color = 'bg-green-500';
    if (percent > 60) color = 'bg-orange-400';
    if (percent > 85) color = 'bg-red-500';
    if (percent > 95) color = 'bg-red-600 animate-pulse';

    return { percent, text, color };
};

// Classes de la carte : bordure + halo rouges quand la tâche est en retard,
// pour qu'elle saute aux yeux dans le Kanban. Le ring épaissit le contour sans
// décaler la mise en page (contrairement à border-2).
export const TASK_CARD_NORMAL_CLASS = 'bg-(--bg2) border-(--text)/10 hover:border-(--primary)/50 shadow-lg hover:shadow-[0_8px_30px_var(--shadow-elevated)]';
export const TASK_CARD_OVERDUE_CLASS = 'bg-red-500/[0.07] border-red-500 ring-1 ring-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_28px_rgba(239,68,68,0.45)]';
