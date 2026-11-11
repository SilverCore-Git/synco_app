import { ref } from 'vue';

/**
 * Migration v3 → v4 proposée à l'ouverture (App.vue, écran de déverrouillage v3) : l'utilisateur accepte avant de
 * saisir son PIN ; le PIN déverrouille, puis ouvre une dernière fois les clés v3 (openV3IdentityForMigration). Ces
 * clés passent ici à la fenêtre de migration (V4MigrationDialog.vue), montée une fois l'app affichée, qui continue
 * sans redemander le PIN.
 *
 * Le PIN ne passe jamais par ce module. Les clés y restent en mémoire, hors de tout état réactif, le temps que la
 * fenêtre les prenne ; seul un compteur (sans secret) est réactif, pour la prévenir. Une nouvelle remise efface la
 * précédente ; discard() efface tout.
 */
export interface V3MigrationSource {
    rsaPkcs8: Uint8Array;
    signPkcs8: Uint8Array;
    verifier: string;
}

let pending: V3MigrationSource | null = null;

/** Incrémenté à chaque remise : la fenêtre de migration le surveille. Ne contient aucun secret. */
export const v3MigrationOffered = ref(0);

function wipe(source: V3MigrationSource | null): void {
    source?.rsaPkcs8.fill(0);
    source?.signPkcs8.fill(0);
}

export function handOffV3Migration(source: V3MigrationSource): void {
    wipe(pending);
    pending = source;
    v3MigrationOffered.value++;
}

/** Rend les clés remises, une seule fois ; null s'il n'y en a pas. L'appelant les efface après usage. */
export function takeV3Migration(): V3MigrationSource | null {
    const source = pending;
    pending = null;
    return source;
}

/** Efface une remise que personne n'a prise (verrouillage, déconnexion). */
export function discardV3Migration(): void {
    wipe(pending);
    pending = null;
}
