import { ref, computed, type Ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import type { Permission, RoleData, PermissionOverride } from '@/config/permissions.config';

// ─── Cache global des permissions résolues ──────────────────────────────────
// Clé : `${orgId}:${spaceId?}:${folderId?}:${fileId?}`

const permissionsCache = ref<Map<string, Record<Permission, boolean>>>(new Map());
const rolesCache = ref<Map<string, RoleData[]>>(new Map());
const loading = ref(false);

function cacheKey(orgId: string, spaceId?: string, folderId?: string, fileId?: string): string {
  return [orgId, spaceId || '', folderId || '', fileId || ''].join(':');
}

/**
 * Composable pour vérifier les permissions de l'utilisateur courant.
 *
 * Usage :
 * ```ts
 * const { can, fetchPermissions, roles, fetchRoles } = usePermissions(orgId);
 *
 * await fetchPermissions(spaceId);
 * if (can('DELETE', spaceId)) { ... }
 * ```
 */
export function usePermissions(orgId: Ref<string | undefined>) {

  // ── Permissions de l'utilisateur courant ───────────────────────────────
  async function fetchPermissions(
    spaceId?: string,
    folderId?: string,
    fileId?: string
  ): Promise<Record<Permission, boolean> | null> {

    if (!orgId.value) return null;

    const key = cacheKey(orgId.value, spaceId, folderId, fileId);

    // Retourner le cache si disponible
    if (permissionsCache.value.has(key)) {
      return permissionsCache.value.get(key)!;
    }

    loading.value = true;
    try {
      const params = new URLSearchParams();
      if (spaceId) params.set('spaceId', spaceId);
      if (folderId) params.set('folderId', folderId);
      if (fileId) params.set('fileId', fileId);

      const res = await sfetch(
        `/api/orgs/${orgId.value}/my-permissions?${params.toString()}`
      );

      if (!res.ok) return null;

      const data = await res.json();
      const perms = data.permissions as Record<Permission, boolean>;
      permissionsCache.value.set(key, perms);
      return perms;

    } catch (err) {
      console.error('[usePermissions] Erreur fetch permissions:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Vérifie si l'utilisateur a une permission.
   * Utilise le cache — appeler `fetchPermissions()` au préalable.
   */
  function can(
    permission: Permission,
    spaceId?: string,
    folderId?: string,
    fileId?: string
  ): boolean {
    if (!orgId.value) return false;
    const key = cacheKey(orgId.value, spaceId, folderId, fileId);
    const perms = permissionsCache.value.get(key);
    if (!perms) return false;
    return perms[permission] === true;
  }

  /** Vérifie plusieurs permissions (AND) */
  function canAll(
    permissions: Permission[],
    spaceId?: string,
    folderId?: string,
    fileId?: string
  ): boolean {
    return permissions.every(p => can(p, spaceId, folderId, fileId));
  }

  /** Vérifie au moins une permission (OR) */
  function canAny(
    permissions: Permission[],
    spaceId?: string,
    folderId?: string,
    fileId?: string
  ): boolean {
    return permissions.some(p => can(p, spaceId, folderId, fileId));
  }

  // ── Rôles de l'organisation ───────────────────────────────────────────

  async function fetchRoles(): Promise<RoleData[]> {
    if (!orgId.value) return [];

    if (rolesCache.value.has(orgId.value)) {
      return rolesCache.value.get(orgId.value)!;
    }

    try {
      const res = await sfetch(`/api/orgs/${orgId.value}/roles`);
      if (!res.ok) return [];
      const data: RoleData[] = await res.json();
      rolesCache.value.set(orgId.value, data);
      return data;
    } catch (err) {
      console.error('[usePermissions] Erreur fetch roles:', err);
      return [];
    }
  }

  const roles = computed<RoleData[]>(() => {
    if (!orgId.value) return [];
    return rolesCache.value.get(orgId.value) || [];
  });

  // ── Overrides (espace, dossier, fichier) ──────────────────────────────

  async function fetchOverrides(
    type: 'space' | 'folder' | 'file',
    targetId: string,
    spaceId?: string
  ): Promise<PermissionOverride[]> {
    if (!orgId.value) return [];

    let url = '';
    switch (type) {
      case 'space':
        url = `/api/orgs/${orgId.value}/spaces/${targetId}/permissions`;
        break;
      case 'folder':
        url = `/api/orgs/${orgId.value}/spaces/${spaceId}/folders/${targetId}/permissions`;
        break;
      case 'file':
        url = `/api/orgs/${orgId.value}/files/${targetId}/permissions`;
        break;
    }

    try {
      const res = await sfetch(url);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error(`[usePermissions] Erreur fetch ${type} overrides:`, err);
      return [];
    }
  }

  async function saveOverrides(
    type: 'space' | 'folder' | 'file',
    targetId: string,
    overrides: PermissionOverride[],
    spaceId?: string
  ): Promise<boolean> {
    if (!orgId.value) return false;

    let url = '';
    switch (type) {
      case 'space':
        url = `/api/orgs/${orgId.value}/spaces/${targetId}/permissions`;
        break;
      case 'folder':
        url = `/api/orgs/${orgId.value}/spaces/${spaceId}/folders/${targetId}/permissions`;
        break;
      case 'file':
        url = `/api/orgs/${orgId.value}/files/${targetId}/permissions`;
        break;
    }

    try {
      const res = await sfetch(url, {
        method: 'PUT',
        body: JSON.stringify({ overrides }),
      });
      // Invalider le cache permissions après modification
      invalidateCache();
      return res.ok;
    } catch (err) {
      console.error(`[usePermissions] Erreur save ${type} overrides:`, err);
      return false;
    }
  }

  // ── Utilitaires ────────────────────────────────────────────────────────

  function invalidateCache() {
    permissionsCache.value.clear();
  }

  function invalidateRolesCache() {
    rolesCache.value.clear();
  }

  return {
    // Permissions utilisateur
    can,
    canAll,
    canAny,
    fetchPermissions,
    loading,

    // Rôles
    roles,
    fetchRoles,

    // Overrides
    fetchOverrides,
    saveOverrides,

    // Cache
    invalidateCache,
    invalidateRolesCache,
  };
}
