import {
    E2eeV4Error, createDeviceEnvelope, generateDeviceId, generateDeviceKeyPair, openDeviceEnvelope,
    openDevicePrivateKey, openDevicePrivateKeyBytes, sealDevicePrivateKey, signDeviceCertificate,
} from '../utils/e2eeV4';
import { VaultError, type DeviceVault, type KeyValueStore, type VaultContext, type VaultKind } from './types';

/**
 * Appareil local de l'E2EE v4 : enregistrement de l'appareil sur ce poste, déverrouillage de la clé de
 * compte (AK) à chaque ouverture. Rien ici n'est secret en clair : la clé privée de l'appareil est
 * scellée par DK, et DK n'existe que dans le coffre de la plateforme.
 */

export type DevicePlatform = 'web' | 'ios' | 'android' | 'desktop';

export interface LocalDeviceRecord {
    v: 1;
    userId: string;
    deviceId: string;
    vaultKind: VaultKind;
    /** Clé privée ECDH de l'appareil, scellée par DK. */
    sealedPrivateKey: string;
    publicKey: JsonWebKey;
    createdAt: number;
    /**
     * Clés publiques d'identité du compte (JWK canoniques), dérivées des clés privées ouvertes par une
     * AK authentifiée lors de l'inscription. À chaque déverrouillage, les clés ouvertes doivent y
     * correspondre : un serveur qui servirait une fausse enveloppe ET de fausses clés d'identité
     * (spec §7) est détecté. Absent des enregistrements antérieurs à P4.
     */
    identity?: IdentityPin;
}

export interface IdentityPin {
    publicKey: string;
    publicSignKey: string;
}

const recordKey = (userId: string) => `e4-device:${userId}`;

export const getLocalDevice = (store: KeyValueStore, userId: string) => store.get<LocalDeviceRecord>(recordKey(userId));

/** Corps de POST /api/e2ee/v4/init ou /devices (champ `device`). */
export interface DevicePayload {
    id: string;
    name: string;
    platform: DevicePlatform;
    /** JWK sérialisé (l'API le stocke tel quel). */
    publicKey: string;
    certificate: string;
    envelope: string;
}

export interface EnrollArgs {
    userId: string;
    name: string;
    platform: DevicePlatform;
    /** AK en clair, le temps de l'inscription (à effacer par l'appelant). */
    akBytes: Uint8Array;
    /** Clé de signature d'identité déverrouillée : elle certifie la clé publique de l'appareil. */
    identitySignKey: CryptoKey;
    /** Coffres par ordre de préférence ; on passe au suivant quand un coffre est « unavailable ». */
    vaults: DeviceVault[];
    store: KeyValueStore;
    ctx?: VaultContext;
    /** Identité du compte à épingler dans l'enregistrement local (voir LocalDeviceRecord.identity). */
    identity?: IdentityPin;
}

/**
 * Enregistre cet appareil : paire ECDH, DK dans le meilleur coffre disponible, clé privée scellée,
 * certificat, enveloppe d'AK vers sa propre clé publique. L'enregistrement local n'est écrit qu'une
 * fois le coffre rempli ; en cas d'échec, rien ne subsiste.
 */
export async function enrollThisDevice(args: EnrollArgs): Promise<{ payload: DevicePayload; record: LocalDeviceRecord }> {
    const deviceId = generateDeviceId();
    const pair = await generateDeviceKeyPair();

    let vault: DeviceVault | undefined;
    let dk: Uint8Array | undefined;
    let lastError: unknown;
    for (const candidate of args.vaults) {
        try {
            dk = await candidate.create(deviceId, args.ctx);
            vault = candidate;
            break;
        } catch (e) {
            lastError = e;
            // Seule l'indisponibilité de la plateforme autorise un repli ; une annulation, un PIN manquant… remontent.
            if (!(e instanceof VaultError) || e.code !== 'unavailable') throw e;
        }
    }
    if (!vault || !dk) throw lastError instanceof Error ? lastError : new VaultError('unavailable');

    try {
        const sealedPrivateKey = await sealDevicePrivateKey(dk, deviceId, pair.privateKeyPkcs8);
        new Uint8Array(pair.privateKeyPkcs8).fill(0);
        const certificate = await signDeviceCertificate(args.identitySignKey, args.userId, deviceId, args.platform, pair.publicKey);
        const envelope = await createDeviceEnvelope(pair.publicKey, args.akBytes, args.userId, deviceId);

        const record: LocalDeviceRecord = {
            v: 1, userId: args.userId, deviceId, vaultKind: vault.capabilities.kind, sealedPrivateKey, publicKey: pair.publicKey, createdAt: Date.now(),
            ...(args.identity ? { identity: args.identity } : {}),
        };
        await args.store.set(recordKey(args.userId), record);
        return {
            record,
            payload: { id: deviceId, name: args.name, platform: args.platform, publicKey: JSON.stringify(pair.publicKey), certificate, envelope },
        };
    } catch (e) {
        await vault.remove(deviceId).catch(() => {});
        throw e;
    } finally {
        dk.fill(0);
    }
}

