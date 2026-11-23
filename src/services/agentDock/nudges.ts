/**
 * Bulles « l'agent a besoin de vous » (PC80). Pur : décide quelles conversations méritent une bulle.
 * Ne touche jamais au dock : une bulle ne s'ouvre que sur un clic de l'utilisateur.
 */
import { nudgeLabel, waitKind } from './barState';

export interface SessionLike { id: string; title?: string | null; regime?: string | null; status?: string | null; statusChangedAt?: string | null }

export interface Nudge { sessionId: string; title: string; label: string; /** Change quand l'attente change : une bulle fermée ne revient pas pour la même attente. */ key: string }

/**
 * @param openIds conversations déjà présentes dans le dock : la barre s'allume (bordure ambre), pas de bulle en double.
 * @param dismissed clés de bulles déjà fermées.
 */
export function pendingNudges(sessions: readonly SessionLike[], openIds: ReadonlySet<string>, dismissed: ReadonlySet<string>): Nudge[] {
    const out: Nudge[] = [];
    for (const s of sessions) {
        if (s.regime !== 'runtime' || openIds.has(s.id)) continue;
        const wait = waitKind(s.status);
        const label = wait ? nudgeLabel(wait) : null;
        if (!label) continue;
        const key = `${s.id}:${s.status}:${s.statusChangedAt ?? ''}`;
        if (dismissed.has(key)) continue;
        out.push({ sessionId: s.id, title: (s.title || 'Nouvelle conversation').trim(), label, key });
    }
    return out;
}

/** Rangement de la fenêtre agrandie (PC78) : « À traiter », « En cours », « Récentes ». */
export type SessionGroup = 'todo' | 'running' | 'recent';

export function sessionGroup(status: string | null | undefined): SessionGroup {
    if (waitKind(status)) return 'todo';
    if (status === 'queued' || status === 'running') return 'running';
    return 'recent';
}

export function groupSessions<T extends SessionLike>(sessions: readonly T[]): Record<SessionGroup, T[]> {
    const g: Record<SessionGroup, T[]> = { todo: [], running: [], recent: [] };
    for (const s of sessions) g[sessionGroup(s.status)].push(s);
    return g;
}
