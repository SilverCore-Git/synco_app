import type { DeviceVault, VaultKind } from './types';

/**
 * Ordre des coffres proposés à l'inscription sur le web (doc/securite/13-…md §16) :
 *   1. passkey PRF, 2. Synco Extension si le handshake répond, 3. PIN local.
 *
 * La passkey est toujours listée : `PrfVault.create` répond « unavailable » de lui-même, avant toute
 * invite, quand aucun authentificateur de plateforme n'existe (`platformAuthenticatorAvailable`), et
 * `enrollThisDevice` passe alors au coffre suivant. Cette logique n'est donc pas répétée ici.
 */
export interface WebVaultSources {
    prf: () => DeviceVault | undefined;
    /** `detect()` : un handshake a-t-il répondu ? Une erreur vaut « absente ». */
    extension: () => (DeviceVault & { detect(): Promise<boolean> }) | undefined;
    pin: () => DeviceVault;
}

export async function webVaultsInOrder(sources: WebVaultSources): Promise<DeviceVault[]> {
    const prf = sources.prf();
    const extension = sources.extension();
    const detected = extension ? await extension.detect().catch(() => false) : false;
    const list: DeviceVault[] = [];
    if (prf) list.push(prf);
    if (extension && detected) list.push(extension);
    list.push(sources.pin());
    return list;
}

const WEB_KINDS: readonly VaultKind[] = ['webauthn-prf', 'extension', 'web-pin'];

export const isWebVaultKind = (kind: VaultKind | null | undefined): boolean => !!kind && WEB_KINDS.includes(kind);

/**
 * Verrous vers lesquels cet appareil web peut passer (réglage « Verrou de cet appareil »), dans
 * l'ordre de préférence, sans le verrou actuel. Le PIN local est toujours possible ; la passkey si
 * WebAuthn existe (PrfVault refusera seul, avant toute invite, sans authentificateur de plateforme) ;
 * l'extension seulement si elle a répondu. Desktop et mobile : aucun changement proposé.
 */
export function switchTargets(current: VaultKind | null | undefined, available: { prf: boolean; extension: boolean }): VaultKind[] {
    if (!isWebVaultKind(current)) return [];
    return WEB_KINDS.filter(kind => kind !== current
        && (kind !== 'webauthn-prf' || available.prf)
        && (kind !== 'extension' || available.extension));
}
