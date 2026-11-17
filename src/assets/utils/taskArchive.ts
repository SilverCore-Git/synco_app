/** « Archivée aujourd'hui », « Archivée hier », « Archivée il y a 5 j »,
 *  puis la date au-delà d'un mois (carte archivée et liste des personnes). */
export const archivedAgoLabel = (date?: string | Date | null, prefix = 'Archivée'): string => {
    if (!date) return `${prefix} à une date inconnue`;
    const d = new Date(date);
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
    if (days <= 0) return `${prefix} aujourd'hui`;
    if (days === 1) return `${prefix} hier`;
    if (days < 31) return `${prefix} il y a ${days} j`;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return `${prefix} le ${d.toLocaleDateString('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })}`;
};
