/**
 * Modèle d'affichage des résultats d'outils du domaine Rapports et webhooks (L15h). Pur et testable :
 * `ReportsResult.vue` ne fait que le rendre. Noms, titres et textes viennent d'autres membres : jamais en HTML.
 * Aucun secret de webhook n'arrive ici (le serveur ne l'envoie pas) ; on n'affiche de toute façon jamais d'URL d'entrée.
 */

export interface ResultCard { id: string; icon: string; title: string; subtitle?: string }
export interface StatRow { label: string; value: string }

export type ReportsResultView =
    | { kind: 'cards'; cards: ResultCard[]; truncated?: boolean }
    | { kind: 'stats'; rows: StatRow[] }
    | { kind: 'preview'; subject: string; text: string; truncated: boolean }
    | { kind: 'message'; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

const RHYTHMS: Record<string, string> = { HOURLY: 'Toutes les heures', DAILY: 'Chaque jour', WEEKLY: 'Chaque semaine', MONTHLY: 'Chaque mois' };

function dateLabel(v: unknown): string | undefined {
    const s = str(v);
    if (!s) return undefined;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function reportCard(r: unknown): ResultCard | null {
    if (!isRecord(r)) return null;
    const id = str(r.id);
    if (!id) return null;
    const parts: string[] = [];
    const rhythm = str(r.rhythm);
    if (rhythm) parts.push(RHYTHMS[rhythm] ?? 'Rythme inconnu');
    const space = isRecord(r.space) ? str(r.space.name) : undefined;
    parts.push(space ?? 'Toute l’organisation');
    if (r.enabled === false) parts.push('suspendu');
    else {
        const next = dateLabel(r.nextRunAt);
        if (next) parts.push(`prochain envoi ${next}`);
    }
    return { id, icon: r.enabled === false ? 'bi-pause-circle' : 'bi-envelope-paper', title: str(r.name) ?? 'Sans nom', subtitle: parts.join(' · ') };
}

function webhookCard(w: unknown): ResultCard | null {
    if (!isRecord(w)) return null;
    const id = str(w.id);
    if (!id) return null;
    const parts: string[] = [w.isActive === false ? 'désactivé' : 'actif'];
    if (w.requireSignature === false) parts.push('sans signature');
    if (w.isRateLimited === true) parts.push('limité en débit');
    const used = num(w.usageCount);
    if (used !== undefined) parts.push(plural(used, 'appel', 'appels'));
    return { id, icon: 'bi-plug', title: str(w.name) ?? 'Sans nom', subtitle: parts.join(' · ') };
}

const MESSAGES: Record<string, string> = {
    delete_email_report: 'Rapport supprimé.',
    delete_webhook: 'Webhook supprimé : son URL d’entrée ne fonctionne plus.',
    test_webhook: 'Message de test posté dans le salon du webhook.',
    send_test_email_report: 'Rapport de test envoyé à l’adresse du compte.',
};

export function buildReportsView(toolName: string, result: unknown): ReportsResultView {
    if (toolName === 'list_email_reports') {
        const cards = (Array.isArray(result) ? result : []).flatMap(r => { const c = reportCard(r); return c ? [c] : []; });
        return cards.length ? { kind: 'cards', cards } : { kind: 'message', text: 'Aucun rapport e-mail.' };
    }
    if (toolName === 'get_email_report' || toolName === 'update_email_report') {
        const c = reportCard(result);
        if (!c) return { kind: 'message', text: 'Rapport introuvable.' };
        const sections = isRecord(result) && Array.isArray(result.sections) ? result.sections.length : 0;
        return { kind: 'cards', cards: [{ ...c, subtitle: `${c.subtitle ?? ''} · ${plural(sections, 'section', 'sections')}` }] };
    }
    if (toolName === 'set_email_report_enabled') {
        const enabled = isRecord(result) ? result.enabled : undefined;
        return { kind: 'message', text: enabled === true ? 'Rapport repris.' : enabled === false ? 'Rapport suspendu.' : 'Terminé.' };
    }
    if (toolName === 'preview_email_report') {
        if (!isRecord(result)) return { kind: 'message', text: 'Aperçu indisponible.' };
        return { kind: 'preview', subject: str(result.subject) ?? 'Sans objet', text: str(result.text) ?? '', truncated: result.truncated === true };
    }
    if (toolName === 'list_webhooks') {
        const list = isRecord(result) && Array.isArray(result.webhooks) ? result.webhooks : [];
        const cards = list.flatMap(w => { const c = webhookCard(w); return c ? [c] : []; });
        if (!cards.length) return { kind: 'message', text: 'Aucun webhook.' };
        return { kind: 'cards', cards, truncated: isRecord(result) && result.truncated === true };
    }
    if (toolName === 'get_webhook') {
        const wh = isRecord(result) ? webhookCard(result.webhook) : null;
        if (!wh) return { kind: 'message', text: 'Webhook introuvable.' };
        const stats = isRecord(result) && isRecord(result.stats) ? result.stats : null;
        const calls = stats ? num(stats.totalCalls) : undefined;
        if (!stats || calls === undefined) return { kind: 'cards', cards: [wh] };
        return { kind: 'cards', cards: [{ ...wh, subtitle: `${wh.subtitle ?? ''} · ${plural(num(stats.successCount) ?? 0, 'succès', 'succès')}, ${plural(num(stats.errorCount) ?? 0, 'erreur', 'erreurs')}` }] };
    }
    if (toolName === 'create_webhook' || toolName === 'update_webhook') {
        const wh = isRecord(result) ? webhookCard(result.webhook) : null;
        return wh ? { kind: 'cards', cards: [wh] } : { kind: 'message', text: 'Terminé.' };
    }
    return { kind: 'message', text: MESSAGES[toolName] ?? 'Terminé.' };
}
