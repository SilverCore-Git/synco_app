// Construction du rapport de release posté sur Synco (scripts/release-report.mjs, job report de
// release_main.yml). Fonctions pures : aucune I/O, testées par releaseReport.test.mjs.
//
// Le message suit le format webhook Discord accepté par synco_api (doc/08-webhooks.md) : un `content`
// d'une ligne (aperçu des notifications) et une carte enrichie avec un champ par job.

// Clé = id du job dans release_main.yml (clé de `needs`) ; jobName = son `name:`, qui est ce que renvoie
// l'API des jobs GitHub. Un renommage côté workflow ne casse pas le rapport : on perd seulement la durée
// et l'étape fautive du job concerné, son résultat restant lu dans `needs`.
export const STAGES = [
  { key: 'create-release', label: 'Version et release GitHub', jobName: 'Version et création de la release GitHub' },
  { key: 'build-windows-msi', label: 'Windows (MSI)', jobName: "Build de l'installeur Windows (MSI)" },
  { key: 'build-linux-appimage', label: 'Linux (AppImage)', jobName: "Build de l'AppImage Linux" },
  { key: 'build-macos-dmg', label: 'macOS (DMG universel)', jobName: 'Build du DMG macOS (universel Apple Silicon + Intel)' },
  { key: 'publish-updater', label: 'Mise à jour auto des apps PC', jobName: 'Publication de la mise à jour (latest.json)' },
  { key: 'build-android-apk', label: 'Android (APK)', jobName: 'Build Android APK (debug)' },
  { key: 'build-docker-image', label: 'Image Docker (front web)', jobName: "Build et push de l'image Docker (front, prod)" },
];

const COLORS = { success: '#22c55e', partial: '#f59e0b', failure: '#ef4444', cancelled: '#6b7280' };

const DOWNLOADS = [
  { label: 'Windows', match: (n) => n.endsWith('.msi') },
  { label: 'Linux', match: (n) => n.endsWith('.AppImage') },
  { label: 'macOS', match: (n) => n.endsWith('.dmg') },
  { label: 'Android', match: (n) => n.endsWith('.apk') },
];

const MAX_COMMITS = 10;

// synco_api retire tout ce qui ressemble à une balise (<…>) : on neutralise les chevrons plutôt que
// de perdre du texte, et on borne la longueur.
function clean(text, max) {
  const s = String(text ?? '').replace(/</g, '‹').replace(/>/g, '›').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h} h ${String(m).padStart(2, '0')}`;
  if (m) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} Go` : `${Math.round(bytes / 1024 ** 2)} Mo`;
}

/**
 * @param {object} input
 * @param {Record<string, {result: string}>} input.needs   toJSON(needs) du job report
 * @param {Array<object>} [input.jobs]     jobs du run (API GitHub), pour les durées et l'étape en échec
 * @param {object|null} [input.release]    release GitHub (html_url, assets[], prerelease)
 * @param {Array<string>} [input.commits]  sujets des commits depuis la release précédente
 * @param {object} input.ctx  { tag, version, previousTag, repo, serverUrl, runId, runNumber, runAttempt,
 *                              sha, actor, dockerImage, now }
 */
