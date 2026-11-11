// Miroir de synco_api/src/services/spaceStats/types.ts : garder les deux alignés.
export type Granularity = 'day' | 'week' | 'month';

export interface StatsUser {
    id: string;
    name: string;
    avatarUrl: string | null;
}

export interface StatsTag {
    id: string;
    name: string;
    color: string;
}

export interface StatsPeriodInfo {
    from: string;
    to: string;
    timezone: string;
    granularity: Granularity;
    buckets: string[];
}

export interface DurationStats {
    medianHours: number | null;
    p90Hours: number | null;
    sample: number;
}

export type StatsScopeKind = 'org' | 'space';

export interface StatsSpaceRef {
    id: string;
    name: string;
    logo: string | null;
}

/** Portées que l'utilisateur peut consulter (Paramètres > Statistiques). */
export interface StatsScopesResponse {
    org: boolean;
    spaces: StatsSpaceRef[];
}

export interface TaskStatsResponse {
    scope: StatsScopeKind;
    period: StatsPeriodInfo;
    /** Premier évènement d'historique de l'espace : avant, temps de cycle et réouvertures sont inconnus. */
    historySince: string | null;
    canSeeMembers: boolean;
    kpis: {
        total: number;
        todo: number;
        inProgress: number;
        done: number;
        archived: number;
        overdue: number;
        dueSoon: number;
        unassigned: number;
        noDueDate: number;
        created: number;
        completed: number;
        reopened: number;
        previous: { created: number; completed: number };
        leadTime: DurationStats;
        cycleTime: DurationStats;
        onTime: { onTime: number; late: number; rate: number | null };
        withFiles: number;
        subtasks: { total: number; done: number };
    };
    flow: Array<{ bucket: string; created: number; completed: number; open: number }>;
    age: Array<{ label: string; count: number }>;
    stuck: Array<{ id: string; title: string; spaceId: string | null; since: string; assigneeIds: string[] }>;
    overdueTasks: Array<{ id: string; title: string; spaceId: string | null; dueDate: string; assigneeIds: string[] }>;
    members: Array<{
        userId: string;
        open: number;
        inProgress: number;
        completed: number;
        overdue: number;
        created: number;
        leadTimeMedianHours: number | null;
    }>;
    /** tagId null = tâches sans tag. */
    tags: Array<{ tagId: string | null; total: number; open: number; completed: number; overdue: number }>;
    lists: Array<{ id: string; title: string; total: number; done: number }>;
    /** Portée organisation seulement : une ligne par space (spaceId null = tâches hors space). */
    spaces: Array<{ spaceId: string | null; total: number; open: number; completed: number; overdue: number }>;
    /** [jour 0 = lundi][heure 0-23] */
    heatmap: { created: number[][]; completed: number[][] };
    users: StatsUser[];
    tagsMeta: StatsTag[];
    spacesMeta: StatsSpaceRef[];
}

export type FileFamily = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'archive' | 'text' | 'other';

export interface FileStatsResponse {
    scope: StatsScopeKind;
    period: StatsPeriodInfo;
    canSeeMembers: boolean;
    kpis: {
        files: number;
        bytes: number;
        folders: number;
        added: number;
        addedBytes: number;
        previous: { added: number; addedBytes: number };
        dormant: { files: number; bytes: number };
    };
    /** Réservé à ORG_STORAGE (même règle que Paramètres > Stockage). */
    quota: { orgUsed: number; orgMax: number } | null;
    series: Array<{ bucket: string; uploads: number; bytes: number; cumulativeBytes: number }>;
    types: Array<{ family: FileFamily; files: number; bytes: number }>;
    members: Array<{ userId: string; files: number; bytes: number; added: number; lastAt: string | null }>;
    /** Dossiers de premier niveau, totaux sous-dossiers compris ; id null = racine de l'espace. */
    folders: Array<{ id: string | null; name: string; color: string | null; files: number; bytes: number }>;
    largest: Array<{ id: string; name: string; mimeType: string; size: number; ownerId: string; spaceId: string | null; folderId: string | null; createdAt: string }>;
    origin: Record<'space' | 'messages' | 'tasks', { files: number; bytes: number }>;
    /** Portée organisation seulement : une ligne par space (spaceId null = hors space : DM, dossiers d'organisation…). */
    spaces: Array<{ spaceId: string | null; files: number; bytes: number }>;
    tasks: { filesLinkedToTasks: number; tasksWithFiles: number; tasksTotal: number };
    tags: Array<{ tagId: string; files: number; bytes: number }>;
    users: StatsUser[];
    tagsMeta: StatsTag[];
    spacesMeta: StatsSpaceRef[];
}
