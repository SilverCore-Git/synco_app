import type { Summarizer } from './summaryRegistry';

/**
 * Résumés de confirmation du domaine Web (L15-web ; 10 §4.4 ; PC93, PC96). `web_search` et `web_fetch` partent
 * sans confirmation, sauf deux cas où le worker du runtime demande l'accord de l'utilisateur :
 * - une requête (ou le chemin d'une URL) qui semble contenir une information de Synco (passage d'un texte chiffré,
 *   adresse e-mail, numéro, identifiant, nom d'un membre) ;
 * - une URL qui ne vient ni d'une recherche de cette conversation ni de l'utilisateur.
 * La carte montre donc le texte EXACT qui partirait : la requête entière, l'adresse complète. Jamais réécrit,
 * jamais tronqué (requête ≤ 200 caractères, URL ≤ 2 000, sous le plafond du registre) ; un caractère invisible
 * (contrôle, marque bidi, espace sans chasse) est signalé, car le registre le retire de l'affichage alors qu'il
 * partirait tel quel. Texte seulement : aucun lien cliquable.
 */

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/;
const FRESHNESS: Record<string, string> = { day: 'du dernier jour', week: 'de la dernière semaine', month: 'du dernier mois', year: 'de la dernière année' };

const invisibleNote = (v: string): string => (INVISIBLE.test(v) ? ' (ATTENTION : contient des caractères invisibles, non affichés ici)' : '');

/**
 * Adresse affichée : forme analysée (WHATWG), hôte en punycode pour déjouer les homographes (`xn--…` visible),
 * puis l'hôte seul en clair à part. Une adresse illisible est montrée nettoyée, signalée comme telle.
 */
export function describeWebUrl(raw: unknown): string {
    if (typeof raw !== 'string' || raw === '') return 'adresse absente';
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return `adresse illisible : ${raw}${invisibleNote(raw)}`;
    }
    const flags: string[] = [];
    if (u.protocol !== 'https:' && u.protocol !== 'http:') flags.push('schéma refusé par le runtime');
    if (u.username || u.password) flags.push('contient des identifiants, refusée par le runtime');
    if (u.protocol === 'http:') flags.push('non chiffrée (http)');
    const extra = flags.length ? ` (${flags.join(' ; ')})` : '';
    return `${u.href}${invisibleNote(raw)} — site : ${u.hostname}${extra}`;
}

export const summaries: Record<string, Summarizer> = {
    web_search: (a) => {
        const q = typeof a.query === 'string' ? a.query : '';
        const opts: string[] = [];
        if (typeof a.lang === 'string') opts.push(`langue : ${a.lang.slice(0, 2)}`);
        if (typeof a.freshness === 'string' && FRESHNESS[a.freshness]) opts.push(`résultats ${FRESHNESS[a.freshness]}`);
        return `Envoyer cette recherche, mot pour mot, au service de recherche de l’organisation : « ${q || 'requête vide'} »${invisibleNote(q)}${opts.length ? ` (${opts.join(', ')})` : ''}`;
    },
    web_fetch: (a) => `Lire la page à cette adresse complète : ${describeWebUrl(a.url)}`,
};
