// ============================================
// Composable pour les calendriers externes connectés (Google Calendar, sync
// bidirectionnelle OAuth) — strictement personnel, même principe que
// useCalendarAccess.ts mais pour un compte tiers plutôt qu'un collègue.
// ============================================

import { ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from './useToast';
import type {
  ExternalCalendarConnectionSummary,
  ListExternalConnectionsResponse,
  GoogleAuthUrlResponse,
  ExternalConnectionActionResponse,
  ApiErrorResponse
} from '@/types/agenda';

const connections = ref<ExternalCalendarConnectionSummary[]>([]);
const loading = ref(false);

async function fetchConnections(orgId: string): Promise<void> {
  loading.value = true;
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/external/connections`);
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Erreur lors du chargement des calendriers externes');
    }
    connections.value = (await res.json()) as ListExternalConnectionsResponse;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
  } finally {
    loading.value = false;
  }
}

// Redirection pleine page vers l'écran de consentement Google — un OAuth flow
// ne peut pas se faire en fetch/AJAX, il doit se dérouler dans le contexte de
// navigation top-level du navigateur.
async function connectGoogle(orgId: string): Promise<void> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/external/google/auth-url`, { method: 'POST' });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Impossible de démarrer la connexion à Google Calendar');
    }
    const data: GoogleAuthUrlResponse = await res.json();
    window.location.href = data.url;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
  }
}

async function syncNow(orgId: string, connectionId: string): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/external/connections/${connectionId}/sync`, { method: 'POST' });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Échec de la synchronisation');
    }
    const data: ExternalConnectionActionResponse = await res.json();
    useToast().show('Synchronisation lancée', 'success');
    await fetchConnections(orgId);
    return !!data.connectionId;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

async function disconnect(orgId: string, connectionId: string): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/external/connections/${connectionId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Échec de la déconnexion');
    }
    useToast().show('Calendrier déconnecté', 'success');
    connections.value = connections.value.filter(c => c.id !== connectionId);
    return true;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

function resetState(): void {
  connections.value = [];
}

export function useExternalCalendars() {
  return {
    connections,
    loading,

    fetchConnections,
    connectGoogle,
    syncNow,
    disconnect,

    resetState
  };
}
