import { nextTick, onUnmounted, reactive } from 'vue';
import { useAgenda } from './useAgenda';
import { useTaskPanels } from './useTaskPanels';
import type {
    CalendarEventWithDetails,
    CreateEventDTO,
    OccurrenceInstance,
    RecurrenceFreq,
    RsvpStatus,
    UpdateEventDTO
} from '@/types/agenda';

/**
 * Événements de l'agenda ouverts dans le dock en bas à droite, comme les
 * tâches (TaskPanelDock.vue, useTaskPanels.ts) : ils restent ouverts quand on
 * change de vue, se réduisent en barre et partagent la règle d'une seule
 * entrée dépliée.
 *
 * L'état du formulaire vit ici et non dans EventDetails.vue : réduire le
 * panneau démonte le composant, rien ne doit être perdu. La sauvegarde
 * automatique aussi, pour qu'une création en cours ne soit jamais doublée
 * par un remontage du composant.
 */

export interface EventRange {
    start: Date;
    end: Date;
    allDay?: boolean;
}

export type EventFreq = 'NONE' | RecurrenceFreq;
export type EventEndType = 'NEVER' | 'ON_DATE' | 'AFTER_COUNT';

export interface PanelReminder {
    /** id de l'API, ou `pending-…` tant que l'événement n'existe pas encore. */
    id: string;
    minutesBefore: number;
}

export interface EventForm {
    title: string;
    description: string;
    location: string;
    allDay: boolean;
    color: string | null;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    freq: EventFreq;
    interval: number;
    endType: EventEndType;
    untilDate: string;
    count: number;
    attendeeIds: string[];
    /** Création dans l'agenda d'un collègue (délégation en écriture). */
    targetOwnerId: string | null;
}

export interface EventPanelState {
    orgId: string;
    /** Occurrence cliquée dans l'agenda (null pour une création). */
    occurrence: OccurrenceInstance | null;
    /** Id de l'événement en base : celui de l'occurrence, ou celui créé par le brouillon. */
    eventId: string | null;
    /** Créé depuis ce panneau : le fermer sans titre le supprime. */
    createdHere: boolean;
    details: CalendarEventWithDetails | null;
    loading: boolean;
    /** Plage choisie sur la grille à la création (l'agenda la garde surlignée). */
    initialRange: EventRange | null;
    form: EventForm;
    initialAttendeeIds: string[];
    reminders: PanelReminder[];
    saveStatus: 'idle' | 'saving' | 'saved';
    /** Remplissage du formulaire par le code : ne doit pas déclencher de sauvegarde. */
    hydrating: boolean;
    saving: boolean;
    resave: boolean;
}

const DEFAULT_REMINDER_MINUTES = 10;
let draftSeq = 0;

const agenda = useAgenda();
const { panels, pushExpanded, restoreTask, closeTask } = useTaskPanels();

type ChangeListener = () => void;
const changeListeners = new Set<ChangeListener>();
const notifyChanged = () => changeListeners.forEach(fn => fn());

// ── Dates ──────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function toISO(date: string, time: string): string {
    return new Date(`${date}T${time || '00:00'}:00`).toISOString();
}

function emptyForm(): EventForm {
    return {
        title: '',
        description: '',
        location: '',
        allDay: false,
        color: null,
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        freq: 'NONE',
        interval: 1,
        endType: 'NEVER',
        untilDate: '',
        count: 5,
        attendeeIds: [],
        targetOwnerId: null
    };
}

function newState(orgId: string, occurrence: OccurrenceInstance | null): EventPanelState {
    return reactive({
        orgId,
        occurrence,
        eventId: occurrence?.eventId ?? null,
        createdHere: false,
        details: null,
        loading: false,
        initialRange: null,
        form: emptyForm(),
        initialAttendeeIds: [],
        reminders: [],
        saveStatus: 'idle',
        hydrating: false,
        saving: false,
        resave: false
    }) as EventPanelState;
}

// ── Ouverture ──────────────────────────────────────────────────────────

/** Ouvre un événement existant (clic dans l'agenda, notification, accueil). */
function openEvent(orgId: string, occurrence: OccurrenceInstance) {
    const existing = panels.value.find(p => p.event?.eventId === occurrence.eventId);
    if (existing) {
        restoreTask(existing.id);
        return;
    }
    const state = newState(orgId, occurrence);
    state.form.title = occurrence.title;
    pushExpanded({ id: `event-${occurrence.eventId}`, event: state, minimized: false, editTitle: false });
    loadDetails(state);
}

/** Ouvre un événement dont on n'a que l'id (lien de notification). */
async function openEventById(orgId: string, eventId: string): Promise<CalendarEventWithDetails | null> {
    const event = await agenda.getEvent(orgId, eventId);
    if (!event) return null;
    openEvent(orgId, {
        occurrenceKey: event.id,
        eventId: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        color: event.color,
        isRecurring: !!event.recurrenceRule,
        isException: false,
        creatorId: event.creatorId,
        attendees: event.attendees,
        externalConnectionId: null
    });
    return event;
}

