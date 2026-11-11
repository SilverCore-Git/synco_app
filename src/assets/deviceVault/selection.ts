import type { PasskeySupport } from './prfVault';
import type { DeviceVault, VaultKind } from './types';

/**
 * Ordre des coffres proposés à l'inscription sur le web (doc/securite/13-…md §16) :
 *   1. passkey PRF, 2. Synco Extension si le handshake répond, 3. PIN local.
 *
 * Une passkey ne se découvre inutilisable qu'en ouvrant l'invite du navigateur, parfois deux fois
 * (création, puis lecture du secret PRF) : l'utilisateur voit alors des fenêtres qu'il ne comprend pas,
 * et doit les annuler avant d'arriver au bon verrou. La passkey n'est donc tentée d'office que si le
 * navigateur annonce, sans invite, qu'il la prend en charge (`prfSupport`) :
 *   - 'yes'     → passkey en premier ;
 *   - 'no'      → passkey écartée ;
 *   - 'unknown' → passkey écartée SI l'extension répond (le verrou sûr existe, inutile de parier) ; sinon
 *                 tentée comme avant (`PrfVault` se replie lui-même sans invite quand aucun authentificateur
 *                 de plateforme n'existe). L'utilisateur peut toujours la choisir dans « Verrou de cet appareil ».
 */
export interface WebVaultSources {
    prf: () => DeviceVault | undefined;
    /** Prise en charge de la passkey, sans invite. Absente = 'unknown'. */
    prfSupport?: () => Promise<PasskeySupport>;
    /** `detect()` : un handshake a-t-il répondu ? Une erreur vaut « absente ». */
    extension: () => (DeviceVault & { detect(): Promise<boolean> }) | undefined;
    pin: () => DeviceVault;
}

export async function webVaultsInOrder(sources: WebVaultSources): Promise<DeviceVault[]> {
    const extension = sources.extension();
    const detected = extension ? await extension.detect().catch(() => false) : false;
    const support = sources.prfSupport ? await sources.prfSupport().catch((): PasskeySupport => 'unknown') : 'unknown';
    const prf = sources.prf();
    const tryPasskey = !!prf && support !== 'no' && (support === 'yes' || !detected);
    const list: DeviceVault[] = [];
    if (prf && tryPasskey) list.push(prf);
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
