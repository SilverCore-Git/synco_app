/**
 * Texte INTÉGRAL d'un envoi au support, pour les cartes de confirmation (L15j) : sujet et texte tels qu'ils partiront,
 * sans coupe ni réduction des blancs (le rendu les affiche en `whitespace-pre-wrap`, dans un bloc défilant). Le
 * destinataire est l'équipe de Synco, hors de l'organisation. Pur et testé ; texte seulement (jamais de HTML).
 * `name` : le nom de l'outil (`create_support_ticket`) ou du kind (`support.create`).
 */
import { hasHiddenChars } from '@/services/aiRuntime/supportText';
import { cleanText } from '@/services/aiRuntime/plan/planLabels';

export interface SupportPreview {
    recipient: string;
    parts: Array<{ label: string; text: string }>;
    /** Texte refusé à l'envoi (caractère invisible ou de contrôle) : signalé avant l'accord. */
    warning: string | null;
}

const TEAM = 'l’équipe de Synco, hors de votre organisation';
const WARNING = 'Ce texte contient des caractères invisibles ou de contrôle : il sera refusé à l’envoi.';

/** `$m.id` d'un `argsRefs` : numéro de l'étape qui crée la demande. */
const stepOf = (v: unknown): number | null => {
    const m = typeof v === 'string' ? /^\$(\d+)\.id$/.exec(v) : null;
    return m ? Number(m[1]) : null;
};

export function supportPreview(name: string, args: Record<string, unknown>, argsRefs?: Record<string, unknown>): SupportPreview | null {
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    if (name === 'create_support_ticket' || name === 'support.create') {
        const subject = str(args.subject), text = str(args.text);
        return {
            recipient: `Ouvrir une demande auprès de ${TEAM}, en votre nom.`,
            parts: [{ label: 'Sujet', text: subject }, { label: 'Texte', text }],
            warning: hasHiddenChars(subject) || hasHiddenChars(text) ? WARNING : null,
        };
    }
    if (name === 'reply_support_ticket' || name === 'support.reply') {
        const text = str(args.text);
        const step = stepOf(argsRefs?.ticketId);
        const where = step !== null ? `la demande créée à l’étape ${step}` : `votre demande (identifiant ${cleanText(args.ticketId, 64) || 'inconnu'})`;
        return {
            recipient: `Répondre à ${TEAM}, en votre nom, dans ${where}.`,
            parts: [{ label: 'Texte', text }],
            warning: hasHiddenChars(text) ? WARNING : null,
        };
    }
    return null;
}
