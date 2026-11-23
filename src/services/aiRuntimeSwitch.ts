/**
 * Branchement du constructeur de corps de la bascule (L10b) sur l'écran de L11 : sources réelles de
 * l'app (clé `AiSessionKey` de l'ancien format, ouverture du blob `isE2EE` du régime client).
 * Aucune cryptographie ici : tout est dans `@/services/aiRuntime/switchBody`.
 */
import { decryptFromPeer, privateKey } from '@/assets/utils/crypto';
import { createSwitchBodyBuilder, type SwitchHistorySource } from '@/services/aiRuntime';
import { ensureAiSessionKey } from '@/services/AiSessionKeyService';
import { canSwitchExistingConversation, runtimeDeps, setSwitchBodyBuilder } from '@/services/aiRuntimeUi';

const appHistorySource: SwitchHistorySource = {
    gatewayKey: orgId => ensureAiSessionKey(orgId),
    async openClientBlob(blob) {
        const { ciphertext, encryptedAesKey, iv } = blob;
        if (!privateKey.value || typeof ciphertext !== 'string' || typeof encryptedAesKey !== 'string' || typeof iv !== 'string') {
            throw new Error('blob_unreadable');
        }
        return JSON.parse(await decryptFromPeer(ciphertext, encryptedAesKey, iv, privateKey.value)) as unknown;
    },
};

/** Installe le constructeur réel une seule fois (idempotent). */
export function installSwitchBodyBuilder(): void {
    if (canSwitchExistingConversation()) return;
    setSwitchBodyBuilder(createSwitchBodyBuilder(runtimeDeps(), appHistorySource));
}
