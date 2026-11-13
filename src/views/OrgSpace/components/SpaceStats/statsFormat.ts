import type { FileFamily, Granularity } from './statsTypes';

const nf = new Intl.NumberFormat('fr-FR');
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

/** 1 284 / 12,9 k : en entier sous 10 000, compact au-delà. */
export const formatCount = (n: number): string => (Math.abs(n) < 10_000 ? nf.format(n) : compact.format(n));

export const formatPercent = (ratio: number | null): string =>
    ratio === null ? '—' : `${Math.round(ratio * 100)} %`;

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    const units = ['Ko', 'Mo', 'Go', 'To'];
    let v = bytes / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

/** Durée en heures → « 5 h », « 3,5 j », « 6 sem. ». */
export function formatHours(hours: number | null): string {
    if (hours === null) return '—';
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    if (hours < 48) return `${Math.round(hours)} h`;
    const days = hours / 24;
    if (days < 21) return `${days.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`;
    return `${Math.round(days / 7)} sem.`;
}

/** Écart relatif à la période précédente ; null quand la comparaison n'a pas de sens. */
export function delta(current: number, previous: number): number | null {
    if (previous === 0) return current === 0 ? 0 : null;
    return (current - previous) / previous;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Libellé court d'une tranche (« 9 nov. », « sem. du 9 nov. », « nov. 2026 »). */
export function bucketLabel(key: string, granularity: Granularity, long = false): string {
    const [y, m, d] = key.split('-').map(Number);
    const month = MONTHS[(m ?? 1) - 1];
    if (granularity === 'month') return `${month} ${y}`;
    const day = `${d} ${month}`;
    if (granularity === 'week') return long ? `Semaine du ${day}` : day;
    return day;
}

export const FAMILY_LABELS: Record<FileFamily, { label: string; icon: string }> = {
    image: { label: 'Images', icon: 'bi-file-image' },
    video: { label: 'Vidéos', icon: 'bi-file-play' },
    audio: { label: 'Audio', icon: 'bi-file-music' },
    pdf: { label: 'PDF', icon: 'bi-file-pdf' },
    document: { label: 'Documents', icon: 'bi-file-richtext' },
    archive: { label: 'Archives', icon: 'bi-file-zip' },
    text: { label: 'Texte & code', icon: 'bi-file-code' },
    other: { label: 'Autres', icon: 'bi-file-earmark' },
};

/** Couleur fixe par famille (la couleur suit l'entité, jamais son rang). */
export const FAMILY_SLOT: Record<FileFamily, number> = {
    image: 1, video: 2, audio: 3, pdf: 4, document: 5, archive: 6, text: 7, other: 8,
};

/** Famille d'un type MIME — même règle que synco_api (spaceStats/filesStats.ts). */
export function fileFamily(mime: string): FileFamily {
    const m = mime.toLowerCase();
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    if (m === 'application/pdf') return 'pdf';
    if (/zip|rar|tar|7z|gzip|bzip|compressed/.test(m)) return 'archive';
    if (/msword|officedocument|opendocument|ms-excel|ms-powerpoint|rtf|csv/.test(m)) return 'document';
    if (m.startsWith('text/') || /json|xml|javascript|typescript|yaml|x-sh/.test(m)) return 'text';
    return 'other';
}

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
