import { loadSupportRole, refreshSupportRole, supportRoleState } from '@/services/support/role';

/**
 * Rôle de l'utilisateur dans l'équipe support (GET /api/support/me), mis en
 * cache pour la session. Déclenche le chargement au premier appel.
 *
 *   const { role, isStaff, loaded } = useSupportRole();
 *   // role.value : 'superadmin' | 'admin' | 'moderator' | null
 */
export function useSupportRole() {
    void loadSupportRole().catch((e) => console.warn('[Support] Rôle indisponible :', (e as Error).message));
    return {
        ...supportRoleState,
        /** À appeler après une nomination/un retrait. */
        refresh: refreshSupportRole,
        /** Résout le rôle (attend le chargement). */
        load: loadSupportRole,
    };
}
