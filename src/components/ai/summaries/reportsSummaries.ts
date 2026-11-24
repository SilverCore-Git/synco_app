import { cleanText } from '@/services/aiRuntime/plan/planLabels';
import type { Summarizer, SummaryContext } from './summaryRegistry';

/**
 * Résumés de confirmation du domaine Rapports et webhooks (L15h). Les rapports partent toujours à l'adresse du compte
 * de l'auteur ; un webhook est ENTRANT (un service externe y poste dans un salon) : ce qui décide est le droit de poster,
 * la signature et le chiffrement. L'URL d'entrée n'existe pas côté agent.
 */

const RHYTHMS: Record<string, string> = { HOURLY: 'toutes les heures', DAILY: 'chaque jour', WEEKLY: 'chaque semaine', MONTHLY: 'chaque mois' };
const PERMISSIONS: Record<string, string> = {
    send_messages: 'envoyer des messages', send_embeds: 'envoyer des encarts', send_attachments: 'envoyer des pièces jointes',
    manage_webhook: 'gérer le webhook', view_stats: 'voir les statistiques',
};
/**
 * Noms d'espace et de salon : l'annuaire local les connaît, mais `SummaryContext` (fichier commun) ne les expose pas encore.
 * Crochets optionnels, en attendant qu'il le fasse ; sans eux, jamais d'identifiant brut affiché.
 */
type NamedContext = SummaryContext & { spaceName?(id: string): string | null; threadName?(id: string): string | null };
const spaceLabel = (ctx: SummaryContext, id: unknown): string => {
    const n = typeof id === 'string' ? (ctx as NamedContext).spaceName?.(id) : null;
    return n ? `l’espace ${label(n)}` : 'un espace (nom indisponible)';
};
const threadLabel = (ctx: SummaryContext, id: unknown): string => {
    const n = typeof id === 'string' ? (ctx as NamedContext).threadName?.(id) : null;
    return n ? `le salon ${label(n)}` : 'un salon (nom indisponible)';
};
const label = (v: unknown, max = 60): string => `« ${cleanText(v, max) || 'sans nom'} »`;

function rhythmOf(a: Record<string, unknown>): string {
    return typeof a.rhythm === 'string' ? (RHYTHMS[a.rhythm] ?? 'rythme inconnu') : '';
}
function sectionCount(a: Record<string, unknown>): string {
    return Array.isArray(a.sections) ? `${a.sections.length} section${a.sections.length > 1 ? 's' : ''}` : '';
}
function permissionList(v: unknown): string {
    if (!Array.isArray(v)) return '';
    return v.map(p => (typeof p === 'string' ? (PERMISSIONS[p] ?? 'droit inconnu') : 'droit inconnu')).join(', ') || 'aucun droit';
}
function webhookOptions(a: Record<string, unknown>, ctx: SummaryContext, creating: boolean): string[] {
    const out: string[] = [];
    // Création : les droits par défaut (envoi de messages seulement) sont ceux du serveur.
    if (a.permissions !== undefined || creating) out.push(`droits : ${permissionList(a.permissions ?? ['send_messages'])}`);
    if (a.targetChannelId !== undefined) out.push(`ne publie que dans ${threadLabel(ctx, a.targetChannelId)}`);
    if (a.requireSignature === false) out.push('SIGNATURE DÉSACTIVÉE (n’importe qui connaissant l’URL peut poster)');
    else if (a.requireSignature === true || creating) out.push('signature exigée');
    if (a.e2eeEnabled !== undefined || creating) out.push(a.e2eeEnabled === true ? 'chiffrement de bout en bout activé' : 'chiffrement de bout en bout désactivé');
    return out;
}

export const summaries: Record<string, Summarizer> = {
    create_email_report: (a, ctx) => {
        const bits = [rhythmOf(a), a.spaceId ? spaceLabel(ctx, a.spaceId) : 'toute l’organisation', sectionCount(a)].filter(Boolean);
        return `Programmer le rapport e-mail ${label(a.name)} (${bits.join(', ')}), envoyé à l’adresse e-mail de mon compte`;
    },
    update_email_report: (a, ctx) => {
        const changes = Object.keys(a).filter(k => k !== 'reportId' && k !== 'rhythm' && k !== 'spaceId');
        const parts: string[] = [];
        if (a.rhythm !== undefined) parts.push(`nouveau rythme : ${rhythmOf(a) || 'inconnu'}`);
        if (a.spaceId !== undefined) parts.push(`nouvelle portée : ${a.spaceId === null ? 'toute l’organisation' : spaceLabel(ctx, a.spaceId)}`);
        if (changes.length) parts.push(`champs : ${changes.map(k => cleanText(k, 30)).join(', ')}`);
        if (Array.isArray(a.sections)) parts.push(`remplace toutes les sections (${sectionCount(a)})`);
        return `Modifier un rapport e-mail (${parts.join(' ; ') || 'aucun champ'}) ; envoi toujours à l’adresse de mon compte`;
    },
    send_test_email_report: () => 'M’envoyer maintenant un rapport par e-mail, à l’adresse de mon compte',
    delete_email_report: () => 'Supprimer définitivement un rapport e-mail',
    create_webhook: (a, ctx) =>
        `Créer le webhook entrant ${label(a.name)} dans ${spaceLabel(ctx, a.spaceId)} (un service externe pourra poster dans ${threadLabel(ctx, a.targetChannelId)}) ; ${webhookOptions(a, ctx, true).filter(o => !o.startsWith('ne publie')).join(' ; ')}`,
    update_webhook: (a, ctx) => {
        const opts = webhookOptions(a, ctx, false);
        if (a.name !== undefined) opts.unshift(`renommé ${label(a.name)}`);
        if (a.isActive !== undefined) opts.unshift(a.isActive === true ? 'réactivé' : 'désactivé');
        return `Modifier un webhook entrant : ${opts.join(' ; ') || 'aucun changement lisible'}`;
    },
    delete_webhook: () => 'Supprimer définitivement un webhook entrant (son URL d’entrée cessera de fonctionner)',
    test_webhook: () => 'Poster un message de test dans le salon du webhook (visible des membres du salon)',
};
