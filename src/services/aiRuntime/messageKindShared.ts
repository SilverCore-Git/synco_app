/**
 * Lecture typée des `args` des kinds de message (12 §4.2), déjà validés par `checkMessageKindArgs` ; aucun
 * exécutant ici (le registre ignore ce module). Partagé par message.send, message.edit, dm.send, dm.edit.
 */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { checkMessageKindArgs, type MessageKind } from '@/assets/utils/agentMessagePlan';
import { DeviceNotSentError } from './plan/deviceErrors';
import { cleanText } from './plan/planLabels';

export const str = (v: JsonObject[string] | undefined): string | undefined => (typeof v === 'string' ? v : undefined);
export const ids = (v: JsonObject[string] | undefined): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
export function need(v: string | undefined): string {
    if (v === undefined) throw new DeviceNotSentError('invalid_args');
    return v;
}
/** Texte du modèle cité dans un intitulé : contrôles et marques bidirectionnelles neutralisés (usurpation d'affichage), borné. */
export const quote = (s: string, max = 80): string => cleanText(s, max + 1);

export { assertOrgOpen, assertPeerInOrg, assertThreadInOrg } from './orgGuard';

/** `args` stricts du §4.2 revérifiés avant tout envoi (bornes, doublons, texte bien formé), même fonction que le worker. */
export function assertKindArgs(kind: MessageKind, args: JsonObject): void {
    if (!checkMessageKindArgs({ kind, args })) throw new DeviceNotSentError('invalid_args');
}
