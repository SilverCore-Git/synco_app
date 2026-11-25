/**
 * Garde d'organisation des gestes de message de l'agent, côté appareil : tout identifiant venu du modèle (salon,
 * interlocuteur) est recoupé avec l'org de la CONVERSATION avant tout envoi, toute édition ou toute lecture.
 * Source : l'annuaire local de l'org OUVERTE (salons d'accueil et d'espaces, membres) ; l'org de la conversation
 * doit être cette org-là. Un salon ou un membre inconnu de l'annuaire est refusé (jamais d'hypothèse).
 */
import { openedOrg } from '@/assets/var';
import { DeviceNotSentError } from './plan/deviceErrors';

export function assertOrgOpen(orgId: string): void {
    if (openedOrg.value?.id !== orgId) throw new DeviceNotSentError('org_mismatch');
}

function threadIdsOfOpenOrg(): Set<string> {
    const org = openedOrg.value;
    const out = new Set<string>();
    if (!org) return out;
    const add = (list?: ReadonlyArray<{ id: string; threads?: ReadonlyArray<{ id: string }> }>) => {
        for (const x of list ?? []) {
            out.add(x.id);
        }
    };
    add(org.home?.threads);
    for (const c of org.home?.categories ?? []) add(c.threads);
    for (const s of org.spaces ?? []) {
        add(s.threads);
        for (const c of s.categories ?? []) add(c.threads);
    }
    return out;
}

/** Le salon appartient à l'org de la conversation (annuaire local de l'org ouverte). */
export function assertThreadInOrg(orgId: string, threadId: string): void {
    assertOrgOpen(orgId);
    if (!threadIdsOfOpenOrg().has(threadId)) throw new DeviceNotSentError('thread_not_in_org');
}

/** L'interlocuteur est membre de l'org de la conversation. */
export function assertPeerInOrg(orgId: string, peerId: string): void {
    assertOrgOpen(orgId);
    if (!openedOrg.value?.members?.some(m => m.userId === peerId)) throw new DeviceNotSentError('peer_not_in_org');
}
