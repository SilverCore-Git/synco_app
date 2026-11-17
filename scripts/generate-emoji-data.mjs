#!/usr/bin/env node
// Génère src/components/common/emoji/emojiData.json à partir d'emojibase-data
// (version épinglée, téléchargée depuis jsDelivr — aucune dépendance ajoutée).
//
//   node scripts/generate-emoji-data.mjs            # télécharge la version épinglée
//   node scripts/generate-emoji-data.mjs ./dossier  # lit un emojibase-data local
//
// Format compact (tableaux plutôt qu'objets pour alléger le chunk) :
//   emojis[i] = [emoji, groupe, version, labelFr, tagsFr, labelEn, tagsEn, shortcodes, skins]
//   - tagsFr / tagsEn / shortcodes : chaînes jointes par "|"
//   - skins : 0, ou les 5 variantes (tons 1→5) quand l'emoji en a de uniformes
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '18.0.0';
const CDN = `https://cdn.jsdelivr.net/npm/emojibase-data@${VERSION}`;
const localDir = process.argv[2] ? resolve(process.argv[2]) : null;

const load = async (path) => {
  if (localDir) return JSON.parse(await readFile(join(localDir, path), 'utf8'));
  const res = await fetch(`${CDN}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
};

const [fr, en, github, cldr] = await Promise.all([
  load('fr/data.json'),
  load('en/data.json'),
  load('en/shortcodes/github.json'),
  load('en/shortcodes/cldr.json'),
]);

// Groupes emojibase → index dans GROUPS côté composant. Le groupe 2
// (« composants » : tons de peau et cheveux isolés) n'est pas proposé.
const GROUP_MAP = { 0: 0, 1: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8 };

const enByHex = new Map(en.map((e) => [e.hexcode, e]));
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const clean = (s) => s.replace(/[\u00A0\u202F]/g, ' ').replace(/’/g, "'").trim();

const rows = fr
  .filter((e) => e.group in GROUP_MAP)
  .sort((a, b) => a.order - b.order)
  .map((e) => {
    const enEntry = enByHex.get(e.hexcode);
    const shortcodes = [...new Set([...asList(github[e.hexcode]), ...asList(cldr[e.hexcode])])];

    // Variantes à ton uniforme uniquement (les couples mixtes 🧑🏻‍🤝‍🧑🏼 ne
    // rentrent pas dans un sélecteur de ton global).
    let skins = 0;
    if (e.skins?.length) {
      const uniform = e.skins
        .filter((s) => typeof s.tone === 'number' || (Array.isArray(s.tone) && s.tone.every((t) => t === s.tone[0])))
        .map((s) => ({ tone: Array.isArray(s.tone) ? s.tone[0] : s.tone, emoji: s.emoji }))
        .sort((a, b) => a.tone - b.tone);
      if (uniform.length === 5) skins = uniform.map((s) => s.emoji);
    }

    return [
      e.emoji,
      GROUP_MAP[e.group],
      e.version,
      clean(e.label),
      (e.tags ?? []).map(clean).join('|'),
      enEntry ? clean(enEntry.label) : '',
      (enEntry?.tags ?? []).map(clean).join('|'),
      shortcodes.join('|'),
      skins,
    ];
  });

const out = fileURLToPath(new URL('../src/components/common/emoji/emojiData.json', import.meta.url));
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ source: `emojibase-data@${VERSION}`, emojis: rows }) + '\n');
console.log(`${rows.length} emojis → ${out}`);
