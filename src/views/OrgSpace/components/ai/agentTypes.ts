export type ToolStepStatus = 'pending' | 'executing' | 'done' | 'rejected' | 'error';

export interface ToolStep {
    toolCallId: string;
    name: string;
    args?: any;
    status: ToolStepStatus;
    category?: 'server' | 'client';
    mutating?: boolean;
    interactive?: boolean;
    result?: any;
}

/** Statuts de point affichables par TimelineGutter — ceux des tools, plus 'text'/'thinking' pour les segments sans ToolStep. */
export type TimelineDotStatus = ToolStepStatus | 'text' | 'thinking';

export type TurnPart =
    | { type: 'text'; text: string }
    | { type: 'tool'; tool: ToolStep }
    /** Raisonnement du modèle avant sa réponse — affiché replié, façon "Réflexion (Xs)". */
    | { type: 'thinking'; text: string; durationMs?: number };

/** Libellés/icônes français par tool — utilisés par ToolStepItem pour l'affichage replié. */
export const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
    create_space: { label: 'Création d\'un espace', icon: 'bi-folder-plus' },
    create_task: { label: "Création d'une tâche", icon: 'bi-check2-square' },
    update_task: { label: "Modification d'une tâche", icon: 'bi-pencil-square' },
    complete_task: { label: 'Tâche marquée terminée', icon: 'bi-check2-circle' },
    delete_task: { label: "Suppression d'une tâche", icon: 'bi-trash' },
    update_space: { label: "Modification d'un espace", icon: 'bi-pencil-square' },
    create_thread: { label: 'Création de salon(s)', icon: 'bi-hash' },
    search_messages: { label: 'Recherche dans les messages', icon: 'bi-search' },
    list_documentation: { label: 'Liste des chapitres de documentation', icon: 'bi-journals' },
    read_documentation: { label: 'Consultation de la documentation', icon: 'bi-book' },
    search_documentation: { label: 'Recherche dans la documentation', icon: 'bi-journal-text' },
    read_tasks: { label: 'Lecture des tâches', icon: 'bi-list-check' },
    get_task: { label: "Lecture d'une tâche", icon: 'bi-card-checklist' },
    list_spaces: { label: 'Liste des espaces', icon: 'bi-grid-3x3-gap' },
    list_threads: { label: 'Liste des salons', icon: 'bi-collection' },
    list_members: { label: "Liste des membres", icon: 'bi-people' },
    create_file: { label: "Création d'un fichier", icon: 'bi-file-earmark-plus' },
    create_folder: { label: "Création d'un dossier", icon: 'bi-folder-plus' },
    request_image_upload: { label: "Sélection d'une image", icon: 'bi-image' },
    ask_question: { label: 'Question à l\'utilisateur', icon: 'bi-question-circle' },
    create_email_report: { label: "Création d'un rapport e-mail", icon: 'bi-envelope-paper' },
    list_email_reports: { label: 'Liste des rapports e-mail', icon: 'bi-envelope-paper' },
};

export function toolLabel(name: string) {
    return TOOL_LABELS[name] || { label: name, icon: 'bi-wrench-adjustable-circle' };
}
