// ============================================
// Types pour le module Agenda
// ============================================

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
  recurrenceRule?: RecurrenceRule | null;
  attendeeIds?: string[];
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
