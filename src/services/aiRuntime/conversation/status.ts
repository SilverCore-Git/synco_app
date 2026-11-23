/** Libellés d'affichage des états de conversation et du lien (08 §7, 05 §7). Texte fixe, jamais celui du runtime. */
import type { LinkState } from './connection';
import type { ConversationStatus } from './events';

export const STATUS_LABEL: Record<string, string> = {
    queued: 'En attente',
    running: 'Synco AI travaille',
    awaiting_confirmation: 'Confirmation demandée',
    awaiting_user: 'Réponse attendue',
    awaiting_input: 'Réponse attendue',
    awaiting_upload: 'Fichier attendu',
    awaiting_key: 'Ouvrez Synco pour donner accès',
    idle: 'Terminé',
    failed: 'Échec',
    cancelled: 'Annulé',
};

export const statusLabel = (s: ConversationStatus): string => STATUS_LABEL[s] ?? 'État inconnu';

/** La conversation travaille : l'envoi d'un message est « mis en file » (affiché tel quel). */
export const isBusyStatus = (s: ConversationStatus): boolean => s === 'queued' || s === 'running';

/** Le prochain message ne partira pas tout de suite (le runtime travaille ou attend une décision). */
export const messageWillQueue = (s: ConversationStatus): boolean => isBusyStatus(s) || s === 'awaiting_confirmation';

export interface LinkBanner { tone: 'info' | 'warning' | 'error'; text: string; readOnly: boolean }

/** Bandeau de l'état du lien ; `null` quand tout va bien (D10 : hors ligne = lecture seule, message clair). */
export function linkBanner(link: LinkState): LinkBanner | null {
    switch (link) {
        case 'live': return null;
        case 'connecting': return { tone: 'info', text: 'Connexion au runtime…', readOnly: false };
        case 'resuming': return { tone: 'info', text: 'Reprise de la connexion au runtime…', readOnly: false };
        case 'offline': return { tone: 'warning', text: "Le runtime est injoignable. L'historique reste consultable ; il reprendra dès son retour.", readOnly: true };
        case 'refused': return { tone: 'error', text: "Le runtime a refusé la connexion : cette conversation n'est plus disponible en direct.", readOnly: true };
    }
}
