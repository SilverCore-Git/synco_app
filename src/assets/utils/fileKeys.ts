import { getWorkspaceKey } from './workspaceCrypto';
import { getDMConversationKey } from './dmCrypto';
import { decryptThreadKeyWithRsa, privateKey } from './crypto';
import { getCachedThreadKey, setCachedThreadKey } from './threadKeyCache';
import useWSocket from '@/composables/useWSocket';

/**
 * Clé qui emballe la DEK d'un fichier (KEK), selon son contexte. Tout
 * fichier est chiffré de bout en bout : un contexte sans clé partagée est
 * refusé plutôt qu'envoyé en clair.
 *
 *   espace                → clé d'espace (tous les membres)
 *   conversation DM       → clé de conversation (les 2 participants)
 *   salon d'organisation  → clé du salon (ses membres, comme ses messages)
 */

export interface FileKeyContext {
    workspaceId?: string | null;
    dmPeerId?: string | null;
    threadId?: string | null;
}

export class NoFileKeyError extends Error {
    constructor() {
        super('Aucune clé de chiffrement disponible pour ce contexte : le fichier ne peut pas être chiffré de bout en bout.');
        this.name = 'NoFileKeyError';
    }
}

const THREAD_KEY_TIMEOUT_MS = 15000;

/** Clé d'un salon : celle du cache de session, sinon demandée au serveur (get-thread-access). */
async function getThreadKey(threadId: string): Promise<CryptoKey> {
    const cached = getCachedThreadKey(threadId);
    if (cached) return cached.key;

    const socket = (await useWSocket()).value;
    if (!socket) throw new Error('Non connecté au serveur.');
    const response: { encryptedKey?: string; error?: string } = await new Promise((resolve) => {
        socket.timeout(THREAD_KEY_TIMEOUT_MS).emit('get-thread-access', { threadId }, (err: Error | null, res: any) => {
            resolve(err ? { error: "Le serveur n'a pas répondu." } : res);
        });
    });
    if (!response.encryptedKey) throw new Error(response.error || 'Clé du salon indisponible.');
    if (!privateKey.value) throw new Error('Chiffrement de bout en bout verrouillé.');

    const key = await decryptThreadKeyWithRsa(response.encryptedKey, privateKey.value);
    setCachedThreadKey(threadId, response.encryptedKey, key);
    return key;
}

/** KEK et sa version pour le contexte, ou NoFileKeyError. */
export async function resolveFileKek(context: FileKeyContext): Promise<{ key: CryptoKey; version: number }> {
    if (context.workspaceId) return getWorkspaceKey(context.workspaceId);
    if (context.dmPeerId) return getDMConversationKey(context.dmPeerId);
    // Les clés de salon n'ont pas de version : 1.
    if (context.threadId) return { key: await getThreadKey(context.threadId), version: 1 };
    throw new NoFileKeyError();
}

/** Un fichier peut-il être chiffré dans ce contexte ? (pour griser l'ajout de pièces jointes) */
export const hasFileKeyContext = (context: FileKeyContext) =>
    !!(context.workspaceId || context.dmPeerId || context.threadId);
