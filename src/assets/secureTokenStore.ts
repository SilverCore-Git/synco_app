// Stockage sécurisé du refresh token Keycloak sur les plateformes natives
// (audit FC9). Avant ce fichier, keycloak.ts écrivait kc_token/kc_refreshToken
// en clair dans localStorage — un fichier non chiffré du profil utilisateur
// sur Tauri (WebKitGTK/WebView2/WKWebView) et inclus dans les sauvegardes
// Android/iOS. Seul le refresh token est désormais persisté, et uniquement
// dans le trousseau de l'OS (Tauri : Keychain/Gestionnaire d'identifiants/
// Secret Service via le crate `keyring`, commandes src-tauri/src/lib.rs ;
// Capacitor : Keychain/Android Keystore via @aparajita/capacitor-secure-storage).
// Le jeton d'accès n'est plus jamais écrit sur disque : il ne vit qu'en
// mémoire dans l'instance keycloak-js.
import { Capacitor } from '@capacitor/core';
import { isTauriPlatform } from './keycloak';

const KEY = 'kc_refreshToken';

export async function saveRefreshToken(token: string): Promise<void> {
    if (isTauriPlatform()) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('secure_store_set', { key: KEY, value: token });
    } else if (Capacitor.isNativePlatform()) {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        await SecureStorage.set(KEY, token);
    }
    // Web : rien à faire ici — keycloak-js gère la session via la session SSO
    // du navigateur (cookie + silent-check-sso), pas via ce magasin.
}

export async function loadRefreshToken(): Promise<string | undefined> {
    if (isTauriPlatform()) {
        const { invoke } = await import('@tauri-apps/api/core');
        return (await invoke<string | null>('secure_store_get', { key: KEY })) ?? undefined;
    }
    if (Capacitor.isNativePlatform()) {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        return ((await SecureStorage.get(KEY)) as string | null) ?? undefined;
    }
    return undefined;
}

export async function clearTokens(): Promise<void> {
    if (isTauriPlatform()) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('secure_store_delete', { key: KEY }).catch(() => {});
    } else if (Capacitor.isNativePlatform()) {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        await SecureStorage.remove(KEY).catch(() => {});
    }
    // Migration : purge des anciennes clés en clair laissées par les
    // versions précédentes, sur toutes les plateformes.
    for (const k of ['kc_token', 'kc_refreshToken']) {
        try { localStorage.removeItem(k); } catch { /* indisponible (SSR, navigation privée) */ }
    }
}
