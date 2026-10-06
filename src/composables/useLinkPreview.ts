// Aperçu de lien à la Discord : extrait la première URL d'un message déchiffré
// (synco_api ne voit jamais le contenu en clair, cf. ThreadMessage/ChatMessage
// qui chiffrent côté client) et va chercher ses balises Open Graph en
// requêtant la page DIRECTEMENT depuis l'appareil — jamais via synco_api, qui
// ne doit apprendre aucun des liens partagés dans un message, même
// indirectement. Contreparties acceptées :
// - un site sans en-têtes CORS permissifs ne montrera pas d'aperçu (le fetch
//   échoue silencieusement plutôt que de bloquer l'affichage du message) ;
// - ce fetch part automatiquement, sans clic, dès l'affichage du message :
//   l'IP/la présence de l'utilisateur est donc révélée à qui contrôle le
//   domaine du lien (comme pour toute ressource auto-chargée), ce qu'aucun
//   garde-fou client ne peut éviter sans soit exiger un clic explicite, soit
//   repasser par un serveur — exactement ce qu'on a choisi de ne pas faire ici.
// isPrivateHostname.ts limite seulement la deuxième moitié du risque (sonder
// le réseau local/interne de l'utilisateur), pas la première.
// Aucun JavaScript de la page distante n'est exécuté : on ne lit que le
// texte brut de sa réponse HTTP.
import { ref } from 'vue';
import type { LinkPreviewData } from '@/types/linkPreview';
import { extractOpenGraphTags } from '@/assets/utils/openGraph';
import { isPrivateOrLocalHostname } from '@/assets/utils/isPrivateHostname';

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
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Un lien pasté est fetché automatiquement, sans clic, dès l'affichage du
  // message : sans ce garde-fou, un lien vers une IP privée/locale (réseau
  // de l'utilisateur, service interne non authentifié) serait requêté par son
  // propre navigateur à son insu (CSRF-like côté client, cf. isPrivateHostname.ts
  // pour la limite assumée face au DNS rebinding, indétectable depuis le JS
  // du navigateur).
  if (isPrivateOrLocalHostname(parsed.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      // Une redirection pourrait mener vers un hôte privé que le contrôle
      // ci-dessus n'a pas vu (l'URL pastée elle-même était publique) — on ne
      // la suit donc jamais plutôt que de la revalider (le mode 'manual' ne
      // donnerait qu'une réponse opaque, sans accès à l'en-tête Location pour
      // une cible cross-origin).
      redirect: 'error',
      referrerPolicy: 'no-referrer',
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
