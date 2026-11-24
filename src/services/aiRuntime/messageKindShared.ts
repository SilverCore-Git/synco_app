/**
 * Lecture typée des `args` des kinds de message (12 §4.2), déjà validés par `checkMessageKindArgs` ; aucun
 * exécutant ici (le registre ignore ce module). Partagé par message.send, message.edit, dm.send, dm.edit.
 */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { DeviceNotSentError } from './plan/deviceErrors';

export const str = (v: JsonObject[string] | undefined): string | undefined => (typeof v === 'string' ? v : undefined);
export const ids = (v: JsonObject[string] | undefined): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
export function need(v: string | undefined): string {
    if (v === undefined) throw new DeviceNotSentError('invalid_args');
    return v;
}
/** Nom lu dans l'annuaire local (jamais dans le plan) pour les intitulés. */
export type Resolve = (kind: 'thread' | 'user', id: string) => string | null;
export const quote = (s: string, max = 80): string => {
    const one = s.replace(/\s+/g, ' ').trim();
    const chars = Array.from(one);
    return chars.length > max ? `${chars.slice(0, max).join('')}…` : one;
};
