// ============================================
// Composable pour les calendriers externes connectés — Google Calendar (sync
// bidirectionnelle OAuth), ou un flux ICS en lecture seule par lien ou par
// fichier uploadé — strictement personnel, même principe que
// useCalendarAccess.ts mais pour un compte/flux tiers plutôt qu'un collègue.
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

function formFields(label?: string | null, color?: string | null): Record<string, string> {
  const fields: Record<string, string> = {};
  if (label) fields.label = label;
  if (color) fields.color = color;
  return fields;
}

// Masquage d'un calendrier externe — préférence d'affichage purement locale
// (jamais envoyée au serveur), même mécanisme que
// useCalendarAccess.ts::isVisible/toggleVisibility pour les agendas partagés,
// mais sous une clé distincte (id de connexion, pas id de grant).
function hiddenKey(orgId: string): string {
  return `agenda-hidden-external-calendars:${orgId}`;
}

function getHiddenIds(orgId: string): Set<string> {
  try {
    const raw = localStorage.getItem(hiddenKey(orgId));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function isExternalCalendarVisible(orgId: string, connectionId: string): boolean {
  return !getHiddenIds(orgId).has(connectionId);
}

function toggleExternalCalendarVisibility(orgId: string, connectionId: string): void {
  const hidden = getHiddenIds(orgId);
  if (hidden.has(connectionId)) hidden.delete(connectionId);
  else hidden.add(connectionId);
  localStorage.setItem(hiddenKey(orgId), JSON.stringify([...hidden]));
}

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

async function addIcsUrl(orgId: string, url: string, label?: string | null, color?: string | null): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/external/ics/url`, {
      method: 'POST',
      body: JSON.stringify({ url, label: label || undefined, color: color || undefined })
    });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de l'ajout du calendrier");
    }
    const connection: ExternalCalendarConnectionSummary = await res.json();
    connections.value = [...connections.value, connection];
    useToast().show('Calendrier ajouté', 'success');
    return true;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

async function updateIcsUrl(orgId: string, connectionId: string, url: string, label?: string | null, color?: string | null): Promise<boolean> {
  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/external/connections/${connectionId}/ics-url`, {
      method: 'PATCH',
      body: JSON.stringify({ url, label: label || undefined, color: color || undefined })
    });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Erreur lors de la mise à jour du lien');
    }
    const connection: ExternalCalendarConnectionSummary = await res.json();
    connections.value = connections.value.map(c => c.id === connectionId ? connection : c);
    useToast().show('Lien mis à jour', 'success');
    return true;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

async function addIcsFile(orgId: string, file: File, label?: string | null, color?: string | null): Promise<boolean> {
  try {
    const body = new FormData();
    body.append('icsFile', file);
    for (const [k, v] of Object.entries(formFields(label, color))) body.append(k, v);

    const res = await sfetch(`/api/orgs/${orgId}/agenda/external/ics/upload`, { method: 'POST', body });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de l'import du fichier");
    }
    const connection: ExternalCalendarConnectionSummary = await res.json();
    connections.value = [...connections.value, connection];
    useToast().show('Calendrier importé', 'success');
    return true;
  } catch (err: any) {
    useToast().show(err.message || 'Erreur inconnue', 'error');
    return false;
  }
}

async function replaceIcsFile(orgId: string, connectionId: string, file: File): Promise<boolean> {
  try {
    const body = new FormData();
    body.append('icsFile', file);

    const res = await sfetch(`/api/orgs/${orgId}/agenda/external/connections/${connectionId}/replace-file`, { method: 'POST', body });
    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Erreur lors du remplacement du fichier');
    }
    const connection: ExternalCalendarConnectionSummary = await res.json();
    connections.value = connections.value.map(c => c.id === connectionId ? connection : c);
    useToast().show('Fichier remplacé', 'success');
    return true;
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
    addIcsUrl,
    addIcsFile,
    updateIcsUrl,
    replaceIcsFile,
    syncNow,
    disconnect,

    isExternalCalendarVisible,
    toggleExternalCalendarVisibility,

    resetState
  };
}
