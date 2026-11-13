// node --test scripts/lib/releaseVersion.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpFromCommits, bumpVersion, classifyCommit } from './releaseVersion.mjs';

test('classifyCommit', () => {
  assert.equal(classifyCommit('fix(ws): socket sans schéma'), 'patch');
  assert.equal(classifyCommit('Tâche : le space se change depuis la fenêtre'), 'patch');
  assert.equal(classifyCommit('feat(stats): page Statistiques'), 'minor');
  assert.equal(classifyCommit('feat: nouvel écran'), 'minor');
  assert.equal(classifyCommit('Merge pull request #73 from SilverCore-Git/feat/e2ee-v4'), 'minor');
  assert.equal(classifyCommit('Merge pull request #67 from SilverCore-Git/feature/sav'), 'minor');
  assert.equal(classifyCommit("Merge branch 'feature/fc4-key-signing' into pentest/011026"), 'minor');
  assert.equal(classifyCommit('Merge pull request #75 from SilverCore-Git/recipe/main'), 'patch');
  assert.equal(classifyCommit('Merge pull request #64 from SilverCore-Git/fix/vocal-thread'), 'patch');
  assert.equal(classifyCommit('refactor(api)!: nouveau format'), 'major');
  assert.equal(classifyCommit('fix: x', 'détail\n\nBREAKING CHANGE: plus de v3'), 'major');
  assert.equal(classifyCommit('featuring: pas une feature'), 'patch');
});

test('bumpFromCommits prend le niveau le plus fort', () => {
  assert.equal(bumpFromCommits([]), 'patch');
  assert.equal(bumpFromCommits([{ subject: 'fix: a' }, { subject: 'feat(x): b' }, { subject: 'fix: c' }]), 'minor');
  assert.equal(bumpFromCommits([{ subject: 'feat: a' }, { subject: 'chore!: b' }]), 'major');
});

test('bumpVersion', () => {
  assert.equal(bumpVersion('1.0.0', 'patch'), '1.0.1');
  assert.equal(bumpVersion('v1.0.7', 'minor'), '1.1.0');
  assert.equal(bumpVersion('1.4.2', 'major'), '2.0.0');
  assert.throws(() => bumpVersion('1.255.0', 'minor'), /MSI/);
  assert.throws(() => bumpVersion('1.0.0-dev.3', 'patch'), /invalide/);
  assert.throws(() => bumpVersion('1.0.0', 'auto'), /Bump inconnu/);
});
