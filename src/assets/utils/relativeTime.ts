const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60],
    ['month', 30 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60]
];

export function formatRelativeTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const diffSeconds = (d.getTime() - Date.now()) / 1000;

    for (const [unit, secondsInUnit] of UNITS) {
        if (Math.abs(diffSeconds) >= secondsInUnit) {
            return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
        }
    }
    return rtf.format(Math.round(diffSeconds), 'second');
}
