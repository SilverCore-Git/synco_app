// Logique du sélecteur d'emojis, séparée du composant :
//  - chargement paresseux des données (chunk JSON généré par
//    scripts/generate-emoji-data.mjs, partagé par toutes les instances) ;
//  - détection des emojis que le système ne sait pas afficher ;
//  - recherche classée (FR + EN + shortcodes) ;
//  - emojis fréquents et ton de peau, persistés par appareil.
import { ref, shallowRef } from 'vue';

export interface Emoji {
  /** Emoji de base (sans ton de peau). */
  emoji: string;
  group: number;
  version: number;
  label: string;
  labelEn: string;
  shortcodes: string[];
  /** Variantes tons 1→5, ou null. */
  skins: string[] | null;
  /** Ordre d'origine, pour départager à score égal. */
  order: number;
  // Index de recherche (normalisés)
  sLabel: string;
  sLabelEn: string;
  sNameWords: string[];
  sNameWordsEn: string[];
  sTags: string[];
  sTagWords: string[];
  sTagsEn: string[];
  sTagWordsEn: string[];
}

export const GROUPS = [
  { id: 'smileys', label: 'Smileys & émotions', icon: 'bi-emoji-smile' },
  { id: 'people', label: 'Personnes & corps', icon: 'bi-person' },
  { id: 'nature', label: 'Animaux & nature', icon: 'bi-tree' },
  { id: 'food', label: 'Nourriture & boissons', icon: 'bi-cup-hot' },
  { id: 'travel', label: 'Voyages & lieux', icon: 'bi-airplane' },
  { id: 'activities', label: 'Activités', icon: 'bi-trophy' },
  { id: 'objects', label: 'Objets', icon: 'bi-lightbulb' },
  { id: 'symbols', label: 'Symboles', icon: 'bi-heart' },
  { id: 'flags', label: 'Drapeaux', icon: 'bi-flag' },
] as const;

export const EMOJI_FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "Twemoji Mozilla", "Android Emoji", "EmojiSymbols", sans-serif';

// ─── Normalisation ─────────────────────────────────────────────────────────

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .trim();

const splitWords = (s: string) => s.split(/[\s\-_:'.,()!?/&«»"]+/).filter(Boolean);

// ─── Chargement des données ────────────────────────────────────────────────

type RawEmoji = [string, number, number, string, string, string, string, string, string[] | 0];

export const emojis = shallowRef<Emoji[]>([]);
export const emojisReady = ref(false);

let loadPromise: Promise<void> | null = null;

/** Index emoji (base ou variante de ton) → entrée. */
const byChar = new Map<string, Emoji>();
export const findEmoji = (char: string) => byChar.get(char);

export function loadEmojis(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = import('./emojiData.json')
    .then(({ default: data }) => {
      const raw = data.emojis as unknown as RawEmoji[];
      const unsupported = getUnsupportedVersions(raw, data.source);
      const list: Emoji[] = [];
      raw.forEach(([emoji, group, version, label, tags, labelEn, tagsEn, shortcodes, skins], order) => {
        if (unsupported.has(version)) return;
        const sLabel = normalize(label);
        const sLabelEn = normalize(labelEn);
        const sTags = tags ? tags.split('|').map(normalize) : [];
        const sTagsEn = tagsEn ? tagsEn.split('|').map(normalize) : [];
        const entry: Emoji = {
          emoji,
          group,
          version,
          label,
          labelEn,
          shortcodes: shortcodes ? shortcodes.split('|') : [],
          skins: skins || null,
          order,
          sLabel,
          sLabelEn,
          sNameWords: splitWords(sLabel),
          sNameWordsEn: splitWords(sLabelEn),
          sTags,
          sTagWords: [...new Set(sTags.flatMap(splitWords))],
          sTagsEn,
          sTagWordsEn: [...new Set(sTagsEn.flatMap(splitWords))],
        };
        list.push(entry);
        byChar.set(emoji, entry);
        // Certaines plateformes collent l'emoji sans le sélecteur de variante FE0F
        byChar.set(emoji.replace(/\uFE0F/g, ''), entry);
        entry.skins?.forEach((s) => byChar.set(s, entry));
      });
      emojis.value = list;
      emojisReady.value = true;
    })
    .catch((err) => {
      loadPromise = null; // permet de réessayer à la prochaine ouverture
      throw err;
    });
  return loadPromise;
}

// ─── Support d'affichage ───────────────────────────────────────────────────
// Les emojis récents (Unicode 12+) ne sont pas dessinés par tous les systèmes :
// on teste quelques représentants par version sur un canvas, et on masque les
// versions qui s'affichent en « tofu » ou en séquence éclatée (🐦🔥 au lieu
// de 🐦‍🔥). Résultat mis en cache par user-agent.

const SUPPORT_KEY = 'synco:emojiSupport';
const FIRST_TESTED_VERSION = 12;

function getUnsupportedVersions(raw: RawEmoji[], source: string): Set<number> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  try {
    const cached = JSON.parse(localStorage.getItem(SUPPORT_KEY) || 'null');
    if (cached && cached.ua === ua && cached.source === source && Array.isArray(cached.unsupported)) {
      return new Set(cached.unsupported as number[]);
    }
  } catch {
    /* cache illisible : on refait le test */
  }

  const unsupported = detectUnsupportedVersions(raw);
  try {
    localStorage.setItem(SUPPORT_KEY, JSON.stringify({ ua, source, unsupported: [...unsupported] }));
  } catch {
    /* stockage indisponible */
  }
  return unsupported;
}

function detectUnsupportedVersions(raw: RawEmoji[]): Set<number> {
  const result = new Set<number>();
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 40;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    return result;
  }
  if (!ctx) return result;

  ctx.font = `28px ${EMOJI_FONT}`;
  ctx.textBaseline = 'top';
  const refWidth = ctx.measureText('😀').width;

  const isColored = (text: string) => {
    ctx!.clearRect(0, 0, 40, 40);
    ctx!.fillStyle = '#000';
    ctx!.fillText(text, 2, 2);
    const { data } = ctx!.getImageData(0, 0, 40, 40);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! > 64 && (Math.abs(data[i]! - data[i + 1]!) > 24 || Math.abs(data[i + 1]! - data[i + 2]!) > 24)) {
        return true;
      }
    }
    return false;
  };
  const renders = (text: string) => ctx!.measureText(text).width < refWidth * 1.4 && isColored(text);

  // Contrôle : si le canvas ment (anti-fingerprinting, rendu bloqué), on ne
  // masque rien plutôt que de cacher des emojis à tort.
  if (!refWidth || !renders('😀') || isColored('A')) return result;

  const samples = new Map<number, string[]>();
  for (const [emoji, , version] of raw) {
    if (version < FIRST_TESTED_VERSION) continue;
    const list = samples.get(version) ?? [];
    if (list.length < 3) list.push(emoji);
    samples.set(version, list);
  }
  for (const [version, list] of samples) {
    if (!list.some(renders)) result.add(version);
  }
  return result;
}

