// ============================================
// Composable pour le partage d'agenda entre collègues
// (CalendarAccessGrant — demande/invitation, lecture seule ou modification)
// ============================================

import { ref, computed } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from './useToast';
import type {
  CalendarAccessGrantAsOwner,
  CalendarAccessGrantAsGrantee,
  CalendarAccessLevel,
  ListMyGrantsResponse,
  GrantResponse,
  ApiErrorResponse,
  MergedOccurrence
} from '@/types/agenda';

// Palette de couleurs par défaut proposées pour un nouveau calendrier partagé
// (réutilisée dans l'ordre, cycliquement, si l'utilisateur n'en choisit pas).
const DEFAULT_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444'];

const asOwner = ref<CalendarAccessGrantAsOwner[]>([]);
const asGrantee = ref<CalendarAccessGrantAsGrantee[]>([]);
const sharedOccurrences = ref<MergedOccurrence[]>([]);
const loading = ref(false);

// Demandes reçues sur MON agenda (quelqu'un demande à me lire/modifier) —
// c'est moi qui décide.
const incomingRequests = computed(() => asOwner.value.filter(g => g.status === 'PENDING' && g.initiatedBy === 'REQUESTER'));
// Invitations reçues à consulter/modifier l'agenda d'un tiers — c'est moi qui décide.
const incomingInvites = computed(() => asGrantee.value.filter(g => g.status === 'PENDING' && g.initiatedBy === 'OWNER'));
// Mes propres demandes/invitations envoyées, en attente de réponse de l'autre partie.
const outgoingRequests = computed(() => asGrantee.value.filter(g => g.status === 'PENDING' && g.initiatedBy === 'REQUESTER'));
const outgoingInvites = computed(() => asOwner.value.filter(g => g.status === 'PENDING' && g.initiatedBy === 'OWNER'));
const acceptedSharedCalendars = computed(() => asGrantee.value.filter(g => g.status === 'ACCEPTED'));

function hiddenKey(orgId: string): string {
  return `agenda-hidden-calendars:${orgId}`;
}

function getHiddenIds(orgId: string): Set<string> {
  try {
    const raw = localStorage.getItem(hiddenKey(orgId));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function isVisible(orgId: string, grantId: string): boolean {
  return !getHiddenIds(orgId).has(grantId);
}

function toggleVisibility(orgId: string, grantId: string): void {
  const hidden = getHiddenIds(orgId);
  if (hidden.has(grantId)) hidden.delete(grantId);
  else hidden.add(grantId);
  localStorage.setItem(hiddenKey(orgId), JSON.stringify([...hidden]));
}

function colorFor(grant: CalendarAccessGrantAsGrantee, index: number): string {
  return grant.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length] || DEFAULT_COLORS[0]!;
}

async function fetchGrants(orgId: string): Promise<void> {
  loading.value = true;
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/access`);
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors du chargement des accès à l'agenda");
    }
    const data: ListMyGrantsResponse = await res.json();
    asOwner.value = data.asOwner;
    asGrantee.value = data.asGrantee;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
  } finally {
    loading.value = false;
  }
}

async function requestAccess(orgId: string, ownerId: string, level: CalendarAccessLevel): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/access/request`, {
      method: 'POST',
      body: JSON.stringify({ ownerId, level })
    });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de la demande d'accès");
    }
    useToast().show('Demande envoyée', 'success');
    await fetchGrants(orgId);
    return true;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

async function inviteAccess(orgId: string, granteeId: string, level: CalendarAccessLevel): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/access/invite`, {
      method: 'POST',
      body: JSON.stringify({ granteeId, level })
    });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de l'invitation");
    }
    useToast().show('Invitation envoyée', 'success');
    await fetchGrants(orgId);
    return true;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

async function respondToGrant(orgId: string, grantId: string, action: 'ACCEPT' | 'DECLINE', level?: CalendarAccessLevel): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/access/${grantId}/respond`, {
      method: 'PATCH',
      body: JSON.stringify({ action, level })
    });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Erreur lors de la réponse');
    }
    const data: GrantResponse = await res.json();
    useToast().show(action === 'ACCEPT' ? 'Accès accordé' : 'Demande refusée', 'success');
    await fetchGrants(orgId);
    return data.grant.status === 'ACCEPTED';
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

async function revokeGrant(orgId: string, grantId: string): Promise<boolean> {
  // Capturé avant l'appel : une fois révoqué, le grant peut disparaître des
  // listes rechargées par fetchGrants, on ne pourrait plus retrouver son
  // ownerId pour purger sharedOccurrences.
  const ownerId = asGrantee.value.find(g => g.id === grantId)?.ownerId;
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/access/${grantId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors du retrait de l'accès");
    }
    useToast().show('Accès retiré', 'success');
    await fetchGrants(orgId);
    if (ownerId) sharedOccurrences.value = sharedOccurrences.value.filter(o => o.sourceOwnerId !== ownerId);
    return true;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

async function setColor(orgId: string, grantId: string, color: string): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/access/${grantId}/color`, {
      method: 'PATCH',
      body: JSON.stringify({ color })
    });
    if (!res.ok) return false;
    await fetchGrants(orgId);
    return true;
  } catch {
    return false;
  }
}

// Récupère et fusionne les occurrences de tous les calendriers partagés
// actuellement visibles (accès accepté + non masqué), taguées par calendrier
// source pour l'affichage superposé. N'affecte jamais l'agenda "moi" (voir
// useAgenda.ts::fetchRange, séparé).
async function fetchSharedOccurrences(orgId: string, from: string, to: string): Promise<void> {
  const visible = acceptedSharedCalendars.value.filter(g => isVisible(orgId, g.id));
  if (visible.length === 0) {
    sharedOccurrences.value = [];
    return;
  }

  const results = await Promise.all(visible.map(async (grant, index) => {
    try {
      const params = new URLSearchParams({ from, to, userId: grant.ownerId });
      const res = await sfetch(`/api/orgs/${orgId}/agenda/events?${params.toString()}`);
      if (!res.ok) return [];
      const data = await res.json();
      const color = colorFor(grant, index);
      return (data.occurrences || []).map((o: any) => ({ ...o, sourceOwnerId: grant.ownerId, sourceColor: color }));
    } catch {
      return [];
    }
  }));

  sharedOccurrences.value = results.flat();
}

function resetState(): void {
  asOwner.value = [];
  asGrantee.value = [];
  sharedOccurrences.value = [];
}

export function useCalendarAccess() {
  return {
    asOwner,
    asGrantee,
    sharedOccurrences,
    loading,
    incomingRequests,
    incomingInvites,
    outgoingRequests,
    outgoingInvites,
    acceptedSharedCalendars,

    fetchGrants,
    requestAccess,
    inviteAccess,
    respondToGrant,
    revokeGrant,
    setColor,
    fetchSharedOccurrences,

    isVisible,
    toggleVisibility,
    colorFor,

    resetState
  };
}
