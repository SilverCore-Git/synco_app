import type { OrgMember } from '@/types/types';

export type ReferenceKind = 'user' | 'thread' | 'task' | 'file';

export interface TriggerConfig {
  kind: ReferenceKind;
  // Préfixe du token stocké : <@:id> et <#:id> gardent le symbole du trigger,
  // <task:id>/<file:id> utilisent un mot car ! et & n'ont pas de sens une
  // fois sortis du contexte de saisie.
  tokenPrefix: string;
  label: string;
  icon: string;
}

// @ reste réservé aux personnes. # -> salon (Thread en DB). ! -> tâche
// (évoque une action). & -> fichier (touche non-shiftée en AZERTY, libre de
// toute convention). / est réservé aux futures commandes slash, jamais un
// trigger de référence.
export const TRIGGERS: Record<string, TriggerConfig> = {
  '@': { kind: 'user', tokenPrefix: '@', label: 'Membres', icon: 'bi-person-fill' },
  '#': { kind: 'thread', tokenPrefix: '#', label: 'Salons', icon: 'bi-hash' },
  '!': { kind: 'task', tokenPrefix: 'task', label: 'Tâches', icon: 'bi-check2-square' },
  '&': { kind: 'file', tokenPrefix: 'file', label: 'Fichiers', icon: 'bi-file-earmark-fill' },
};

const PREFIX_TO_KIND: Record<string, ReferenceKind> = {};
for (const t of Object.values(TRIGGERS)) PREFIX_TO_KIND[t.tokenPrefix] = t.kind;

// Charset partagé avec l'ancien MENTION_CHAR_CLASS (useMentions.ts) — lettres/
// chiffres unicode + quelques signes usuels dans un nom.
const QUERY_CHAR_CLASS = "\\p{L}\\p{N}_.'’-";

// Détecte un trigger "en cours de frappe" juste avant le curseur, ex. "voir #gen" -> ['#', 'gen'].
export const TRIGGER_QUERY_REGEX = new RegExp(`(?:^|\\s)([@#!&])([${QUERY_CHAR_CLASS}]*)$`, 'u');

// Matches <@:id> / <#:id> / <task:id> / <file:id>.
export const REFERENCE_TOKEN_REGEX = /<(@|#|task|file):([a-zA-Z0-9_-]+)>/g;

export interface ExtractedReference {
  type: ReferenceKind;
  id: string;
}

export const extractReferenceTokens = (content: string | undefined | null): ExtractedReference[] => {
  if (!content) return [];

  const seen = new Set<string>();
  const refs: ExtractedReference[] = [];

  for (const match of content.matchAll(REFERENCE_TOKEN_REGEX)) {
    const prefix = match[1];
    const id = match[2];
    const kind = prefix ? PREFIX_TO_KIND[prefix] : undefined;
    if (!kind || !id) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ type: kind, id });
  }

  return refs;
};

export const buildReferenceToken = (kind: ReferenceKind, id: string): string => {
  const config = Object.values(TRIGGERS).find(t => t.kind === kind)!;
  return `<${config.tokenPrefix}:${id}>`;
};

export interface ResolvedReference {
  label: string;
  ok: boolean;
  spaceId?: string | null;
}

export type ResolveBatchFn = (items: ExtractedReference[]) => Promise<Map<string, ResolvedReference>>;

// Cache mémoire partagé pour la session (pas de persistance) — évite de
// re-résoudre le même chip à chaque re-render d'un message déjà affiché.
const resolveCache = new Map<string, ResolvedReference>();

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const chipHtml = (kind: ReferenceKind, id: string, label: string, ok: boolean, spaceId?: string | null): string => {
  const config = Object.values(TRIGGERS).find(t => t.kind === kind)!;
  const prefixChar = kind === 'user' ? '@' : kind === 'thread' ? '#' : '';
  const cls = ok ? 'reference-chip' : 'reference-chip reference-chip--restricted';
  const spaceAttr = spaceId ? ` data-ref-space="${escapeHtml(spaceId)}"` : '';
  return `<span class="${cls}" data-ref-kind="${kind}" data-ref-id="${id}"${spaceAttr}><i class="bi ${config.icon}"></i>${prefixChar}${escapeHtml(label)}</span>`;
};

/**
 * Parcourt les noeuds texte sous `root` et remplace les tokens <kind:id> par
 * un chip. Deux passes : (1) synchrone avec le label déjà en cache ou un
 * placeholder neutre, (2) résolution batchée (un seul appel réseau pour tous
 * les tokens non résolus de ce rendu) qui vient ensuite patcher chaque chip.
 */
export const renderReferences = async (root: HTMLElement, resolveBatch: ResolveBatchFn): Promise<void> => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.parentElement?.closest('.reference-chip, .mention-tag')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  const nodesToReplace: { oldNode: ChildNode; newNode: HTMLElement }[] = [];
  const pending: ExtractedReference[] = [];

  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (!text.includes('<')) continue;

    let hasMatch = false;
    const html = escapeHtml(text).replace(REFERENCE_TOKEN_REGEX, (full, prefix: string, id: string) => {
      const kind = PREFIX_TO_KIND[prefix];
      if (!kind) return full;
      hasMatch = true;
      const cached = resolveCache.get(`${kind}:${id}`);
      if (!cached) pending.push({ type: kind, id });
      return chipHtml(kind, id, cached?.label ?? '…', cached?.ok ?? true, cached?.spaceId);
    });

    if (hasMatch) {
      const span = document.createElement('span');
      span.innerHTML = html;
      nodesToReplace.push({ oldNode: node as ChildNode, newNode: span });
    }
  }

  nodesToReplace.forEach(({ oldNode, newNode }) => {
    oldNode.parentNode?.replaceChild(newNode, oldNode);
  });

  if (pending.length === 0) return;

  const resolved = await resolveBatch(pending);
  resolved.forEach((value, key) => resolveCache.set(key, value));

  root.querySelectorAll<HTMLElement>('.reference-chip').forEach((chip) => {
    const kind = chip.dataset.refKind as ReferenceKind | undefined;
    const id = chip.dataset.refId;
    if (!kind || !id) return;
    const result = resolved.get(`${kind}:${id}`);
    if (!result) return;
    chip.outerHTML = chipHtml(kind, id, result.label, result.ok, result.spaceId);
  });
};

/** Résolution synchrone, sans réseau, pour les mentions @user via la liste des membres déjà chargée (chemin rapide, comme l'ancien renderMentions). */
export const buildLocalUserResolutions = (members: OrgMember[] | undefined): Map<string, ResolvedReference> => {
  const map = new Map<string, ResolvedReference>();
  for (const m of members || []) {
    if (!m.user) continue;
    map.set(`user:${m.user.id}`, { label: m.user.name || m.user.pseudo || m.user.id, ok: true });
  }
  return map;
};

/** Pré-remplit le cache de résolution (ex. avec buildLocalUserResolutions) pour éviter un aller-retour réseau évitable dans renderReferences. */
export const seedResolveCache = (entries: Map<string, ResolvedReference>): void => {
  entries.forEach((value, key) => resolveCache.set(key, value));
};

export const handleReferenceChipClick = (event: MouseEvent): { kind: ReferenceKind; id: string; spaceId?: string } | null => {
  const el = (event.target as HTMLElement)?.closest?.('.reference-chip') as HTMLElement | null;
  if (!el) return null;
  const kind = el.dataset.refKind as ReferenceKind | undefined;
  const id = el.dataset.refId;
  if (!kind || !id) return null;
  return { kind, id, spaceId: el.dataset.refSpace || undefined };
};
