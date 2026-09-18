// ============================================
// Types pour le module Agenda
// ============================================

// Préfixe des pseudo-occurrences synthétisées côté front pour représenter
// l'échéance d'une tâche (module Todo) directement dans l'agenda — ce ne
// sont pas de vrais CalendarEvent, donc jamais envoyées à l'API agenda.
export const TASK_DEADLINE_PREFIX = 'task-deadline:';

export function isTaskDeadlineOccurrence(eventId: string): boolean {
    return eventId.startsWith(TASK_DEADLINE_PREFIX);
}

export function taskIdFromDeadlineEventId(eventId: string): string {
    return eventId.slice(TASK_DEADLINE_PREFIX.length);
}

// ============================================
// Récurrence
// ============================================
export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval: number;
  until?: string; // ISO
  count?: number;
}

// ============================================
// RSVP
// ============================================
export type RsvpStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';

// ============================================
// Événement de calendrier (racine ou exception d'occurrence)
// ============================================
export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  color: string | null; // Hex #RRGGBB choisi par l'utilisateur
  creatorId: string;
  organizationId: string;
  recurrenceRule: RecurrenceRule | null;
  recurrenceParentId: string | null;
  originalStartAt: string | null;
  isCancelled: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ============================================
// Invité d'un événement
// ============================================
export interface EventAttendee {
  id: string;
  eventId: string;
  userId: string;
  status: RsvpStatus;
  respondedAt: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ============================================
// Rappel (toujours self-service)
// ============================================
export interface EventReminder {
  id: string;
  eventId: string;
  userId: string;
  minutesBefore: number;
  remindAt: string | null;
  sent: boolean;
  sentAt: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ============================================
// Détail complet d'un événement (GET /events/:eventId)
// ============================================
export interface CalendarEventWithDetails extends CalendarEvent {
  attendees: EventAttendee[];
  reminders: EventReminder[]; // rappels de l'appelant uniquement
  // Renseigné quand l'événement a été créé par un tiers ayant un accès en
  // modification sur cet agenda (voir CalendarAccessGrant) — creatorId reste
  // le propriétaire de l'agenda.
  createdByDelegateId: string | null;
}

// ============================================
// Résumé d'invité au sein d'une occurrence
// ============================================
export interface OccurrenceAttendeeSummary {
  userId: string;
  status: RsvpStatus;
}

// ============================================
// Occurrence matérialisée (GET /events?from=&to=)
// ============================================
export interface OccurrenceInstance {
  occurrenceKey: string;
  eventId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string; // ISO
  endAt: string;   // ISO
  allDay: boolean;
  color: string | null;
  isRecurring: boolean;
  isException: boolean;
  creatorId: string;
  attendees: OccurrenceAttendeeSummary[];
}

// ============================================
// Rappel + infos événement (GET /reminders/me)
// ============================================
export interface ReminderWithEvent extends EventReminder {
  event: {
    id: string;
    title: string;
    startAt: string;
  };
}

// ============================================
// DTOs
// ============================================
export interface CreateEventDTO {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  timezone?: string;
  color?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  attendeeIds?: string[];
  // Créer l'événement pour le compte d'un tiers dont on a l'accès en
  // modification (voir CalendarAccessGrant) — l'événement apparaît sur son
  // agenda, pas sur le sien.
  onBehalfOfUserId?: string;
}

// PATCH accepte un sous-ensemble quelconque des mêmes champs
export type UpdateEventDTO = Partial<CreateEventDTO>;
export type UpdateOccurrenceDTO = Partial<CreateEventDTO>;

// ============================================
// Réponses API
// ============================================
export interface ListOccurrencesResponse {
  occurrences: OccurrenceInstance[];
}

export interface CreateEventResponse {
  event: CalendarEvent;
}

export interface GetEventResponse {
  event: CalendarEventWithDetails;
}

export interface UpdateEventResponse {
  event: CalendarEvent;
}

export interface DeleteEventResponse {
  success: true;
  eventId: string;
}

export interface UpdateOccurrenceResponse {
  event: CalendarEvent;
}

export interface DeleteOccurrenceResponse {
  success: true;
  eventId: string;
  occurrenceStartAt: string;
}

export interface AddAttendeesResponse {
  attendees: EventAttendee[];
}

export interface RemoveAttendeeResponse {
  success: true;
  eventId: string;
  userId: string;
}

export interface RsvpResponse {
  attendee: EventAttendee;
}

export interface AddReminderResponse {
  reminder: EventReminder;
}

export interface RemoveReminderResponse {
  success: true;
  reminderId: string;
}

export interface ListMyRemindersResponse {
  reminders: ReminderWithEvent[];
}

// ============================================
// Erreur API (forme commune à tous les endpoints)
// ============================================
export interface ApiErrorResponse {
  error: string;
}

// ============================================
// Événements WebSocket (user:${uid})
// ============================================
export interface AgendaEventCreatedEvent {
  event: CalendarEvent;
}
export interface AgendaEventUpdatedEvent {
  event: CalendarEvent;
}
export interface AgendaEventDeletedEvent {
  eventId: string;
}
export interface AgendaOccurrenceUpdatedEvent {
  eventId: string;
  occurrence: OccurrenceInstance;
}
export interface AgendaOccurrenceCancelledEvent {
  eventId: string;
  occurrenceStartAt: string;
}
export interface AgendaRsvpUpdatedEvent {
  eventId: string;
  attendee: EventAttendee;
}

// ============================================
// Partage d'agenda (CalendarAccessGrant)
// ============================================
export type CalendarAccessLevel = 'READ' | 'WRITE';
export type CalendarAccessStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
export type CalendarGrantInitiator = 'REQUESTER' | 'OWNER';

export interface UserSummary {
  id: string;
  name: string;
  pseudo: string | null;
  avatarUrl: string | null;
}

export interface CalendarAccessGrant {
  id: string;
  organizationId: string;
  ownerId: string;
  granteeId: string;
  level: CalendarAccessLevel;
  status: CalendarAccessStatus;
  initiatedBy: CalendarGrantInitiator;
  color: string | null;
  requestedAt: string;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarAccessGrantAsOwner extends CalendarAccessGrant {
  grantee: UserSummary;
}

export interface CalendarAccessGrantAsGrantee extends CalendarAccessGrant {
  owner: UserSummary;
}

export interface ListMyGrantsResponse {
  asOwner: CalendarAccessGrantAsOwner[];
  asGrantee: CalendarAccessGrantAsGrantee[];
}

export interface GrantResponse {
  grant: CalendarAccessGrant;
}

export interface RevokeGrantResponse {
  success: true;
  grantId: string;
}

export interface AgendaAccessUpdatedEvent {
  grant: CalendarAccessGrant;
}

// Occurrence taguée par calendrier source, construite côté client en
// fusionnant mon agenda avec les agendas partagés visibles (voir
// useAgenda.ts::fetchRange) — jamais renvoyée telle quelle par l'API.
export interface MergedOccurrence extends OccurrenceInstance {
  sourceOwnerId: string;
  sourceColor: string;
}
