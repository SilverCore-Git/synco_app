import { computed, ref, watch, type Ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { usePermissions } from '@/composables/usePermissions';
import type { Permission } from '@/config/permissions.config';
import type { StatsScopesResponse } from '@/views/OrgSpace/components/SpaceStats/statsTypes';

/** Permissions qui ouvrent chacune un onglet des paramètres d'organisation. */
export const ORG_SETTINGS_PERMISSIONS: Permission[] = ['ORG_GENERAL', 'ORG_MEMBERS', 'ORG_ROLES', 'ORG_WEBHOOKS', 'ORG_STORAGE', 'ORG_AI'];

// Portées de statistiques par organisation, partagées entre tous les appelants.
const scopesByOrg = ref(new Map<string, StatsScopesResponse>());
const inFlight = new Map<string, Promise<void>>();

async function loadScopes(orgId: string, force = false): Promise<void> {
    if (!force && scopesByOrg.value.has(orgId)) return;
    const pending = inFlight.get(orgId);
    if (pending) return pending;
    const p = (async () => {
        try {
            const res = await sfetch(`/api/orgs/${orgId}/stats/scopes`);
            if (res.ok) scopesByOrg.value.set(orgId, await res.json() as StatsScopesResponse);
        } catch (err) {
            console.error('[useSettingsAccess] portées de statistiques', err);
        } finally {
            inFlight.delete(orgId);
        }
    })();
    inFlight.set(orgId, p);
    return p;
}

/**
 * Accès aux paramètres d'organisation : un onglet de réglage (permissions
 * d'organisation) ou les statistiques, ouvertes aussi par SPACE_STATS sur un
 * seul space — d'où la liste des portées demandée à l'API.
 */
export function useSettingsAccess(orgId: Ref<string | undefined>) {
    const { canAny } = usePermissions(orgId);

    watch(orgId, id => { if (id) loadScopes(id); }, { immediate: true });

    const statsScopes = computed<StatsScopesResponse | null>(() => (orgId.value ? scopesByOrg.value.get(orgId.value) ?? null : null));
    const canSeeStats = computed(() => !!statsScopes.value && (statsScopes.value.org || statsScopes.value.spaces.length > 0));
    const canOpenSettings = computed(() => canAny(ORG_SETTINGS_PERMISSIONS) || canSeeStats.value);

    const refreshStatsScopes = () => (orgId.value ? loadScopes(orgId.value, true) : Promise.resolve());

    return { statsScopes, canSeeStats, canOpenSettings, refreshStatsScopes };
}