export function buildReport({ needs, jobs = [], release = null, commits = [], ctx }) {
  const results = Object.fromEntries(STAGES.map((s) => [s.key, needs?.[s.key]?.result ?? 'skipped']));
  const failed = STAGES.filter((s) => results[s.key] === 'failure');
  const cancelled = STAGES.filter((s) => results[s.key] === 'cancelled');
  const allOk = STAGES.every((s) => results[s.key] === 'success');

  const runUrl = `${ctx.serverUrl}/${ctx.repo}/actions/runs/${ctx.runId}${ctx.runAttempt > 1 ? `/attempts/${ctx.runAttempt}` : ''}`;
  const releaseUrl = release?.html_url || (ctx.tag ? `${ctx.serverUrl}/${ctx.repo}/releases/tag/${ctx.tag}` : '');
  const name = ctx.tag ? `Synco ${ctx.tag}` : 'Synco';

  let status, title, summary;
  if (allOk) {
    status = 'success';
    title = `✅ ${name} est disponible`;
    summary = 'Toutes les étapes sont passées : les apps PC reçoivent la mise à jour automatique, l\'APK Android et l\'image Docker du front sont prêts.';
  } else if (results['create-release'] !== 'success') {
    status = results['create-release'] === 'cancelled' ? 'cancelled' : 'failure';
    title = status === 'cancelled' ? '⏹️ Release Synco annulée' : '❌ Release Synco échouée';
    summary = 'La version n\'a pas pu être créée : aucun build desktop ni Android n\'a été publié.';
    if (results['build-docker-image'] === 'success') summary += ' L\'image Docker du front a tout de même été poussée.';
  } else if (!failed.length && cancelled.length) {
    status = 'cancelled';
    title = `⏹️ ${name} — release annulée`;
    summary = 'Le workflow a été annulé avant la fin.';
  } else {
    status = 'partial';
    title = `⚠️ ${name} — release incomplète`;
    summary = `${failed.length || cancelled.length} étape(s) en échec.`;
  }

  // Ce que l'échec change concrètement, pour qui ne lit pas les logs.
  const impacts = [];
  if (status !== 'success' && results['create-release'] === 'success') {
    if (results['publish-updater'] !== 'success') {
      impacts.push('Les apps PC ne reçoivent **pas** la mise à jour : la release reste en pré-release.');
    }
    if (results['build-android-apk'] !== 'success') impacts.push('Pas d\'APK Android pour cette version.');
    if (results['build-docker-image'] !== 'success') impacts.push('L\'image Docker n\'a pas été poussée : le front web reste sur la version précédente.');
  }

  const jobByName = new Map(jobs.map((j) => [j.name, j]));
  const fields = STAGES.map((stage) => ({
    name: stage.label,
    value: clean(stageLine(stage, results[stage.key], jobByName.get(stage.jobName), ctx), 1024),
    inline: true,
  }));

  const downloads = (release?.assets ?? []).length
    ? DOWNLOADS.flatMap(({ label, match }) => {
        const asset = release.assets.find((a) => match(a.name));
        if (!asset) return [];
        const size = formatSize(asset.size);
        return [`[${label}](${asset.browser_download_url})${size ? ` · ${size}` : ''}`];
      })
    : [];
  if (downloads.length) fields.push({ name: 'Téléchargements', value: downloads.join('\n'), inline: false });

  if (commits.length) {
    const shown = commits.slice(0, MAX_COMMITS).map((c) => `• ${clean(c, 90)}`);
    if (commits.length > MAX_COMMITS) shown.push(`… et ${commits.length - MAX_COMMITS} autre(s)`);
    const since = ctx.previousTag ? ` depuis ${ctx.previousTag}` : '';
    fields.push({ name: `Changements${since} (${commits.length})`, value: clean(shown.join('\n'), 1024), inline: false });
  }

  const links = [];
  if (releaseUrl && results['create-release'] === 'success') links.push(`[Release ${ctx.tag}](${releaseUrl})`);
  links.push(`[Logs du workflow](${runUrl})`);
  if (ctx.sha) links.push(`[Commit ${ctx.sha.slice(0, 7)}](${ctx.serverUrl}/${ctx.repo}/commit/${ctx.sha})`);
  fields.push({ name: 'Liens', value: links.join(' · '), inline: false });

  const description = [summary, ...impacts.map((i) => `• ${i}`)].join('\n');
  const content = {
    success: `Nouvelle version ${name} publiée.`,
    partial: `${name} : release incomplète, ${failed.length || cancelled.length} étape(s) en échec.`,
    failure: 'La release Synco a échoué.',
    cancelled: 'La release Synco a été annulée.',
  }[status];

  return {
    status,
    payload: {
      content,
      embeds: [{
        title: clean(title, 256),
        url: results['create-release'] === 'success' && releaseUrl ? releaseUrl : runUrl,
        description: clean(description, 4096),
        color: COLORS[status],
        fields,
        footer: { text: clean(`${ctx.repo} · run #${ctx.runNumber}${ctx.actor ? ` · lancé par ${ctx.actor}` : ''}`, 2048) },
        timestamp: (ctx.now ?? new Date()).toISOString(),
      }],
    },
  };
}

function stageLine(stage, result, job, ctx) {
  const duration = job?.started_at && job?.completed_at
    ? formatDuration(Date.parse(job.completed_at) - Date.parse(job.started_at))
    : '';
  const withDuration = (text) => (duration ? `${text} · ${duration}` : text);

  switch (result) {
    case 'success':
      if (stage.key === 'build-docker-image' && ctx.dockerImage) return withDuration(`✅ Poussée\n\`${ctx.dockerImage}\``);
      return withDuration('✅ Réussi');
    case 'failure': {
      const step = job?.steps?.find((s) => s.conclusion === 'failure');
      return withDuration(step ? `❌ Échec à « ${step.name} »` : '❌ Échec');
    }
    case 'cancelled':
      return withDuration('⏹️ Annulé');
    default:
      return '⏭️ Non lancé (une étape précédente a échoué)';
  }
}
