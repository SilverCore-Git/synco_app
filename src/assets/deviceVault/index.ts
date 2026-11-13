import { del, get, set } from 'idb-keyval';
import { ExtensionVault } from './extensionVault';
import { PinVault } from './pinVault';
import { PrfVault, passkeySupport, webAuthnAvailable } from './prfVault';
import { KeyringVault } from './keyringVault';
import { NativeVault } from './nativeVault';
import { webVaultsInOrder } from './selection';
import type { DevicePlatform } from './localDevice';
import type { DeviceVault, KeyValueStore, VaultKind } from './types';

/**
 * Sélection du coffre de clé d'appareil selon la plateforme (E2EE v4, doc/securite/13-…md §3).
 * Les modules natifs sont importés à la demande : le bundle web ne charge ni Tauri ni Capacitor.
 */

export * from './types';
export { ExtensionVault, PinVault, PrfVault, KeyringVault, NativeVault };
export { passkeySupport, type PasskeySupport } from './prfVault';
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

const createPrfVault = () => new PrfVault({
    credentials: navigator.credentials, store: idbStore, rpId: location.hostname,
    platformAuthenticatorAvailable: async () =>
        (await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()) === true,
    signalUnknownCredential: async (credentialId) => {
        const signal = (window.PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> }).signalUnknownCredential;
        await signal?.call(window.PublicKeyCredential, { rpId: location.hostname, credentialId });
    },
});

/** Un seul coffre d'extension par page : un seul canal, une seule détection. */
let extensionVault: ExtensionVault | undefined;
const getExtensionVault = () => typeof window === 'undefined' ? undefined : (extensionVault ??= new ExtensionVault({ win: window }));

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
            return webAuthnAvailable() ? createPrfVault() : undefined;
        case 'web-pin':
            return new PinVault(idbStore);
        case 'extension':
            return getExtensionVault();
    }
}

/** Coffre d'un type donné (celui enregistré à l'inscription). */
export const vaultOfKind = (kind: VaultKind) => createVault(kind);

/**
 * Coffres à essayer à l'inscription, du plus protecteur au repli :
 * desktop → trousseau ; mobile → Keychain/Keystore + biométrie ; web → passkey PRF, puis Synco
 * Extension si elle répond, puis PIN local (voir selection.ts).
 */
export async function preferredVaults(): Promise<DeviceVault[]> {
    const platform = await detectPlatform();
    if (platform === 'web') {
        return webVaultsInOrder({
            prf: () => webAuthnAvailable() ? createPrfVault() : undefined,
            prfSupport: () => passkeySupport(),
            extension: getExtensionVault,
            pin: () => new PinVault(idbStore),
        });
    }
    const vault = await createVault(platform === 'desktop' ? 'os-keyring' : 'native-biometric');
    return vault ? [vault] : [];
}
