import type { Router } from 'vue-router';
import { openedOrg } from '@/assets/var';

/**
 * Navigue vers l'entité visée par un chip <#:id>/<task:id>/<file:id>.
 * Réutilise les routes existantes (SpaceThreadView/OrgThreadHome pour les
 * salons, ?select= déjà géré par TasksSpace/TasksGlobal/SpaceFiles pour les
 * tâches et fichiers) — aucune nouvelle route pour les salons/tâches.
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
      if (ref.spaceId) {
        router.push({ name: 'SpaceFiles', params: { orgId, spaceId: ref.spaceId }, query: { select: ref.id } });
      }
      break;
  }
};
