#!/usr/bin/env node
// Génère le latest.json lu par tauri-plugin-updater (release_main.yml, job publish-updater).
//
//   node scripts/updater-manifest.mjs <version> <tag> <assets.json> <dossier des .sig>
//
// assets.json : sortie de `gh release view <tag> --json assets`. Chaque installeur doit avoir sa
// signature <nom>.sig (minisign, `tauri signer sign`) dans le dossier donné. On ne publie que ce que
// l'updater sait installer : MSI (Windows), AppImage (Linux) et l'archive .app.tar.gz (macOS, binaire
// universel : la même archive sert Apple Silicon et Intel). Le DMG ne sert qu'à la première install.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PLATFORMS = [
  { key: 'windows-x86_64', match: (n) => n.endsWith('.msi') },
  { key: 'linux-x86_64', match: (n) => n.endsWith('.AppImage') },
  { key: 'darwin-aarch64', match: (n) => n.endsWith('.app.tar.gz') },
  { key: 'darwin-x86_64', match: (n) => n.endsWith('.app.tar.gz') },
];

const [version, tag, assetsFile, sigDir] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY;
if (!version || !tag || !assetsFile || !sigDir || !repo) {
  console.error('Usage : GITHUB_REPOSITORY=owner/repo updater-manifest.mjs <version> <tag> <assets.json> <dossier .sig>');
  process.exit(2);
}

const names = JSON.parse(readFileSync(assetsFile, 'utf8')).assets.map((a) => a.name);
const platforms = {};
for (const { key, match } of PLATFORMS) {
  const found = names.filter(match);
  if (found.length !== 1) {
    console.error(`${key} : ${found.length} installeur(s) sur la release ${tag} (attendu 1) : ${found.join(', ') || '—'}`);
    process.exit(1);
  }
  const name = found[0];
  platforms[key] = {
    signature: readFileSync(path.join(sigDir, `${name}.sig`), 'utf8').trim(),
    url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`,
  };
}

process.stdout.write(`${JSON.stringify({ version, notes: `Synco ${version}`, pub_date: new Date().toISOString(), platforms }, null, 2)}\n`);
