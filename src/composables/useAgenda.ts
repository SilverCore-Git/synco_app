// ============================================
// Composable pour la gestion de l'Agenda
// ============================================

import { ref, computed } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from './useToast';
import { user } from '@/assets/var';
import type {
  CalendarEvent,
  CalendarEventWithDetails,
  OccurrenceInstance,
  EventAttendee,
  EventReminder,
  ReminderWithEvent,
  RsvpStatus,
  CreateEventDTO,
  UpdateEventDTO,
  UpdateOccurrenceDTO,
  ApiErrorResponse,
  ListOccurrencesResponse,
  CreateEventResponse,
  GetEventResponse,
  UpdateEventResponse,
  UpdateOccurrenceResponse,
  AddAttendeesResponse,
  RsvpResponse,
  AddReminderResponse,
  ListMyRemindersResponse
} from '@/types/agenda';

// ============================================
// State principal
// ============================================

const occurrences = ref<OccurrenceInstance[]>([]);
const currentEvent = ref<CalendarEventWithDetails | null>(null);
const myReminders = ref<ReminderWithEvent[]>([]);
const loading = ref<boolean>(false);
const error = ref<string | null>(null);

// Agenda affiché : soi-même par défaut, ou un membre dirigé (cascade Équipes).
// `null` = "moi" (résolu dynamiquement via `user`, jamais figé au chargement du module).
const viewingUserId = ref<string | null>(null);

const isViewingSelf = computed(() => !viewingUserId.value || viewingUserId.value === user.value?.id);

// ============================================
// Fonctions utilitaires internes
// ============================================

function buildOccurrencePath(eventId: string, occurrenceStartAt: string): string {
  return `/agenda/events/${eventId}/occurrences/${encodeURIComponent(occurrenceStartAt)}`;
}

// ============================================
// Fonctions API — Événements
// ============================================

/**
 * Récupère les occurrences dans une plage de dates, pour soi ou (via le
 * cascade Équipes) pour un membre dirigé.
 */
async function fetchRange(orgId: string, from: string, to: string, userId?: string): Promise<OccurrenceInstance[] | null> {
  loading.value = true;
  error.value = null;

  try {
    const targetUserId = userId ?? viewingUserId.value ?? undefined;
    const params = new URLSearchParams({ from, to });
    if (targetUserId) params.set('userId', targetUserId);

    const res = await sfetch(`/api/orgs/${orgId}/agenda/events?${params.toString()}`);

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Erreur lors de la récupération des événements');
    }

    const data: ListOccurrencesResponse = await res.json();
    occurrences.value = data.occurrences;
    return data.occurrences;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement de l'agenda: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Crée un événement (ponctuel ou récurrent, avec invités éventuels)
 */
async function createEvent(orgId: string, dto: CreateEventDTO): Promise<CalendarEvent | null> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/events`, {
      method: 'POST',
      body: JSON.stringify(dto)
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de la création de l'événement");
    }

    const data: CreateEventResponse = await res.json();

    const toast = useToast();
    toast.show('Événement créé avec succès', 'success');

    return data.event;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la création: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Récupère le détail complet d'un événement (invités + mes rappels)
 */
async function getEvent(orgId: string, eventId: string): Promise<CalendarEventWithDetails | null> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/events/${eventId}`);

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de la récupération de l'événement");
    }

    const data: GetEventResponse = await res.json();
    currentEvent.value = data.event;
    return data.event;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Édite toute la série d'un événement (ou un événement ponctuel)
 */
async function updateEvent(orgId: string, eventId: string, dto: UpdateEventDTO): Promise<CalendarEvent | null> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto)
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de la mise à jour de l'événement");
    }

    const data: UpdateEventResponse = await res.json();

    const toast = useToast();
    toast.show('Événement mis à jour avec succès', 'success');

    return data.event;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la mise à jour: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Supprime toute la série d'un événement (ou un événement ponctuel)
 */
async function deleteEvent(orgId: string, eventId: string): Promise<boolean> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/events/${eventId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de la suppression de l'événement");
    }

    occurrences.value = occurrences.value.filter(o => o.eventId !== eventId);
    if (currentEvent.value?.id === eventId) currentEvent.value = null;

    const toast = useToast();
    toast.show('Événement supprimé avec succès', 'success');

    return true;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la suppression: ${error.value}`, 'error');
    return false;
  } finally {
    loading.value = false;
  }
}

/**
 * Édite une occurrence isolée d'une série récurrente
 */
async function updateOccurrence(orgId: string, eventId: string, occurrenceStartAt: string, dto: UpdateOccurrenceDTO): Promise<CalendarEvent | null> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}${buildOccurrencePath(eventId, occurrenceStartAt)}`, {
      method: 'PATCH',
      body: JSON.stringify(dto)
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de la mise à jour de l'occurrence");
    }

    const data: UpdateOccurrenceResponse = await res.json();

    const toast = useToast();
    toast.show('Occurrence mise à jour avec succès', 'success');

    return data.event;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la mise à jour: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Annule une occurrence isolée d'une série récurrente
 */