/** Plage par défaut d'une création sans sélection : la prochaine demi-heure, pour une heure. */
function nextSlot(): EventRange {
    const start = new Date();
    start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
    return { start, end: new Date(start.getTime() + 60 * 60000), allDay: false };
}

/** Nouvel événement : un brouillon s'ouvre dans le dock, créé en base dès qu'il a un titre. */
function openEventDraft(orgId: string, range: EventRange = nextSlot(), title = '') {
    const state = newState(orgId, null);
    state.initialRange = range;
    Object.assign(state.form, {
        title,
        allDay: !!range.allDay,
        startDate: dateStr(range.start),
        startTime: timeStr(range.start),
        endDate: dateStr(range.end),
        endTime: timeStr(range.end)
    });
    state.reminders = [{ id: `pending-default-${Date.now()}`, minutesBefore: DEFAULT_REMINDER_MINUTES }];
    const id = `event-draft-${++draftSeq}`;
    pushExpanded({
        id,
        event: state,
        minimized: false,
        editTitle: false,
        onClose: () => discardIfEmpty(state)
    });
    // Titre déjà tapé dans la création rapide (« Plus d'options ») : comme
    // partout dans le panneau, un titre suffit pour enregistrer.
    if (title.trim()) saveEvent(state);
}

// Fermer un brouillon dont on a vidé le titre après sa création ne doit pas
// laisser un événement fantôme dans l'agenda.
async function discardIfEmpty(state: EventPanelState) {
    if (!state.createdHere || !state.eventId || state.form.title.trim()) return;
    const ok = await agenda.deleteEvent(state.orgId, state.eventId);
    if (ok) notifyChanged();
}

async function loadDetails(state: EventPanelState) {
    if (!state.eventId) return;
    state.loading = true;
    try {
        const details = await agenda.getEvent(state.orgId, state.eventId);
        if (details) {
            state.details = details;
            await hydrateFromOccurrence(state);
        }
    } finally {
        state.loading = false;
    }
}

async function hydrateFromOccurrence(state: EventPanelState) {
    const occ = state.occurrence;
    const ev = state.details;
    if (!occ) return;
    state.hydrating = true;
    const start = new Date(occ.startAt);
    const end = new Date(occ.endAt);
    const rule = ev?.recurrenceRule;
    Object.assign(state.form, {
        title: occ.title,
        description: occ.description || '',
        location: occ.location || '',
        allDay: occ.allDay,
        color: occ.color,
        startDate: dateStr(start),
        startTime: timeStr(start),
        endDate: dateStr(end),
        endTime: timeStr(end),
        freq: rule?.freq ?? 'NONE',
        interval: rule?.interval ?? 1,
        endType: rule?.until ? 'ON_DATE' : rule?.count ? 'AFTER_COUNT' : 'NEVER',
        untilDate: rule?.until ? dateStr(new Date(rule.until)) : '',
        count: rule?.count ?? 5
    });
    const ids = (ev?.attendees || []).map(a => a.userId);
    state.form.attendeeIds = [...ids];
    state.initialAttendeeIds = [...ids];
    state.reminders = (ev?.reminders || []).map(r => ({ id: r.id, minutesBefore: r.minutesBefore }));
    // Les watchers du formulaire (EventDetails.vue) passent avant la fin du tick.
    await nextTick();
    state.hydrating = false;
}

// ── Sauvegarde automatique ─────────────────────────────────────────────

function buildRecurrenceRule(f: EventForm) {
    if (f.freq === 'NONE') return null;
    const rule: { freq: RecurrenceFreq; interval: number; until?: string; count?: number } = {
        freq: f.freq,
        interval: Math.max(1, f.interval || 1)
    };
    if (f.endType === 'ON_DATE' && f.untilDate) rule.until = toISO(f.untilDate, '23:59');
    else if (f.endType === 'AFTER_COUNT') rule.count = Math.max(1, f.count || 1);
    return rule;
}

/**
 * Première sauvegarde valide (titre non vide) d'un brouillon : crée
 * l'événement ; les suivantes mettent à jour la série. Une seule sauvegarde
 * à la fois : une modification pendant l'envoi relance une sauvegarde après,
 * sinon une création en vol serait doublée.
 */
