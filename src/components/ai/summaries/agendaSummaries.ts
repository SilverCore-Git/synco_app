import { cleanText } from '@/services/aiRuntime/plan/planLabels';
import type { Summarizer, SummaryContext } from './summaryRegistry';

const LEVELS: Record<string, string> = { READ: 'lecture seule', WRITE: 'modification' };
const level = (v: unknown): string => LEVELS[String(v)] ?? 'niveau inconnu';
/** URL entière, requête comprise : c'est ce que le serveur va télécharger, rien n'est abrégé. */
const fullUrl = (v: unknown): string => cleanText(v, 2000) || 'URL absente';
const member = (ctx: SummaryContext, id: unknown): string =>
    (typeof id === 'string' ? ctx.userName(id) : null) ?? 'membre inconnu de l’organisation';

export const summaries: Record<string, Summarizer> = {
    add_ics_calendar: a => `S’abonner à l’agenda ICS ${fullUrl(a.url)}${a.name ? ` (nommé « ${cleanText(a.name, 60)} »)` : ''}`,
    update_ics_calendar_url: a => `Suivre désormais l’URL ICS ${fullUrl(a.url)}`,
    share_my_calendar: (a, ctx) => `Partager mon agenda avec ${member(ctx, a.userId)}, en ${level(a.level)}`,
    request_calendar_access: (a, ctx) => `Demander l’accès à l’agenda de ${member(ctx, a.userId)}, en ${level(a.level)}`,
    respond_calendar_access: (a, ctx) => {
        const verb = a.accept === true ? 'Accepter' : 'Refuser';
        const g = typeof a.grantId === 'string' ? ctx.grant?.(a.grantId) : null;
        if (!g) return `${verb} un partage d’agenda (demandeur inconnu)`;
        return g.direction === 'owner'
            ? `${verb} la demande de ${cleanText(g.who, 60)} d’accéder à mon agenda (${g.level})`
            : `${verb} l’invitation de ${cleanText(g.who, 60)} à consulter son agenda (${g.level})`;
    },
};
