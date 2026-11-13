import { DK_LENGTH, VaultError, fromB64, toB64, type DeviceVault, type KeyValueStore, type VaultContext } from './types';

/**
 * Coffre web sans authentificateur matériel : DK est scellée par une clé dérivée du PIN local.
 *
 * LIMITE ASSUMÉE : le navigateur n'offre pas de limiteur d'essais matériel. Un attaquant qui copie le
 * profil (IndexedDB) peut tester les PIN hors ligne, malgré le compteur ci-dessous, qui ne protège que
 * contre un essai en ligne depuis l'application. Ce coffre est donc le repli du web ; la protection
 * réelle vient de WebAuthn PRF quand il est disponible (prfVault.ts), ou d'un autre appareil.
 * Le PIN n'est jamais envoyé au serveur : la compromission du serveur n'ouvre pas ce coffre.
 */

export const PIN_VAULT_ITERATIONS = 600_000;
export const MAX_FAILURES = 10;
const BACKOFF_FROM = 5; // 5 premiers échecs sans attente
const BACKOFF_STEPS_SEC = [30, 120, 600, 3600, 86400];
const MIN_PIN_LENGTH = 4;

interface PinVaultRecord {
    v: 1;
    salt: string;
    iv: string;
    ciphertext: string;
    iterations: number;
    failures: number;
    lockedUntil: number | null;
}

const enc = new TextEncoder();
const recordKey = (deviceId: string) => `e4-pinvault:${deviceId}`;
const aad = (deviceId: string) => enc.encode(`synco-e4-pinvault|${deviceId}`);

async function deriveKey(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export class PinVault implements DeviceVault {
    readonly capabilities = { kind: 'web-pin', hardwareBacked: false, biometric: false, needsPin: true, rateLimit: 'software' } as const;

    private readonly store: KeyValueStore;
    private readonly iterations: number;
    constructor(store: KeyValueStore, iterations = PIN_VAULT_ITERATIONS) {
        this.store = store;
        this.iterations = iterations;
    }

    async create(deviceId: string, ctx?: VaultContext): Promise<Uint8Array> {
        if (!ctx?.pin) throw new VaultError('pin-required');
        if (ctx.pin.length < MIN_PIN_LENGTH) throw new VaultError('wrong-pin', 'Le PIN doit contenir au moins 4 caractères.');

        const dk = crypto.getRandomValues(new Uint8Array(DK_LENGTH));
        await this.write(deviceId, dk, ctx.pin);
        return dk;
    }

    async load(deviceId: string, ctx?: VaultContext): Promise<Uint8Array> {
        if (!ctx?.pin) throw new VaultError('pin-required');
        const record = await this.store.get<PinVaultRecord>(recordKey(deviceId));
        if (!record) throw new VaultError('missing');

        if (record.lockedUntil && record.lockedUntil > Date.now()) {
            throw new VaultError('locked', undefined, Math.ceil((record.lockedUntil - Date.now()) / 1000));
        }

        // L'échec est enregistré AVANT l'essai : interrompre le processus entre l'essai et l'écriture
        // ne permet pas d'obtenir des essais gratuits. Il est annulé si le PIN est bon.
        const failures = record.failures + 1;
        if (failures > MAX_FAILURES) {
            await this.store.del(recordKey(deviceId));
            throw new VaultError('wiped', 'Trop d\'essais : cet appareil doit être relié de nouveau.');
        }
        const step = failures - BACKOFF_FROM;
        const lockedUntil = step > 0 ? Date.now() + BACKOFF_STEPS_SEC[Math.min(step - 1, BACKOFF_STEPS_SEC.length - 1)]! * 1000 : null;
        await this.store.set(recordKey(deviceId), { ...record, failures, lockedUntil } satisfies PinVaultRecord);

        let dk: Uint8Array;
        try {
            const key = await deriveKey(ctx.pin, fromB64(record.salt), record.iterations);
            dk = new Uint8Array(await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: fromB64(record.iv) as BufferSource, additionalData: aad(deviceId) },
                key,
                fromB64(record.ciphertext) as BufferSource
            ));
        } catch {
            if (failures >= MAX_FAILURES) {
                await this.store.del(recordKey(deviceId));
                throw new VaultError('wiped', 'Trop d\'essais : cet appareil doit être relié de nouveau.');
            }
            throw new VaultError('wrong-pin', undefined, lockedUntil ? Math.ceil((lockedUntil - Date.now()) / 1000) : undefined);
        }

        await this.store.set(recordKey(deviceId), { ...record, failures: 0, lockedUntil: null } satisfies PinVaultRecord);
        return dk;
    }

    /**
     * Change le PIN local sans changer DK : rien d'autre à resceller. L'ancien PIN passe par load(),
     * donc par le même compteur d'essais.
     */
    async changePin(deviceId: string, oldPin: string, newPin: string): Promise<void> {
        if (newPin.length < MIN_PIN_LENGTH) throw new VaultError('wrong-pin', 'Le PIN doit contenir au moins 4 caractères.');
        const dk = await this.load(deviceId, { pin: oldPin });
        try {
            await this.write(deviceId, dk, newPin);
        } finally {
            dk.fill(0);
        }
    }

    private async write(deviceId: string, dk: Uint8Array, pin: string): Promise<void> {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(pin, salt, this.iterations);
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(deviceId) }, key, dk as BufferSource));
        await this.store.set(recordKey(deviceId), {
            v: 1, salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(ct), iterations: this.iterations, failures: 0, lockedUntil: null,
        } satisfies PinVaultRecord);
    }

    remove(deviceId: string): Promise<void> {
        return this.store.del(recordKey(deviceId));
    }

    async has(deviceId: string): Promise<boolean> {
        return (await this.store.get(recordKey(deviceId))) !== undefined;
    }
}
