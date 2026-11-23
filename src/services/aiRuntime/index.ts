/**
 * Service runtime de Synco AI côté app (lot L10) : appairage, vérification et épinglage du runtime,
 * délégation des clés, synchro P11, cryptographie du plan d'action. Sans UI : les écrans (L11 à L13)
 * appellent ces fonctions et ne lisent que des erreurs typées (`AiRuntimeError.code`).
 */
import type { MandateMode, VerifiedMandate } from '@/assets/utils/runtimeDelegation';
import { AiRuntimeError } from './errors';
import type { AiRuntimeDeps } from './ports';
import { RuntimeKeySync } from './sync';
import {
    onRuntimeUnpaired,
    readVerifiedMandate,
    fetchCurrentDelegation,
} from './delegation';
import { requireUserId, verifyRuntimeForDelegation } from './runtimeTrust';

export * from './errors';
export type { AiRuntimeDeps, KeyRef } from './ports';
export { createDefaultAiRuntimeDeps } from './defaults';
export {
    inspectRuntime,
    acceptNewRuntimeKey,
    verifyRuntimeForDelegation,
    type RuntimeInspection,
    type VerifiedRuntime,
} from './runtimeTrust';
export type { RuntimePinState } from './runtimePin';
export { previewPairing, pairRuntime, unpairRuntime, type PairingPreview, type PairingResult } from './pairing';
export {
    createDelegation,
    addMissingEntries,
    getDelegationSummary,
    revokeMyDelegation,
    enableAutonomousMode,
    disableAutonomousMode,
    readVerifiedMandate,
    ownRsaThumbprint,
    registerRuntimeConversation,
    isKnownRuntimeConversation,
    onRuntimeUnpaired,
    clearDelegationKeys,
    DEFAULT_DELEGATION_SECS,
    type DelegationSummary,
    type CreateDelegationOptions,
} from './delegation';
export { RuntimeKeySync, type SyncState, type SyncPhase } from './sync';
export {
    openPlan,
    buildAcceptDecision,
    buildRejectDecision,
    fetchPlanView,
    postPlanDecision,
    sealDevicePhaseResult,
    openPhaseResult,
    openAgentResults,
    type OpenedPlan,
    type ServedPlanView,
    type PhaseOutcome,
    type PlanResultFrame,
    type AcceptDecision,
    type RejectDecision,
} from './actionPlan';

/**
 * `CK` d'une conversation (03 §6.2) en clé AES non extractable, pour le plan et ses résultats.
 * Les octets ouverts sont effacés aussitôt l'import fait.
 */
export async function openConversationKey(deps: AiRuntimeDeps, orgId: string, sessionId: string, version = 1): Promise<CryptoKey> {
    const raw = await deps.keys.open(orgId, { kind: 'conv', ref: sessionId, version });
    if (!raw) throw new AiRuntimeError('not_found');
    try {
        return await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    } finally {
        raw.fill(0);
    }
}

/**
 * Mode du mandat VÉRIFIÉ de la délégation courante (`PlanContext.mode`, 12 §5 règle 8) ; `plan` s'il
 * n'y a pas de délégation active.
 */
export async function currentVerifiedMode(deps: AiRuntimeDeps, orgId: string): Promise<{ mode: MandateMode; mandate: VerifiedMandate | null }> {
    const current = await fetchCurrentDelegation(deps, orgId);
    if (!current || current.status !== 'active') return { mode: 'plan', mandate: null };
    const runtime = await verifyRuntimeForDelegation(deps, orgId, { challenge: false });
    const mandate = await readVerifiedMandate(deps, orgId, current.delegationId, runtime);
    return { mode: mandate.mode, mandate };
}

/** Socket minimal (socket.io) pour brancher la synchro. */
export interface RuntimeSyncSocket {
    on(event: string, listener: (payload: unknown) => void): unknown;
    off(event: string, listener: (payload: unknown) => void): unknown;
}

const orgOf = (p: unknown): string | null => (p && typeof p === 'object' && typeof (p as { orgId?: unknown }).orgId === 'string' ? (p as { orgId: string }).orgId : null);

/**
 * Branche la synchro sur les évènements socket (03 §7.2) tant que l'app est ouverte : `thread:created`
 * et `ai:runtime-changed` de CETTE org, `keys-distributed` (clé de salon reçue), `ai:session-status`
 * (nouvelle conversation runtime). `ai:runtime-changed` `unpaired` archive l'épingle après
 * confirmation par l'API. Rend la fonction de débranchement.
 */
export function bindRuntimeSync(deps: AiRuntimeDeps, sync: RuntimeKeySync, socket: RuntimeSyncSocket): () => void {
    const forOrg = (p: unknown) => {
        if (orgOf(p) === sync.orgId) sync.notifyKeyEvent();
    };
    const any = () => sync.notifyKeyEvent();
    const runtimeChanged = (p: unknown) => {
        if (orgOf(p) !== sync.orgId || !p || typeof p !== 'object') return;
        const { change, runtimeId } = p as { change?: unknown; runtimeId?: unknown };
        if (change === 'unpaired' && typeof runtimeId === 'string') {
            void onRuntimeUnpaired(deps, sync.orgId, runtimeId).catch(() => undefined);
        } else if (change === 'paired' || change === 'recertified') {
            sync.start();
        }
    };
    const handlers: [string, (p: unknown) => void][] = [
        ['thread:created', forOrg],
        ['keys-distributed', any],
        ['ai:session-status', any],
        ['ai:runtime-changed', runtimeChanged],
    ];
    handlers.forEach(([e, h]) => socket.on(e, h));
    return () => handlers.forEach(([e, h]) => socket.off(e, h));
}

/** Synchro de l'org ouverte, à lancer après le déverrouillage ; ne bloque jamais l'appelant. */
export function startRuntimeSync(deps: AiRuntimeDeps, orgId: string): RuntimeKeySync {
    requireUserId(deps);
    const sync = new RuntimeKeySync(deps, orgId);
    sync.start();
    return sync;
}
