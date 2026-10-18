import { DK_LENGTH, VaultError, fromB64, toB64, type DeviceVault } from './types';

/**
 * Coffre Tauri (desktop) : DK dans le trousseau du système (Keychain macOS, Gestionnaire d'identifiants
 * Windows, Secret Service Linux) via les commandes `secure_store_*` de src-tauri/src/lib.rs (déjà
 * utilisées pour le jeton de rafraîchissement, FC9).
 *
 * LIMITE : la session de l'OS est l'unique barrière (pas de biométrie ni de limiteur d'essais propres
 * à l'application). Un logiciel malveillant s'exécutant dans la session de l'utilisateur peut lire le
 * trousseau ; c'est le niveau de protection de tout client de bureau.
 */

export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const key = (deviceId: string) => `e2ee-dk:${deviceId}`;

export class KeyringVault implements DeviceVault {
    readonly capabilities = { kind: 'os-keyring', hardwareBacked: false, biometric: false, needsPin: false, rateLimit: 'none' } as const;

    constructor(private readonly invoke: Invoke) {}

    async create(deviceId: string): Promise<Uint8Array> {
        const dk = crypto.getRandomValues(new Uint8Array(DK_LENGTH));
        try {
            await this.invoke('secure_store_set', { key: key(deviceId), value: toB64(dk) });
        } catch (e) {
            throw new VaultError('unavailable', String(e));
        }
        return dk;
    }

    async load(deviceId: string): Promise<Uint8Array> {
        let value: string | null;
        try {
            value = await this.invoke<string | null>('secure_store_get', { key: key(deviceId) });
        } catch (e) {
            throw new VaultError('unavailable', String(e));
        }
        if (!value) throw new VaultError('missing');
        const dk = fromB64(value);
        if (dk.length !== DK_LENGTH) throw new VaultError('missing');
        return dk;
    }

    async remove(deviceId: string): Promise<void> {
        await this.invoke('secure_store_delete', { key: key(deviceId) }).catch(() => {});
    }

    async has(deviceId: string): Promise<boolean> {
        return !!(await this.invoke<string | null>('secure_store_get', { key: key(deviceId) }).catch(() => null));
    }
}
