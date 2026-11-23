/**
 * Branchement du constructeur de corps de la bascule (L10b) sur l'écran de L11 : sources réelles de
 * l'app (clé `AiSessionKey` de l'ancien format, historique affiché de la conversation ouverte).
 * Aucune cryptographie ici : tout est dans `@/services/aiRuntime/switchBody`.
 */
import { openedOrg } from '@/assets/var';
import { createSwitchBodyBuilder, type SwitchHistorySource } from '@/services/aiRuntime';
import { ensureAiSessionKey } from '@/services/AiSessionKeyService';
import { activeSessionId, aiSessionMessages } from '@/services/AIService';
import { canSwitchExistingConversation, runtimeDeps, setSwitchBodyBuilder } from '@/services/aiRuntimeUi';

const appHistorySource: SwitchHistorySource = {
    gatewayKey: orgId => ensureAiSessionKey(orgId),
    displayedMessages(orgId, sessionId) {
        if (openedOrg.value?.id !== orgId || activeSessionId.value !== sessionId) return null;
        return aiSessionMessages.value as readonly unknown[];
    },
};

/** Installe le constructeur réel une seule fois (idempotent). */
export function installSwitchBodyBuilder(): void {
    if (canSwitchExistingConversation()) return;
    setSwitchBodyBuilder(createSwitchBodyBuilder(runtimeDeps(), appHistorySource));
}
