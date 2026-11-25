/**
 * Modèle d'affichage des résultats du domaine Web (L15-web) : `web_search`, `web_fetch`. Pur et testable :
 * `WebResult.vue` ne fait que le rendre. Tout vient d'internet (titres, extraits, texte des pages, adresses) :
 * texte brut nettoyé, jamais de HTML, et AUCUNE adresse rendue cliquable (une page piégée choisit ses liens ;
 * l'utilisateur peut sélectionner l'adresse et la copier s'il le veut).
 */
import { cleanText } from '@/services/aiRuntime/plan/planLabels';

export interface WebRow { key: string; title: string; host: string; address: string; snippet: string; age: string }

export type WebResultView =
    | { kind: 'search'; query: string; rows: WebRow[] }
    | { kind: 'page'; title: string; host: string; address: string; type: string; excerpt: string; text: string; chars: number; truncated: boolean }
    | { kind: 'message'; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const ROWS_MAX = 10;
const EXCERPT_MAX = 400;
/** Texte d'une page montré au plus (le modèle peut en avoir reçu 100 000 caractères). */
const TEXT_VIEW_MAX = 20_000;
const ADDRESS_MAX = 160;

const TYPES: Record<string, string> = {
    'text/html': 'Page HTML', 'text/plain': 'Texte', 'text/markdown': 'Markdown', 'application/json': 'JSON', 'application/xml': 'XML',
};

/** Hôte et adresse lisibles (hôte en punycode : un homographe se voit) ; `null` si l'adresse n'est pas http(s). */
export function webAddress(raw: unknown): { host: string; address: string } | null {
    if (typeof raw !== 'string') return null;
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return null;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return { host: u.hostname, address: cleanText(`${u.host}${u.pathname === '/' ? '' : u.pathname}${u.search}`, ADDRESS_MAX) };
}

/** Texte multiligne d'une page : contrôles et marques bidi retirés ligne par ligne, lignes vides compactées. */
export function pageText(raw: unknown, max = TEXT_VIEW_MAX): string {
    if (typeof raw !== 'string') return '';
    const lines = raw.split(/\r?\n/).map(l => cleanText(l, max));
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function searchView(r: Record<string, unknown>): WebResultView {
    const rows: WebRow[] = [];
    const list = Array.isArray(r.results) ? r.results : [];
    for (const raw of list.slice(0, ROWS_MAX)) {
        if (!isRecord(raw)) continue;
        const a = webAddress(raw.url);
        if (!a) continue;
        rows.push({
            key: `${rows.length}:${a.address}`,
            title: cleanText(raw.title, 200) || a.host,
            host: a.host,
            address: a.address,
            snippet: cleanText(raw.snippet, 500),
            age: cleanText(raw.age, 40),
        });
    }
    const query = cleanText(r.query, 200);
    if (!rows.length) return { kind: 'message', text: query ? `Aucun résultat pour « ${query} ».` : 'Aucun résultat.' };
    return { kind: 'search', query, rows };
}

function pageView(r: Record<string, unknown>): WebResultView {
    const a = webAddress(r.url);
    if (!a) return { kind: 'message', text: 'Page lue, adresse illisible.' };
    const text = pageText(r.text);
    const type = typeof r.contentType === 'string' ? (TYPES[r.contentType] ?? 'Texte') : 'Texte';
    return {
        kind: 'page',
        title: cleanText(r.title, 200) || a.host,
        host: a.host,
        address: a.address,
        type,
        excerpt: cleanText(text, EXCERPT_MAX),
        text,
        chars: typeof r.text === 'string' ? [...r.text].length : 0,
        truncated: r.truncated === true,
    };
}

export function buildWebView(name: string, result: unknown): WebResultView {
    if (!isRecord(result)) return { kind: 'message', text: 'Résultat illisible.' };
    if (name === 'web_search') return searchView(result);
    if (name === 'web_fetch') return pageView(result);
    return { kind: 'message', text: 'Résultat illisible.' };
}
