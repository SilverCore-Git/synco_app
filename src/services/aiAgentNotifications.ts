/**
 * Notifications de l'agent (PC25) : un interrupteur par cas, stocké dans `notificationPreferences.agent` du profil
 * (mêmes réglages que ceux lus par l'API pour le push et le centre de notifications). Pur, testable sans réseau.
 */
import type { WaitKind } from '@/services/agentDock/barState';

export interface AgentNotifPrefs {
    enabled: boolean;
    question: boolean;
    plan: boolean;
    missingKey: boolean;
    done: boolean;
    failed: boolean;
}

export type AgentNotifCase = Exclude<keyof AgentNotifPrefs, 'enabled'>;

export const AGENT_NOTIF_CASES: Array<{ id: AgentNotifCase; label: string; sample: string }> = [
    { id: 'question', label: 'Une question', sample: 'Synco AI attend votre réponse.' },
    { id: 'plan', label: 'Un plan à valider', sample: 'Synco AI attend votre confirmation.' },
    { id: 'missingKey', label: 'Une clé manquante', sample: 'Ouvrez Synco pour donner accès à de nouveaux salons à Synco AI.' },
    { id: 'done', label: 'Une tâche terminée', sample: 'Synco AI a terminé.' },
    { id: 'failed', label: 'Un échec', sample: "Synco AI n'a pas pu terminer." },
];

/** Lit l'objet `agent` (absent ou ancien format : tout est actif, comme côté API). */
export function readAgentNotifPrefs(raw: unknown): AgentNotifPrefs {
    let all = raw;
    if (typeof all === 'string') { try { all = JSON.parse(all); } catch { all = null; } }
    const a = all && typeof all === 'object' ? (all as Record<string, unknown>).agent : null;
    const p = a && typeof a === 'object' && !Array.isArray(a) ? a as Record<string, unknown> : {};
    return {
        enabled: p.enabled !== false, question: p.question !== false, plan: p.plan !== false,
        missingKey: p.missingKey !== false, done: p.done !== false, failed: p.failed !== false,
    };
}

const CASE_OF_WAIT: Record<WaitKind, AgentNotifCase> = { confirmation: 'plan', question: 'question', upload: 'question', key: 'missingKey' };

/** La bulle de l'agent (PC80) respecte la même préférence que le push. */
export function nudgeAllowed(prefs: AgentNotifPrefs, wait: WaitKind): boolean {
    return prefs.enabled && prefs[CASE_OF_WAIT[wait]];
}
