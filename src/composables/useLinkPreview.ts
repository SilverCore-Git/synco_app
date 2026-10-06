// Aperçu de lien à la Discord : extrait la première URL d'un message déchiffré
// (synco_api ne voit jamais le contenu en clair, cf. ThreadMessage/ChatMessage
// qui chiffrent côté client — le fetch Open Graph ne peut donc se faire QUE
// depuis ici, une fois le message déchiffré) et récupère son aperçu via
// GET /api/link-preview. Cache mémoire partagé entre tous les messages affichés
// pour ne jamais refaire deux fois le même fetch pendant la session.
import { ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import type { LinkPreviewData } from '@/types/linkPreview';

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(URL_RE);
  if (!match) return null;
  // La regex avale souvent la ponctuation de fin de phrase ou une parenthèse
  // fermante qui n'appartient pas au lien.
  return match[0].replace(/[.,;:!?)\]]+$/, '');
}

const cache = new Map<string, LinkPreviewData | null>();
const pending = new Map<string, Promise<LinkPreviewData | null>>();

async function fetchPreview(url: string): Promise<LinkPreviewData | null> {
  try {
    const res = await sfetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
    const data = res.ok ? ((await res.json()) as LinkPreviewData) : null;
    cache.set(url, data);
    return data;
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
