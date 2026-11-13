/** Échelle « propre » : maximum arrondi et 3 graduations régulières. */
export function niceScale(max: number, ticks = 3): { max: number; ticks: number[] } {
    if (max <= 0) return { max: 1, ticks: [0, 1] };
    const raw = max / ticks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const niceMax = Math.ceil(max / step) * step;
    const values: number[] = [];
    for (let v = 0; v <= niceMax + step / 2; v += step) values.push(Number(v.toFixed(6)));
    return { max: niceMax, ticks: values };
}

/** Indices des libellés d'axe X à afficher (environ `count`, extrémités comprises). */
export function labelIndices(length: number, count = 6): Set<number> {
    if (length <= count) return new Set(Array.from({ length }, (_, i) => i));
    const step = (length - 1) / (count - 1);
    return new Set(Array.from({ length: count }, (_, i) => Math.round(i * step)));
}
