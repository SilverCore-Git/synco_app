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

// `marked` (CommonMark) reconnaît `<scheme:...>` comme un "autolink" dès que
// le scheme fait ≥2 caractères et commence par une lettre — c'est le cas de
// "task"/"file" (pas de "@"/"#", premier caractère invalide pour un scheme).
// Sans ce pré-échappement, <task:id>/<file:id> partent en
// <a href="task:id">...</a> avant même d'atteindre renderReferences, qui ne
// voit alors plus de `<`/`>` littéraux à matcher dans les noeuds texte — la
// carte ne s'affiche jamais, le lien brut reste visible. `&lt;`/`&gt;` dans
// le markdown source ressortent en `<`/`>` réels une fois le HTML injecté
// dans le DOM (v-html), donc renderReferences les retrouve normalement.
export const escapeReferenceTokensForMarkdown = (content: string): string =>
  content.replace(REFERENCE_TOKEN_REGEX, (full, prefix: string, id: string) =>
    (prefix === 'task' || prefix === 'file') ? `&lt;${prefix}:${id}&gt;` : full
  );

export const buildReferenceToken = (kind: ReferenceKind, id: string): string => {
  const config = Object.values(TRIGGERS).find(t => t.kind === kind)!;
  return `<${config.tokenPrefix}:${id}>`;
};

export interface ResolvedReference {
  label: string;
  ok: boolean;
  spaceId?: string | null;
  // task uniquement
  status?: string;
  dueDate?: string | null;
  // file uniquement
  mimeType?: string;
  size?: number;
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

const TASK_STATUS_LABEL: Record<string, string> = { TODO: 'À faire', IN_PROGRESS: 'En cours', DONE: 'Terminé' };
const TASK_STATUS_COLOR: Record<string, string> = { TODO: '#8b8b96', IN_PROGRESS: '#eab308', DONE: '#22c55e' };

const formatDueDate = (dueDate?: string | null): string => {
  if (!dueDate) return '';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const formatFileSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
};

const fileIconFor = (mimeType?: string): string => {
  if (!mimeType) return 'bi-file-earmark-fill';
  if (mimeType.startsWith('image/')) return 'bi-file-earmark-image-fill';
  if (mimeType.startsWith('video/')) return 'bi-file-earmark-play-fill';
  if (mimeType.startsWith('audio/')) return 'bi-file-earmark-music-fill';
  if (mimeType === 'application/pdf') return 'bi-file-earmark-pdf-fill';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'bi-file-earmark-zip-fill';
  if (mimeType.startsWith('text/')) return 'bi-file-earmark-text-fill';
  return 'bi-file-earmark-fill';
};

// Carte bloc pour task/file (contrairement au chip inline user/thread) — même
// principe que chipHtml mais avec les métadonnées renvoyées par
// POST /mentions/resolve (status/dueDate ou mimeType/size).
const cardHtml = (kind: 'task' | 'file', id: string, label: string, resolved?: ResolvedReference): string => {
  const spaceAttr = resolved?.spaceId ? ` data-ref-space="${escapeHtml(resolved.spaceId)}"` : '';

  if (kind === 'task') {
    const status = resolved?.status;
    const statusText = status ? (TASK_STATUS_LABEL[status] ?? status) : '';
    const color = status ? (TASK_STATUS_COLOR[status] ?? '#8b8b96') : '#8b8b96';
    const due = formatDueDate(resolved?.dueDate);
    const metaHtml = (statusText || due)
      ? `<span class="reference-card__meta">${statusText ? `<span class="reference-card__badge" style="background:${color}">${escapeHtml(statusText)}</span>` : ''}${due ? `<span class="reference-card__due"><i class="bi bi-calendar-event"></i>${escapeHtml(due)}</span>` : ''}</span>`
      : '';
    return `<span class="reference-card" data-ref-kind="task" data-ref-id="${id}"${spaceAttr}><i class="bi bi-check2-square reference-card__icon"></i><span class="reference-card__body"><span class="reference-card__title">${escapeHtml(label)}</span>${metaHtml}</span></span>`;
  }

  const size = formatFileSize(resolved?.size);
  const metaHtml = size ? `<span class="reference-card__meta"><span class="reference-card__due">${escapeHtml(size)}</span></span>` : '';
  return `<span class="reference-card" data-ref-kind="file" data-ref-id="${id}"${spaceAttr}><i class="bi ${fileIconFor(resolved?.mimeType)} reference-card__icon"></i><span class="reference-card__body"><span class="reference-card__title">${escapeHtml(label)}</span>${metaHtml}</span></span>`;
};

// Point d'entrée unique pour les deux passes de renderReferences : chip
// compact pour user/thread (et pour tout accès restreint, quel que soit le
// kind — pas de métadonnées à montrer dans ce cas), carte bloc pour
// task/file quand l'accès est ok.
const renderReferenceNode = (kind: ReferenceKind, id: string, resolved: ResolvedReference | undefined): string => {
  const ok = resolved?.ok ?? true;
  const label = resolved?.label ?? '…';
  if (ok && (kind === 'task' || kind === 'file')) {
    return cardHtml(kind, id, label, resolved);
  }
  return chipHtml(kind, id, label, ok, resolved?.spaceId);
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
      if (node.parentElement?.closest('.reference-chip, .reference-card, .mention-tag')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  const nodesToReplace: { oldNode: ChildNode; newNode: HTMLElement }[] = [];
  const pending: ExtractedReference[] = [];

  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (!text.includes('<')) continue;

    // Le regex matche des délimiteurs `<`/`>` littéraux : il faut le faire
    // tourner sur `text` brut avant escapeHtml, sinon `<`/`>` sont déjà
    // devenus `&lt;`/`&gt;` et REFERENCE_TOKEN_REGEX ne matche plus jamais
    // (c'était le bug : le token restait affiché tel quel).
    let hasMatch = false;
    let html = '';
    let lastIndex = 0;
    for (const match of text.matchAll(REFERENCE_TOKEN_REGEX)) {
      const [full, prefix, id] = match as unknown as [string, string, string];
      const kind = PREFIX_TO_KIND[prefix];
      if (!kind) continue;
      hasMatch = true;
      html += escapeHtml(text.slice(lastIndex, match.index));
      const cached = resolveCache.get(`${kind}:${id}`);
      if (!cached) pending.push({ type: kind, id });
      html += renderReferenceNode(kind, id, cached);
      lastIndex = match.index! + full.length;
    }
    html += escapeHtml(text.slice(lastIndex));

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

  root.querySelectorAll<HTMLElement>('.reference-chip, .reference-card').forEach((chip) => {
    const kind = chip.dataset.refKind as ReferenceKind | undefined;
    const id = chip.dataset.refId;
    if (!kind || !id) return;
    const result = resolved.get(`${kind}:${id}`);
    if (!result) return;
    chip.outerHTML = renderReferenceNode(kind, id, result);
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
  const el = (event.target as HTMLElement)?.closest?.('.reference-chip, .reference-card') as HTMLElement | null;
  if (!el) return null;
  const kind = el.dataset.refKind as ReferenceKind | undefined;
  const id = el.dataset.refId;
  if (!kind || !id) return null;
  return { kind, id, spaceId: el.dataset.refSpace || undefined };
};
