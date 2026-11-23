/**
 * État local d'un plan, lié à (org, conversation, plan), conservé pour la reprise après rechargement :
 * - `accepted` : les actions que L'UTILISATEUR a acceptées sur cet appareil (l'appareil n'exécute jamais
 *   que l'intersection avec l'état servi par l'API) ; `null` = inconnu, donc rien n'est exécuté ;
 * - `phases` : les `plan_result` d'appareil scellés (gcm1, chiffrés par CK) déjà produits, relus pour
 *   contrôler les sorties des phases précédentes et ne pas rapporter deux fois une issue inconnue.
 * Rien de ce qui est stocké ici n'est en clair : les résultats sont les trames scellées.
 */
export interface SealedPhase { phase: number; value: string }
export interface PlanLocalState { accepted: number[] | null; phases: SealedPhase[] }

export interface PlanLocalStore {
    read(planId: string): PlanLocalState;
    saveAccepted(planId: string, accepted: readonly number[]): void;
    addPhase(planId: string, phase: number, value: string): void;
}

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const EMPTY = (): PlanLocalState => ({ accepted: null, phases: [] });

function parse(raw: string | null): PlanLocalState {
    if (!raw) return EMPTY();
    try {
        const o: unknown = JSON.parse(raw);
        if (!o || typeof o !== 'object') return EMPTY();
        const r = o as { accepted?: unknown; phases?: unknown };
        const accepted = Array.isArray(r.accepted) && r.accepted.every(isInt) ? [...new Set(r.accepted as number[])] : null;
        const phases = Array.isArray(r.phases)
            ? r.phases.flatMap((p): SealedPhase[] => (p && typeof p === 'object' && isInt((p as SealedPhase).phase) && typeof (p as SealedPhase).value === 'string' ? [{ phase: (p as SealedPhase).phase, value: (p as SealedPhase).value }] : []))
            : [];
        return { accepted, phases };
    } catch { return EMPTY(); }
}

/** Stockage adossé à un `Storage` (localStorage) ; indisponible ou en erreur : état vide (échec fermé). */
export function createPlanLocalStore(storage: KeyValueStorage | null, orgId: string, sessionId: string): PlanLocalStore {
    const key = (planId: string) => `synco_plan_local:${orgId}:${sessionId}:${planId}`;
    const read = (planId: string): PlanLocalState => { try { return parse(storage?.getItem(key(planId)) ?? null); } catch { return EMPTY(); } };
    const write = (planId: string, s: PlanLocalState): void => { try { storage?.setItem(key(planId), JSON.stringify(s)); } catch { /* quota ou stockage bloqué */ } };
    return {
        read,
        saveAccepted: (planId, accepted) => write(planId, { ...read(planId), accepted: [...accepted] }),
        addPhase: (planId, phase, value) => {
            const s = read(planId);
            write(planId, { ...s, phases: [...s.phases.filter(p => p.phase !== phase), { phase, value }] });
        },
    };
}

export function memoryPlanLocalStore(): PlanLocalStore {
    const m = new Map<string, string>();
    return createPlanLocalStore({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }, 'o', 's');
}

const DEVICE_KEY = 'synco_ai_device_id';

/**
 * Identifiant d'appareil stable (opaque pour l'API, 00 §3.2) : un rechargement reprend le même claim au lieu
 * de se prendre pour « un autre appareil ». Stockage indisponible : identifiant propre à l'ouverture.
 */
export function stableDeviceId(storage: KeyValueStorage | null, fresh: () => string = () => crypto.randomUUID()): string {
    try {
        const known = storage?.getItem(DEVICE_KEY);
        if (known && /^[0-9a-zA-Z-]{8,64}$/.test(known)) return known;
        const id = fresh();
        storage?.setItem(DEVICE_KEY, id);
        return id;
    } catch { return fresh(); }
}
