<template>

  <div class="flex flex-col md:flex-row h-full w-full bg-(--bg) overflow-hidden relative">

    <!-- Colonne gauche : les rôles de l'organisation -->
    <div class="w-full md:w-1/4 md:max-w-[320px] md:min-w-[280px] bg-(--bg2)/50 border-b md:border-b-0 md:border-r border-(--border-color) flex flex-col shrink-0 md:h-full">

      <div class="p-6 border-b border-(--border-color) shrink-0">
        <h1 class="text-xl font-bold text-(--text)">Rôles</h1>
        <p class="text-xs text-(--text2) mt-1">Réglages propres à ce space</p>
      </div>

      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-2 relative max-h-56 md:max-h-none">

        <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center">
          <div class="w-6 h-6 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
        </div>

        <div
          v-for="role in roles"
          :key="role.id"
          @click="selectedRoleId = role.id"
          class="px-4 py-3 rounded-xl transition-all cursor-pointer flex items-center justify-between group border"
          :class="selectedRoleId === role.id ? 'bg-(--primary)/10 border-(--primary)/20 shadow-sm' : 'border-transparent hover:bg-(--bg2)'"
        >

          <div class="flex items-center gap-2.5 min-w-0">

            <div
              class="w-3 h-3 rounded-full shrink-0 shadow-inner"
              :style="{ backgroundColor: role.color || '#6b7280' }"
            />

            <div class="flex flex-col min-w-0">
              <span class="font-bold text-sm flex items-center gap-2 truncate" :class="selectedRoleId === role.id ? 'text-(--primary)' : 'text-(--text)'">
                {{ role.name }}
                <span v-if="role.name === 'OWNER'" class="text-[9px] font-black bg-(--text)/5 px-1.5 py-0.5 rounded text-(--text2) uppercase tracking-wider border border-(--border-color)">
                  Sys
                </span>
              </span>
              <span class="text-xs text-(--text2) mt-0.5">
                {{ role.memberCount }} membre{{ (role.memberCount || 0) !== 1 ? 's' : '' }}
              </span>
            </div>

          </div>

          <!-- Un rôle sans réglage propre suit entièrement l'organisation :
               le compteur dit d'un coup d'œil lesquels sont personnalisés ici. -->
          <span
            v-if="overrideCount(role.id) > 0"
            class="shrink-0 text-[10px] font-black text-(--primary) bg-(--primary)/10 border border-(--primary)/20 rounded-full px-2 py-0.5"
            :title="`${overrideCount(role.id)} permission(s) redéfinie(s) dans ce space`"
          >
            {{ overrideCount(role.id) }}
          </span>

        </div>

      </div>

    </div>

    <!-- Colonne droite : les permissions du rôle sélectionné -->
    <div class="flex-1 flex flex-col h-full bg-(--bg) relative overflow-hidden">

      <template v-if="selectedRole">

        <div class="px-6 sm:px-8 py-6 border-b border-(--border-color) shrink-0 flex flex-wrap items-end justify-between gap-4 bg-(--bg)/95 backdrop-blur-sm z-10">

          <div>

            <div class="flex items-center gap-3 mb-1">
              <div class="w-4 h-4 rounded-full shadow-inner" :style="{ backgroundColor: selectedRole.color || '#6b7280' }" />
              <h2 class="text-2xl font-black text-(--text)">{{ selectedRole.name }}</h2>
            </div>

            <p class="text-sm text-(--text2)">
              <template v-if="isRoleLocked(selectedRole)">
                Le rôle propriétaire garde tous ses droits, ici comme ailleurs.
              </template>
              <template v-else>
                Ce qui reste sur « Hériter » suit les permissions de l'organisation.
              </template>
            </p>

            <div class="relative mt-4">
              <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs" />
              <input
                type="search"
                v-model="searchQuery"
                placeholder="Rechercher une permission..."
                class="pl-8 pr-4 py-2 bg-(--bg2) border border-(--border-color) rounded-lg text-sm text-(--text) outline-none focus:border-(--primary) w-full sm:w-64 transition-all placeholder-(--text2)/50"
              />
            </div>

          </div>

          <button
            v-if="overrideCount(selectedRole.id) > 0 && !isRoleLocked(selectedRole)"
            @click="resetRole(selectedRole.id)"
            class="default !text-sm !py-2 !px-3 gap-2 text-(--text2)"
            title="Tout remettre sur « Hériter » pour ce rôle"
          >
            <i class="bi bi-arrow-counterclockwise" />
            Tout hériter
          </button>

        </div>

        <div class="flex-1 overflow-y-auto p-6 sm:p-8 relative">

          <div class="max-w-3xl flex flex-col gap-10 pb-28">

            <template v-for="group in filteredPermissionGroups" :key="group.name">

              <div v-if="group.keys.length > 0" class="flex flex-col gap-4">

                <h3 class="text-xs font-black uppercase tracking-widest text-(--primary) border-b border-(--border-color) pb-2">
                  {{ group.name }}
                </h3>

                <div class="flex flex-col gap-1">

                  <div
                    v-for="permKey in group.keys"
                    :key="permKey"
                    class="flex items-center justify-between gap-4 p-3 -mx-3 rounded-xl hover:bg-(--bg2)/50 transition-colors"
                  >

                    <div class="flex items-start gap-4 min-w-0">

                      <div class="w-8 h-8 rounded-lg bg-(--bg2) flex items-center justify-center border border-(--border-color) text-(--text2) mt-0.5 shrink-0">
                        <i :class="'bi ' + PERMISSION_REGISTRY[permKey].icon" />
                      </div>

                      <div class="flex flex-col min-w-0">

                        <span class="font-bold text-sm text-(--text)">
                          {{ PERMISSION_REGISTRY[permKey].label }}
                        </span>

                        <span class="text-xs text-(--text2) mt-0.5 max-w-md leading-relaxed">
                          {{ PERMISSION_REGISTRY[permKey].description }}
                        </span>

                        <span
                          v-if="valueOf(selectedRole.id, permKey) === 'INHERIT'"
                          class="text-[10px] mt-1.5 font-bold uppercase tracking-wider"
                          :class="inheritedValue(selectedRole, permKey) === 'ALLOW' ? 'text-emerald-400/70' : 'text-(--text2)'"
                        >
                          Hérité de l'organisation :
                          {{ inheritedValue(selectedRole, permKey) === 'ALLOW' ? 'autorisé' : 'refusé' }}
                        </span>

                      </div>

                    </div>

                    <div class="flex items-center gap-0.5 p-0.5 rounded-lg bg-(--bg2) border border-(--border-color) shrink-0">

                      <button
                        v-for="option in VALUE_OPTIONS"
                        :key="option.value"
                        @click="setValue(selectedRole.id, permKey, option.value)"
                        :disabled="isRoleLocked(selectedRole)"
                        class="px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        :class="valueOf(selectedRole.id, permKey) === option.value ? option.activeClass : 'text-(--text2) hover:text-(--text)'"
                        :title="option.label"
                      >
                        <i :class="option.icon" />
                        <span class="hidden lg:inline ml-1">{{ option.label }}</span>
                      </button>

                    </div>

                  </div>

                </div>

              </div>

            </template>

            <div v-if="filteredPermissionGroups.every(g => g.keys.length === 0)" class="py-12 text-center">
              <p class="text-(--text2) text-sm">Aucune permission ne correspond à « {{ searchQuery }} »</p>
            </div>

          </div>

        </div>

      </template>

      <div v-else class="flex-1 flex flex-col items-center justify-center gap-3 text-(--text2) p-8 text-center">
        <i class="bi bi-shield-lock text-4xl opacity-40" />
        <p class="text-sm">{{ isLoading ? 'Chargement des rôles...' : 'Aucun rôle à configurer.' }}</p>
      </div>

    </div>

  </div>

