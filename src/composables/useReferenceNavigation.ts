import type { Router } from 'vue-router';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { TransferOrigin } from '@/composables/useShareReference';

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
 * Navigue vers l'entité visée par un chip <#:id>/<task:id>/<file:id>/<folder:id>.
 * Réutilise les routes existantes (SpaceThreadView/OrgThreadHome pour les
 * salons, ?select= de TasksSpace/TasksGlobal pour les tâches) ; un fichier
 * ouvre son emplacement dans le gestionnaire de fichiers, un dossier s'ouvre
 * directement (?folderId=, voir SpaceFiles.vue::handleRouteQuery).
 */
export const navigateToReference = (
  router: Router,
  ref: { kind: 'thread' | 'task' | 'file' | 'folder'; id: string; spaceId?: string }
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
    case 'folder':
      if (ref.spaceId) {
        router.push({ name: 'SpaceFiles', params: { orgId, spaceId: ref.spaceId }, query: { showView: '1', folderId: ref.id } });
      }
      break;
  }
};

/**
 * Navigue vers l'original d'un message transféré (bouton "Voir l'original",
 * cf. ChatMessage.vue/ThreadMessage.vue). Résolu PAR LECTEUR (pas par
 * l'émetteur qui a construit le pointeur à l'envoi) via
 * GET /api/messages/transfer-origin — un pointeur valide à l'envoi peut ne
 * plus l'être pour ce lecteur précis (salon privé, DM dont il n'est pas
 * participant), d'où ce aller-retour plutôt qu'une navigation optimiste.
 * N'affiche rien en cas d'échec (bouton silencieusement inopérant) : il n'y
 * a pas de place pour un message d'erreur depuis un simple lien de citation.
 */
export const navigateToTransferOrigin = async (router: Router, origin: TransferOrigin): Promise<void> => {
  const orgId = openedOrg.value?.id;
  if (!orgId) return;

  try {
    const res = await sfetch(`/api/messages/transfer-origin?kind=${origin.kind}&id=${encodeURIComponent(origin.id)}`);
    if (!res.ok) return;
    const { nav } = await res.json();

    if (nav.kind === 'thread') {
      if (nav.spaceId) {
        router.push({ name: 'SpaceThreadView', params: { orgId, spaceId: nav.spaceId, threadId: nav.threadId }, query: { select: nav.messageId } });
      } else {
        router.push({ name: 'OrgThreadHome', params: { orgId, threadId: nav.threadId }, query: { select: nav.messageId } });
      }
      return;
    }

    // La route de DM attend l'OrgMember.id du pair, pas son User.id (voir
    // ChatView.vue::recipient) — /transfer-origin renvoie un User.id brut
    // (DMMessage.senderId/recipientId), à remapper ici.
    const peerMemberId = openedOrg.value?.members?.find(m => m.user?.id === nav.peerId)?.id;
    if (peerMemberId) {
      router.push({ name: 'OrgThreadChat', params: { orgId, userId: peerMemberId }, query: { select: nav.messageId } });
    }
  } catch (err) {
    console.error('[navigateToTransferOrigin] failed:', err);
  }
};
