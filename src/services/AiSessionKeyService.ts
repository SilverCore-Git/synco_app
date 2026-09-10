import sfetch from '@/assets/utils/sfetch';
import { user } from '@/assets/var';
import {
    privateKey,
    generateAiSessionKey,
    wrapAiSessionKeyForMember,
    unwrapAiSessionKey,
} from '@/assets/utils/crypto';

/**
 * Erreur typée levée par `ensureAiSessionKey`/`getAiSessionKeyRawBase64` — l'appelant (UI) doit la
 * traduire en message utilisateur, sur le même principe que le placeholder
 * "[🔒 Conversation chiffrée. Clé privée manquante.]" déjà utilisé dans AIService.ts.
 */
export class AiSessionKeyUnavailableError extends Error {}

interface CachedAiSessionKey {
    cryptoKey: CryptoKey;
    rawBase64: string;
}

// Clé de session IA par organisation, en mémoire uniquement — jamais persistée en localStorage,
// cohérent avec la convention existante pour `privateKey` dans crypto.ts.
const cache = new Map<string, CachedAiSessionKey>();
const pending = new Map<string, Promise<CachedAiSessionKey>>();

function bytesToBase64(bytes: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64ToBytes(b64: string): ArrayBuffer {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

async function toCachedKey(rawKeyBytes: ArrayBuffer): Promise<CachedAiSessionKey> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw', rawKeyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    return { cryptoKey, rawBase64: bytesToBase64(rawKeyBytes) };
}

/**
 * Première activation du provider 'gateway' pour cette org : personne n'a encore de clé de
 * session IA, on en génère une et on l'enveloppe pour soi-même. L'endpoint synco_api fait sa
 * propre vérification de permission (cf. plan synco_api §4.3) — comme AISettings.vue/saveSettings()
 * ne fait elle-même aucun contrôle de rôle côté client pour écrire activeModules.aiConfig, on
 * n'en duplique pas non plus ici.
 */
async function bootstrapAiSessionKey(orgId: string): Promise<CachedAiSessionKey> {
    if (!user.value?.publicKey) {
        throw new AiSessionKeyUnavailableError("Votre clé publique de chiffrement E2EE n'est pas configurée.");
    }

    const sessionKey = await generateAiSessionKey();
    const rawKeyBytes = await crypto.subtle.exportKey('raw', sessionKey);
    const encryptedKey = await wrapAiSessionKeyForMember(rawKeyBytes, user.value.publicKey);

    const res = await sfetch(`/api/orgs/${orgId}/ai/key`, {
        method: 'POST',
        body: JSON.stringify({ encryptedKey }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new AiSessionKeyUnavailableError(`Impossible de provisionner la clé de session IA (${res.status}): ${body}`);
    }

    return toCachedKey(rawKeyBytes);
}

/**
 * Récupère (et déchiffre) la clé de session IA de l'org courante, en la mettant en cache pour les
 * appels suivants. Si aucune clé n'existe encore pour l'org (404), en génère une nouvelle
 * (bootstrap, cf. E2EE_PLAN.md §3.2).
 */
export async function ensureAiSessionKey(orgId: string): Promise<CryptoKey> {
    const cached = cache.get(orgId);
    if (cached) return cached.cryptoKey;

    let inflight = pending.get(orgId);
    if (!inflight) {
        inflight = (async () => {
            if (!privateKey.value) {
                throw new AiSessionKeyUnavailableError('🔒 Déverrouillez votre sécurité (code PIN) pour accéder à l\'IA.');
            }
            const myPrivateKey = privateKey.value;

            const res = await sfetch(`/api/orgs/${orgId}/ai/key`);

            let result: CachedAiSessionKey;
            if (res.status === 404) {
                result = await bootstrapAiSessionKey(orgId);
            } else if (res.ok) {
                const { encryptedKey } = await res.json();
                const rawKeyBytes = await unwrapAiSessionKey(encryptedKey, myPrivateKey);
                result = await toCachedKey(rawKeyBytes);
            } else {
                const body = await res.text().catch(() => '');
                throw new AiSessionKeyUnavailableError(`Erreur de récupération de la clé de session IA (${res.status}): ${body}`);
            }

            cache.set(orgId, result);
            return result;
        })();
        pending.set(orgId, inflight);
        // Le retour de `.finally()` est une promesse distincte, non attendue par ailleurs : sans ce
        // `.catch`, un rejet de `inflight` la ferait aussi rejeter sans jamais être capturée
        // (unhandled rejection), même si l'appelant gère bien l'erreur via `await inflight` plus bas.
        inflight.finally(() => pending.delete(orgId)).catch(() => {});
    }

    const result = await inflight;
    return result.cryptoKey;
}

/** Clé brute en base64, prête à poser dans le header `X-Session-Key` envoyé à la gateway. */
export async function getAiSessionKeyRawBase64(orgId: string): Promise<string> {
    const cached = cache.get(orgId);
    if (cached) return cached.rawBase64;
    await ensureAiSessionKey(orgId);
    return cache.get(orgId)!.rawBase64;
}

/** À appeler quand la sécurité E2EE est verrouillée (PIN reverrouillé, changement d'utilisateur, etc). */
export function clearAiSessionKeyCache(orgId?: string) {
    if (orgId) {
        cache.delete(orgId);
        pending.delete(orgId);
    } else {
        cache.clear();
        pending.clear();
    }
}

/**
 * Partage la clé de session IA déjà connue localement avec un autre membre de l'org (nouveau
 * membre, ou membre dont la ligne AiSessionKey n'a pas encore été provisionnée). Utilise les
 * octets bruts mis en cache lors du dernier `ensureAiSessionKey` — la CryptoKey elle-même est
 * importée non-extractable et ne peut pas être ré-exportée.
 */
export async function shareAiSessionKeyWithMember(
    orgId: string,
    targetUserId: string,
    targetPublicKeyJWK: string | object
): Promise<void> {
    await ensureAiSessionKey(orgId);
    const cached = cache.get(orgId)!;

    const encryptedKey = await wrapAiSessionKeyForMember(base64ToBytes(cached.rawBase64), targetPublicKeyJWK);

    const res = await sfetch(`/api/orgs/${orgId}/ai/key`, {
        method: 'POST',
        body: JSON.stringify({ encryptedKey, targetUserId }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Impossible de partager la clé de session IA (${res.status}): ${body}`);
    }
}
