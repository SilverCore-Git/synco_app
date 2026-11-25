import { cleanText } from '@/services/aiRuntime/plan/planLabels';
import type { Summarizer } from './summaryRegistry';
import { supportPreview } from './supportPreview';

/**
 * Résumés des cartes de confirmation du domaine Support, côté demandeur (L15j). Le destinataire n'est PAS dans
 * l'organisation : c'est l'équipe de Synco. Le résumé ne porte que le destinataire : le sujet et le texte INTÉGRAUX
 * (jusqu'à 8000 caractères, blancs inclus) sont affichés par la carte dans un bloc défilant (`supportPreview`), car le
 * nettoyage des résumés (blancs réduits, plafond) ne doit pas altérer ce qui part hors de l'organisation.
 */
const ref = (v: unknown): string => (typeof v === 'string' ? cleanText(v, 64) : 'inconnu');

export const summaries: Record<string, Summarizer> = {
    create_support_ticket: a => `${supportPreview('create_support_ticket', a)!.recipient} Texte complet ci-dessous.`,
    reply_support_ticket: a => `${supportPreview('reply_support_ticket', a)!.recipient} Texte complet ci-dessous.`,
    close_support_ticket: a => `Fermer votre demande au support (identifiant ${ref(a.ticketId)}) ; vous pourrez la rouvrir`,
    reopen_support_ticket: a => `Rouvrir votre demande au support (identifiant ${ref(a.ticketId)})`,
};
