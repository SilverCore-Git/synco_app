import { DK_LENGTH, VaultError, fromB64, toB64, type DeviceVault, type VaultContext } from './types';

/**
 * Coffre Capacitor (iOS / Android) : DK vit dans le Keychain iOS (accessible seulement appareil
 * déverrouillé, jamais synchronisé ni sauvegardé) ou dans le Keystore Android, via
 * @aparajita/capacitor-secure-storage. Chaque lecture exige d'abord une vérification biométrique
 * (Face ID, Touch ID, empreinte, visage) ou, à défaut, le code de l'appareil, via
 * @aparajita/capacitor-biometric-auth.
 *
 * LIMITE : la vérification biométrique est un contrôle côté application devant un secret protégé par
 * le trousseau de l'OS ; elle n'est pas liée cryptographiquement à la lecture (ce lien demanderait une
 * clé Keystore/Secure Enclave avec contrôle d'accès biométrique, hors du périmètre de ces plugins). Le
 * secret reste protégé par le verrouillage de l'appareil et exclu des sauvegardes (cf. FX4).
 * Un appareil sans aucun verrouillage d'écran est refusé : DK n'y serait protégée par rien.
 */

export interface SecureStoragePlugin {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<unknown>;
    remove(key: string): Promise<unknown>;
    setDefaultKeychainAccess?(access: unknown): Promise<void>;
}

export interface BiometricPlugin {
    checkBiometry(): Promise<{ isAvailable: boolean; deviceIsSecure: boolean; biometryType?: unknown }>;
    authenticate(options: { reason?: string; cancelTitle?: string; allowDeviceCredential?: boolean }): Promise<void>;
}

export interface NativeDeps {
    secureStorage: SecureStoragePlugin;
    biometric: BiometricPlugin;
    /** Valeur `KeychainAccess.whenUnlockedThisDeviceOnly` du plugin (iOS), injectée pour rester testable. */
    keychainAccess?: unknown;
}

const key = (deviceId: string) => `e4-dk:${deviceId}`;

export class NativeVault implements DeviceVault {
    readonly capabilities = { kind: 'native-biometric', hardwareBacked: true, biometric: true, needsPin: false, rateLimit: 'hardware' } as const;
    private configured = false;

    constructor(private readonly deps: NativeDeps) {}

    private async configure(): Promise<void> {
        if (this.configured) return;
        if (this.deps.keychainAccess !== undefined && this.deps.secureStorage.setDefaultKeychainAccess) {
            await this.deps.secureStorage.setDefaultKeychainAccess(this.deps.keychainAccess);
        }
        this.configured = true;
    }

    private async verifyUser(reason?: string): Promise<void> {
        const info = await this.deps.biometric.checkBiometry().catch(() => null);
        if (!info?.deviceIsSecure && !info?.isAvailable) {
            throw new VaultError('unavailable', "Activez un verrouillage d'écran (code, empreinte ou visage) pour protéger vos clés.");
        }
        try {
            await this.deps.biometric.authenticate({ reason: reason ?? 'Déverrouiller vos messages chiffrés', cancelTitle: 'Annuler', allowDeviceCredential: true });
        } catch (e) {
            const code = (e as { code?: string })?.code ?? '';
            if (/cancel|userCancel|systemCancel|appCancel/i.test(code)) throw new VaultError('cancelled');
            if (/lockout/i.test(code)) throw new VaultError('locked', 'Trop d\'essais biométriques : utilisez le code de l\'appareil.');
            throw new VaultError('unavailable', (e as Error)?.message);
        }
    }

    async create(deviceId: string, ctx?: { reason?: string }): Promise<Uint8Array> {
        await this.configure();
        await this.verifyUser(ctx?.reason);
        const dk = crypto.getRandomValues(new Uint8Array(DK_LENGTH));
        await this.deps.secureStorage.set(key(deviceId), toB64(dk));
        return dk;
    }

    async load(deviceId: string, ctx?: { reason?: string }): Promise<Uint8Array> {
        await this.configure();
        await this.verifyUser(ctx?.reason);
        const value = await this.deps.secureStorage.get(key(deviceId));
        if (typeof value !== 'string') throw new VaultError('missing');
        const dk = fromB64(value);
        if (dk.length !== DK_LENGTH) throw new VaultError('missing');
        return dk;
    }

    async remove(deviceId: string): Promise<void> {
        await this.deps.secureStorage.remove(key(deviceId)).catch(() => {});
    }

    async has(deviceId: string): Promise<boolean> {
        return typeof (await this.deps.secureStorage.get(key(deviceId)).catch(() => null)) === 'string';
    }
}
