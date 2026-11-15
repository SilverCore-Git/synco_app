#!/usr/bin/env node
// Rapport de fin de release posté dans un salon Synco (release_main.yml, job report, lancé même quand
// une étape a échoué). Construit le message (lib/releaseReport.mjs), le signe en HMAC et l'envoie au
// webhook Synco (doc/08-webhooks.md).
//
//   node scripts/release-report.mjs [--dry-run]
//
// Variables d'environnement :
//   NEEDS_JSON              toJSON(needs) du job report (résultat de chaque job)
//   RELEASE_TAG, VERSION    sorties du job create-release (vides s'il a échoué)
//   DOCKER_IMAGE            image poussée par build-docker-image (affichée si le job a réussi)
//   SYNCO_WEBHOOK_URL       adresse d'envoi du webhook (secret du dépôt)
//   SYNCO_WEBHOOK_SECRET    secret HMAC du webhook (secret du dépôt ; si absent, envoi non signé)
//   GH_TOKEN                pour lire les jobs du run et les assets de la release (facultatif)
//   GITHUB_*                fournies par Actions
//
// --dry-run affiche le JSON sans l'envoyer.
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { buildReport } from './lib/releaseReport.mjs';

const env = process.env;
const dryRun = process.argv.includes('--dry-run');
const api = env.GITHUB_API_URL || 'https://api.github.com';
const repo = env.GITHUB_REPOSITORY;

async function github(path) {
  if (!env.GH_TOKEN || !repo) return null;
  try {
    const res = await fetch(`${api}${path}`, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.log(`::warning::API GitHub ${path} : ${e.message} (rapport sans ce détail)`);
    return null;
  }
}

function git(...args) {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

// Release précédente = dernier tag v* atteignable, hors celui de cette release.
function commitsSincePreviousTag(tag) {
  const exclude = tag ? ['--exclude', tag] : [];
  const previousTag = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*', ...exclude, 'HEAD');
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD^..HEAD';
  const log = git('log', '--no-merges', '--format=%s', range);
  return { previousTag, commits: log ? log.split('\n').filter(Boolean) : [] };
}

let needs;
try {
  needs = JSON.parse(env.NEEDS_JSON || '{}');
} catch {
  console.log('::error::NEEDS_JSON illisible');
  process.exit(1);
}

const tag = env.RELEASE_TAG || '';
const runId = env.GITHUB_RUN_ID;
const runAttempt = Number(env.GITHUB_RUN_ATTEMPT || 1);

const [jobsRes, release] = await Promise.all([
  runId ? github(`/repos/${repo}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`) : null,
  tag ? github(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`) : null,
]);
const { previousTag, commits } = commitsSincePreviousTag(tag);

const { status, payload } = buildReport({
  needs,
  jobs: jobsRes?.jobs ?? [],
  release,
  commits,
  ctx: {
    tag,
    version: env.VERSION || '',
    previousTag,
    repo,
    serverUrl: env.GITHUB_SERVER_URL || 'https://github.com',
    runId,
    runNumber: env.GITHUB_RUN_NUMBER,
    runAttempt,
    sha: env.GITHUB_SHA,
    actor: env.GITHUB_TRIGGERING_ACTOR || env.GITHUB_ACTOR,
    dockerImage: env.DOCKER_IMAGE?.toLowerCase(), // GHCR exige un owner en minuscules
  },
});

const body = JSON.stringify(payload);
if (dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (!env.SYNCO_WEBHOOK_URL) {
  console.log('::warning::Secret SYNCO_WEBHOOK_URL absent : rapport Synco non envoyé');
  process.exit(0);
}

const headers = { 'Content-Type': 'application/json' };
if (env.SYNCO_WEBHOOK_SECRET) {
  // Signature sur horodatage (ms) + corps brut, exactement la chaîne envoyée.
  const ts = String(Date.now());
  const sig = createHmac('sha256', env.SYNCO_WEBHOOK_SECRET).update(ts + body).digest('hex');
  headers['X-Synco-Timestamp'] = ts;
  headers['X-Synco-Signature'] = `t=${ts},v1=${sig}`;
}

const res = await fetch(env.SYNCO_WEBHOOK_URL, { method: 'POST', headers, body });
if (!res.ok) {
  // Le corps d'erreur de synco_api ne contient pas l'adresse ; il aide à diagnostiquer (signature, quota…).
  console.log(`::error::Webhook Synco : HTTP ${res.status} ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}
console.log(`Rapport Synco envoyé (${status}).`);