async function cancelOccurrence(orgId: string, eventId: string, occurrenceStartAt: string): Promise<boolean> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}${buildOccurrencePath(eventId, occurrenceStartAt)}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de l'annulation de l'occurrence");
    }

    occurrences.value = occurrences.value.filter(
      o => !(o.eventId === eventId && o.startAt === occurrenceStartAt)
    );

    const toast = useToast();
    toast.show('Occurrence annulée avec succès', 'success');

    return true;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de l'annulation: ${error.value}`, 'error');
    return false;
  } finally {
    loading.value = false;
  }
}

// ============================================
// Fonctions API — Invités / RSVP
// ============================================

/**
 * Ajoute des invités à un événement
 */
async function addAttendees(orgId: string, eventId: string, userIds: string[]): Promise<EventAttendee[] | null> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/events/${eventId}/attendees`, {
      method: 'POST',
      body: JSON.stringify({ userIds })
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de l'ajout des invités");
    }

    const data: AddAttendeesResponse = await res.json();

    const toast = useToast();
    toast.show('Invités ajoutés avec succès', 'success');

    return data.attendees;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de l'ajout: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Retire un invité d'un événement
 */
async function removeAttendee(orgId: string, eventId: string, userId: string): Promise<boolean> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/events/${eventId}/attendees/${userId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors du retrait de l'invité");
    }

    const toast = useToast();
    toast.show('Invité retiré avec succès', 'success');

    return true;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du retrait: ${error.value}`, 'error');
    return false;
  } finally {
    loading.value = false;
  }
}

/**
 * Répond à une invitation (soi-même uniquement)
 */
async function respondToInvite(orgId: string, eventId: string, status: RsvpStatus): Promise<EventAttendee | null> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/events/${eventId}/rsvp`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Erreur lors de la réponse à l\'invitation');
    }

    const data: RsvpResponse = await res.json();

    const toast = useToast();
    toast.show('Réponse enregistrée', 'success');

    return data.attendee;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la réponse: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

// ============================================
// Fonctions API — Rappels
// ============================================

/**
 * Ajoute un rappel personnel sur un événement (self-service)
 */
async function addReminder(orgId: string, eventId: string, minutesBefore: number): Promise<EventReminder | null> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/events/${eventId}/reminders`, {
      method: 'POST',
      body: JSON.stringify({ minutesBefore })
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || "Erreur lors de l'ajout du rappel");
    }

    const data: AddReminderResponse = await res.json();

    if (currentEvent.value?.id === eventId) {
      currentEvent.value.reminders.push(data.reminder);
    }

    const toast = useToast();
    toast.show('Rappel ajouté avec succès', 'success');

    return data.reminder;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de l'ajout: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Retire un rappel personnel
 */
async function removeReminder(orgId: string, eventId: string, reminderId: string): Promise<boolean> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/events/${eventId}/reminders/${reminderId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Erreur lors du retrait du rappel');
    }

    if (currentEvent.value?.id === eventId) {
      currentEvent.value.reminders = currentEvent.value.reminders.filter(r => r.id !== reminderId);
    }
    myReminders.value = myReminders.value.filter(r => r.id !== reminderId);

    const toast = useToast();
    toast.show('Rappel retiré avec succès', 'success');

    return true;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du retrait: ${error.value}`, 'error');
    return false;
  } finally {
    loading.value = false;
  }
}

/**
 * Liste mes rappels à venir (vue transverse, toutes séries confondues)
 */
async function listMyReminders(orgId: string): Promise<ReminderWithEvent[] | null> {
  loading.value = true;
  error.value = null;

  try {
    const res = await sfetch(`/api/orgs/${orgId}/agenda/reminders/me`);

    if (!res.ok) {
      const err: ApiErrorResponse = await res.json();
      throw new Error(err.error || 'Erreur lors de la récupération des rappels');
    }

    const data: ListMyRemindersResponse = await res.json();
    myReminders.value = data.reminders;
    return data.reminders;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

// ============================================
// Fonctions utilitaires — sélecteur "voir comme"
// ============================================

/** Bascule l'agenda affiché sur celui d'un membre dirigé */
function setViewingUser(userId: string): void {
  viewingUserId.value = userId;
}

/** Revient à son propre agenda */
function resetViewingUser(): void {
  viewingUserId.value = null;
}

/**
 * Réinitialise le state
 */
function resetState(): void {
  occurrences.value = [];
  currentEvent.value = null;
  myReminders.value = [];
  error.value = null;
  viewingUserId.value = null;
}

// ============================================
// Export du composable
// ============================================

export function useAgenda() {
  return {
    // State
    occurrences,
    currentEvent,
    myReminders,
    loading,
    error,
    viewingUserId,
    isViewingSelf,

    // Fonctions API — Événements
    fetchRange,
    createEvent,
    getEvent,
    updateEvent,
    deleteEvent,
    updateOccurrence,
    cancelOccurrence,

    // Fonctions API — Invités / RSVP
    addAttendees,
    removeAttendee,
    respondToInvite,

    // Fonctions API — Rappels
    addReminder,
    removeReminder,
    listMyReminders,

    // Sélecteur "voir comme"
    setViewingUser,
    resetViewingUser,

    // Utilitaires
    resetState
  };
}
