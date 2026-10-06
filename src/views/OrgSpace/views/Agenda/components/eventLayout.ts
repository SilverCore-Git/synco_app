import type { OccurrenceInstance } from '@/types/agenda';

export interface EventLayoutSlot {
    col: number;
    cols: number;
}

// Dispose les événements chevauchants côte à côte (façon Google Agenda)
// plutôt que de les empiler. `getRange` doit renvoyer un intervalle en
// minutes (ou toute unité monotone) pour une occurrence donnée.
export function layoutDayEvents(
    occurrences: OccurrenceInstance[],
    getRange: (occ: OccurrenceInstance) => { start: number; end: number }
): Map<string, EventLayoutSlot> {
    const result = new Map<string, EventLayoutSlot>();
    if (occurrences.length === 0) return result;

    const items = occurrences
        .map(occ => ({ occ, ...getRange(occ) }))
        .sort((a, b) => a.start - b.start || b.end - a.end);

    // Un "cluster" regroupe les événements transitivement chevauchants
    // (A touche B, B touche C → A, B, C partagent le même jeu de colonnes
    // même si A et C ne se chevauchent pas directement).
    let cluster: typeof items = [];
    let clusterEnd = -Infinity;

    function flushCluster() {
        if (cluster.length === 0) return;
        // Coloration gloutonne : chaque événement prend la première colonne
        // dont le dernier occupant se termine avant (ou à) son propre début.
        const columnEnds: number[] = [];
        const placed: { item: typeof items[number]; col: number }[] = [];
        for (const item of cluster) {
            let col = columnEnds.findIndex(end => end <= item.start);
            if (col === -1) {
                col = columnEnds.length;
                columnEnds.push(item.end);
            } else {
                columnEnds[col] = item.end;
            }
            placed.push({ item, col });
        }
        const cols = columnEnds.length;
        for (const { item, col } of placed) {
            result.set(item.occ.occurrenceKey, { col, cols });
        }
    }

    for (const item of items) {
        if (cluster.length > 0 && item.start >= clusterEnd) {
            flushCluster();
            cluster = [];
            clusterEnd = -Infinity;
        }
        cluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.end);
    }
    flushCluster();

    return result;
}
