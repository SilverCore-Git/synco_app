// ============================================
// Rapports d'activité — types partagés avec l'API
// ============================================

export type ReportRhythm = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ReportWindowMode = 'WATERMARK' | 'FIXED';
export type SectionDisplayMode = 'DETAILED' | 'COMPACT' | 'COUNT_ONLY';

export type SectionType =
    | 'TASKS_ASSIGNED' | 'TASKS_COMPLETED' | 'TASKS_OVERDUE' | 'TASKS_DUE_SOON' | 'TASKS_STATUS_CHANGED'
    | 'EVENTS_UPCOMING' | 'EVENTS_NEW_INVITES' | 'EVENTS_PENDING_RSVP'
    | 'FILES_ADDED' | 'MESSAGE_ACTIVITY' | 'MENTIONS' | 'MISSED_CALLS' | 'TAG_ACTIVITY';

export interface SectionFilters {
    assignee?: 'me' | 'anyone';
    tagIds?: string[];
    todoListIds?: string[];
    spaceIds?: string[];
    userIds?: string[];
    threadIds?: string[];
    withinDays?: number;
    mimeTypes?: string[];
}

export interface ReportSection {
    id?: string;
    type: SectionType;
    position: number;
    enabled: boolean;
    customTitle?: string | null;
    displayMode: SectionDisplayMode;
    itemLimit: number;
    hideWhenEmpty: boolean;
    filters: SectionFilters;
}

export interface ActivityReport {
    id: string;
    name: string;
    enabled: boolean;
    organizationId: string;
    spaceId?: string | null;
    organization?: { id: string; name: string };
    space?: { id: string; name: string } | null;

    rhythm: ReportRhythm;
    /** Minutes depuis minuit, dans `timezone`. */
    sendTimes: number[];
    /** 1 = lundi ... 7 = dimanche. Vide = tous les jours. */
    activeWeekdays: number[];
    intervalHours?: number | null;
    activeFromMinute?: number | null;
    activeUntilMinute?: number | null;
    /** Quantième, ou -1 pour « dernier jour du mois ». */
    dayOfMonth?: number | null;
    timezone: string;
    startsAt?: string | null;
    endsAt?: string | null;

    windowMode: ReportWindowMode;
    windowCapDays: number;
    sendIfEmpty: boolean;
    minItems: number;
    introText?: string | null;

    nextRunAt?: string | null;
    lastSentAt?: string | null;

    sections: ReportSection[];
}

/**
 * Une section répond soit à « ce qui s'est passé », soit à « où en est-on ».
 *
 * La distinction se voit dans l'interface : un rapport ne contenant que des
 * sections d'état n'est jamais vide, donc « ne rien envoyer si vide » ne se
 * déclenche jamais pour lui — un rapport horaire « tâches en retard »
 * enverrait 24 e-mails identiques par jour sans cet avertissement.
 */
export type SectionNature = 'PERIOD' | 'STATE';

export interface SectionDefinition {
    type: SectionType;
    label: string;
    description: string;
    family: 'Tâches' | 'Agenda' | 'Fichiers' | 'Messages' | 'Appels' | 'Tags';
    nature: SectionNature;
    icon: string;
    /** Faux tant que le collecteur correspondant n'est pas écrit côté API. */
    available: boolean;
}