async function saveEvent(state: EventPanelState): Promise<void> {
    const f = state.form;
    if (!f.title.trim() || !f.startDate) return;
    if (state.saving) {
        state.resave = true;
        return;
    }
    state.saving = true;
    state.saveStatus = 'saving';
    try {
        const endDate = f.endDate || f.startDate;
        const dto: CreateEventDTO = {
            title: f.title.trim(),
            description: f.description.trim() || null,
            location: f.location.trim() || null,
            startAt: f.allDay ? toISO(f.startDate, '00:00') : toISO(f.startDate, f.startTime || '09:00'),
            endAt: f.allDay ? toISO(endDate, '23:59') : toISO(endDate, f.endTime || '10:00'),
            allDay: f.allDay,
            color: f.color
        };

        if (!state.eventId) {
            dto.recurrenceRule = buildRecurrenceRule(f);
            dto.attendeeIds = [...f.attendeeIds];
            if (f.targetOwnerId) dto.onBehalfOfUserId = f.targetOwnerId;

            const created = await agenda.createEvent(state.orgId, dto);
            if (!created) {
                state.saveStatus = 'idle';
                return;
            }
            state.eventId = created.id;
            state.createdHere = true;
            state.initialAttendeeIds = [...dto.attendeeIds];

            for (const r of state.reminders) {
                if (!r.id.startsWith('pending-')) continue;
                const persisted = await agenda.addReminder(state.orgId, created.id, r.minutesBefore);
                if (persisted) r.id = persisted.id;
            }
        } else {
            const eventId = state.eventId;
            const seriesDto: UpdateEventDTO = { ...dto, recurrenceRule: buildRecurrenceRule(f) };
            await agenda.updateEvent(state.orgId, eventId, seriesDto);

            const before = new Set(state.initialAttendeeIds);
            const now = new Set(f.attendeeIds);
            const toAdd = f.attendeeIds.filter(id => !before.has(id));
            const toRemove = state.initialAttendeeIds.filter(id => !now.has(id));
            if (toAdd.length) await agenda.addAttendees(state.orgId, eventId, toAdd);
            for (const id of toRemove) await agenda.removeAttendee(state.orgId, eventId, id);
            state.initialAttendeeIds = [...f.attendeeIds];
        }

        state.saveStatus = 'saved';
        notifyChanged();
    } catch (e) {
        state.saveStatus = 'idle';
    } finally {
        state.saving = false;
        if (state.resave) {
            state.resave = false;
            saveEvent(state);
        }
    }
}

// ── Rappels (toujours personnels) ──────────────────────────────────────
// Persistés dès que l'événement existe ; avant, ils attendent la création.

async function addEventReminder(state: EventPanelState, minutesBefore: number) {
    if (!minutesBefore || minutesBefore <= 0) return;
    if (state.reminders.some(r => r.minutesBefore === minutesBefore)) return;
    if (state.eventId) {
        const reminder = await agenda.addReminder(state.orgId, state.eventId, minutesBefore);
        if (reminder) state.reminders.push({ id: reminder.id, minutesBefore: reminder.minutesBefore });
    } else {
        state.reminders.push({ id: `pending-${Date.now()}-${Math.random()}`, minutesBefore });
    }
}

async function removeEventReminder(state: EventPanelState, reminder: PanelReminder) {
    if (state.eventId && !reminder.id.startsWith('pending-')) {
        const ok = await agenda.removeReminder(state.orgId, state.eventId, reminder.id);
        if (!ok) return;
    }
    state.reminders = state.reminders.filter(r => r.id !== reminder.id);
}

// ── Réponse à une invitation ───────────────────────────────────────────

async function respondToEvent(state: EventPanelState, status: RsvpStatus) {
    if (!state.eventId) return;
    await agenda.respondToInvite(state.orgId, state.eventId, status);
    const details = await agenda.getEvent(state.orgId, state.eventId);
    if (details) state.details = details;
    notifyChanged();
}

// ── Suppression ────────────────────────────────────────────────────────

async function deleteEventFromPanel(panelId: string, state: EventPanelState, mode: 'occurrence' | 'event'): Promise<boolean> {
    if (!state.eventId) return false;
    const ok = mode === 'occurrence' && state.occurrence
        ? await agenda.cancelOccurrence(state.orgId, state.eventId, state.occurrence.startAt)
        : await agenda.deleteEvent(state.orgId, state.eventId);
    if (!ok) return false;
    // Déjà supprimé : la fermeture ne doit pas tenter de le supprimer à nouveau.
    state.createdHere = false;
    closeTask(panelId);
    notifyChanged();
    return true;
}

/** Pour une vue qui affiche l'agenda : être prévenue des modifications faites dans le dock. */
function onEventPanelChange(fn: ChangeListener) {
    changeListeners.add(fn);
    onUnmounted(() => changeListeners.delete(fn));
}

export function useEventPanels() {
    return {
        openEvent,
        openEventById,
        openEventDraft,
        saveEvent,
        addEventReminder,
        removeEventReminder,
        respondToEvent,
        deleteEventFromPanel,
        onEventPanelChange
    };
}
