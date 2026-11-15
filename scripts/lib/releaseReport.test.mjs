// node --test scripts/lib/releaseReport.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, buildReport, formatDuration } from './releaseReport.mjs';

const ctx = {
  tag: 'v1.4.0', version: '1.4.0', previousTag: 'v1.3.2', repo: 'SilverCore-Git/synco_app',
  serverUrl: 'https://github.com', runId: '42', runNumber: '7', runAttempt: 1, sha: 'abcdef1234567890',
  actor: 'moi', dockerImage: 'ghcr.io/silvercore-git/synco_app:latest', now: new Date('2026-11-15T10:00:00Z'),
};
const needsWith = (overrides = {}) =>
  Object.fromEntries(STAGES.map((s) => [s.key, { result: overrides[s.key] ?? 'success' }]));

test('formatDuration', () => {
  assert.equal(formatDuration(42_000), '42 s');
  assert.equal(formatDuration(252_000), '4 min 12 s');
  assert.equal(formatDuration(3_900_000), '1 h 05');
  assert.equal(formatDuration(NaN), '');
});

test('tout réussi : vert, lien vers la release, téléchargements, changements', () => {
  const release = {
    html_url: 'https://github.com/SilverCore-Git/synco_app/releases/tag/v1.4.0',
    assets: [
      { name: 'synco_1.4.0_x64.msi', size: 80 * 1024 ** 2, browser_download_url: 'https://x/msi' },
      { name: 'synco_1.4.0_x64.msi.sig', size: 400, browser_download_url: 'https://x/sig' },
      { name: 'synco-android-debug.apk', size: 30 * 1024 ** 2, browser_download_url: 'https://x/apk' },
    ],
  };
  const jobs = [{ name: STAGES[1].jobName, started_at: '2026-11-15T09:00:00Z', completed_at: '2026-11-15T09:04:12Z', steps: [] }];
  const { status, payload } = buildReport({ needs: needsWith(), jobs, release, commits: ['feat: x <y>', 'fix: z'], ctx });
  const embed = payload.embeds[0];
  assert.equal(status, 'success');
  assert.equal(embed.color, '#22c55e');
  assert.equal(embed.url, release.html_url);
  assert.match(embed.title, /v1\.4\.0 est disponible/);
  const field = (name) => embed.fields.find((f) => f.name.startsWith(name));
  assert.equal(field('Windows').value, '✅ Réussi · 4 min 12 s');
  assert.match(field('Image Docker').value, /ghcr\.io/);
  assert.equal(field('Téléchargements').value, '[Windows](https://x/msi) · 80 Mo\n[Android](https://x/apk) · 30 Mo');
  assert.equal(field('Changements').name, 'Changements depuis v1.3.2 (2)');
  assert.equal(field('Changements').value, '• feat: x ‹y›\n• fix: z');
  assert.match(field('Liens').value, /\[Release v1\.4\.0\]/);
});

test('échec d\'un build PC : orange, étape fautive, impact sur la mise à jour auto', () => {
  const jobs = [{
    name: STAGES[3].jobName, started_at: '2026-11-15T09:00:00Z', completed_at: '2026-11-15T09:01:00Z',
    steps: [{ name: 'Checkout du code', conclusion: 'success' }, { name: 'Build du .app et du DMG', conclusion: 'failure' }],
  }];
  const needs = needsWith({ 'build-macos-dmg': 'failure', 'publish-updater': 'skipped' });
  const { status, payload } = buildReport({ needs, jobs, ctx });
  const embed = payload.embeds[0];
  assert.equal(status, 'partial');
  assert.equal(embed.color, '#f59e0b');
  assert.match(embed.description, /reste en pré-release/);
  assert.equal(embed.fields.find((f) => f.name.startsWith('macOS')).value, '❌ Échec à « Build du .app et du DMG » · 1 min 00 s');
  assert.match(embed.fields.find((f) => f.name.startsWith('Mise à jour')).value, /Non lancé/);
});

test('échec de la création de release : rouge, lien vers les logs', () => {
  const needs = needsWith({
    'create-release': 'failure', 'build-windows-msi': 'skipped', 'build-linux-appimage': 'skipped',
    'build-macos-dmg': 'skipped', 'publish-updater': 'skipped', 'build-android-apk': 'skipped',
  });
  const { status, payload } = buildReport({ needs, ctx: { ...ctx, tag: '' } });
  const embed = payload.embeds[0];
  assert.equal(status, 'failure');
  assert.equal(embed.url, 'https://github.com/SilverCore-Git/synco_app/actions/runs/42');
  assert.match(embed.description, /Docker du front a tout de même été poussée/);
  assert.doesNotMatch(embed.fields.at(-1).value, /Release/);
});

test('respecte les limites du schéma synco_api', () => {
  const commits = Array.from({ length: 40 }, (_, i) => `feat: ${'x'.repeat(200)} ${i}`);
  const { payload } = buildReport({ needs: needsWith(), commits, ctx });
  for (const f of payload.embeds[0].fields) {
    assert.ok(f.name.length >= 1 && f.name.length <= 256);
    assert.ok(f.value.length >= 1 && f.value.length <= 1024);
  }
  assert.match(payload.embeds[0].fields.find((f) => f.name.startsWith('Changements')).value, /… et 30 autre\(s\)/);
});
