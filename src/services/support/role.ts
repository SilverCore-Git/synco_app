import { computed, ref, watch } from 'vue';
import { user } from '@/assets/var';
import type { SupportRole } from '@/types/support';
import { supportApi } from './api';

/**
 * Rôle de l'utilisateur courant dans l'équipe support (GET /api/support/me),
 * mis en cache pour la session : il ne change qu'à une nomination/un retrait
 * par le super-admin (appeler refreshSupportRole() après coup).
 */

const role = ref<SupportRole>(null);
const loaded = ref(false);
let inflight: Promise<SupportRole> | null = null;

// Changement de compte (déconnexion/reconnexion sans rechargement) : le
// rôle d'un autre utilisateur ne doit pas survivre.
watch(() => user.value?.id, () => {
    role.value = null;
    loaded.value = false;
    inflight = null;
});

export function loadSupportRole(force = false): Promise<SupportRole> {
    if (loaded.value && !force) return Promise.resolve(role.value);
    if (inflight && !force) return inflight;
    const p = supportApi.me()
        .then((res) => {
            if (inflight === p) {
                role.value = res.role;
                loaded.value = true;
            }
            return res.role;
        })
        .finally(() => { if (inflight === p) inflight = null; });
    inflight = p;
    return p;
}

export const refreshSupportRole = () => loadSupportRole(true);

export const supportRoleState = {
    role: computed(() => role.value),
    loaded: computed(() => loaded.value),
    isStaff: computed(() => role.value !== null),
    isSuperAdmin: computed(() => role.value === 'superadmin'),
    /** Admin ou super-admin : suppression des messages d'autrui, transfert/libération de tout ticket. */
    isPrivileged: computed(() => role.value === 'superadmin' || role.value === 'admin'),
};