// ─── Ton de peau ───────────────────────────────────────────────────────────

const SKIN_KEY = 'synco:emojiSkinTone';
export const SKIN_TONE_SAMPLES = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'];

const readSkinTone = () => {
  try {
    const v = Number(localStorage.getItem(SKIN_KEY));
    return Number.isInteger(v) && v >= 0 && v <= 5 ? v : 0;
  } catch {
    return 0;
  }
};

/** 0 = jaune par défaut, 1→5 = tons Fitzpatrick. */
export const skinTone = ref<number>(readSkinTone());

export function setSkinTone(tone: number) {
  skinTone.value = tone;
  try {
    localStorage.setItem(SKIN_KEY, String(tone));
  } catch {
    /* non persisté */
  }
}

export const withSkin = (e: Emoji, tone = skinTone.value) => (tone && e.skins ? e.skins[tone - 1]! : e.emoji);

// ─── Emojis fréquents ──────────────────────────────────────────────────────
// Nouveau format : { v: 2, items: { [emoji]: { c: nombre d'usages, t: ms } } }.
// L'ancien format (tableau d'emojis récents sous 'synco:recentEmojis') est
// encore lu pour ne pas perdre l'historique, mais n'est plus écrit.

const USAGE_KEY = 'synco:emojiUsage';
const LEGACY_RECENT_KEY = 'synco:recentEmojis';
const MAX_TRACKED = 64;
const FREQUENT_COUNT = 24;
const DEFAULT_FREQUENT = ['👍', '❤️', '😂', '🎉', '🙏', '🔥', '😮', '😢', '👀', '✅', '🚀', '💯', '😊', '🤔', '👏', '😅'];

type Usage = Record<string, { c: number; t: number }>;

const readUsage = (): Usage => {
  try {
    const parsed = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
    if (parsed?.v === 2 && parsed.items && typeof parsed.items === 'object') return parsed.items as Usage;
  } catch {
    /* format illisible */
  }
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_RECENT_KEY) || '[]');
    if (Array.isArray(legacy)) {
      const now = Date.now();
      const usage: Usage = {};
      legacy
        .filter((e): e is string => typeof e === 'string')
        .forEach((e, i) => (usage[e] = { c: 1, t: now - i * 60_000 }));
      return usage;
    }
  } catch {
    /* rien à migrer */
  }
  return {};
};

const usage = ref<Usage>(readUsage());

// Score « frecency » : le nombre d'usages, amorti par l'ancienneté.
const frecency = (u: { c: number; t: number }, now: number) => u.c / (1 + (now - u.t) / (14 * 86_400_000));

export function recordEmojiUsage(emoji: string) {
  const now = Date.now();
  const next: Usage = { ...usage.value, [emoji]: { c: (usage.value[emoji]?.c ?? 0) + 1, t: now } };
  const kept = Object.entries(next)
    .sort(([, a], [, b]) => frecency(b, now) - frecency(a, now))
    .slice(0, MAX_TRACKED);
  usage.value = Object.fromEntries(kept);
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ v: 2, items: usage.value }));
  } catch {
    /* non persisté */
  }
}

