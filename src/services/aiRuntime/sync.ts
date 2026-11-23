/**
 * Synchro P11 (03 §7.2, 09 §1, §4) : en tâche de fond, jamais bloquante, jamais en boucle.
 *
 * - À l'ouverture de l'app déverrouillée (`start`) : mode runtime activé sur cet appareil et aucune
 *   délégation active → création ; durée restante < 50 % ou `DK` absente → renouvellement complet ;
 *   sinon ajout des clés manquantes. Puis contrôle toutes les 6 h tant que l'app reste ouverte.
 * - En temps réel (`notifyKeyEvent`) : création de salon, clés distribuées, création ou rotation de
 *   clé d'espace, nouvelle conversation runtime → ajout des clés manquantes, regroupé (au plus une
 *   requête toutes les 5 s).
 * - Échec : backoff exponentiel 30 s → 30 min, au plus 5 essais par session et par org ; une erreur
 *   qui demande une action de l'utilisateur (clé du runtime changée, première vue, politique…) arrête
 *   la synchro de l'org jusqu'au prochain `start`.
 *
 * Une instance ne traite que l'org qui lui est passée : les clés des autres orgs n'y entrent jamais.
 */
import type { MandateMode } from '@/assets/utils/runtimeDelegation';
import { AiRuntimeError, type AiRuntimeErrorCode } from './errors';
import type { AiRuntimeDeps } from './ports';
import {
    addMissingEntries,
    createDelegation,
    fetchCurrentDelegation,
    hasDelegationKey,
    readRuntimeModePreference,
    readVerifiedMandate,
} from './delegation';
import { verifyRuntimeForDelegation } from './runtimeTrust';

export const SYNC_DEBOUNCE_MS = 5_000;
export const SYNC_BACKOFF_START_MS = 30_000;
export const SYNC_BACKOFF_MAX_MS = 30 * 60_000;
export const SYNC_MAX_FAILURES = 5;
export const SYNC_PERIOD_MS = 6 * 3_600_000;

/** Erreurs qui attendent une décision ou un changement côté org : pas de nouvel essai automatique. */
const TERMINAL: readonly AiRuntimeErrorCode[] = [
    'e2ee_locked', 'no_runtime', 'runtime_not_allowed', 'cert_invalid', 'cert_signer_not_admin', 'cert_bad_signature',
    'cert_runtime_mismatch', 'runtime_first_seen', 'runtime_key_changed', 'delegation_not_allowed', 'ai_disabled', 'forbidden',
];

export type SyncPhase = 'idle' | 'running' | 'waiting_retry' | 'stopped';

export interface SyncState {
    phase: SyncPhase;
    /** Dernière erreur (typée) ; `null` après un succès. */
    lastError: AiRuntimeErrorCode | null;
    failures: number;
    /** Le mode autonome a été retiré par l'org : la délégation a été redéposée en `plan` (PC40). */
    autonomyWithdrawn: boolean;
}

type Job = 'full' | 'entries';

export class RuntimeKeySync {
    private readonly deps: AiRuntimeDeps;
    readonly orgId: string;
    private state: SyncState = { phase: 'idle', lastError: null, failures: 0, autonomyWithdrawn: false };
    private running: Promise<void> | null = null;
    private pending: Job | null = null;
    private debounce: unknown = null;
    private retry: unknown = null;
    private periodic: unknown = null;
    private disposed = false;
    private readonly listeners = new Set<(s: SyncState) => void>();

    constructor(deps: AiRuntimeDeps, orgId: string) {
        this.deps = deps;
        this.orgId = orgId;
    }

    snapshot(): SyncState {
        return { ...this.state };
    }

