import type { Router } from 'vue-router';
import { openedOrg } from '@/assets/var';

/**
 * Ouvre le gestionnaire de fichiers de l'espace à l'emplacement exact du
 * fichier (son dossier), et le met en surbrillance (?reveal=, cf.
 * SpaceFiles.vue).
 */
export const revealFileInFiles = (router: Router, file: { id: string; spaceId: string }): void => {
  const orgId = openedOrg.value?.id;
  if (!orgId) return;
  router.push({ name: 'SpaceFiles', params: { orgId, spaceId: file.spaceId }, query: { showView: '1', reveal: file.id } });
};

/**
 * Navigue vers l'entité visée par un chip <#:id>/<task:id>/<file:id>.
 * Réutilise les routes existantes (SpaceThreadView/OrgThreadHome pour les
 * salons, ?select= de TasksSpace/TasksGlobal pour les tâches) ; un fichier
 * ouvre son emplacement dans le gestionnaire de fichiers.
 */
export const navigateToReference = (
  router: Router,
  ref: { kind: 'thread' | 'task' | 'file'; id: string; spaceId?: string }
): void => {
  const orgId = openedOrg.value?.id;
  if (!orgId) return;

  switch (ref.kind) {
    case 'thread':
      if (ref.spaceId) {
        router.push({ name: 'SpaceThreadView', params: { orgId, spaceId: ref.spaceId, threadId: ref.id } });
      } else {
        router.push({ name: 'OrgThreadHome', params: { orgId, threadId: ref.id } });
      }
      break;
    case 'task':
      if (ref.spaceId) {
        router.push({ name: 'TasksSpace', params: { orgId, spaceId: ref.spaceId }, query: { select: ref.id } });
      } else {
        router.push({ name: 'TasksGlobal', params: { orgId }, query: { select: ref.id } });
      }
      break;
    case 'file':
      if (ref.spaceId) revealFileInFiles(router, { id: ref.id, spaceId: ref.spaceId });
      break;
  }
};