/** Emojis fréquents (caractères tels qu'utilisés, ton compris), complétés par des valeurs sûres. */
export function getFrequentEmojis(): string[] {
  const now = Date.now();
  const used = Object.entries(usage.value)
    .sort(([, a], [, b]) => frecency(b, now) - frecency(a, now))
    .map(([e]) => e)
    .filter((e) => byChar.has(e));
  const seen = new Set(used.map((e) => byChar.get(e)!.emoji));
  for (const d of DEFAULT_FREQUENT) {
    if (used.length >= FREQUENT_COUNT) break;
    const entry = byChar.get(d);
    if (entry && !seen.has(entry.emoji)) {
      used.push(withSkin(entry));
      seen.add(entry.emoji);
    }
  }
  return used.slice(0, FREQUENT_COUNT);
}

export const usageScore = (e: Emoji) => {
  let c = usage.value[e.emoji]?.c ?? 0;
  e.skins?.forEach((s) => (c += usage.value[s]?.c ?? 0));
  return c;
};

// ─── Recherche ─────────────────────────────────────────────────────────────
// Chaque mot de la requête doit correspondre à quelque chose (ET logique), au
// début d'un mot plutôt qu'au milieu — « chat » trouve 🐱 sans remonter
// « château ». Le français pèse plus que l'anglais, le nom plus que les tags.

const EMOJI_CHAR = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

function wordScore(e: Emoji, w: string, isLast: boolean): number {
  // Le dernier mot est en cours de frappe : on accepte les préfixes partout ;
  // les mots déjà terminés doivent correspondre à un mot entier ou au moins
  // en être un préfixe solide.
  let best = 0;
  const check = (words: string[], exact: number, prefix: number) => {
    for (const word of words) {
      if (word === w) return void (best = Math.max(best, exact));
      if (word.startsWith(w)) best = Math.max(best, isLast || w.length >= 3 ? prefix : prefix / 3);
    }
  };
  check(e.sNameWords, 100, 70);
  if (best >= 100) return best;
  check(e.sTagWords, 60, 40);
  check(e.sNameWordsEn, 50, 35);
  check(e.sTagWordsEn, 30, 20);
  if (!best && w.length >= 3) {
    for (const sc of e.shortcodes) if (sc.includes(w)) return 15;
    if (e.sLabel.includes(w) || e.sTags.some((t) => t.includes(w))) return 10;
  }
  return best;
}

export function searchEmojis(rawQuery: string, list: Emoji[]): Emoji[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  // Emoji collé directement : on retrouve l'entrée (et ses voisines de nom)
  if (EMOJI_CHAR.test(trimmed)) {
    const hit = byChar.get(trimmed) ?? byChar.get(trimmed.replace(/\uFE0F/g, ''));
    if (!hit) return [];
    const related = searchEmojis(hit.sNameWords.filter((w) => w.length > 3).slice(0, 2).join(' '), list);
    return [hit, ...related.filter((e) => e !== hit)].slice(0, 48);
  }

  const q = normalize(trimmed);

  // Shortcode façon Slack/GitHub : « :+1 », « :thumbs_up: »
  if (q.startsWith(':')) {
    const code = q.replace(/^:+|:+$/g, '');
    if (!code) return [];
    return list
      .map((e) => {
        let s = 0;
        for (const sc of e.shortcodes) {
          if (sc === code) s = Math.max(s, 3);
          else if (sc.startsWith(code)) s = Math.max(s, 2);
          else if (sc.includes(code)) s = Math.max(s, 1);
        }
        return { e, s };
      })
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.e.order - b.e.order)
      .map((r) => r.e);
  }

  const words = splitWords(q);
  if (!words.length) return [];

  const results: { e: Emoji; s: number }[] = [];
  for (const e of list) {
    let total = 0;
    let ok = true;
    for (let i = 0; i < words.length; i++) {
      const s = wordScore(e, words[i]!, i === words.length - 1);
      if (!s) {
        ok = false;
        break;
      }
      total += s;
    }
    if (!ok) continue;
    // Bonus pour la correspondance de la phrase entière
    if (e.sLabel === q || e.sLabelEn === q) total += 200;
    else if (e.sLabel.startsWith(q)) total += 60;
    else if (e.sTags.includes(q)) total += 50;
    else if (e.sLabelEn.startsWith(q) || e.sTagsEn.includes(q)) total += 30;
    // Les emojis qu'on utilise remontent un peu, les noms courts aussi
    total += Math.min(20, usageScore(e) * 4);
    total -= Math.min(10, e.sNameWords.length * 1.5);
    results.push({ e, s: total });
  }
  return results.sort((a, b) => b.s - a.s || a.e.order - b.e.order).map((r) => r.e);
}