    /** Abonnement à l'état (pour l'UI) ; rend la fonction de désabonnement. */
    subscribe(fn: (s: SyncState) => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private set(patch: Partial<SyncState>): void {
        this.state = { ...this.state, ...patch };
        const snap = this.snapshot();
        this.listeners.forEach(fn => fn(snap));
    }

    /** Ouverture de l'app déverrouillée : remet le compteur d'essais à zéro et lance la synchro complète. */
    start(): void {
        if (this.disposed) return;
        this.set({ phase: 'idle', failures: 0, lastError: null });
        this.schedule('full', 0);
        if (this.periodic === null) this.armPeriodic();
    }

    /** Évènement socket de création de clé pour CETTE org : ajout regroupé des clés manquantes. */
    notifyKeyEvent(): void {
        if (this.disposed || this.state.phase === 'stopped') return;
        if (this.debounce !== null) return;
        this.debounce = this.deps.clock.setTimeout(() => {
            this.debounce = null;
            this.enqueue('entries');
        }, SYNC_DEBOUNCE_MS);
    }

    /** Arrêt (verrouillage, changement d'org, déconnexion). */
    dispose(): void {
        this.disposed = true;
        for (const h of [this.debounce, this.retry, this.periodic]) if (h !== null) this.deps.clock.clearTimeout(h);
        this.debounce = this.retry = this.periodic = null;
        this.listeners.clear();
    }

    /** Attend la fin du travail en cours (tests, déconnexion propre). */
    async idle(): Promise<void> {
        while (this.running) await this.running;
    }

    private armPeriodic(): void {
        this.periodic = this.deps.clock.setTimeout(() => {
            this.periodic = null;
            if (this.disposed) return;
            if (this.state.phase !== 'stopped') this.enqueue('full');
            this.armPeriodic();
        }, SYNC_PERIOD_MS);
    }

    private schedule(job: Job, ms: number): void {
        if (ms === 0) {
            this.enqueue(job);
            return;
        }
        if (this.retry !== null) this.deps.clock.clearTimeout(this.retry);
        this.retry = this.deps.clock.setTimeout(() => {
            this.retry = null;
            this.enqueue(job);
        }, ms);
    }

    /** Un seul travail à la fois ; une demande pendant un travail est fusionnée (la complète l'emporte). */
    private enqueue(job: Job): void {
        if (this.disposed) return;
        if (this.running) {
            this.pending = this.pending === 'full' || job === 'full' ? 'full' : 'entries';
            return;
        }
        this.running = this.run(job).finally(() => {
            this.running = null;
            const next = this.pending;
            this.pending = null;
            if (next && !this.disposed && this.state.phase !== 'stopped' && this.state.phase !== 'waiting_retry') this.enqueue(next);
        });
    }

    private async run(job: Job): Promise<void> {
        this.set({ phase: 'running' });
        try {
            if (job === 'full') await this.fullSync();
            else await this.entriesSync();
            this.set({ phase: 'idle', lastError: null, failures: 0 });
        } catch (e) {
            const code: AiRuntimeErrorCode = e instanceof AiRuntimeError ? e.code : 'api_error';
            if (TERMINAL.includes(code)) {
                this.set({ phase: 'stopped', lastError: code });
                return;
            }
            const failures = this.state.failures + 1;
            if (failures >= SYNC_MAX_FAILURES) {
                this.set({ phase: 'stopped', lastError: code, failures });
                return;
            }
            this.set({ phase: 'waiting_retry', lastError: code, failures });
            this.schedule('full', Math.min(SYNC_BACKOFF_START_MS * 2 ** (failures - 1), SYNC_BACKOFF_MAX_MS));
        }
    }

    private async entriesSync(): Promise<void> {
        const userId = this.deps.identity.userId();
        if (!userId || !hasDelegationKey(userId, this.orgId)) return;
        try {
            await addMissingEntries(this.deps, this.orgId);
        } catch (e) {
            // DK périmée (délégation remplacée, expirée, révoquée) : la synchro complète tranche.
            if (e instanceof AiRuntimeError && ['delegation_none', 'delegation_unusable', 'delegation_expired', 'delegation_revoked', 'not_found'].includes(e.code)) {
                await this.fullSync();
                return;
            }
            throw e;
        }
    }

    private async fullSync(): Promise<void> {
        const userId = this.deps.identity.userId();
        if (!userId || !this.deps.identity.signKey()) throw new AiRuntimeError('e2ee_locked');
        const pref = await readRuntimeModePreference(this.deps, userId, this.orgId);
        if (!pref?.enabled) return;
        const current = await fetchCurrentDelegation(this.deps, this.orgId);
        const now = this.deps.clock.now();
        const active = current && current.status === 'active' && current.exp > now ? current : null;
        const keyInMemory = !!active && hasDelegationKey(userId, this.orgId, active.delegationId);
        const halfLife = active ? now - active.iat >= (active.exp - active.iat) / 2 : true;
        if (!active || halfLife || !keyInMemory) {
            await this.redelegate(active?.delegationId ?? null, pref.mode);
            return;
        }
        await addMissingEntries(this.deps, this.orgId);
    }

    /**
     * Nouvelle délégation complète. Le mode reconduit est celui du mandat VÉRIFIÉ de la délégation
     * active (signé par l'utilisateur), jamais le champ servi seul : une API ne peut pas faire signer
     * un `auto` sans consentement. Sans délégation active : la préférence locale. Mandat illisible :
     * `plan` (échec fermé). Un `auto` refusé par l'org (PC40) repart en `plan`.
     */
    private async redelegate(activeId: string | null, preferred: MandateMode): Promise<void> {
        const verified = await verifyRuntimeForDelegation(this.deps, this.orgId);
        let mode: MandateMode = preferred;
        if (activeId) {
            mode = await readVerifiedMandate(this.deps, this.orgId, activeId, verified).then(m => m.mode, () => 'plan' as const);
        }
        try {
            await createDelegation(this.deps, this.orgId, { mode, verified });
        } catch (e) {
            if (mode === 'auto' && e instanceof AiRuntimeError && e.code === 'feature_not_allowed') {
                await createDelegation(this.deps, this.orgId, { mode: 'plan', verified });
                this.set({ autonomyWithdrawn: true });
                return;
            }
            throw e;
        }
    }
}
