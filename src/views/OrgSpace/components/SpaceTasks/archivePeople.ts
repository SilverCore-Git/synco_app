import type { Task } from '@/types/types';

/** Une « personne » de l'écran des archives : un assigné, ou le groupe des
 *  tâches sans assigné (isNone). */
export interface ArchivePerson {
    id: string;
    name: string;
    avatarUrl?: string | null;
    isMe: boolean;
    isNone: boolean;
}

export const NO_ASSIGNEE_ID = '__none__';

/** Personnes d'une tâche archivée : ses assignés, ou « Sans assigné ». Une
 *  tâche à deux assignés est rangée chez les deux. */
export const taskPeople = (task: Task, meId: string | null): ArchivePerson[] => {
    if (!task.assignees?.length) {
        return [{ id: NO_ASSIGNEE_ID, name: 'Sans assigné', avatarUrl: null, isMe: false, isNone: true }];
    }
    return task.assignees.map(a => ({
        id: a.id,
        name: a.name || 'Membre',
        avatarUrl: a.avatarUrl ?? null,
        isMe: a.id === meId,
        isNone: false,
    }));
};

/** Vous d'abord, puis par nombre de tâches, puis par nom ; « Sans assigné » à la fin. */
export const comparePeople = (
    a: { person: ArchivePerson; total: number },
    b: { person: ArchivePerson; total: number },
): number => {
    if (a.person.isNone !== b.person.isNone) return a.person.isNone ? 1 : -1;
    if (a.person.isMe !== b.person.isMe) return a.person.isMe ? -1 : 1;
    if (a.total !== b.total) return b.total - a.total;
    return a.person.name.localeCompare(b.person.name, 'fr');
};

/** Teinte stable par personne pour les initiales (même personne, même couleur partout). */
export const personHue = (id: string): number => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return h;
};