</template>

<script lang="ts" setup>

import { ref, watch, computed, onMounted } from 'vue';
import { usePermissions } from '@/composables/usePermissions';
import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';
import { PERMISSION_REGISTRY, type Permission, type PermissionValue, type RoleData, type PermissionOverride } from '@/config/permissions.config';

const props = defineProps<{
  spaceId: string;
}>();

// L'état « non enregistré » remonte à la fenêtre de paramètres, qui possède la
// barre d'enregistrement commune à tous les onglets.
const emit = defineEmits<{
  (e: 'dirty', value: boolean): void;
}>();

const toast = useToast();
const orgId = computed(() => openedOrg.value?.id);
const { fetchRoles, fetchOverrides, saveOverrides, invalidateCache, fetchPermissions } = usePermissions(orgId);

const isLoading = ref<boolean>(false);
const isSaving = ref<boolean>(false);
const roles = ref<RoleData[]>([]);
const originalOverrides = ref<PermissionOverride[]>([]);
const selectedRoleId = ref<string | null>(null);
const searchQuery = ref<string>('');

// Ici on ne manipule que les *dérogations* propres au space : 'INHERIT'
// signifie « aucune dérogation », donc suivre le rôle tel qu'il est défini au
// niveau de l'organisation.
const localPerms = ref<Record<string, Record<string, PermissionValue>>>({});

