/**
 * Comparaison de versions « x.y.z » (PC107, version minimale de l'app). Fonctions pures.
 * Un préfixe « v » et un suffixe « -beta » / « +build » sont ignorés. Une valeur illisible vaut `null`.
 */
export type Triplet = [number, number, number];

export function parseVersion(raw: unknown): Triplet | null {
    if (typeof raw !== 'string') return null;
    const m = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:[-+][0-9A-Za-z.+-]*)?$/.exec(raw.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Négatif si a < b, 0 si égales, positif si a > b ; `null` si l'une des deux est illisible. */
export function compareVersions(a: unknown, b: unknown): number | null {
    const x = parseVersion(a);
    const y = parseVersion(b);
    if (!x || !y) return null;
    for (let i = 0; i < 3; i++) { const d = x[i]! - y[i]!; if (d !== 0) return d; }
    return 0;
}

/** Vrai seulement si les deux versions sont lisibles et que `current` est strictement plus ancienne. */
export function isOlderThan(current: unknown, minimum: unknown): boolean {
    const c = compareVersions(current, minimum);
    return c !== null && c < 0;
}
