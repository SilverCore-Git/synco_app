<template>

  <div class="space-y-5">

    <div class="p-4 bg-(--bg2) rounded-xl border border-(--border-color) flex gap-4">
      <i class="bi bi-info-circle-fill text-(--primary) text-xl shrink-0" />
      <p class="text-sm text-(--text2)">
        Chaque rôle part des permissions définies au niveau de l'organisation.
        Une valeur posée ici ne vaut que pour ce space ; laissée sur
        « Hériter », elle suit le rôle.
      </p>
    </div>

    <div v-if="isLoading" class="flex items-center justify-center py-16">
      <div class="w-8 h-8 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
    </div>

    <!-- La colonne des rôles est collante et peinte en `--bg` par
         PermissionMatrix : le conteneur garde donc ce fond, sinon la colonne
         se détache du reste du tableau au défilement horizontal. -->
    <div v-else class="rounded-2xl border border-(--border-color) bg-(--bg) p-2 sm:p-4">
      <PermissionMatrix
        :subjects="matrixSubjects"
        :permissions="localPerms"
        subject-label="Rôles"
        @update="handlePermUpdate"
      />
    </div>

  </div>

</template>

<script lang="ts" setup>

import { ref, watch, computed, onMounted } from 'vue';
import { usePermissions } from '@/composables/usePermissions';
import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';
import { PERMISSION_KEYS, type Permission, type PermissionValue, type RoleData, type PermissionOverride } from '@/config/permissions.config';
import PermissionMatrix from './PermissionMatrix.vue';
import type { MatrixSubject } from './PermissionMatrix.vue';

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

// État local des permissions (modifiable par l'utilisateur)
const localPerms = ref<Record<string, Record<string, PermissionValue>>>({});

const matrixSubjects = computed<MatrixSubject[]>(() =>
  roles.value.map(r => ({
    id: r.id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    isSystem: r.isSystem,
    memberCount: r.memberCount,
  }))
);

const hasChanges = computed<boolean>(() => {

  const current = buildOverridesFromLocal();
  const original = originalOverrides.value;

  if (current.length !== original.length) return true;

  for (const c of current) {
    const match = original.find(
      o => o.roleId === c.roleId && o.permission === c.permission && o.value === c.value
    );
    if (!match) return true;
  }

  return false;

});

watch(hasChanges, (value) => emit('dirty', value), { immediate: true });

// Repart des overrides connus du serveur : sert au chargement comme au
// bouton « Réinitialiser » de la barre d'enregistrement.
const applyOverrides = () => {

  const perms: Record<string, Record<string, PermissionValue>> = {};

  for (const role of roles.value) {
    perms[role.id] = {};
    for (const perm of PERMISSION_KEYS) {
      const override = originalOverrides.value.find(
        o => o.roleId === role.id && o.permission === perm
      );
      if (override) {
        perms[role.id]![perm] = override.value;
      } else {
        const rolePerm = role.permissions.find(rp => rp.permission === perm);
        perms[role.id]![perm] = rolePerm ? rolePerm.value : 'INHERIT';
      }
    }
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

  } catch (err) {
    console.error('[SpacePermissions] Erreur chargement:', err);
    toast.show('Erreur lors du chargement des permissions', 'error');
  } finally {
    isLoading.value = false;
  }

};

onMounted(load);
watch(() => props.spaceId, load);

function handlePermUpdate(subjectId: string, permission: Permission, value: PermissionValue) {
  if (!localPerms.value[subjectId]) localPerms.value[subjectId] = {};
  localPerms.value[subjectId]![permission] = value;
}

function buildOverridesFromLocal(): PermissionOverride[] {

  const overrides: PermissionOverride[] = [];

  for (const [roleId, perms] of Object.entries(localPerms.value)) {
    for (const [perm, value] of Object.entries(perms)) {
      if (value !== 'INHERIT') {
        overrides.push({
          roleId,
          permission: perm as Permission,
          value: value as PermissionValue,
        });
      }
    }
  }

  return overrides;

}

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
