import sfetch from './sfetch';
import { privateKey, decryptSpaceKeyWithRsa, generateSpaceKey, encryptSpaceKeyForMember } from './crypto';
import { registerKeyCache } from './keyCaches';
import { resolveRecipientKey } from './keyTrust';
import { pinOrCheckKey } from './keyPinning';
import { signKeyEnvelope, verifyKeyEnvelopeIfPresent } from './keyEnvelope';

// Cache for Workspace keys
const workspaceKeyCache = new Map<string, CryptoKey>();
const workspaceKeyVersionCache = new Map<string, number>();
// Appels en cours : N uploads lancés en même temps dans un espace partagent
// la même résolution de clé au lieu de faire N GET (et, si la clé n'existe
// pas encore, N générations concurrentes de clés différentes).
const workspaceKeyInflight = new Map<string, Promise<{ key: CryptoKey, version: number }>>();

// Ces clés déchiffrées restaient utilisables après un verrouillage manuel de
// l'E2EE, contrairement à threadKeyCache (audit FC10).
registerKeyCache(() => {
    workspaceKeyCache.clear();
    workspaceKeyVersionCache.clear();
    workspaceKeyInflight.clear();
    lastShareAttempt.clear();
});

/**
 * Gets the WorkspaceKey for the given workspaceId.
 * If the key doesn't exist yet, it fetches all members' public keys,
 * generates a new WorkspaceKey (v1), encrypts it for everyone, and saves it.
 */
export function getWorkspaceKey(workspaceId: string): Promise<{ key: CryptoKey, version: number }> {
    const inflight = workspaceKeyInflight.get(workspaceId);
    if (inflight) return inflight;
    const promise = resolveWorkspaceKey(workspaceId).finally(() => workspaceKeyInflight.delete(workspaceId));
    workspaceKeyInflight.set(workspaceId, promise);
    // Qui détient la clé la transmet aux membres qui ne l'ont pas encore.
    promise.then(({ key, version }) => { void shareWorkspaceKeyWithMissingMembers(workspaceId, key, version); }, () => {});
    return promise;
}

/**
 * La clé de l'espace existe, mais aucune copie n'a encore été scellée pour
 * ce membre (ajouté après sa création). Elle lui sera transmise dès qu'un
 * membre qui la détient utilisera l'espace.
 */
export class WorkspaceKeyNotSharedError extends Error {
    constructor() {
        super("La clé de chiffrement de cet espace ne vous a pas encore été transmise. Elle le sera dès qu'un membre qui la possède ouvrira l'espace ; réessayez ensuite.");
        this.name = 'WorkspaceKeyNotSharedError';
    }
}

// Au plus un partage par espace et par intervalle : appelé à chaque usage
// de la clé, il ne coûte qu'une requête quand tout le monde l'a déjà.
const SHARE_INTERVAL_MS = 2 * 60 * 1000;
const lastShareAttempt = new Map<string, number>();

/**
 * Scelle la clé de l'espace pour chaque membre qui ne l'a pas encore (clé
 * publique RSA) et dépose ces copies via l'API. Au mieux : un échec est
 * seulement journalisé. `force` ignore l'intervalle (ajout d'un membre).
 */
export async function shareWorkspaceKeyWithMissingMembers(workspaceId: string, key: CryptoKey, version: number, force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - (lastShareAttempt.get(workspaceId) ?? 0) < SHARE_INTERVAL_MS) return;
    lastShareAttempt.set(workspaceId, now);

    try {
        const res = await sfetch(`/api/spaces/${workspaceId}/key/missing`, { method: 'GET' });
        if (!res.ok) return;
        const missing: { version: number; members: { id: string; publicKey: string }[] } = await res.json();
        if (missing.version !== version || missing.members.length === 0) return;

        const keys = [];
        for (const member of missing.members) {
            try {
                // Clé épinglée uniquement : une clé substituée par le serveur
                // pour un membre connu ne reçoit rien (audit FC1).
                const pk = await resolveRecipientKey(member.id, member.publicKey);
                keys.push({ userId: member.id, encryptedKey: await encryptSpaceKeyForMember(key, pk) });
            } catch {
                console.warn(`[E2EE] Clé publique inutilisable ou non vérifiée pour ${member.id} : clé d'espace non transmise.`);
            }
        }
        if (keys.length === 0) return;

        // FC4 §2 : signe l'enveloppe si notre propre clé d'identité est
        // déverrouillée ; sinon, partage quand même la clé (comportement
        // inchangé) mais sans enveloppe — le destinataire la traitera comme
        // non vérifiable, pas comme invalide.
        const envelope = await signKeyEnvelope(key, `space:${workspaceId}`, version).catch(() => null);

        await sfetch(`/api/spaces/${workspaceId}/key/share`, {
            method: 'POST',
            body: JSON.stringify({ version, keys, ...envelope }),
        });
    } catch (e) {
        console.warn("[E2EE] Partage de la clé d'espace impossible :", e);
    }
}

