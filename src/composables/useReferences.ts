import type { OrgMember } from '@/types/types';

export type ReferenceKind = 'user' | 'role' | 'thread' | 'task' | 'file';

export interface TriggerConfig {
  kind: ReferenceKind;
  // Préfixe du token stocké : <@:id> et <#:id> gardent le symbole du trigger,
  // <task:id>/<file:id>/<role:id> utilisent un mot car ! et & n'ont pas de
  // sens une fois sortis du contexte de saisie.
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

// 'role' n'a pas son propre caractère : @ ouvre un picker mixte
// membres+rôles (comme Discord), donc 'role' n'est pas dans TRIGGERS (une
// config par caractère) mais a besoin des mêmes infos pour construire son
// token/chip — d'où cette config à part, fusionnée dans PREFIX_TO_KIND/
// KIND_TO_TRIGGER_CHAR ci-dessous.
export const ROLE_TRIGGER_CONFIG: TriggerConfig = { kind: 'role', tokenPrefix: 'role', label: 'Rôles', icon: 'bi-shield-fill' };

const PREFIX_TO_KIND: Record<string, ReferenceKind> = {};
for (const t of Object.values(TRIGGERS)) PREFIX_TO_KIND[t.tokenPrefix] = t.kind;
PREFIX_TO_KIND[ROLE_TRIGGER_CONFIG.tokenPrefix] = ROLE_TRIGGER_CONFIG.kind;

// kind -> caractère de trigger (l'inverse de TRIGGERS) — utilisé pour
// afficher un texte lisible ("!Titre de tâche") à la place du token brut
// dans l'éditeur (voir ThreadTextarea.vue). 'role' partage le '@' de 'user'.
export const KIND_TO_TRIGGER_CHAR: Record<ReferenceKind, string> = {} as Record<ReferenceKind, string>;
for (const [char, t] of Object.entries(TRIGGERS)) KIND_TO_TRIGGER_CHAR[t.kind] = char;
KIND_TO_TRIGGER_CHAR.role = '@';

const configForKind = (kind: ReferenceKind): TriggerConfig =>
  kind === 'role' ? ROLE_TRIGGER_CONFIG : Object.values(TRIGGERS).find(t => t.kind === kind)!;

// Charset partagé avec l'ancien MENTION_CHAR_CLASS (useMentions.ts) — lettres/
// chiffres unicode + quelques signes usuels dans un nom.
const QUERY_CHAR_CLASS = "\\p{L}\\p{N}_.'’-";

// Détecte un trigger "en cours de frappe" juste avant le curseur, ex. "voir #gen" -> ['#', 'gen'].
export const TRIGGER_QUERY_REGEX = new RegExp(`(?:^|\\s)([@#!&])([${QUERY_CHAR_CLASS}]*)$`, 'u');

// Matches <@:id> / <#:id> / <task:id> / <file:id> / <role:id>.
export const REFERENCE_TOKEN_REGEX = /<(@|#|task|file|role):([a-zA-Z0-9_-]+)>/g;

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
// 'role' a le même souci que task/file (mot ≥2 lettres = scheme valide pour
// marked), même si son chip reste inline (pas de carte bloc) — toujours
// échappé, jamais retiré par stripBlockReferenceTokens.
export const escapeReferenceTokensForMarkdown = (content: string): string =>
  content.replace(REFERENCE_TOKEN_REGEX, (full, prefix: string, id: string) =>
    (prefix === 'task' || prefix === 'file' || prefix === 'role') ? `&lt;${prefix}:${id}&gt;` : full
  );

export const buildReferenceToken = (kind: ReferenceKind, id: string): string => {
  const config = configForKind(kind);
  return `<${config.tokenPrefix}:${id}>`;
};

// Retire les tokens <task:id>/<file:id> du markdown source — utilisé quand
// MarkdownRender les affiche à part, via les vrais TaskCard.vue/FileCard.vue
// (voir MarkdownRender.vue), plutôt qu'inline dans le texte. Laisse
// <@:id>/<#:id> intacts pour la passe chip habituelle. Consomme l'espace
// simple inséré après le token par ThreadTextarea.insertMention pour éviter
// une double espace à l'endroit où il était.
export const stripBlockReferenceTokens = (content: string): string =>
  content.replace(/<(?:task|file):[a-zA-Z0-9_-]+> ?/g, '').trim();

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
  const config = configForKind(kind);
  // Un seul symbole affiché par chip : pour 'thread', l'icône bi-hash EST
  // déjà le "#" (sinon on se retrouvait avec icône # + texte "#nom" = "##nom").
  // Pour 'user'/'role', l'icône n'est pas un "@" (silhouette / bouclier) — le
  // préfixe texte reste donc nécessaire pour ces deux-là.
  const prefixChar = (kind === 'user' || kind === 'role') ? '@' : '';
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
      html += chipHtml(kind, id, cached?.label ?? '…', cached?.ok ?? true, cached?.spaceId);
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
