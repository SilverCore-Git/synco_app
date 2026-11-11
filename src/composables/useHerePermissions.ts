import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { openedOrg } from '@/assets/var';
import { usePermissions } from '@/composables/usePermissions';
import type { Permission } from '@/config/permissions.config';

/**
 * Permissions là où l'on se trouve : le space ouvert (surcharges comprises),
 * ou l'accueil de l'organisation, qui suit les valeurs par défaut des rôles.
 * Les permissions du space sont chargées par ThreadsBar.
 */
export function useHerePermissions() {
  const route = useRoute();
  const orgId = computed(() => openedOrg.value?.id);
  const { can } = usePermissions(orgId);
  const spaceId = computed(() => (route.params.spaceId ? String(route.params.spaceId) : undefined));

  const canHere = (permission: Permission): boolean => can(permission, spaceId.value);

  return { canHere, spaceId };
}
