/**
 * Épinglage TOFU de la clé du runtime par org (01 §8, mesure 3), dans le magasin local existant
 * (IndexedDB). Données publiques seulement : identifiant et empreinte.
 *
 * Clé : `rt-pin:<utilisateur local>:<orgId>`, valeur v1
 * `{ v: 1, runtimeId, fpr, firstSeen, previous: [{ runtimeId, fpr, until }] }`.
 *
 * Choix provisoire (spec muette) : après un désappairage, l'épingle courante passe dans `previous`
 * et `runtimeId` / `fpr` valent `null` ; le runtime suivant est alors une « première vue avec
 * alerte » (01 §8), jamais accepté en silence. Un enregistrement illisible est traité comme une clé
 * changée (échec fermé), jamais comme une absence d'épingle.
 */
import type { LocalStorePort } from './ports';

export interface RuntimePinPrevious {
    runtimeId: string;
    fpr: string;
    until: number;
}

export interface RuntimePinRecord {
    v: 1;
    runtimeId: string | null;
    fpr: string | null;
    firstSeen: number;
    previous: RuntimePinPrevious[];
}

/** État de l'épingle face au runtime présenté. */
export type RuntimePinState =
    /** Même `runtimeId` et même empreinte que l'épingle. */
    | 'match'
    /** Aucune épingle : première vue, confirmation explicite requise. */
    | 'first_seen'
    /** Plus d'épingle courante, mais un runtime avait été épinglé (désappairage) : première vue avec alerte. */
    | 'first_seen_after_change'
    /** Autre `runtimeId` ou autre empreinte : refus, alerte persistante. */
    | 'changed';

const MAX_PREVIOUS = 16;
const FPR = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const runtimePinSlot = (localUserId: string, orgId: string): string => `rt-pin:${localUserId}:${orgId}`;

function isPrevious(x: unknown): x is RuntimePinPrevious {
    if (!x || typeof x !== 'object') return false;
    const p = x as Record<string, unknown>;
    return typeof p.runtimeId === 'string' && ID.test(p.runtimeId) && typeof p.fpr === 'string' && FPR.test(p.fpr)
        && typeof p.until === 'number' && Number.isSafeInteger(p.until);
}

/** `undefined` : aucune entrée ; `null` : entrée illisible. */
function parseRecord(value: unknown): RuntimePinRecord | null | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    const r = value as Record<string, unknown>;
    if (r.v !== 1 || typeof r.firstSeen !== 'number' || !Array.isArray(r.previous) || !r.previous.every(isPrevious)) return null;
    const current = r.runtimeId === null && r.fpr === null;
    const pinned = typeof r.runtimeId === 'string' && ID.test(r.runtimeId) && typeof r.fpr === 'string' && FPR.test(r.fpr);
    if (!current && !pinned) return null;
    return { v: 1, runtimeId: r.runtimeId as string | null, fpr: r.fpr as string | null, firstSeen: r.firstSeen, previous: r.previous as RuntimePinPrevious[] };
}

export async function readRuntimePin(store: LocalStorePort, localUserId: string, orgId: string): Promise<RuntimePinRecord | null | undefined> {
    return parseRecord(await store.get(runtimePinSlot(localUserId, orgId)));
}

export async function checkRuntimePin(store: LocalStorePort, localUserId: string, orgId: string, runtimeId: string, fprHex: string): Promise<{ state: RuntimePinState; pinnedFpr: string | null }> {
    const record = await readRuntimePin(store, localUserId, orgId);
    if (record === undefined) return { state: 'first_seen', pinnedFpr: null };
    if (record === null) return { state: 'changed', pinnedFpr: null };
    if (record.runtimeId === null || record.fpr === null) return { state: 'first_seen_after_change', pinnedFpr: record.previous[record.previous.length - 1]?.fpr ?? null };
    if (record.runtimeId === runtimeId && record.fpr === fprHex) return { state: 'match', pinnedFpr: record.fpr };
    return { state: 'changed', pinnedFpr: record.fpr };
}

/**
 * Épingle `(runtimeId, fprHex)` comme clé courante. L'ancienne épingle éventuelle passe dans
 * `previous`. À n'appeler qu'après une décision explicite de l'utilisateur (première vue confirmée,
 * nouvelle clé acceptée après affichage des deux empreintes) ou un appairage vérifié par code.
 */
export async function pinRuntime(store: LocalStorePort, localUserId: string, orgId: string, runtimeId: string, fprHex: string, now: number): Promise<void> {
    if (!ID.test(runtimeId) || !FPR.test(fprHex)) throw new Error('épingle invalide');
    const record = await readRuntimePin(store, localUserId, orgId);
    const previous = record ? [...record.previous] : [];
    if (record?.runtimeId && record.fpr && !(record.runtimeId === runtimeId && record.fpr === fprHex)) {
        previous.push({ runtimeId: record.runtimeId, fpr: record.fpr, until: now });
    }
    if (record?.runtimeId === runtimeId && record.fpr === fprHex) return;
    const next: RuntimePinRecord = { v: 1, runtimeId, fpr: fprHex, firstSeen: now, previous: previous.slice(-MAX_PREVIOUS) };
    await store.set(runtimePinSlot(localUserId, orgId), next);
}

/**
 * Désappairage confirmé (01 §8, §9) : l'épingle courante passe dans `previous`, jamais effacée. Le
 * runtime suivant sera une première vue avec alerte.
 */
export async function archiveRuntimePin(store: LocalStorePort, localUserId: string, orgId: string, now: number): Promise<void> {
    const record = await readRuntimePin(store, localUserId, orgId);
    if (!record || record.runtimeId === null || record.fpr === null) return;
    const previous = [...record.previous, { runtimeId: record.runtimeId, fpr: record.fpr, until: now }].slice(-MAX_PREVIOUS);
    await store.set(runtimePinSlot(localUserId, orgId), { v: 1, runtimeId: null, fpr: null, firstSeen: record.firstSeen, previous } satisfies RuntimePinRecord);
}
