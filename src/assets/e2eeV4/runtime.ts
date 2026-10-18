import { user } from '@/assets/var';
import type { User } from '@/types/types';
import { archivedPrivateKeys, privateKey, privateSignKey } from '../utils/crypto';
import { canonicalEcJwk, checkKeyTrust, readPinnedSignKey, trustKey, trustSignKey } from '../utils/keyTrust';
import { detectPlatform, getLocalDevice, idbStore, preferredVaults, vaultOfKind } from '../deviceVault';
import type { DevicePlatform } from '../deviceVault/localDevice';
import type { DeviceVault, VaultKind } from '../deviceVault/types';
import { httpV4Api } from './api';
import { IdentityMismatchError, type DeviceContext, type IdentityKeys, type OwnIdentityTrust, type SealedIdentity, type ServedIdentity } from './session';

/**
 * Liaison de l'orchestration v4 (session.ts) avec l'application : utilisateur courant, IndexedDB,
 * coffres de la plateforme, API, épinglage keyTrust, état `privateKey` / `privateSignKey`.
 */

export const V4_SALT_PREFIX = 'v4:';

/**
 * Le déverrouillage sans saisie (trousseau du système, invite biométrique native) n'est proposé
 * d'office qu'une fois par lancement : après « Verrouiller la session », il faut le redemander.
 */
export const autoUnlock = { tried: false };
export const isV4Account = (pinSalt?: string | null) => !!pinSalt && pinSalt.startsWith(V4_SALT_PREFIX);

/** Sa propre identité, épinglée dans keyTrust (mêmes magasins que pour les autres membres). */
const keyTrustAdapter = (userId: string): OwnIdentityTrust => ({
    async pin(identity, opts) {
        if (!opts?.replace) {
            if (await checkKeyTrust(userId, identity.publicKey) === 'changed') throw new IdentityMismatchError('pinned');
            const sign = await readPinnedSignKey(userId);
            if (sign && sign !== canonicalEcJwk(identity.publicSignKey)) throw new IdentityMismatchError('pinned');
        }
        await trustKey(userId, identity.publicKey);
        await trustSignKey(userId, identity.publicSignKey);
    },
    pinnedSignKey: () => readPinnedSignKey(userId),
});

const vaults = new Map<VaultKind, DeviceVault>();

async function loadVault(kind: VaultKind): Promise<DeviceVault | undefined> {
    if (!vaults.has(kind)) {
        const v = await vaultOfKind(kind);
        if (v) vaults.set(kind, v);
    }
    return vaults.get(kind);
}

/** Coffres proposés à l'inscription, du plus protecteur au repli. */
export async function enrollmentVaults(): Promise<DeviceVault[]> {
    const list = await preferredVaults();
    for (const v of list) if (!vaults.has(v.capabilities.kind)) vaults.set(v.capabilities.kind, v);
    return list.map(v => vaults.get(v.capabilities.kind)!);
}

/** Contexte de l'appareil courant ; précharge le coffre enregistré et ceux de la plateforme. */
export async function deviceContext(): Promise<DeviceContext> {
    const userId = user.value?.id;
    if (!userId) throw new Error('Utilisateur non chargé');
    const record = await getLocalDevice(idbStore, userId);
    if (record) await loadVault(record.vaultKind);
    await enrollmentVaults();
    if ((await detectPlatform()) === 'web') await loadVault('web-pin');
    return { userId, store: idbStore, vaultFor: (k) => vaults.get(k), api: httpV4Api, trust: keyTrustAdapter(userId) };
}

export const vaultFor = (kind: VaultKind) => loadVault(kind);

export function sealedFrom(u: User | null | undefined): SealedIdentity {
    return {
        encryptedPrivateKey: u?.encryptedPrivateKey ?? '',
        keyIv: u?.keyIv ?? '',
        encryptedSignPrivateKey: u?.encryptedSignPrivateKey ?? '',
        signKeyIv: u?.signKeyIv ?? '',
    };
}

export const servedFrom = (u: User | null | undefined): ServedIdentity => ({ publicKey: u?.publicKey, publicSignKey: u?.publicSignKey });

/** Arme la session déverrouillée (comme unlockSecurity*). */
export function applyIdentityKeys(keys: IdentityKeys) {
    archivedPrivateKeys.value = keys.archivedKeys;
    privateSignKey.value = keys.privateSignKey;
    privateKey.value = keys.privateKey;
}

export const PLATFORM_LABELS: Record<DevicePlatform, string> = {
    web: 'Navigateur',
    ios: 'iPhone / iPad',
    android: 'Android',
    desktop: 'Application de bureau',
};

export const PLATFORM_ICONS: Record<DevicePlatform, string> = {
    web: 'bi-globe2',
    ios: 'bi-phone',
    android: 'bi-phone',
    desktop: 'bi-laptop',
};

/** Nom proposé pour cet appareil (modifiable ensuite). */
export function defaultDeviceName(platform: DevicePlatform): string {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) && !/iPhone|iPad/.test(ua) ? 'macOS'
        : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
    if (platform === 'web') {
        const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
        return os ? `${browser} sur ${os}` : browser;
    }
    if (platform === 'desktop') return os ? `Synco pour ${os}` : 'Synco pour ordinateur';
    return platform === 'ios' ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : 'Téléphone Android';
}

export { detectPlatform };
