/**
 * Ouverture réelle d'une conversation runtime : `CK` ouverte par le service L10, origine du runtime
 * lue dans le registre de l'org, liaison WebSocket. Non couvert par les tests unitaires.
 */
import { openConversationKey, type AiRuntimeDeps } from '@/services/aiRuntime';
import type { ConnectHooks } from './useRuntimeConversation';
import { RuntimeEventSource } from './runtimeSource';
import { createConnectionDeps } from './wiring';

async function registeredOrigin(deps: AiRuntimeDeps, orgId: string): Promise<string | null> {
    const res = await deps.api.request('GET', `/api/orgs/${encodeURIComponent(orgId)}/ai/runtime`);
    const rt = res.body && typeof res.body === 'object' ? (res.body as { runtime?: { url?: unknown } }).runtime : undefined;
    if (typeof rt?.url !== 'string') return null;
    try { return new URL(rt.url).origin; } catch { return null; }
}

export async function connectRuntimeConversation(deps: AiRuntimeDeps, orgId: string, sessionId: string, hooks: ConnectHooks): Promise<RuntimeEventSource> {
    const [ck, origin] = await Promise.all([openConversationKey(deps, orgId, sessionId), registeredOrigin(deps, orgId)]);
    return new RuntimeEventSource(createConnectionDeps(orgId, sessionId, ck, deps.allowDevHttp, origin), {
        onLink: hooks.onLink,
        onSnapshot: hooks.onSnapshot,
        onReload: hooks.onReload,
    });
}
