import sfetch from '@/assets/utils/sfetch';
import { user } from '@/assets/var';
import {
    privateKey,
    generateAiSessionKey,
    wrapAiSessionKeyForMember,
    unwrapAiSessionKey,
} from '@/assets/utils/crypto';
import { registerKeyCache } from '@/assets/utils/keyCaches';
import { requireTrustedKey } from '@/assets/utils/keyTrust';
import { pinOrCheckKey } from '@/assets/utils/keyPinning';

/**
 * Erreur typée levée par `ensureAiSessionKey`/`getAiSessionKeyRawBase64` — l'appelant (UI) doit la
 * traduire en message utilisateur, sur le même principe que le placeholder
 * "[🔒 Conversation chiffrée. Clé privée manquante.]" déjà utilisé dans AIService.ts.
 */
export class AiSessionKeyUnavailableError extends Error {}

interface CachedAiSessionKey {
    cryptoKey: CryptoKey;
    // Scellé RSA (jamais les octets bruts) : X-Session-Key et le repartage
    // vers un nouveau membre déchiffrent à la demande via `privateKey`
    // plutôt que de garder la clé brute en mémoire sous forme de chaîne
    // immuable, impossible à effacer et lisible par tout script de la page
    // (audit FC10).
    sealedForMe: string;
}

// Clé de session IA par organisation, en mémoire uniquement — jamais persistée en localStorage,
// cohérent avec la convention existante pour `privateKey` dans crypto.ts.
const cache = new Map<string, CachedAiSessionKey>();
const pending = new Map<string, Promise<CachedAiSessionKey>>();

function bytesToBase64(bytes: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function toCachedKey(rawKeyBytes: ArrayBuffer, sealedForMe: string): Promise<CachedAiSessionKey> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw', rawKeyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    return { cryptoKey, sealedForMe };
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

    const cached = await toCachedKey(rawKeyBytes, encryptedKey);
    new Uint8Array(rawKeyBytes).fill(0);
    return cached;
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
                // Version figée à 1 côté serveur (QW6) ; clé épinglée (FC4).
                await pinOrCheckKey(rawKeyBytes, `ai:${orgId}`, 1);
                result = await toCachedKey(rawKeyBytes, encryptedKey);
                new Uint8Array(rawKeyBytes).fill(0);
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

/**
 * Clé brute en base64, prête à poser dans le header `X-Session-Key` envoyé à
 * la gateway. Déchiffrée à la demande depuis le scellé RSA à chaque appel —
 * jamais gardée en mémoire sous forme de chaîne base64 durable (audit FC10).
 */
export async function getAiSessionKeyRawBase64(orgId: string): Promise<string> {
    if (!cache.get(orgId)) await ensureAiSessionKey(orgId);
    const cached = cache.get(orgId)!;
    if (!privateKey.value) {
        throw new AiSessionKeyUnavailableError('🔒 Déverrouillez votre sécurité (code PIN) pour accéder à l\'IA.');
    }
    const rawKeyBytes = await unwrapAiSessionKey(cached.sealedForMe, privateKey.value);
    const b64 = bytesToBase64(rawKeyBytes);
    new Uint8Array(rawKeyBytes).fill(0);
    return b64;
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

// Cette fonction existait déjà mais n'était appelée nulle part : le cache de
// clé de session IA survivait donc à un verrouillage manuel de l'E2EE
// (audit FC10).
registerKeyCache(() => clearAiSessionKeyCache());

/**
 * Partage la clé de session IA déjà connue localement avec un autre membre de l'org (nouveau
 * membre, ou membre dont la ligne AiSessionKey n'a pas encore été provisionnée). Redéchiffre les
 * octets bruts depuis le scellé RSA pour l'occasion — la CryptoKey en cache est importée
 * non-extractable et ne peut pas être ré-exportée (audit FC10).
 */
export async function shareAiSessionKeyWithMember(
    orgId: string,
    targetUserId: string,
    targetPublicKeyJWK: string | object
): Promise<void> {
    await ensureAiSessionKey(orgId);
    const cached = cache.get(orgId)!;
    if (!privateKey.value) {
        throw new AiSessionKeyUnavailableError('🔒 Déverrouillez votre sécurité (code PIN) pour accéder à l\'IA.');
    }

    // Clé épinglée du destinataire (audit FC1), résolue avant de toucher aux
    // octets bruts de la clé de session.
    const trustedKey = await requireTrustedKey(targetUserId, targetPublicKeyJWK);
    const rawKeyBytes = await unwrapAiSessionKey(cached.sealedForMe, privateKey.value);
    const encryptedKey = await wrapAiSessionKeyForMember(rawKeyBytes, trustedKey);
    new Uint8Array(rawKeyBytes).fill(0);

    const res = await sfetch(`/api/orgs/${orgId}/ai/key`, {
        method: 'POST',
        body: JSON.stringify({ encryptedKey, targetUserId }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Impossible de partager la clé de session IA (${res.status}): ${body}`);
    }
}
