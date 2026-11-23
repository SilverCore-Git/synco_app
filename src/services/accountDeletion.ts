/**
 * Suppression du compte depuis « Mon profil » (R2, C2 §9 point 10).
 *
 * 1. `DELETE /api/users/me` d'abord, seul juge (403 super-admin, 409 propriétaire d'org). S'il
 *    échoue, le keyguard n'est jamais touché : l'utilisateur garde sa récupération par PIN.
 * 2. Après un succès seulement, `DELETE /v1/setup` du keyguard, au mieux : un échec est journalisé
 *    sans bloquer, car le keyguard purge aussi chaque jour les comptes de la liste signée de
 *    synco_api (filet de sécurité).
 */

export interface AccountDeletionPorts {
    /** `DELETE /v1/setup` du keyguard (lève en cas d'échec). */
    disableKeyguard(): Promise<unknown>;
    /** `DELETE /api/users/me`. */
    deleteMe(): Promise<{ ok: boolean; status: number; error?: string }>;
    keyguardConfigured: boolean;
}

export type KeyguardOutcome = 'disabled' | 'skipped' | 'failed';

export type AccountDeletionOutcome =
    | { ok: true; keyguard: KeyguardOutcome }
    | { ok: false; status: number; error?: string; keyguard: 'skipped' };

export async function deleteMyAccount(ports: AccountDeletionPorts): Promise<AccountDeletionOutcome> {
    const res = await ports.deleteMe();
    if (!res.ok) return { ok: false, status: res.status, error: res.error, keyguard: 'skipped' };
    let keyguard: KeyguardOutcome = 'skipped';
    if (ports.keyguardConfigured) {
        try {
            await ports.disableKeyguard();
            keyguard = 'disabled';
        } catch (e) {
            console.warn('[accountDeletion] keyguard: purge impossible, la liste signée prendra le relais', e);
            keyguard = 'failed';
        }
    }
    return { ok: true, keyguard };
}
