import { onBeforeUnmount, watch, type Ref } from 'vue';
import { user } from '@/assets/var';
import {
    decryptFromPeer, decryptMessageWithContentKey, encryptForPeer, encryptMessageWithContentKey,
} from '@/assets/utils/crypto';

// Préfixe purgé à la déconnexion (USER_SCOPED_PREFIXES, assets/keycloak.ts).
const KEY_PREFIX = 'draft_';
const SAVE_DEBOUNCE_MS = 400;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Distingue un vrai brouillon d'un échec de déchiffrement (decryptMessageWithContentKey
// renvoie un texte d'erreur au lieu de lever).
const PLAIN_MARKER = 'd:';

interface StoredDraft { c: string; iv: string; t: number; k?: string }

/** Chiffrement du brouillon, selon le modèle de chiffrement de la conversation. */
export interface DraftCipher {
    encrypt(plain: string): Promise<{ c: string; iv: string; k?: string }>;
    /** Texte clair, ou n'importe quelle chaîne ne portant pas le marqueur en cas d'échec. */
    decrypt(stored: StoredDraft): Promise<string>;
}

/** Salons/threads/tickets : clé AES-GCM partagée de la conversation. */
export const channelKeyCipher = (key: CryptoKey): DraftCipher => ({
    async encrypt(plain) {
        const { ciphertext, iv } = await encryptMessageWithContentKey(plain, key);
        return { c: ciphertext, iv };
    },
    decrypt: (stored) => decryptMessageWithContentKey(stored.c, stored.iv, key),
});

/** Messages privés : chiffré pour soi-même avec sa clé publique, lu avec sa clé privée déverrouillée. */
export const selfCipher = (myPublicKeyJWK: string, myPrivateKey: CryptoKey): DraftCipher => ({
    async encrypt(plain) {
        const r = await encryptForPeer(plain, myPublicKeyJWK);
        return { c: r.ciphertext, iv: r.iv, k: r.encryptedAesKey };
    },
    async decrypt(stored) {
        if (!stored.k) return '';
        try { return await decryptFromPeer(stored.c, stored.k, stored.iv, myPrivateKey); }
        catch { return ''; }
    },
});

const storageKey = (conversationId: string): string | null =>
    user.value?.id ? `${KEY_PREFIX}${user.value.id}_${conversationId}` : null;

const readStored = (storeKey: string): StoredDraft | null => {
    try {
        const raw = localStorage.getItem(storeKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.c !== 'string' || typeof parsed?.iv !== 'string' || typeof parsed?.t !== 'number') return null;
        return parsed;
    } catch {
        return null;
    }
};

const removeStored = (storeKey: string) => {
    try { localStorage.removeItem(storeKey); } catch { /* localStorage indisponible */ }
};

/**
 * Brouillon du composer d'une conversation, persisté par appareil
 * (localStorage) pour le retrouver en quittant puis en revenant.
 *
 * Les messages sont chiffrés de bout en bout : le brouillon est donc chiffré
 * (`getCipher`, propre à chaque modèle de chiffrement) avant d'être écrit — jamais de texte clair
 * dans le stockage. Tant que le chiffrement n'est pas disponible (clé du salon absente, PIN non saisi), rien n'est lu ni
 * écrit. Le composant est réutilisé d'une conversation à l'autre : le texte
 * est vidé puis rechargé quand `getConversationId` change.
 */
export function useMessageDraft(
    text: Ref<string>,
    getConversationId: () => string | null,
    getCipher: () => DraftCipher | null,
) {
    // Conversation dont le brouillon a été chargé : tant que ça ne correspond
    // pas à la conversation courante, on n'écrit rien (sinon le texte vide
    // d'avant chargement écraserait le brouillon stocké).
    let loadedFor: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: { id: string; cipher: DraftCipher; value: string } | null = null;

    const persist = async (id: string, cipher: DraftCipher, value: string) => {
        const storeKey = storageKey(id);
        if (!storeKey) return;
        if (!value.trim()) return removeStored(storeKey);
        try {
            const stored: StoredDraft = { ...(await cipher.encrypt(PLAIN_MARKER + value)), t: Date.now() };
            localStorage.setItem(storeKey, JSON.stringify(stored));
        } catch {
            // quota ou stockage indisponible : brouillon non conservé, sans impact fonctionnel
        }
    };

    const flush = () => {
        clearTimeout(timer);
        timer = undefined;
        if (!pending) return;
        const { id, cipher, value } = pending;
        pending = null;
        void persist(id, cipher, value);
    };

    const load = async (id: string, cipher: DraftCipher) => {
        const storeKey = storageKey(id);
        if (!storeKey) return;
        const stored = readStored(storeKey);
        if (!stored) { loadedFor = id; return; }
        if (Date.now() - stored.t > MAX_AGE_MS) {
            removeStored(storeKey);
            loadedFor = id;
            return;
        }
        const decrypted = await cipher.decrypt(stored);
        // La conversation a changé pendant le déchiffrement.
        if (getConversationId() !== id) return;
        loadedFor = id;
        if (decrypted.startsWith(PLAIN_MARKER)) {
            // Ne pas écraser ce que l'utilisateur a déjà tapé entre-temps.
            if (!text.value) text.value = decrypted.slice(PLAIN_MARKER.length);
        } else {
            // Clé changée depuis (rotation) : brouillon illisible, on l'abandonne.
            removeStored(storeKey);
        }
    };

    // Changement de conversation : on sauve l'ancien brouillon, puis on repart d'un composer vide.
    watch(getConversationId, () => {
        flush();
        loadedFor = null;
        text.value = '';
    });

    watch([getConversationId, getCipher], ([id, cipher]) => {
        if (id && cipher && loadedFor !== id) void load(id, cipher);
    }, { immediate: true });

    watch(text, (value) => {
        const id = getConversationId();
        const cipher = getCipher();
        if (!id || !cipher || loadedFor !== id) return;
        pending = { id, cipher, value };
        clearTimeout(timer);
        // Vide (ex. après envoi) : suppression immédiate, pas de brouillon fantôme.
        if (!value.trim()) return flush();
        timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    });

    onBeforeUnmount(flush);
}
