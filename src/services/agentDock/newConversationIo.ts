/** Branchement réel de `startRuntimeConversation` sur l'API et sur L10 (bascule). Aucune logique ici. */
import sfetch from '@/assets/utils/sfetch';
import {
    SwitchRefusedError, SwitchUnavailableError, explainRuntimeError, explainSwitchRefusal, previousPinnedFingerprint,
    runtimeAvailability, runtimeDeps, switchConversationToRuntime,
} from '@/services/aiRuntimeUi';
import { installSwitchBodyBuilder } from '@/services/aiRuntimeSwitch';
import type { NewConversationIo } from './newConversation';

export const newConversationIo: NewConversationIo = {
    async createSession(orgId, title) {
        const res = await sfetch(`/api/orgs/${orgId}/ai/sessions`, { method: 'POST', body: JSON.stringify({ title, messages: [] }) });
        if (!res.ok) throw new Error('create_failed');
        const data = await res.json() as { id?: unknown };
        if (typeof data.id !== 'string') throw new Error('create_failed');
        return data.id;
    },
    async runtimeAvailable(orgId) {
        return (await runtimeAvailability(runtimeDeps(), orgId)).available;
    },
    async switchToRuntime(orgId, sessionId) {
        installSwitchBodyBuilder();
        await switchConversationToRuntime(runtimeDeps(), orgId, sessionId);
    },
    async explain(e, orgId) {
        if (e instanceof SwitchUnavailableError) return e.message;
        if (e instanceof SwitchRefusedError) return explainSwitchRefusal(e.code);
        const p = explainRuntimeError(e, { pinnedFingerprint: await previousPinnedFingerprint(runtimeDeps(), orgId).catch(() => undefined) });
        return `${p.title}. ${p.detail}`;
    },
};
