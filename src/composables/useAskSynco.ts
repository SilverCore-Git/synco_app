import { aiEnabled, openedOrg } from '@/assets/var';
import { useAgentDock } from './useAgentDock';
import type { AgentContext } from '@/services/agentDock/context';

/** Geste « Demander à Synco AI » depuis un module : ouvre le dock sur une nouvelle conversation avec l'élément en contexte. */
export function askSynco(context: AgentContext): boolean {
    const orgId = openedOrg.value?.id;
    if (!orgId || !aiEnabled.value) return false;
    useAgentDock().openNew(orgId, { context });
    return true;
}

export const canAskSynco = (): boolean => aiEnabled.value && !!openedOrg.value;
