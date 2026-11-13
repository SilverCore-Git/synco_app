import { get, set } from 'idb-keyval';
import { user } from '@/assets/var';

/**
 * Plus haute révision connue de chaque message édité (audit FC7).
 *
 * Une édition garde l'identifiant du message d'origine et incrémente un compteur `rev`, signé avec
 * le contenu. Sans mémoire, le serveur pourrait resservir une ancienne version d'un message édité
 * (valide, signée) ; avec elle, toute version plus ancienne que la plus récente déjà vue est refusée.
 *
 * Seules les révisions > 0 sont retenues (les messages jamais édités n'ajoutent rien), persistées par
 * compte dans IndexedDB. Stockage local best-effort : sans lui, le contrôle ne vaut que pour la session.
 */

const nsOf = () => `msgrev:${user.value?.id ?? 'anon'}`;
let cache: { ns: string; map: Record<string, number> } | null = null;

async function load(): Promise<Record<string, number>> {
    const ns = nsOf();
    if (cache?.ns === ns) return cache.map;
    let map: Record<string, number> = {};
    try { map = (await get<Record<string, number>>(ns)) ?? {}; } catch { /* stockage indisponible */ }
    // Une lecture concurrente a pu remplir le cache entre-temps : on garde la plus complète.
    if (cache?.ns === ns) return cache.map;
    cache = { ns, map };
    return map;
}

/**
 * Enregistre `rev` pour `key` et renvoie false si une révision plus récente a déjà été vue
 * (retour en arrière). `key` identifie le message sans dépendre de l'id serveur.
 */
export async function noteMessageRevision(key: string, rev: number): Promise<boolean> {
    const map = await load();
    const known = map[key] ?? 0;
    if (rev < known) return false;
    if (rev > known) {
        map[key] = rev;
        try { await set(nsOf(), map); } catch { /* best-effort */ }
    }
    return true;
}
