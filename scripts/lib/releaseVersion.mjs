// Calcul de la prochaine version de l'app à partir des commits arrivés sur main (release_main.yml).
// Logique pure, sans git : testée par scripts/lib/releaseVersion.test.mjs.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

// Plafonds imposés par le MSI Windows (WiX) : major/minor ≤ 255, patch ≤ 65535, pas de suffixe.
const MSI_MAX = [255, 255, 65535];

export const BUMPS = ['patch', 'minor', 'major'];

export function parseVersion(raw) {
  const m = SEMVER.exec(String(raw ?? '').trim().replace(/^v/, ''));
  if (!m) throw new Error(`Version invalide : « ${raw} » (attendu X.Y.Z)`);
  return m.slice(1).map(Number);
}

/**
 * Niveau de bump d'un commit (sujet + corps).
 *  - major : `type!:` / `type(scope)!:` ou `BREAKING CHANGE` dans le corps
 *  - minor : `feat:` / `feat(scope):`, ou merge d'une branche feat/… ou feature/…
 *  - patch : tout le reste (fix, refactor, commits libres, merges de recipe/main…)
 */
export function classifyCommit(subject, body = '') {
  const s = String(subject ?? '').trim();
  if (/^\w+(\([^)]*\))?!:/.test(s) || /^BREAKING[ -]CHANGE:/m.test(body)) return 'major';
  if (/^feat(\([^)]*\))?:/i.test(s)) return 'minor';
  // « Merge pull request #73 from SilverCore-Git/feat/e2ee-v4 », « Merge branch 'feature/x' into … »
  if (/^Merge (pull request #\d+ from [^/\s]+\/|branch ')(feat|feature)\//i.test(s)) return 'minor';
  return 'patch';
}

/** Le bump le plus fort de la liste de commits ({ subject, body }). Aucun commit → patch. */
export function bumpFromCommits(commits) {
  let level = 0;
  for (const c of commits) level = Math.max(level, BUMPS.indexOf(classifyCommit(c.subject, c.body)));
  return BUMPS[level];
}

export function bumpVersion(current, bump) {
  const [major, minor, patch] = parseVersion(current);
  const next =
    bump === 'major' ? [major + 1, 0, 0]
    : bump === 'minor' ? [major, minor + 1, 0]
    : bump === 'patch' ? [major, minor, patch + 1]
    : null;
  if (!next) throw new Error(`Bump inconnu : « ${bump} » (patch | minor | major)`);
  next.forEach((n, i) => {
    if (n > MSI_MAX[i]) throw new Error(`Version ${next.join('.')} hors des limites du MSI (${MSI_MAX.join('.')})`);
  });
  return next.join('.');
}
