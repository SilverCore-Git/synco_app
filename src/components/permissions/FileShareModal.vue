<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="transform scale-95 opacity-0"
    enter-to-class="transform scale-100 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="transform scale-100 opacity-100"
    leave-to-class="transform scale-95 opacity-0"
  >
    <div 
      v-if="show" 
      class="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      @click.self="$emit('close')"
    >
      <div class="bg-(--bg) rounded-2xl border border-white/10 shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col relative overflow-hidden" @click.stop>

        <!-- Header -->
        <header class="flex items-center justify-between px-6 py-4 border-b border-(--border-color) shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-(--primary)/10 flex items-center justify-center">
              <i class="bi bi-file-earmark-lock text-(--primary) text-lg" />
            </div>
            <div>
              <h2 class="text-lg font-bold text-(--text)">Permissions du fichier</h2>
              <p class="text-xs text-(--text2)">{{ fileName }}</p>
            </div>
          </div>
          <button @click="$emit('close')" class="text-(--text2) hover:text-(--text) transition-colors p-2 rounded-lg hover:bg-white/5">
            <i class="bi bi-x-lg text-xl" />
          </button>
        </header>

        <!-- Contenu scrollable -->
        <main class="flex-1 overflow-y-auto p-6">

          <!-- Loading -->
          <div v-if="isLoading" class="flex items-center justify-center py-12">
            <div class="w-8 h-8 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
          </div>

          <!-- Matrice -->
          <template v-else>
            <PermissionMatrix
              :subjects="matrixSubjects"
              :permissions="matrixPermissions"
              subject-label="Rôles"
              @update="handlePermUpdate"
            />
          </template>

        </main>

        <!-- Footer -->
        <footer class="flex items-center justify-between px-6 py-4 border-t border-(--border-color) shrink-0 bg-(--bg2)/50">
          <p v-if="hasChanges" class="text-xs text-amber-400 flex items-center gap-1.5">
            <i class="bi bi-exclamation-circle" />
            Modifications non sauvegardées
          </p>
          <div v-else />
          <div class="flex items-center gap-3">
            <button 
              @click="$emit('close')" 
              class="px-4 py-2 rounded-xl text-sm font-semibold text-(--text2) hover:text-(--text) hover:bg-white/5 transition-all"
            >
              Annuler
            </button>
            <button 
              @click="save"
              :disabled="!hasChanges || isSaving"
              class="px-5 py-2 rounded-xl text-sm font-bold bg-(--primary) hover:bg-(--primary-hover) text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <div v-if="isSaving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>{{ isSaving ? 'Sauvegarde...' : 'Sauvegarder' }}</span>
            </button>
          </div>
        </footer>

      </div>
    </div>
  </transition>
</template>

<script lang="ts" setup>
import { ref, watch, computed } from 'vue';
import { usePermissions } from '@/composables/usePermissions';
import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';
import { PERMISSION_KEYS, type Permission, type PermissionValue, type RoleData, type PermissionOverride } from '@/config/permissions.config';
import PermissionMatrix from './PermissionMatrix.vue';
import type { MatrixSubject } from './PermissionMatrix.vue';

const props = defineProps<{
  show: boolean;
  fileId: string;
  fileName: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const toast = useToast();
const orgId = computed(() => openedOrg.value?.id);
const { fetchRoles, fetchOverrides, saveOverrides, invalidateCache } = usePermissions(orgId);

const isLoading = ref(false);
const isSaving = ref(false);
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

const matrixPermissions = computed(() => localPerms.value);

const hasChanges = computed(() => {
  // Comparer l'état local avec les overrides originaux
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

// Charger les données à l'ouverture
watch(() => props.show, async (show) => {
  if (!show || !orgId.value) return;

  isLoading.value = true;
  try {
    const [rolesData, overridesData] = await Promise.all([
      fetchRoles(),
      fetchOverrides('file', props.fileId),
    ]);

    roles.value = rolesData;
    originalOverrides.value = overridesData;

    // Initialiser l'état local
    const perms: Record<string, Record<string, PermissionValue>> = {};
    for (const role of rolesData) {
      perms[role.id] = {};
      for (const perm of PERMISSION_KEYS) {
        // Chercher un override existant
        const override = overridesData.find(
          o => o.roleId === role.id && o.permission === perm
        );
        if (override) {
          perms[role.id]![perm] = override.value;
        } else {
          // INHERIT par défaut (hérite du dossier ou de l'espace)
          perms[role.id]![perm] = 'INHERIT';
        }
      }
    }
    localPerms.value = perms;

  } catch (err) {
    console.error('[FilePermissions] Erreur chargement:', err);
    toast.show('Erreur lors du chargement des permissions', 'error');
  } finally {
    isLoading.value = false;
  }
});

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

async function save() {
  if (!orgId.value) return;
  isSaving.value = true;
  try {
    const overrides = buildOverridesFromLocal();
    const ok = await saveOverrides('file', props.fileId, overrides);
    if (ok) {
      originalOverrides.value = overrides;
      invalidateCache();
      toast.show('Permissions sauvegardées', 'success');
      emit('close');
    } else {
      toast.show('Erreur lors de la sauvegarde', 'error');
    }
  } catch (err) {
    console.error('[FilePermissions] Erreur save:', err);
    toast.show('Erreur lors de la sauvegarde', 'error');
  } finally {
    isSaving.value = false;
  }
}
</script>
