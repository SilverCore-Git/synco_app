// ============================================
// Composable pour le lien d'abonnement iCal en lecture seule de MON propre
// agenda (distinct de useExternalCalendars.ts, qui gère la connexion OAuth
// Google dans l'autre sens — importer un agenda externe).
// ============================================

import { ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from './useToast';
import type { AgendaFeedTokenStatus, ApiErrorResponse } from '@/types/agenda';

const status = ref<AgendaFeedTokenStatus>({ active: false, url: null, lastAccessedAt: null });
const loading = ref(false);

async function fetchStatus(orgId: string): Promise<void> {
  loading.value = true;
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/feed-token`);
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Erreur lors du chargement du lien de partage');
    }
    status.value = (await res.json()) as AgendaFeedTokenStatus;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
  } finally {
    loading.value = false;
  }
}

async function regenerate(orgId: string): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/feed-token/regenerate`, { method: 'POST' });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Échec de la génération du lien');
    }
    status.value = (await res.json()) as AgendaFeedTokenStatus;
    useToast().show('Lien de partage généré', 'success');
    return true;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

async function disable(orgId: string): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/feed-token`, { method: 'DELETE' });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Échec de la désactivation du lien');
    }
    status.value = { active: false, url: null, lastAccessedAt: null };
    useToast().show('Partage désactivé', 'success');
    return true;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

export function useAgendaFeed() {
  return {
    status,
    loading,
    fetchStatus,
    regenerate,
    disable
  };
}
