import sfetch from './sfetch';
import { privateKey, decryptSpaceKeyWithRsa, generateSpaceKey, encryptSpaceKeyForMember } from './crypto';
import { openedOrg, user } from '@/assets/var';

// Cache for DM conversation keys, keyed by peerId
const dmKeyCache = new Map<string, CryptoKey>();
const dmKeyVersionCache = new Map<string, number>();
// Appels en cours, cf. workspaceKeyInflight dans workspaceCrypto.ts.
const dmKeyInflight = new Map<string, Promise<{ key: CryptoKey, version: number }>>();

/**
 * Gets the persistent DMConversationKey shared with peerId.
 * If it doesn't exist yet, generates a new one (v1), wraps it for both
 * participants (self + peer), and saves it.
 *
 * Mirrors getWorkspaceKey() in workspaceCrypto.ts, but a DM conversation
 * only ever has 2 participants — no "admin distributes to everyone" step,
 * whoever gets there first (sender or recipient) can mint version 1.
 */
export function getDMConversationKey(peerId: string): Promise<{ key: CryptoKey, version: number }> {
    const inflight = dmKeyInflight.get(peerId);
    if (inflight) return inflight;
    const promise = resolveDMConversationKey(peerId).finally(() => dmKeyInflight.delete(peerId));
    dmKeyInflight.set(peerId, promise);
    return promise;
}

async function fetchDMConversationKey(peerId: string, response?: Response): Promise<{ key: CryptoKey, version: number } | null> {
    const res = response ?? await sfetch(`/api/dm/${peerId}/key`, { method: 'GET' });
    if (!res.ok) return null;
    const data = await res.json();
    const decryptedKey = await decryptSpaceKeyWithRsa(data.encryptedKey, privateKey.value!);
    dmKeyCache.set(peerId, decryptedKey);
    dmKeyVersionCache.set(peerId, data.version);
    return { key: decryptedKey, version: data.version };
}

async function resolveDMConversationKey(peerId: string): Promise<{ key: CryptoKey, version: number }> {

    // 1. Check cache
    if (dmKeyCache.has(peerId)) {
        return {
            key: dmKeyCache.get(peerId)!,
            version: dmKeyVersionCache.get(peerId)!
        };
    }

    if (!privateKey.value) {
        throw new Error("Private key not loaded");
    }

    // 2. Fetch the current key for this conversation
    try {
        const response = await sfetch(`/api/dm/${peerId}/key`, { method: 'GET' });

        if (response.ok) {
            return (await fetchDMConversationKey(peerId, response))!;
        }
        else if (response.status === 404)
        {
            // 3. Key doesn't exist yet: generate it and wrap it for both participants
            const peerPublicKey = openedOrg.value?.members?.find(m => m.user?.id === peerId)?.user?.publicKey;
            if (!peerPublicKey) {
                throw new Error("Recipient's public key not available");
            }
            if (!user.value?.publicKey) {
                throw new Error("Own public key not available");
            }

            const newKey = await generateSpaceKey();

            const encryptedKeyForPeer = await encryptSpaceKeyForMember(newKey, peerPublicKey);
            const encryptedKeyForMe = await encryptSpaceKeyForMember(newKey, user.value.publicKey);

            const saveResponse = await sfetch(`/api/dm/${peerId}/key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ encryptedKeyForMe, encryptedKeyForPeer })
            });

            if (saveResponse.status === 409) {
                // Le pair a créé la clé en même temps que nous : la sienne
                // fait foi, la nôtre est jetée.
                const persisted = await fetchDMConversationKey(peerId);
                if (!persisted) throw new Error("Failed to fetch concurrently created DMConversationKey");
                return persisted;
            }

            if (!saveResponse.ok) {
                throw new Error("Failed to save new DMConversationKey");
            }

            dmKeyCache.set(peerId, newKey);
            dmKeyVersionCache.set(peerId, 1);
            return { key: newKey, version: 1 };
        }
        else {
            throw new Error(`Failed to fetch DM conversation key: ${response.status}`);
        }
    } catch (e) {
        console.error("Error getting DMConversationKey:", e);
        throw e;
    }
}
