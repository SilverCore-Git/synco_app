/**
 * Traduit une planification de rapport en une phrase française.
 *
 * C'est l'élément le plus utile de l'éditeur : une grille de cases ne dit pas
 * à l'utilisateur ce qu'il vient de régler, une phrase si. Affichée en
 * permanence sous le bloc « quand », elle supprime le doute avant l'envoi
 * plutôt qu'après.
 */

import type { ActivityReport } from '@/types/activityReports';

type ScheduleFields = Pick<
    ActivityReport,
    'rhythm' | 'sendTimes' | 'activeWeekdays' | 'intervalHours'
    | 'activeFromMinute' | 'activeUntilMinute' | 'dayOfMonth' | 'timezone'
>;

const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** « lundi, mardi et vendredi » plutôt que « lundi, mardi, vendredi ». */
function joinFr(parts: string[]): string {
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0]!;
    return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

function describeDays(weekdays: number[]): string {
    if (weekdays.length === 0) return 'tous les jours';

    const sorted = [...weekdays].sort((a, b) => a - b);
    const isWeekdays = sorted.length === 5 && sorted.every((d, i) => d === i + 1);
    if (isWeekdays) return 'les jours ouvrés';

    const isWeekend = sorted.length === 2 && sorted[0] === 6 && sorted[1] === 7;
    if (isWeekend) return 'le week-end';

    return `le ${joinFr(sorted.map(d => DAY_NAMES[d - 1] ?? ''))}`;
}

function describeTimes(sendTimes: number[]): string {
    const sorted = [...sendTimes].sort((a, b) => a - b);
    return joinFr(sorted.map(formatMinutes));
}

function describeDayOfMonth(day: number): string {
    if (day === -1) return 'le dernier jour du mois';
    if (day === 1) return 'le 1er du mois';
    return `le ${day} du mois`;
}

export function describeSchedule(s: ScheduleFields): string {
    const times = describeTimes(s.sendTimes);

    switch (s.rhythm) {
        case 'HOURLY': {
            const step = s.intervalHours ?? 1;
            const every = step === 1 ? 'Toutes les heures' : `Toutes les ${step} heures`;
            const days = s.activeWeekdays.length > 0 ? `, ${describeDays(s.activeWeekdays)}` : '';
            const range = s.activeFromMinute != null && s.activeUntilMinute != null
                ? `, entre ${formatMinutes(s.activeFromMinute)} et ${formatMinutes(s.activeUntilMinute)}`
                : '';
            return `${every}${days}${range}`;
        }

        case 'WEEKLY':
            return `Chaque semaine ${describeDays(s.activeWeekdays)} à ${times}`;

        case 'MONTHLY':
            return `Chaque mois ${describeDayOfMonth(s.dayOfMonth ?? 1)} à ${times}`;

        case 'DAILY':
        default: {
            const days = describeDays(s.activeWeekdays);
            const prefix = days === 'tous les jours' ? 'Tous les jours' : `Chaque semaine ${days}`;
            return `${prefix} à ${times}`;
        }
    }
}

/** Phrase complète, fuseau et prochain envoi compris. */
export function describeScheduleFull(s: ScheduleFields, nextRunAt?: string | null): string {
    const base = describeSchedule(s);
    const zone = s.timezone ? `, heure de ${s.timezone.split('/').pop()?.replace(/_/g, ' ')}` : '';
    if (!nextRunAt) return `${base}${zone}.`;

    const next = new Date(nextRunAt);
    if (Number.isNaN(next.getTime())) return `${base}${zone}.`;

    const formatted = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long',
        hour: '2-digit', minute: '2-digit', timeZone: s.timezone || undefined,
    }).format(next);

    return `${base}${zone}. Prochain envoi : ${formatted}.`;
}
