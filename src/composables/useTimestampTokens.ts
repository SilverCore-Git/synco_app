import { formatRelativeTime } from '@/assets/utils/relativeTime';

// <t:unixSeconds> ou <t:unixSeconds:format>, format façon Discord. Purement
// client (pas d'entité derrière, pas d'appel réseau, pas de vérif serveur —
// voir la conception de la feature) : extrait/rendu indépendamment des
// références <@:id>/<#:id>/<task:id>/<file:id>.
export const TIMESTAMP_TOKEN_REGEX = /<t:(\d+)(?::([tTdDfFR]))?>/g;

type TimestampFormat = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';

const shortTime = new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit' });
const longTime = new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shortDate = new Intl.DateTimeFormat('fr', { day: '2-digit', month: '2-digit', year: 'numeric' });
const longDate = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDateTime = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const longDateTime = new Intl.DateTimeFormat('fr', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const absoluteTooltip = new Intl.DateTimeFormat('fr', { dateStyle: 'full', timeStyle: 'medium' });

const formatTimestamp = (date: Date, format: TimestampFormat | undefined): string => {
  switch (format) {
    case 't': return shortTime.format(date);
    case 'T': return longTime.format(date);
    case 'd': return shortDate.format(date);
    case 'D': return longDate.format(date);
    case 'f': return shortDateTime.format(date);
    case 'F': return longDateTime.format(date);
    case 'R':
    default:
      return formatRelativeTime(date);
  }
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Parcourt les noeuds texte sous `root` et remplace les tokens <t:...> par un <time> formaté, tooltip = heure absolue. */
export const renderTimestampTokens = (root: HTMLElement): void => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.parentElement?.closest('.timestamp-token')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  const nodesToReplace: { oldNode: ChildNode; newNode: HTMLElement }[] = [];

  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (!text.includes('<t:')) continue;

    let hasMatch = false;
    const html = escapeHtml(text).replace(TIMESTAMP_TOKEN_REGEX, (full, seconds: string, format?: string) => {
      const unixSeconds = Number(seconds);
      if (!Number.isFinite(unixSeconds)) return full;
      hasMatch = true;
      const date = new Date(unixSeconds * 1000);
      const display = formatTimestamp(date, format as TimestampFormat | undefined);
      return `<time class="timestamp-token" datetime="${date.toISOString()}" title="${absoluteTooltip.format(date)}">${display}</time>`;
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
