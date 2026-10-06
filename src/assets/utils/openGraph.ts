// Extraction des balises Open Graph / Twitter Card par expression régulière,
// sur le HTML brut d'une page récupérée par le navigateur lui-même (aucune
// requête ne part jamais de synco_api — cf. useLinkPreview.ts, qui tourne
// sur le texte déjà déchiffré du message). Aucun JavaScript de la page
// distante n'est exécuté : on ne fait que lire le texte de sa réponse HTTP.
import type { LinkPreviewData } from '@/types/linkPreview';

const META_TAG_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const TITLE_TAG_RE = /<title\b[^>]*>([^<]*)<\/title>/i;

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

function parseAttrs(tag: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    let m: RegExpExecArray | null;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(tag))) {
        attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? '');
    }
    return attrs;
}

function resolveUrl(value: string | undefined, baseUrl: string): string | null {
    if (!value) return null;
    try {
        const resolved = new URL(value, baseUrl);
        return resolved.protocol === 'https:' || resolved.protocol === 'http:' ? resolved.href : null;
    } catch {
        return null;
    }
}

export function extractOpenGraphTags(html: string, baseUrl: string): LinkPreviewData {
    const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    const scope = headMatch ? headMatch[1] : html;

    const tags: Record<string, string> = {};
    const matches = scope.match(META_TAG_RE) || [];
    for (const tag of matches) {
        const attrs = parseAttrs(tag);
        const key = (attrs.property || attrs.name || '').toLowerCase();
        if (!key || attrs.content === undefined) continue;
        if (!(key in tags)) tags[key] = attrs.content;
    }

    const titleMatch = scope.match(TITLE_TAG_RE);
    const fallbackTitle = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;

    const image = resolveUrl(tags['og:image:secure_url'] || tags['og:image'] || tags['twitter:image'], baseUrl);
    const canonicalUrl = resolveUrl(tags['og:url'], baseUrl) || baseUrl;

    return {
        url: canonicalUrl,
        title: tags['og:title'] || tags['twitter:title'] || fallbackTitle || null,
        description: tags['og:description'] || tags['twitter:description'] || tags['description'] || null,
        image,
        siteName: tags['og:site_name'] || null,
    };
}
