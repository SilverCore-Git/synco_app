import { cleanText } from '@/services/aiRuntime/plan/planLabels';
import type { Summarizer } from './summaryRegistry';

/** Le texte exact que verront les autres membres : rien n'est abrégé en dessous de la borne serveur (100). */
const shownText = (v: unknown): string => cleanText(v, 100) || 'message absent';

export const summaries: Record<string, Summarizer> = {
    set_my_status_message: a => {
        if (a.clear === true) return 'Effacer mon message de statut';
        const until = typeof a.until === 'string' && !Number.isNaN(Date.parse(a.until))
            ? `, jusqu’au ${new Date(a.until).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
            : '';
        return `Afficher à tous les membres de mes organisations le message de statut « ${shownText(a.message)} »${until}`;
    },
};
