import { cleanText } from '@/services/aiRuntime/plan/planLabels';
import type { Summarizer } from './summaryRegistry';

/**
 * Résumés des cartes de confirmation du domaine Support, côté demandeur (L15j). Le destinataire n'est PAS dans
 * l'organisation : c'est l'équipe de Synco, qui lira le texte exact. Il doit se lire en toutes lettres, avec le sujet
 * et le texte tels qu'ils partiront (plafonnés à l'affichage, longueur totale annoncée si coupé).
 */
const TEAM = 'l’équipe de Synco (hors de votre organisation)';
const SHOWN = 1500;

const exact = (v: unknown): string => {
    const s = typeof v === 'string' ? v : '';
    const shown = cleanText(s, SHOWN);
    const total = Array.from(s).length;
    return `« ${shown || '(vide)'} »${total > SHOWN ? ` (affichage coupé : ${total} caractères au total)` : ''}`;
};
const ref = (v: unknown): string => (typeof v === 'string' ? cleanText(v, 64) : 'inconnu');

export const summaries: Record<string, Summarizer> = {
    create_support_ticket: a => `Ouvrir une demande auprès de ${TEAM}, en votre nom. Sujet : ${exact(a.subject)}. Texte : ${exact(a.text)}`,
    reply_support_ticket: a => `Répondre à ${TEAM}, en votre nom, dans votre demande (identifiant ${ref(a.ticketId)}) : ${exact(a.text)}`,
    close_support_ticket: a => `Fermer votre demande au support (identifiant ${ref(a.ticketId)}) ; vous pourrez la rouvrir`,
    reopen_support_ticket: a => `Rouvrir votre demande au support (identifiant ${ref(a.ticketId)})`,
};
