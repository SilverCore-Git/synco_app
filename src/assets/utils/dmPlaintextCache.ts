import { watch } from 'vue';
import { E2EEUnloked } from './crypto';

// Texte clair des messages privés déjà déchiffrés pendant la session, pour ne
// pas refaire un déchiffrement RSA-4096 (plusieurs ms chacun) en revenant sur
// une conversation déjà ouverte, ni pour une citation dont le message
// d'origine a déjà été déchiffré.
//
// Mémoire uniquement, jamais persisté (localStorage/IndexedDB affaibliraient
// le chiffrement de bout en bout), et vidé dès que l'E2EE est verrouillé.
// La clé inclut le nonce : une édition change le nonce, donc l'ancienne
// entrée n'est jamais resservie pour le nouveau contenu.

const MAX_ENTRIES = 5000;
const cache = new Map<string, string>();

const keyOf = (id: string, nonce: string) => `${id}:${nonce}`;

export function getCachedPlaintext(id: string, nonce: string): string | undefined {
    return cache.get(keyOf(id, nonce));
}

export function setCachedPlaintext(id: string, nonce: string, plaintext: string): void {
    // Map conserve l'ordre d'insertion : la première clé est la plus ancienne.
    if (cache.size >= MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
    }
    cache.set(keyOf(id, nonce), plaintext);
}

watch(E2EEUnloked, (unlocked) => {
    if (!unlocked) cache.clear();
});