export const SECTION_DEFINITIONS: SectionDefinition[] = [
    { type: 'TASKS_ASSIGNED', label: 'Nouvelles tâches assignées', description: 'Les tâches qu\'on vous a confiées', family: 'Tâches', nature: 'PERIOD', icon: 'bi bi-person-check', available: true },
    { type: 'TASKS_COMPLETED', label: 'Tâches terminées', description: 'Ce qui a été bouclé', family: 'Tâches', nature: 'PERIOD', icon: 'bi bi-check2-circle', available: true },
    { type: 'TASKS_OVERDUE', label: 'Tâches en retard', description: 'Échéance dépassée, non terminées', family: 'Tâches', nature: 'STATE', icon: 'bi bi-exclamation-triangle', available: true },
    { type: 'TASKS_DUE_SOON', label: 'Échéances à venir', description: 'Ce qui arrive dans les prochains jours', family: 'Tâches', nature: 'STATE', icon: 'bi bi-hourglass-split', available: true },
    { type: 'TASKS_STATUS_CHANGED', label: 'Changements de statut', description: 'Les tâches qui ont bougé', family: 'Tâches', nature: 'PERIOD', icon: 'bi bi-arrow-left-right', available: true },
    { type: 'EVENTS_UPCOMING', label: 'Événements à venir', description: 'Votre agenda des prochains jours', family: 'Agenda', nature: 'STATE', icon: 'bi bi-calendar-event', available: false },
    { type: 'EVENTS_NEW_INVITES', label: 'Nouvelles invitations', description: 'Les événements auxquels on vous a ajouté', family: 'Agenda', nature: 'PERIOD', icon: 'bi bi-calendar-plus', available: false },
    { type: 'EVENTS_PENDING_RSVP', label: 'Invitations sans réponse', description: 'Celles qui attendent votre réponse', family: 'Agenda', nature: 'STATE', icon: 'bi bi-calendar-question', available: false },
    { type: 'FILES_ADDED', label: 'Fichiers ajoutés', description: 'Les documents déposés sur votre périmètre', family: 'Fichiers', nature: 'PERIOD', icon: 'bi bi-file-earmark-arrow-up', available: false },
    { type: 'MESSAGE_ACTIVITY', label: 'Activité des salons', description: 'Volume par salon — le contenu reste chiffré', family: 'Messages', nature: 'PERIOD', icon: 'bi bi-chat-dots', available: false },
    { type: 'MENTIONS', label: 'Vos mentions', description: 'Qui vous a mentionné, et où', family: 'Messages', nature: 'PERIOD', icon: 'bi bi-at', available: false },
    { type: 'MISSED_CALLS', label: 'Appels manqués', description: 'Les appels que vous n\'avez pas pris', family: 'Appels', nature: 'PERIOD', icon: 'bi bi-telephone-x', available: false },
    { type: 'TAG_ACTIVITY', label: 'Activité par tag', description: 'Ce qui bouge sur les tags que vous suivez', family: 'Tags', nature: 'PERIOD', icon: 'bi bi-tags', available: false },
];

export function sectionDef(type: SectionType): SectionDefinition {
    return SECTION_DEFINITIONS.find(d => d.type === type) ?? SECTION_DEFINITIONS[0]!;
}

/** Préréglages proposés à qui n'a encore aucun rapport : un clic suffit. */
export interface ReportPreset {
    id: string;
    name: string;
    tagline: string;
    icon: string;
    build: () => Omit<ActivityReport, 'id' | 'organizationId' | 'organization' | 'space'>;
}

function section(
    type: SectionType,
    position: number,
    overrides: Partial<ReportSection> = {}
): ReportSection {
    return {
        type, position, enabled: true, displayMode: 'DETAILED',
        itemLimit: 10, hideWhenEmpty: true, filters: {}, ...overrides,
    };
}

const baseReport = {
    enabled: true,
    activeWeekdays: [] as number[],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
    windowMode: 'WATERMARK' as ReportWindowMode,
    windowCapDays: 7,
    sendIfEmpty: false,
    minItems: 1,
};

export const REPORT_PRESETS: ReportPreset[] = [
    {
        id: 'morning',
        name: 'Mon point du matin',
        tagline: 'Chaque jour ouvré à 8h30 — ce qui vous attend et ce qui a bougé',
        icon: 'bi bi-sunrise',
        build: () => ({
            ...baseReport,
            name: 'Mon point du matin',
            rhythm: 'DAILY',
            sendTimes: [510],
            activeWeekdays: [1, 2, 3, 4, 5],
            sections: [
                section('TASKS_DUE_SOON', 0, { filters: { assignee: 'me', withinDays: 3 } }),
                section('TASKS_ASSIGNED', 1, { filters: { assignee: 'me' } }),
                section('TASKS_OVERDUE', 2, { filters: { assignee: 'me' } }),
            ],
        }),
    },
    {
        id: 'weekly',
        name: 'Bilan de la semaine',
        tagline: 'Chaque vendredi à 17h — tout ce qui s\'est passé en sept jours',
        icon: 'bi bi-calendar-week',
        build: () => ({
            ...baseReport,
            name: 'Bilan de la semaine',
            rhythm: 'WEEKLY',
            sendTimes: [1020],
            activeWeekdays: [5],
            sections: [
                section('TASKS_COMPLETED', 0, { filters: { assignee: 'anyone' } }),
                section('TASKS_ASSIGNED', 1, { filters: { assignee: 'me' } }),
                section('TASKS_STATUS_CHANGED', 2, { displayMode: 'COMPACT', filters: { assignee: 'anyone' } }),
                section('TASKS_OVERDUE', 3, { filters: { assignee: 'me' } }),
            ],
        }),
    },
    {
        id: 'overdue',
        name: 'Mes tâches en retard',
        tagline: 'Chaque lundi à 9h — uniquement ce qui a dépassé son échéance',
        icon: 'bi bi-exclamation-triangle',
        build: () => ({
            ...baseReport,
            name: 'Mes tâches en retard',
            rhythm: 'WEEKLY',
            sendTimes: [540],
            activeWeekdays: [1],
            sections: [
                section('TASKS_OVERDUE', 0, { itemLimit: 20, filters: { assignee: 'me' } }),
            ],
        }),
    },
];
