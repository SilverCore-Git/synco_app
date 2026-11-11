import { VaultError, type VaultKind } from '../deviceVault/types';

/**
 * Que faire quand le coffre de cet appareil refuse de s'ouvrir (écran de déverrouillage) ?
 *
 * Règle de sécurité : on n'oublie l'appareil (`forget`) que si ses clés sont réellement perdues
 * (`wiped`, `missing`) ou si son coffre n'existe plus sur cette plateforme. Pour le coffre de
 * l'extension, « unavailable » veut le plus souvent dire extension désactivée, sans accès au site ou
 * fraîchement mise à jour : DK est intacte dans l'extension, l'oublier forcerait à relier l'appareil.
 */
export type UnlockFailure =
    | { action: 'wrong-pin'; retryAfterSeconds?: number }
    | { action: 'lockout'; retryAfterSeconds: number; message?: string }
    | { action: 'reconnect'; forget: true; notice: string }
    | { action: 'extension-unavailable'; message: string }
    | { action: 'cancelled'; message?: string }
    | { action: 'error' };

export const EXTENSION_CANCELLED_HINT =
    "Demande annulée. Si la fenêtre de Synco Extension est encore ouverte, fermez-la. Une seule demande est possible à la fois : un autre onglet Synco en attend peut-être une.";

export function unlockFailure(kind: VaultKind | undefined, e: unknown): UnlockFailure {
    if (!(e instanceof VaultError)) return { action: 'error' };
    const extension = kind === 'extension';
    const ownMessage = e.message && e.message !== e.code ? e.message : undefined;
    switch (e.code) {
        case 'wrong-pin':
            return { action: 'wrong-pin', ...(e.retryAfterSeconds ? { retryAfterSeconds: e.retryAfterSeconds } : {}) };
        case 'locked':
            return { action: 'lockout', retryAfterSeconds: e.retryAfterSeconds ?? 30, ...(e.retryAfterSeconds ? {} : { message: ownMessage }) };
        case 'wiped':
            return {
                action: 'reconnect', forget: true, notice: extension
                    ? "Trop d'essais : Synco Extension a effacé les clés de cet appareil. Reconnectez-le."
                    : "Trop d'essais : les clés de cet appareil ont été effacées. Reconnectez-le.",
            };
        case 'missing':
            return {
                action: 'reconnect', forget: true, notice: extension
                    ? "Synco Extension ne contient plus de clé pour cet appareil (supprimée depuis ses options, ou extension réinstallée). Reconnectez-le."
                    : "Les clés de cet appareil sont introuvables. Reconnectez-le.",
            };
        case 'unavailable':
            if (extension) return { action: 'extension-unavailable', message: ownMessage ?? "Synco Extension ne répond pas." };
            return { action: 'reconnect', forget: true, notice: ownMessage ?? "Le coffre sécurisé de cet appareil n'est plus disponible." };
        case 'cancelled':
            return extension ? { action: 'cancelled', message: EXTENSION_CANCELLED_HINT } : { action: 'cancelled' };
        case 'pin-required':
            return { action: 'error' };
    }
}
