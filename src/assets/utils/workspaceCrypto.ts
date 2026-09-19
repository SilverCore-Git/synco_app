import sfetch from './sfetch';
import { privateKey, decryptSpaceKeyWithRsa, generateSpaceKey, encryptSpaceKeyForMember } from './crypto';

// Cache for Workspace keys
const workspaceKeyCache = new Map<string, CryptoKey>();
const workspaceKeyVersionCache = new Map<string, number>();

/**
 * Gets the WorkspaceKey for the given workspaceId.
 * If the key doesn't exist yet, it fetches all members' public keys,
 * generates a new WorkspaceKey (v1), encrypts it for everyone, and saves it.
 */
export async function getWorkspaceKey(workspaceId: string): Promise<{ key: CryptoKey, version: number }> {
    
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
            const data = await response.json();
            const decryptedKey = await decryptSpaceKeyWithRsa(data.encryptedKey, privateKey.value);
            
            workspaceKeyCache.set(workspaceId, decryptedKey);
            workspaceKeyVersionCache.set(workspaceId, data.version);
            
            return { key: decryptedKey, version: data.version };
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
                    const encryptedKeyBase64 = await encryptSpaceKeyForMember(newSpaceKey, member.publicKey);
                    keysToDistribute.push({
                        userId: member.id,
                        encryptedKey: encryptedKeyBase64
                    });
                } catch (e) {
                    console.warn(`Could not encrypt WorkspaceKey for user ${member.id}`);
                }
            }
            
            if (keysToDistribute.length > 0) {
                const saveResponse = await sfetch(`/api/spaces/${workspaceId}/key`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keys: keysToDistribute, version })
                });
                
                if (saveResponse.ok) {
                    workspaceKeyCache.set(workspaceId, newSpaceKey);
                    workspaceKeyVersionCache.set(workspaceId, version);
                    return { key: newSpaceKey, version };
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
