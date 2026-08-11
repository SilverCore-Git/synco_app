import sfetch from '@/assets/utils/sfetch';
import { localSearchDB } from './LocalSearchVectorDB';
import { decryptThreadKeyWithRsa } from '@/assets/utils/crypto';

export class SearchSyncService {
    /**
     * Chiffre le texte et le vecteur, puis les envoie au backend (PostgreSQL) de manière aveugle.
     */
    static async syncIndex(
        workspaceId: string | null,
        threadId: string | null,
        type: 'MESSAGE' | 'FILE' | 'TODO',
        resourceId: string,
        textContent: string,
        vector: number[],
        aesKey: CryptoKey,
        extraMetadata: any = {}
    ) {
        try {
            // Créer le payload en clair
            const payload = JSON.stringify({ textContent, vector, metadata: extraMetadata });
            const encoder = new TextEncoder();
            const data = encoder.encode(payload);

            // Chiffrer en AES-GCM
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const ciphertextBuffer = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                aesKey,
                data
            );

            // Convertir en Base64
            const encryptedBlob = btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer)));
            const ivBase64 = btoa(String.fromCharCode(...iv));

            // Envoyer au backend
            await sfetch('/api/search-index', {
                method: 'POST',
                body: JSON.stringify({
                    workspaceId,
                    threadId,
                    type,
                    resourceId,
                    encryptedBlob,
                    iv: ivBase64
                })
            });

        } catch (error) {
            console.error("[SearchSyncService] Error syncing index:", error);
        }
    }

    /**
     * Récupère les index chiffrés d'un thread du serveur, les déchiffre et les insère dans Orama.
     */
    static async restoreThreadIndexes(threadId: string, aesKey: CryptoKey) {
        try {
            const res = await sfetch(`/api/search-index/thread/${threadId}`);
            if (!res.ok) throw new Error('Failed to fetch thread indexes');
            
            const indexes = await res.json();
            
            for (const index of indexes) {
                try {
                    const ciphertext = Uint8Array.from(atob(index.encryptedBlob), c => c.charCodeAt(0));
                    const iv = Uint8Array.from(atob(index.iv), c => c.charCodeAt(0));

                    const decryptedBuffer = await window.crypto.subtle.decrypt(
                        { name: "AES-GCM", iv },
                        aesKey,
                        ciphertext
                    );

                    const payloadString = new TextDecoder().decode(decryptedBuffer);
                    const { textContent, vector, metadata } = JSON.parse(payloadString);

                    // Insérer dans la BD vectorielle locale
                    await localSearchDB.insertDocument({
                        id: index.resourceId,
                        workspaceId: index.workspaceId,
                        type: index.type,
                        textContent,
                        vector,
                        metadata: { threadId: index.threadId, ...(metadata || {}) }
                    });
                } catch (e) {
                    // Ignorer les erreurs de déchiffrement silencieusement
                }
            }
        } catch (error) {
            console.error("[SearchSyncService] Error restoring thread indexes:", error);
        }
    }

    /**
     * Récupère tous les index d'un workspace, déchiffre les clés de salons avec la clé privée de l'utilisateur,
     * puis déchiffre tous les vecteurs pour permettre la recherche globale sur tout l'espace.
     */
    static async restoreWorkspaceIndexes(spaceId: string, rsaPrivateKey: CryptoKey) {
        try {
            const res = await sfetch(`/api/search-index/workspace/${spaceId}`);
            if (!res.ok) throw new Error('Failed to fetch workspace indexes');
            
            const { indexes, threadKeys } = await res.json();
            
            // 1. Déchiffrer toutes les clés de salon (ThreadKeys)
            const decryptedThreadKeys = new Map<string, CryptoKey>();
            for (const keyObj of threadKeys) {
                try {
                    const aesKey = await decryptThreadKeyWithRsa(keyObj.encryptedKey, rsaPrivateKey);
                    decryptedThreadKeys.set(keyObj.threadId, aesKey);
                } catch (e: any) {
                    console.warn(`[SearchSyncService] Impossible de déchiffrer la clé du salon ${keyObj.threadId}. Raison:`, e.name || e.message || String(e), 'Key:', keyObj.encryptedKey);
                }
            }

            // 2. Déchiffrer et insérer chaque vecteur
            for (const index of indexes) {
                try {
                    if (!index.threadId) continue;
                    const aesKey = decryptedThreadKeys.get(index.threadId);
                    if (!aesKey) continue; // L'utilisateur n'a pas accès à ce salon ou la clé est invalide

                    const ciphertext = Uint8Array.from(atob(index.encryptedBlob), c => c.charCodeAt(0));
                    const iv = Uint8Array.from(atob(index.iv), c => c.charCodeAt(0));

                    const decryptedBuffer = await window.crypto.subtle.decrypt(
                        { name: "AES-GCM", iv },
                        aesKey,
                        ciphertext
                    );

                    const payloadString = new TextDecoder().decode(decryptedBuffer);
                    const { textContent, vector, metadata } = JSON.parse(payloadString);

                    await localSearchDB.insertDocument({
                        id: index.resourceId,
                        workspaceId: index.workspaceId,
                        type: index.type,
                        textContent,
                        vector,
                        metadata: { threadId: index.threadId, ...(metadata || {}) }
                    });
                } catch (e) {
                    // Ignorer les erreurs de déchiffrement silencieusement (ex: vieux vecteurs ou clés désynchronisées)
                }
            }
            // console.log(`[SearchSyncService] Restauration du workspace terminée. ${indexes.length} vecteurs traités.`);
        } catch (error) {
            console.error("[SearchSyncService] Error restoring workspace indexes:", error);
        }
    }
}