export interface UnlockArgs {
    userId: string;
    /** Coffre correspondant à `record.vaultKind` (le choix est fait à l'inscription, pas à chaque ouverture). */
    vaultFor: (kind: VaultKind) => DeviceVault | undefined;
    store: KeyValueStore;
    fetchEnvelope: (deviceId: string) => Promise<{ envelope: string; publicKey: string | JsonWebKey }>;
    ctx?: VaultContext;
}

const canonical = (jwk: JsonWebKey) => JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });

/**
 * Déverrouille AK sur cet appareil : coffre → DK → clé privée de l'appareil → enveloppe servie par le
 * serveur. La clé publique renvoyée par le serveur doit être celle enregistrée localement, sinon le
 * serveur a tenté de substituer une enveloppe.
 */
export async function unlockAccountKey(args: UnlockArgs): Promise<{ akBytes: Uint8Array; deviceId: string; record: LocalDeviceRecord }> {
    const record = await getLocalDevice(args.store, args.userId);
    if (!record) throw new VaultError('missing', 'Cet appareil n\'est pas enregistré.');
    const vault = args.vaultFor(record.vaultKind);
    if (!vault) throw new VaultError('unavailable', 'Le coffre de cet appareil n\'est plus disponible.');

    const dk = await vault.load(record.deviceId, args.ctx);
    let privateKey: CryptoKey;
    try {
        privateKey = await openDevicePrivateKey(dk, record.deviceId, record.sealedPrivateKey);
    } finally {
        dk.fill(0);
    }

    const remote = await args.fetchEnvelope(record.deviceId);
    const remotePublic = typeof remote.publicKey === 'string' ? JSON.parse(remote.publicKey) as JsonWebKey : remote.publicKey;
    if (canonical(remotePublic) !== canonical(record.publicKey)) {
        throw new E2eeV4Error('Server device key does not match this device');
    }
    const akBytes = await openDeviceEnvelope(privateKey, record.publicKey, remote.envelope, args.userId, record.deviceId);
    return { akBytes, deviceId: record.deviceId, record };
}

export interface SwitchVaultArgs {
    userId: string;
    store: KeyValueStore;
    from: DeviceVault;
    to: DeviceVault;
    fromCtx?: VaultContext;
    toCtx?: VaultContext;
}

/**
 * Change le coffre de cet appareil (ex. PIN local → passkey) sans changer d'appareil : la clé privée
 * de l'appareil est rescellée sous une nouvelle DK. Rien ne change côté serveur. L'ancien coffre
 * n'est vidé qu'une fois le nouvel enregistrement écrit.
 */
export async function switchVault(args: SwitchVaultArgs): Promise<LocalDeviceRecord> {
    const record = await getLocalDevice(args.store, args.userId);
    if (!record) throw new VaultError('missing', 'Cet appareil n\'est pas enregistré.');
    if (record.vaultKind !== args.from.capabilities.kind) throw new VaultError('unavailable', 'Coffre actuel inattendu.');
    if (args.from.capabilities.kind === args.to.capabilities.kind) return record;

    const oldDk = await args.from.load(record.deviceId, args.fromCtx);
    let pkcs8: Uint8Array;
    try {
        pkcs8 = await openDevicePrivateKeyBytes(oldDk, record.deviceId, record.sealedPrivateKey);
    } finally {
        oldDk.fill(0);
    }

    try {
        const newDk = await args.to.create(record.deviceId, args.toCtx);
        try {
            const next: LocalDeviceRecord = {
                ...record,
                vaultKind: args.to.capabilities.kind,
                sealedPrivateKey: await sealDevicePrivateKey(newDk, record.deviceId, pkcs8 as BufferSource),
            };
            await args.store.set(recordKey(args.userId), next);
            await args.from.remove(record.deviceId).catch(() => {});
            return next;
        } catch (e) {
            await args.to.remove(record.deviceId).catch(() => {});
            throw e;
        } finally {
            newDk.fill(0);
        }
    } finally {
        pkcs8.fill(0);
    }
}

/** Oublie cet appareil localement (déconnexion, appareil retiré à distance). */
export async function forgetThisDevice(userId: string, store: KeyValueStore, vaultFor: UnlockArgs['vaultFor']): Promise<void> {
    const record = await getLocalDevice(store, userId);
    if (!record) return;
    await vaultFor(record.vaultKind)?.remove(record.deviceId).catch(() => {});
    await store.del(recordKey(userId));
}