const VALUE_OPTIONS: Array<{ value: PermissionValue; label: string; icon: string; activeClass: string }> = [
  { value: 'INHERIT', label: 'Hériter',   icon: 'bi bi-dash-lg',  activeClass: 'bg-(--text)/10 text-(--text)' },
  { value: 'ALLOW',   label: 'Autoriser', icon: 'bi bi-check-lg', activeClass: 'bg-emerald-500/15 text-emerald-400' },
  { value: 'DENY',    label: 'Refuser',   icon: 'bi bi-x-lg',     activeClass: 'bg-red-500/15 text-red-400' },
];

// Même découpage que l'écran Rôles de l'organisation, pour que les deux écrans
// se lisent de la même façon.
const permissionGroups: Array<{ name: string; keys: Permission[] }> = [
  { name: 'Organisation (Paramètres)',            keys: ['ORG_GENERAL', 'ORG_MEMBERS', 'ORG_ROLES', 'ORG_WEBHOOKS', 'ORG_STORAGE', 'ORG_AI'] },
  { name: 'Espaces de travail',                   keys: ['SPACE_CREATE', 'SPACE_MANAGE', 'SPACE_DELETE'] },
  { name: 'Salons & Dossiers',                    keys: ['FOLDER_CREATE', 'FOLDER_MANAGE', 'FOLDER_DELETE'] },
  { name: 'Contenu & Fichiers',                   keys: ['VIEW', 'READ', 'WRITE', 'UPLOAD', 'CONTENT_DELETE', 'SHARE'] },
  { name: 'Tâches (Gestion Globale)',             keys: ['TASK_UPDATE_ALL', 'TASK_DELETE_ALL', 'TASK_STATUS_ALL', 'TASK_SUBTASK_ALL'] },
  { name: 'Tâches (Hiérarchie - Rôles Inférieurs)', keys: ['TASK_UPDATE_LOWER', 'TASK_DELETE_LOWER', 'TASK_STATUS_LOWER', 'TASK_SUBTASK_LOWER'] },
  { name: 'Salons vocaux',                        keys: ['VOICE_MUTE_OTHERS', 'VOICE_DISCONNECT'] },
];

const selectedRole = computed<RoleData | undefined>(() => roles.value.find(r => r.id === selectedRoleId.value));

const filteredPermissionGroups = computed(() => {

  if (!searchQuery.value) return permissionGroups;

  const query = searchQuery.value.toLowerCase();

  return permissionGroups.map(group => ({
    ...group,
    keys: group.keys.filter(key => {
      const meta = PERMISSION_REGISTRY[key];
      return meta.label.toLowerCase().includes(query)
          || meta.description.toLowerCase().includes(query);
    }),
  }));

});

