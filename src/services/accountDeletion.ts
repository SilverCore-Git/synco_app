/**
 * Suppression du compte depuis « Mon profil » (R2, C2 §9 point 10).
 *
 * 1. Le keyguard d'abord (`DELETE /v1/setup`) : il ne connaît pas synco_api et garde sinon la clé
 *    de récupération par PIN. Un échec (keyguard injoignable, non configuré) n'empêche pas la
 *    suite : le keyguard purge aussi, chaque jour, les comptes de la liste signée de synco_api.
 * 2. Puis `DELETE /api/users/me`, seul juge (403 super-admin, 409 propriétaire d'org).
 *
 * Si l'utilisateur est propriétaire d'une organisation, l'API refusera (409) : on n'appelle pas le
 * keyguard, pour ne pas lui faire perdre sa récupération par PIN sur une suppression refusée.
 */

export interface AccountDeletionPorts {
    /** `DELETE /v1/setup` du keyguard (lève en cas d'échec). */
    disableKeyguard(): Promise<unknown>;
    /** `DELETE /api/users/me`. */
    deleteMe(): Promise<{ ok: boolean; status: number; error?: string }>;
    keyguardConfigured: boolean;
    ownsAnOrganization: boolean;
}

export type AccountDeletionOutcome =
    | { ok: true; keyguard: 'disabled' | 'skipped' | 'failed' }
    | { ok: false; status: number; error?: string; keyguard: 'disabled' | 'skipped' | 'failed' };

export async function deleteMyAccount(ports: AccountDeletionPorts): Promise<AccountDeletionOutcome> {
    let keyguard: 'disabled' | 'skipped' | 'failed' = 'skipped';
    if (ports.keyguardConfigured && !ports.ownsAnOrganization) {
        try {
            await ports.disableKeyguard();
            keyguard = 'disabled';
        } catch {
            keyguard = 'failed';
        }
    }
    const res = await ports.deleteMe();
    return res.ok ? { ok: true, keyguard } : { ok: false, status: res.status, error: res.error, keyguard };
}
