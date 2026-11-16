import { ref } from 'vue';
import type { VaultKind } from './types';

/**
 * Dernière utilisation réussie du coffre de cet appareil pendant ce lancement (mémoire seulement,
 * jamais persisté) : la vue « Développeur » des paramètres s'en sert pour montrer que le coffre a
 * réellement servi à déverrouiller la clé de compte, pas seulement qu'il contient une clé.
 */
export interface VaultUsage {
    kind: VaultKind;
    at: number;
    /** Nombre de déverrouillages réussis depuis le lancement. */
    count: number;
}

export const lastVaultUsage = ref<VaultUsage | null>(null);

export function recordVaultUsage(kind: VaultKind): void {
    lastVaultUsage.value = { kind, at: Date.now(), count: (lastVaultUsage.value?.count ?? 0) + 1 };
}
