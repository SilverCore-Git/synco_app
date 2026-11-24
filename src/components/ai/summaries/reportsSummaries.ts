import { cleanText } from '@/services/aiRuntime/plan/planLabels';
import type { Summarizer } from './summaryRegistry';

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
function webhookOptions(a: Record<string, unknown>): string[] {
    const out: string[] = [];
    if (a.permissions !== undefined) out.push(`droits : ${permissionList(a.permissions)}`);
    if (typeof a.targetChannelId === 'string') out.push('salon de destination modifié');
    if (a.requireSignature === false) out.push('SIGNATURE DÉSACTIVÉE (n’importe qui connaissant l’URL peut poster)');
    else if (a.requireSignature === true) out.push('signature exigée');
    if (a.e2eeEnabled !== undefined) out.push(a.e2eeEnabled === true ? 'chiffrement de bout en bout activé' : 'chiffrement de bout en bout désactivé');
    return out;
}

export const summaries: Record<string, Summarizer> = {
    create_email_report: a => {
        const bits = [rhythmOf(a), a.spaceId ? 'sur un espace' : 'sur toute l’organisation', sectionCount(a)].filter(Boolean);
        return `Programmer le rapport e-mail ${label(a.name)} (${bits.join(', ')}), envoyé à l’adresse e-mail de mon compte`;
    },
    update_email_report: a => {
        const changes = Object.keys(a).filter(k => k !== 'reportId');
        const what = changes.length ? changes.map(k => cleanText(k, 30)).join(', ') : 'aucun champ';
        return `Modifier un rapport e-mail (${what}${Array.isArray(a.sections) ? ` ; remplace toutes les sections, ${sectionCount(a)}` : ''}) ; envoi toujours à mon adresse`;
    },
    send_test_email_report: () => 'M’envoyer maintenant un rapport par e-mail, à l’adresse de mon compte',
    delete_email_report: () => 'Supprimer un rapport e-mail',
    create_webhook: a => {
        const opts = webhookOptions({ requireSignature: true, ...a });
        return `Créer le webhook entrant ${label(a.name)} dans un espace (un service externe pourra poster dans le salon cible) ; ${opts.join(' ; ')}`;
    },
    update_webhook: a => {
        const opts = webhookOptions(a);
        if (a.name !== undefined) opts.unshift(`renommé ${label(a.name)}`);
        if (a.isActive !== undefined) opts.unshift(a.isActive === true ? 'réactivé' : 'désactivé');
        return `Modifier un webhook entrant : ${opts.join(' ; ') || 'aucun changement lisible'}`;
    },
    delete_webhook: () => 'Supprimer un webhook entrant (son URL d’entrée cessera de fonctionner)',
    test_webhook: () => 'Poster un message de test dans le salon du webhook (visible des membres du salon)',
};
