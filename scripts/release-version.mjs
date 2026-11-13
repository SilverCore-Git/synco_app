#!/usr/bin/env node
// Version de l'app pour la CI de release (release_main.yml). La source de vérité est le dernier tag vX.Y.Z,
// la version n'est jamais commitée dans les fichiers (tauri.conf.json reste à sa valeur de base).
//
//   node scripts/release-version.mjs next [--bump auto|patch|minor|major]
//       Calcule la version suivante d'après les commits depuis le dernier tag v* (fix → patch,
//       feat → minor, `!`/BREAKING CHANGE → major ; cf. lib/releaseVersion.mjs). Si HEAD porte déjà
//       un tag v* (relance du workflow sur le même commit), cette version est réutilisée telle quelle.
//       Écrit version, tag, bump, existing dans $GITHUB_OUTPUT quand il existe.
//
//   node scripts/release-version.mjs apply <X.Y.Z> [--android-code <n>]
//       Écrit la version dans src-tauri/tauri.conf.json (lue par le bundler et par l'updater) et,
//       si --android-code est donné, dans android/app/build.gradle (versionName / versionCode).
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUMPS, bumpFromCommits, bumpVersion, parseVersion } from './lib/releaseVersion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAURI_CONF = path.join(ROOT, 'src-tauri/tauri.conf.json');
const GRADLE = path.join(ROOT, 'android/app/build.gradle');
const TAG_GLOB = 'v[0-9]*.[0-9]*.[0-9]*';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return ''; } };

function option(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function isVersionTag(tag) {
  try { parseVersion(tag); return tag.startsWith('v'); } catch { return false; }
}

function commitsIn(range) {
  return git('log', '--format=%s%x1f%b%x1e', range)
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => { const [subject, body = ''] = entry.split('\x1f'); return { subject, body }; });
}

function next() {
  const requested = option('--bump') || 'auto';
  if (requested !== 'auto' && !BUMPS.includes(requested)) throw new Error(`--bump invalide : ${requested}`);

  const onHead = tryGit('tag', '--points-at', 'HEAD', '--list', TAG_GLOB).split('\n').filter(isVersionTag);
  if (onHead.length) {
    const tag = onHead.sort((a, b) => (parseVersion(a) > parseVersion(b) ? -1 : 1))[0];
    return { version: tag.slice(1), tag, bump: 'none', existing: true };
  }

  const lastTag = tryGit('describe', '--tags', '--abbrev=0', '--match', TAG_GLOB, 'HEAD');
  const base = lastTag || JSON.parse(readFileSync(TAURI_CONF, 'utf8')).version;
  // Sans tag (première release versionnée) : seuls les commits apportés par le dernier push comptent.
  const range = lastTag ? `${lastTag}..HEAD` : tryGit('rev-parse', '--verify', '--quiet', 'HEAD^') ? 'HEAD^..HEAD' : 'HEAD';
  const bump = requested === 'auto' ? bumpFromCommits(commitsIn(range)) : requested;
  const version = bumpVersion(base, bump);

  console.error(`Base ${lastTag || `${base} (tauri.conf.json, aucun tag v*)`} · commits ${range} · bump ${bump} → ${version}`);
  return { version, tag: `v${version}`, bump, existing: false };
}

function apply(version) {
  parseVersion(version);
  const conf = JSON.parse(readFileSync(TAURI_CONF, 'utf8'));
  conf.version = version;
  writeFileSync(TAURI_CONF, `${JSON.stringify(conf, null, 2)}\n`);
  console.error(`tauri.conf.json → ${version}`);

  const code = option('--android-code');
  if (code !== undefined) {
    if (!/^[1-9]\d{0,9}$/.test(code)) throw new Error(`--android-code invalide : ${code}`);
    const gradle = readFileSync(GRADLE, 'utf8')
      .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`)
      .replace(/versionCode\s+\d+/, `versionCode ${code}`);
    writeFileSync(GRADLE, gradle);
    console.error(`build.gradle → versionName ${version}, versionCode ${code}`);
  }
}

const [command, arg] = process.argv.slice(2);
try {
  if (command === 'next') {
    const out = next();
    console.log(out.version);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}\n`).join(''));
    }
  } else if (command === 'apply' && arg) {
    apply(arg);
  } else {
    console.error('Usage : release-version.mjs next [--bump auto|patch|minor|major] | apply <X.Y.Z> [--android-code <n>]');
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
