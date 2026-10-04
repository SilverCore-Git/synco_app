import { computed } from 'vue';
import type { OrgMember, User } from '@/types/types';
import { openedOrg } from '@/assets/var';

// Token charset for a mention: any Unicode letter/digit (so accented names like "José" or
// "Amélie" match, not just ASCII) plus underscore, hyphen, dot and apostrophe (for names like
// "O'Brien"). Shared with the composer's live "@query" detection in ThreadTextarea.vue so the
// two never drift out of sync again.
const MENTION_CHAR_CLASS = "\\p{L}\\p{N}_.'’-";

// Matches "@token" using the charset above.
export const MENTION_TOKEN_REGEX = new RegExp(`@([${MENTION_CHAR_CLASS}]+)`, 'gu');

// Matches an in-progress "@query" right before the cursor, used to drive the autocomplete
// dropdown while typing.
export const MENTION_QUERY_REGEX = new RegExp(`(?:^|\\s)@([${MENTION_CHAR_CLASS}]*)$`, 'u');

export interface MentionEntry {
  id: string;
  name: string;
  pseudo?: string;
  special?: 'everyone' | 'here';
  // Présent quand le trigger '@' mélange plusieurs kinds (membres + rôles) —
  // absent pour les entrées "membre" classiques, où le kind est déjà porté
  // par activeTriggerKind. Voir ThreadTextarea.vue insertMention.
  kind?: 'role';
}

export type MentionTarget =
  | { type: 'everyone' }
  | { type: 'here' }
  | { type: 'user'; user: User };

export interface MentionLookup {
  // token (lowercased pseudo/name, or "everyone"/"here") -> resolved target
  byToken: Map<string, MentionTarget>;
  // userId -> User, for resolving a click back to a profile
  usersById: Map<string, User>;
}

const normalize = (s: string) => s.trim().toLowerCase();

// Special entries always offered first in the autocomplete list, on top of real members.
export const buildMentionableList = (members: OrgMember[] | undefined): MentionEntry[] => {

  const everyone: MentionEntry = { id: '__everyone__', name: 'Tout le monde', pseudo: 'everyone', special: 'everyone' };
  const here: MentionEntry = { id: '__here__', name: 'Membres en ligne', pseudo: 'here', special: 'here' };

  const users: MentionEntry[] = (members || [])
    .filter(m => m.user)
    .map(m => ({ id: m.user!.id, name: m.user!.name, pseudo: m.user!.pseudo }));

  return [everyone, here, ...users];

};

// A mention only "counts" (gets highlighted, becomes clickable, can tag the reader) if its
// token resolves to a real member or one of the two special tokens — typing "@anything" that
// doesn't match anyone must render as plain text, not as a fake mention.
export const buildMentionLookup = (members: OrgMember[] | undefined): MentionLookup => {

  const byToken = new Map<string, MentionTarget>();
  const usersById = new Map<string, User>();

  byToken.set('everyone', { type: 'everyone' });
  byToken.set('here', { type: 'here' });

  for (const m of members || []) {

    if (!m.user) continue;

    usersById.set(m.user.id, m.user);
    const target: MentionTarget = { type: 'user', user: m.user };

    if (m.user.pseudo) byToken.set(normalize(m.user.pseudo), target);
    if (m.user.name) byToken.set(normalize(m.user.name.replace(/\s+/g, '')), target);

  }

  return { byToken, usersById };

};

// Table unique pour toute l'app, recalculée seulement quand les membres de
// l'org ouverte changent. Un computed par message (ChatMessage, ThreadMessage,
// MarkdownRender) reconstruisait la table ET s'abonnait aux propriétés de
// chaque membre, pour chaque instance : ouvrir une conversation de 40
// messages dans une org de 100 membres créait des dizaines de milliers
// d'abonnements réactifs, une bonne part du gel à l'ouverture.
export const orgMentionLookup = computed(() => buildMentionLookup(openedOrg.value?.members));

export const extractMentionTokens = (content: string | undefined | null): string[] => {

  if (!content) return [];

  const tokens: string[] = [];
  for (const match of content.matchAll(MENTION_TOKEN_REGEX)) {
    if (match[1]) tokens.push(normalize(match[1]));
  }

  return tokens;

};

// Is `currentUser` targeted by a mention in `content`? Covers @everyone, @here (only while
// online) and a direct @pseudo/@name mention.
export const isUserMentioned = (
  content: string | undefined | null,
  currentUser: User | null | undefined,
  lookup: MentionLookup
): boolean => {

  if (!content || !currentUser) return false;

  for (const token of extractMentionTokens(content)) {

    const target = lookup.byToken.get(token);
    if (!target) continue;

    if (target.type === 'everyone') return true;
    if (target.type === 'here' && currentUser.data?.status === 'online') return true;
    if (target.type === 'user' && target.user.id === currentUser.id) return true;

  }

  return false;

};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Walks the text nodes under `root` and wraps only the tokens that resolve through `lookup`
// in a clickable ".mention-tag" span. Anything else stays as plain text.
//
// The text is HTML-escaped before being written back via innerHTML — none of the mention
// token characters (a-zA-Z0-9_-.) are affected by escaping, so match positions are unchanged,
// but a literal "<"/"&" typed in the message can no longer be reinterpreted as markup.
export const renderMentions = (root: HTMLElement, lookup: MentionLookup) => {

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node.parentElement?.classList.contains('mention-tag')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node: Node | null;
  const nodesToReplace: { oldNode: ChildNode; newNode: HTMLElement }[] = [];

  while ((node = walker.nextNode())) {

    const text = node.textContent || '';
    if (!text.includes('@')) continue;

    let hasMatch = false;

    const html = escapeHtml(text).replace(MENTION_TOKEN_REGEX, (full, rawToken: string) => {

      const target = lookup.byToken.get(normalize(rawToken));
      if (!target) return full;

      hasMatch = true;
      const id = target.type === 'user' ? target.user.id : target.type;

      return `<span class="mention-tag" data-mention-kind="${target.type}" data-mention-id="${id}">@${rawToken}</span>`;

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

};

// Delegated click handler: pass the click event from anywhere inside the rendered message,
// resolves it to the concrete user (if any) and hands it to `onUser`.
export const handleMentionClick = (
  event: MouseEvent,
  lookup: MentionLookup,
  onUser: (user: User, event: MouseEvent) => void
) => {

  const el = (event.target as HTMLElement)?.closest?.('.mention-tag') as HTMLElement | null;
  if (!el) return;

  const kind = el.dataset.mentionKind;
  const id = el.dataset.mentionId;
  if (kind !== 'user' || !id) return;

  const user = lookup.usersById.get(id);
  if (user) onUser(user, event);

};
