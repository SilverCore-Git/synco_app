import { del, get, set } from 'idb-keyval';
import { PinVault } from './pinVault';
import { PrfVault, webAuthnAvailable } from './prfVault';
import { KeyringVault } from './keyringVault';
import { NativeVault } from './nativeVault';
import type { DevicePlatform } from './localDevice';
import type { DeviceVault, KeyValueStore, VaultKind } from './types';

/**
 * Sélection du coffre de clé d'appareil selon la plateforme (E2EE v4, doc/securite/13-…md §3).
 * Les modules natifs sont importés à la demande : le bundle web ne charge ni Tauri ni Capacitor.
 */

export * from './types';
export { PinVault, PrfVault, KeyringVault, NativeVault };
export * from './localDevice';

/** IndexedDB. */
export const idbStore: KeyValueStore = {
    get: <T>(key: string) => get<T>(key),
    set: (key, value) => set(key, value),
    del: (key) => del(key),
};

export async function detectPlatform(): Promise<DevicePlatform> {
    const { isTauriPlatform } = await import('../keycloak');
    if (isTauriPlatform()) return 'desktop';
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
    return 'web';
}

async function createVault(kind: VaultKind): Promise<DeviceVault | undefined> {
    switch (kind) {
        case 'os-keyring': {
            const { invoke } = await import('@tauri-apps/api/core');
            return new KeyringVault(invoke as never);
        }
        case 'native-biometric': {
            const [{ SecureStorage, KeychainAccess }, { BiometricAuth }] = await Promise.all([
                import('@aparajita/capacitor-secure-storage'),
                import('@aparajita/capacitor-biometric-auth'),
            ]);
            return new NativeVault({
                secureStorage: SecureStorage as never,
                biometric: BiometricAuth as never,
                keychainAccess: KeychainAccess.whenUnlockedThisDeviceOnly,
            });
        }
        case 'webauthn-prf':
            return webAuthnAvailable() ? new PrfVault({
                credentials: navigator.credentials, store: idbStore, rpId: location.hostname,
                signalUnknownCredential: async (credentialId) => {
                    const signal = (window.PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> }).signalUnknownCredential;
                    await signal?.call(window.PublicKeyCredential, { rpId: location.hostname, credentialId });
                },
            }) : undefined;
        case 'web-pin':
            return new PinVault(idbStore);
    }
}

/** Coffre d'un type donné (celui enregistré à l'inscription). */
export const vaultOfKind = (kind: VaultKind) => createVault(kind);

/**
 * Coffres à essayer à l'inscription, du plus protecteur au repli :
 * desktop → trousseau ; mobile → Keychain/Keystore + biométrie ; web → passkey PRF puis PIN local.
 */
export async function preferredVaults(): Promise<DeviceVault[]> {
    const platform = await detectPlatform();
    const kinds: VaultKind[] = platform === 'desktop' ? ['os-keyring']
        : platform === 'web' ? ['webauthn-prf', 'web-pin']
        : ['native-biometric'];
    const vaults = await Promise.all(kinds.map(createVault));
    return vaults.filter((v): v is DeviceVault => !!v);
}
