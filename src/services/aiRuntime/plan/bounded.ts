/** Applique `fn` à chaque élément, au plus `limit` à la fois ; l'ordre des résultats suit celui des éléments. */
export async function mapBounded<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i]!);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
    return out;
}
