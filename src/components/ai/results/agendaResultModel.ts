/**
 * Modèle d'affichage des résultats d'outils du domaine Agenda (L15b). Pur et testable : la vue
 * `AgendaResult.vue` ne fait que le rendre. Titres, lieux et noms viennent d'autres membres ou de flux
 * externes ; ils ne sont jamais rendus en HTML.
 */

export interface EventRow { id: string; title: string; when: string; place?: string }
export interface DayGroup { day: string; rows: EventRow[] }
export interface ReminderRow { id: string; title: string; when: string; before: string }
export interface GrantRow { id: string; who: string; level: string; status: string; direction: 'owner' | 'grantee' }
export interface ConnectionRow { id: string; label: string; provider: string; status: string; lastError?: string }

export type AgendaResultView =
    | { kind: 'events'; days: DayGroup[]; shown: number; total: number; truncated: boolean }
    | { kind: 'event'; row: EventRow }
    | { kind: 'reminders'; rows: ReminderRow[]; total: number; truncated: boolean }
    | { kind: 'grants'; rows: GrantRow[]; truncated: boolean }
    | { kind: 'connections'; rows: ConnectionRow[]; total: number; truncated: boolean }
    | { kind: 'message'; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const dayFmt = (tz?: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz });
const timeFmt = (tz?: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
const dateTimeFmt = (tz?: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz });

const toDate = (v: unknown): Date | null => {
    const s = str(v);
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
};

/** « 10:00 – 11:00 », ou « Toute la journée ». */
export function whenLabel(start: unknown, end: unknown, allDay: unknown, tz?: string): string {
    if (allDay === true) return 'Toute la journée';
    const s = toDate(start);
    if (!s) return '';
    const e = toDate(end);
    const t = timeFmt(tz);
    return e ? `${t.format(s)} – ${t.format(e)}` : t.format(s);
}

export function eventRow(raw: unknown, tz?: string): EventRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id) ?? str(raw.eventId);
    if (!id) return null;
    const start = toDate(raw.startAt);
    return {
        id: `${id}${start ? `@${start.toISOString()}` : ''}`,
        title: str(raw.title) ?? 'Sans titre',
        when: raw.allDay === true || !start ? whenLabel(raw.startAt, raw.endAt, raw.allDay, tz) : `${dateTimeFmt(tz).format(start)}, ${whenLabel(raw.startAt, raw.endAt, raw.allDay, tz)}`,
        place: str(raw.location),
    };
}

/** Occurrences regroupées par jour (ordre d'arrivée : le serveur les trie par date). */
export function groupByDay(items: unknown[], tz?: string): DayGroup[] {
    const days: DayGroup[] = [];
    const fmt = dayFmt(tz);
    for (const raw of items) {
        if (!isRecord(raw)) continue;
        const id = str(raw.id) ?? str(raw.eventId);
        const start = toDate(raw.startAt);
        if (!id || !start) continue;
        const day = fmt.format(start);
        const row: EventRow = {
            id: `${id}@${start.toISOString()}`,
            title: str(raw.title) ?? 'Sans titre',
            when: whenLabel(raw.startAt, raw.endAt, raw.allDay, tz),
            place: str(raw.location),
        };
        const last = days[days.length - 1];
        if (last && last.day === day) last.rows.push(row);
        else days.push({ day, rows: [row] });
    }
    return days;
}

const LEVELS: Record<string, string> = { READ: 'Lecture', WRITE: 'Modification' };
const GRANT_STATUS: Record<string, string> = { PENDING: 'En attente', ACCEPTED: 'Accepté', DECLINED: 'Refusé', REVOKED: 'Retiré' };
const PROVIDERS: Record<string, string> = { GOOGLE: 'Google Agenda', ICS_URL: 'Lien ICS', ICS_FILE: 'Fichier ICS' };

const personName = (v: unknown): string => (isRecord(v) ? (str(v.name) ?? str(v.pseudo) ?? 'Membre') : 'Membre');