async function fetchWorkspaceKey(workspaceId: string, response?: Response): Promise<{ key: CryptoKey, version: number } | null> {
    const res = response ?? await sfetch(`/api/spaces/${workspaceId}/key`, { method: 'GET' });
    if (!res.ok) return null;
    const data = await res.json();
    const decryptedKey = await decryptSpaceKeyWithRsa(data.encryptedKey, privateKey.value!);
    // FC4 §2 : vérifie l'origine signée avant de faire confiance à la clé,
    // si une enveloppe accompagne cette copie.
    await verifyKeyEnvelopeIfPresent(decryptedKey, `space:${workspaceId}`, data.version, data);
    // Une clé différente de celle épinglée pour cette version est refusée
    // (audit FC4 §1).
    await pinOrCheckKey(decryptedKey, `space:${workspaceId}`, data.version);
    workspaceKeyCache.set(workspaceId, decryptedKey);
    workspaceKeyVersionCache.set(workspaceId, data.version);
    return { key: decryptedKey, version: data.version };
}

async function resolveWorkspaceKey(workspaceId: string): Promise<{ key: CryptoKey, version: number }> {
    
    // 1. Check cache
    if (workspaceKeyCache.has(workspaceId)) {
        return {
            key: workspaceKeyCache.get(workspaceId)!,
            version: workspaceKeyVersionCache.get(workspaceId)!
        };
    }

    if (!privateKey.value) {
        throw new Error("Private key not loaded");
    }

    // 2. Fetch the current key for the user
    try {
        const response = await sfetch(`/api/spaces/${workspaceId}/key`, { method: 'GET' });
        
        if (response.ok) {
            return (await fetchWorkspaceKey(workspaceId, response))!;
        }
        else if (response.status === 404 && (await response.clone().json().catch(() => null))?.keyExists)
        {
            // Une clé existe déjà : en générer une autre la rendrait
            // illisible pour tous les autres membres.
            throw new WorkspaceKeyNotSharedError();
        }
        else if (response.status === 404) 
        {
            // 3. Key doesn't exist, we must generate it (Key Generation)
            // Only admins should ideally do this, but the API restricts saving to admins.
            // If the user isn't an admin, the POST will fail, but that's expected.
            const membersResponse = await sfetch(`/api/spaces/${workspaceId}/members-keys`, { method: 'GET' });
            
            if (!membersResponse.ok) {
                throw new Error("Failed to fetch members keys");
            }
            
            const members = await membersResponse.json();
            
            const newSpaceKey = await generateSpaceKey();
            const version = 1;
            
            const keysToDistribute = [];
            for (const member of members) {
                if (!member.publicKey) continue; // Skip users who haven't generated their keypair yet
                
                try {
                    // encryptSpaceKeyForMember() already imports the JWK itself
                    // (crypto.ts:313-335) — passing it an already-imported
                    // CryptoKey here made it re-run importKey("jwk", ...) on a
                    // CryptoKey object instead of a JsonWebKey, which throws and
                    // was silently swallowed below, so no member ever actually
                    // got a wrapped copy and key generation always failed.
                    const encryptedKeyBase64 = await encryptSpaceKeyForMember(newSpaceKey, await resolveRecipientKey(member.id, member.publicKey));
                    keysToDistribute.push({
                        userId: member.id,
                        encryptedKey: encryptedKeyBase64
                    });
                } catch (e) {
                    console.warn(`Could not encrypt WorkspaceKey for user ${member.id}`);
                }
            }
            
            if (keysToDistribute.length > 0) {
                const envelope = await signKeyEnvelope(newSpaceKey, `space:${workspaceId}`, version).catch(() => null);
                const saveResponse = await sfetch(`/api/spaces/${workspaceId}/key`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keys: keysToDistribute, version, ...envelope })
                });
                
                if (saveResponse.ok) {
                    workspaceKeyCache.set(workspaceId, newSpaceKey);
                    workspaceKeyVersionCache.set(workspaceId, version);
                    return { key: newSpaceKey, version };
                } else if (saveResponse.status === 409) {
                    // Un autre client a persisté sa clé avant nous : c'est
                    // elle qui fait foi, la nôtre est jetée.
                    const persisted = await fetchWorkspaceKey(workspaceId);
                    if (!persisted) throw new Error("Failed to fetch concurrently created WorkspaceKey");
                    return persisted;
                } else {
                    throw new Error("Failed to save new WorkspaceKey");
                }
            } else {
                throw new Error("No members with valid public keys to distribute to.");
            }
        }
        else {
            throw new Error(`Failed to fetch workspace key: ${response.status}`);
        }
    } catch (e) {
        console.error("Error getting WorkspaceKey:", e);
        throw e;
    }
}