const isRoleLocked = (role: RoleData): boolean => role.name === 'OWNER';

const valueOf = (roleId: string, permission: Permission): PermissionValue => {
  return localPerms.value[roleId]?.[permission] ?? 'INHERIT';
};

// Ce que donne le rôle au niveau de l'organisation, faute de dérogation ici.
const inheritedValue = (role: RoleData, permission: Permission): PermissionValue => {
  return role.permissions.find(rp => rp.permission === permission)?.value ?? 'DENY';
};

const overrideCount = (roleId: string): number => {
  const perms = localPerms.value[roleId];
  if (!perms) return 0;
  return Object.values(perms).filter(v => v !== 'INHERIT').length;
};

const setValue = (roleId: string, permission: Permission, value: PermissionValue) => {
  if (!localPerms.value[roleId]) localPerms.value[roleId] = {};
  localPerms.value[roleId]![permission] = value;
};

const resetRole = (roleId: string) => {
  localPerms.value[roleId] = {};
};

const buildOverridesFromLocal = (): PermissionOverride[] => {

  const overrides: PermissionOverride[] = [];

  for (const [roleId, perms] of Object.entries(localPerms.value)) {
    for (const [permission, value] of Object.entries(perms)) {
      if (value !== 'INHERIT') {
        overrides.push({ roleId, permission: permission as Permission, value });
      }
    }
  }

  return overrides;

};

const hasChanges = computed<boolean>(() => {

  const current = buildOverridesFromLocal();
  const original = originalOverrides.value;

  if (current.length !== original.length) return true;

  return current.some(c => !original.some(
    o => o.roleId === c.roleId && o.permission === c.permission && o.value === c.value
  ));

});

watch(hasChanges, (value) => emit('dirty', value), { immediate: true });

// Repart des dérogations connues du serveur : sert au chargement comme au
// bouton « Réinitialiser » de la barre d'enregistrement.
const applyOverrides = () => {

  const perms: Record<string, Record<string, PermissionValue>> = {};

  for (const role of roles.value) {
    perms[role.id] = {};
  }

  for (const override of originalOverrides.value) {
    if (!override.roleId) continue;
    if (!perms[override.roleId]) perms[override.roleId] = {};
    perms[override.roleId]![override.permission] = override.value;
  }

  localPerms.value = perms;

};

const load = async () => {

  if (!orgId.value) return;

  isLoading.value = true;

  try {

    const [rolesData, overridesData] = await Promise.all([
      fetchRoles(),
      fetchOverrides('space', props.spaceId),
    ]);

    roles.value = rolesData;
    originalOverrides.value = overridesData;
    applyOverrides();

    if (!selectedRole.value) selectedRoleId.value = rolesData[0]?.id ?? null;

  } catch (err) {
    console.error('[SpacePermissions] Erreur chargement:', err);
    toast.show('Erreur lors du chargement des permissions', 'error');
  } finally {
    isLoading.value = false;
  }

};

onMounted(load);
watch(() => props.spaceId, load);

const save = async (): Promise<boolean> => {

  if (!orgId.value || isSaving.value) return false;

  isSaving.value = true;

  try {

    const overrides = buildOverridesFromLocal();
    const ok = await saveOverrides('space', props.spaceId, overrides);

    if (!ok) {
      toast.show('Erreur lors de la sauvegarde des permissions', 'error');
      return false;
    }

    originalOverrides.value = overrides;
    invalidateCache();
    await fetchPermissions();
    return true;

  } catch (err) {
    console.error('[SpacePermissions] Erreur save:', err);
    toast.show('Erreur lors de la sauvegarde des permissions', 'error');
    return false;
  } finally {
    isSaving.value = false;
  }

};

const reset = () => applyOverrides();

defineExpose({ save, reset });

</script>
