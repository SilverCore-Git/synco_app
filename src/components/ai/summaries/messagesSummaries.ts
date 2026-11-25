import { cleanText } from '@/services/aiRuntime/plan/planLabels';
import type { Summarizer, SummaryContext } from './summaryRegistry';

/**
 * Résumés des cartes de confirmation du domaine Messages (L15f). L'argument décisif doit se lire : texte exact qui
 * partira au nom de l'utilisateur (avec la mention « avec Synco AI »), destinataire d'un MP, ce qui sera supprimé.
 * Le contenu d'un message à supprimer est chiffré : seul son identifiant est connu ici.
 */
const member = (ctx: SummaryContext, id: unknown): string =>
    (typeof id === 'string' ? ctx.userName(id) : null) ?? 'membre inconnu de l’organisation';
const text = (v: unknown): string => `« ${cleanText(v, 600) || '(vide)'} »`;
const count = (v: unknown, one: string, many: string): string => {
    const n = Array.isArray(v) ? v.length : 0;
    return n === 0 ? '' : ` ${n} ${n > 1 ? many : one}`;
};
const mentions = (ctx: SummaryContext, v: unknown): string => {
    if (!Array.isArray(v) || v.length === 0) return '';
    const names = v.slice(0, 5).map(id => member(ctx, id));
    return `, en mentionnant ${names.join(', ')}${v.length > 5 ? ` et ${v.length - 5} autres` : ''}`;
};
const msgRef = (v: unknown): string => (typeof v === 'string' ? cleanText(v, 64) : 'inconnu');

export const summaries: Record<string, Summarizer> = {
    send_message: (a, ctx) => `Écrire en votre nom (avec Synco AI) : ${text(a.text)}${mentions(ctx, a.mentionUserIds)}${a.fileIds ? `, avec${count(a.fileIds, 'pièce jointe', 'pièces jointes')}` : ''}${a.replyTo ? ', en réponse à un message' : ''}`,
    edit_message: a => `Remplacer le texte d’un de vos messages par : ${text(a.text)}`,
    forward_message: a => `Transférer un message vers un autre salon${a.comment ? `, avec le commentaire ${text(a.comment)}` : ''}`,
    delete_message: a => `Supprimer définitivement un message de salon (identifiant ${msgRef(a.messageId)}), irréversible`,
    send_dm: (a, ctx) => `Envoyer en votre nom à ${member(ctx, a.peerId)} (message privé, avec Synco AI) : ${text(a.text)}${a.fileIds ? `, avec${count(a.fileIds, 'pièce jointe', 'pièces jointes')}` : ''}`,
    edit_dm: a => `Remplacer le texte d’un de vos messages privés par : ${text(a.text)}`,
    delete_dm: a => `Supprimer définitivement un de vos messages privés (identifiant ${msgRef(a.dmMessageId)}), irréversible`,
    add_reaction: a => `Réagir ${cleanText(a.emoji, 16)} à un ${a.target === 'dm' ? 'message privé' : 'message'}`,
    remove_reaction: a => `Retirer votre réaction ${cleanText(a.emoji, 16)}`,
};
