import { watch } from 'vue';
import { E2EEUnloked } from './crypto';

// Clés AES des salons déjà déchiffrées pendant la session. Sans ce cache,
// chaque ouverture d'un salon attendait l'aller-retour get-thread-access ET un
// déchiffrement RSA-4096 (~20 ms dans WebKitGTK) avant de pouvoir afficher le
// moindre message, même pour un salon rouvert dix fois.
//
// La version chiffrée (encryptedKey) est conservée à côté : ThreadView.vue
// affiche avec la clé en cache puis la revalide auprès du serveur, et ne
// refait le déchiffrement RSA que si elle a changé (réinitialisation E2EE,
// redistribution des clés).
//
// Mémoire uniquement, jamais persisté, vidé dès que l'E2EE est verrouillé.

interface CachedThreadKey {
    encryptedKey: string;
    key: CryptoKey;
}

const cache = new Map<string, CachedThreadKey>();

export function getCachedThreadKey(threadId: string): CachedThreadKey | undefined {
    return cache.get(threadId);
}

export function setCachedThreadKey(threadId: string, encryptedKey: string, key: CryptoKey): void {
    cache.set(threadId, { encryptedKey, key });
}

export function invalidateThreadKey(threadId: string): void {
    cache.delete(threadId);
}

watch(E2EEUnloked, (unlocked) => {
    if (!unlocked) cache.clear();
});