export function grantRow(raw: unknown, direction: 'owner' | 'grantee'): GrantRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const level = str(raw.level) ?? '';
    const status = str(raw.status) ?? '';
    return {
        id, direction,
        who: personName(direction === 'owner' ? raw.grantee : raw.owner),
        level: LEVELS[level] ?? level,
        status: GRANT_STATUS[status] ?? status,
    };
}

export function reminderRow(raw: unknown, tz?: string): ReminderRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const event = isRecord(raw.event) ? raw.event : {};
    const start = toDate(event.startAt);
    const minutes = num(raw.minutesBefore);
    return {
        id,
        title: str(event.title) ?? 'Sans titre',
        when: start ? dateTimeFmt(tz).format(start) : '',
        before: minutes === undefined ? '' : minutes === 0 ? "À l'heure de l'évènement" : `${minutes} min avant`,
    };
}

const DONE_LABELS: Record<string, string> = {
    delete_event: 'Évènement supprimé.',
    delete_event_occurrence: 'Occurrence supprimée.',
    remove_event_attendee: 'Invité retiré.',
    delete_event_reminder: 'Rappel retiré.',
    revoke_calendar_access: "Partage d'agenda retiré.",
    remove_external_calendar: 'Agenda externe déconnecté.',
    sync_external_calendar: 'Agenda externe resynchronisé.',
    add_event_reminder: 'Rappel ajouté.',
    set_calendar_color: "Couleur de l'agenda changée.",
    add_event_attendees: 'Invitations envoyées.',
    respond_to_event: 'Réponse enregistrée.',
    request_calendar_access: "Demande d'accès envoyée.",
    share_my_calendar: 'Agenda partagé : invitation envoyée.',
    respond_calendar_access: 'Réponse au partage enregistrée.',
};

export function buildAgendaView(toolName: string, result: unknown, tz?: string): AgendaResultView {
    const done = DONE_LABELS[toolName];
    if (!isRecord(result)) return { kind: 'message', text: done ?? 'Terminé.' };

    switch (toolName) {
        case 'list_events': {
            const items = arr(result.occurrences);
            return { kind: 'events', days: groupByDay(items, tz), shown: items.length, total: num(result.total) ?? items.length, truncated: result.truncated === true };
        }
        case 'list_my_reminders': {
            const rows = arr(result.reminders).map(r => reminderRow(r, tz)).filter((r): r is ReminderRow => r !== null);
            return { kind: 'reminders', rows, total: num(result.total) ?? rows.length, truncated: result.truncated === true };
        }
        case 'list_calendar_access': {
            const rows = [
                ...arr(result.asOwner).map(g => grantRow(g, 'owner')),
                ...arr(result.asGrantee).map(g => grantRow(g, 'grantee')),
            ].filter((r): r is GrantRow => r !== null);
            return { kind: 'grants', rows, truncated: result.truncated === true };
        }
        case 'list_external_calendars': {
            const rows = arr(result.connections).map(c => connectionRow(c)).filter((r): r is ConnectionRow => r !== null);
            return { kind: 'connections', rows, total: num(result.total) ?? rows.length, truncated: result.truncated === true };
        }
        case 'add_ics_calendar':
        case 'update_ics_calendar_url': {
            const row = connectionRow(result);
            return row ? { kind: 'connections', rows: [row], total: 1, truncated: false } : { kind: 'message', text: 'Terminé.' };
        }
        case 'get_event':
        case 'create_event':
        case 'update_event':
        case 'update_event_occurrence': {
            const row = eventRow(result, tz);
            return row ? { kind: 'event', row } : { kind: 'message', text: 'Terminé.' };
        }
        default:
            return { kind: 'message', text: done ?? 'Terminé.' };
    }
}

export function connectionRow(raw: unknown): ConnectionRow | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    if (!id) return null;
    const provider = str(raw.provider) ?? '';
    return {
        id,
        label: str(raw.label) ?? str(raw.externalAccountEmail) ?? PROVIDERS[provider] ?? 'Agenda externe',
        provider: PROVIDERS[provider] ?? provider,
        status: str(raw.status) ?? '',
        lastError: str(raw.lastError),
    };
}
