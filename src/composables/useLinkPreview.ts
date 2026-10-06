// Aperçu de lien à la Discord : extrait la première URL d'un message déchiffré
// (synco_api ne voit jamais le contenu en clair, cf. ThreadMessage/ChatMessage
// qui chiffrent côté client) et va chercher ses balises Open Graph en
// requêtant la page DIRECTEMENT depuis l'appareil — jamais via synco_api, qui
// ne doit apprendre aucun des liens partagés dans un message, même
// indirectement. Contrepartie acceptée : un site qui ne renvoie pas
// d'en-têtes CORS permissifs ne montrera pas d'aperçu (cf. extractFirstUrl —
// c'est pour ça que le fetch échoue silencieusement plutôt que de bloquer
// l'affichage du message). Aucun JavaScript de la page distante n'est
// exécuté : on ne lit que le texte brut de sa réponse HTTP.
import { ref } from 'vue';
import type { LinkPreviewData } from '@/types/linkPreview';
import { extractOpenGraphTags } from '@/assets/utils/openGraph';

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(URL_RE);
  if (!match) return null;
  // La regex avale souvent la ponctuation de fin de phrase ou une parenthèse
  // fermante qui n'appartient pas au lien.
  return match[0].replace(/[.,;:!?)\]]+$/, '');
}

const FETCH_TIMEOUT_MS = 8_000;
// Les balises OG sont en tête de document : pas besoin de lire la page
// entière, et ça borne la mémoire/bande passante consommées pour une page
// volontairement énorme.
const MAX_BYTES = 512 * 1024;

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'follow',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    // Un site sans en-tête CORS permissif atterrit ici en échec (opaque ou
    // rejeté par le navigateur) — comportement attendu, pas une erreur à logger.
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return null;

    if (!res.body) {
      return { html: (await res.text()).slice(0, MAX_BYTES), finalUrl: res.url || url };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (total >= MAX_BYTES) {
        reader.cancel();
        break;
      }
    }
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const cache = new Map<string, LinkPreviewData | null>();
const pending = new Map<string, Promise<LinkPreviewData | null>>();

async function fetchPreview(url: string): Promise<LinkPreviewData | null> {
  try {
    const fetched = await fetchHtml(url);
    if (!fetched) {
      cache.set(url, null);
      return null;
    }
    const data = extractOpenGraphTags(fetched.html, fetched.finalUrl);
    const hasContent = !!(data.title || data.description || data.image);
    const result = hasContent ? data : null;
    cache.set(url, result);
    return result;
  } catch {
    cache.set(url, null);
    return null;
  } finally {
    pending.delete(url);
  }
}

export function useLinkPreview() {
  const preview = ref<LinkPreviewData | null>(null);
  const loading = ref(false);

  async function load(url: string): Promise<void> {
    if (cache.has(url)) {
      preview.value = cache.get(url) ?? null;
      return;
    }
    if (!pending.has(url)) {
      pending.set(url, fetchPreview(url));
    }
    loading.value = true;
    try {
      preview.value = await pending.get(url)!;
    } finally {
      loading.value = false;
    }
  }

  return { preview, loading, load };
}
