<template>
  <div class="p-6 max-w-6xl mx-auto flex flex-col gap-8 h-full pb-32">

    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-(--text)">Rôles & Permissions</h1>
        <p class="text-sm text-(--text2) mt-1">
          Gérez les rôles de votre organisation et leurs permissions par défaut.
        </p>
      </div>
      <button 
        @click="showCreateModal = true"
        class="px-4 py-2 bg-(--primary) text-white font-bold rounded-xl text-sm flex items-center gap-2 hover:bg-(--primary-hover) transition-colors"
      >
        <i class="bi bi-plus-lg" />
        Créer un rôle
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
    </div>

    <!-- Contenu -->
    <div v-else class="flex flex-col gap-6">

      <!-- Liste des rôles sous forme de cartes -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div 
          v-for="role in roles" 
          :key="role.id"
          class="bg-(--bg2) border border-(--border-color) rounded-xl p-4 flex flex-col gap-4 hover:border-white/10 transition-colors"
        >
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div 
                v-if="role.color" 
                class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-inner"
                :style="{ backgroundColor: role.color + '20', color: role.color }"
              >
                <i :class="role.icon || 'bi-shield-check'" class="text-sm" />
              </div>
              <div 
                v-else 
                class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0"
              >
                <i :class="role.icon || 'bi-shield-check'" class="text-sm text-(--text2)" />
              </div>
              <div>
                <h3 class="font-bold text-(--text) text-sm flex items-center gap-2">
                  {{ role.name }}
                  <span v-if="role.isSystem" class="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-(--text2) uppercase tracking-wider">
                    Système
                  </span>
                </h3>
                <p class="text-xs text-(--text2)">{{ role.memberCount }} membre{{ role.memberCount !== 1 ? 's' : '' }}</p>
              </div>
            </div>

            <!-- Actions (seulement pour rôles custom) -->
            <div v-if="!role.isSystem" class="flex items-center gap-1">
              <button 
                @click="deleteRole(role)"
                class="p-1.5 text-(--text2) hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                title="Supprimer"
              >
                <i class="bi bi-trash" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Section Matrice des permissions par défaut -->
      <div class="mt-8">
        <h2 class="text-lg font-bold text-(--text) mb-4">Permissions par défaut</h2>
        <div class="bg-(--bg2) border border-(--border-color) rounded-2xl overflow-hidden shadow-sm">
          
          <PermissionMatrix
            :subjects="matrixSubjects"
            :permissions="matrixPermissions"
            subject-label="Rôle"
            @update="handlePermUpdate"
          />

          <div class="p-4 border-t border-(--border-color) flex justify-end bg-(--bg2)/50">
            <button 
              @click="saveDefaults"
              :disabled="!hasChanges || isSaving"
              class="px-5 py-2 rounded-xl text-sm font-bold bg-(--primary) hover:bg-(--primary-hover) text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <div v-if="isSaving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Sauvegarder</span>
            </button>
          </div>

        </div>
      </div>

    </div>

    <!-- Modal Création -->
    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="showCreateModal = false">
      <div class="bg-(--bg) border border-white/10 rounded-2xl p-6 max-w-sm w-full">
        <h3 class="text-lg font-bold mb-4 text-(--text)">Créer un rôle</h3>
        
        <div class="flex flex-col gap-4">
          <div>
            <label class="block text-xs text-(--text2) mb-1">Nom du rôle</label>
            <input 
              v-model="newRole.name" 
              type="text" 
              class="w-full bg-(--bg2) border border-(--border-color) rounded-lg px-3 py-2 text-sm text-(--text) outline-none focus:border-(--primary)"
              placeholder="Ex: Designer, Externe..."
            />
          </div>
          <div>
            <label class="block text-xs text-(--text2) mb-1">Couleur (Hex)</label>
            <input 
              v-model="newRole.color" 
              type="text" 
              class="w-full bg-(--bg2) border border-(--border-color) rounded-lg px-3 py-2 text-sm text-(--text) outline-none focus:border-(--primary)"
              placeholder="#3b82f6"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 mt-6">
          <button @click="showCreateModal = false" class="text-sm font-semibold text-(--text2) hover:text-(--text)">
            Annuler
          </button>
          <button 
            @click="createRole"
            :disabled="!newRole.name"
            class="px-4 py-2 bg-(--primary) text-white text-sm font-bold rounded-xl disabled:opacity-50"
          >
            Créer
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { usePermissions } from '@/composables/usePermissions';
import { openedOrg } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import PermissionMatrix from '@/components/permissions/PermissionMatrix.vue';
import type { Permission, PermissionValue, RoleData } from '@/config/permissions.config';

const toast = useToast();
const orgId = computed(() => openedOrg.value?.id);
const { fetchRoles } = usePermissions(orgId);

const loading = ref(true);
const isSaving = ref(false);
const roles = ref<RoleData[]>([]);
const showCreateModal = ref(false);

const newRole = ref({ name: '', color: '' });

// État local des permissions par défaut
const localPerms = ref<Record<string, Record<string, PermissionValue>>>({});
const originalPerms = ref<Record<string, Record<string, PermissionValue>>>({});

onMounted(async () => {
  await loadData();
});

async function loadData() {
  if (!orgId.value) return;
  loading.value = true;
  try {
    const data = await fetchRoles();
    roles.value = data;
    
    // Initialiser l'état
    const perms: Record<string, Record<string, PermissionValue>> = {};
    for (const role of data) {
      perms[role.id] = {};
      for (const p of role.permissions) {
        perms[role.id]![p.permission] = p.value;
      }
    }
    localPerms.value = JSON.parse(JSON.stringify(perms));
    originalPerms.value = JSON.parse(JSON.stringify(perms));

  } catch (err) {
    console.error(err);
    toast.show('Erreur de chargement', 'error');
  } finally {
    loading.value = false;
  }
}

const matrixSubjects = computed(() => 
  roles.value.map(r => ({
    id: r.id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    isSystem: r.isSystem,
    memberCount: r.memberCount
  }))
);

const matrixPermissions = computed(() => localPerms.value);

const hasChanges = computed(() => {
  return JSON.stringify(localPerms.value) !== JSON.stringify(originalPerms.value);
});

function handlePermUpdate(subjectId: string, perm: Permission, value: PermissionValue) {
  if (!localPerms.value[subjectId]) return;
  // Les rôles système (sauf admin pour certaines perms) peuvent être bridés si on veut,
  // mais backend protège OWNER.
  localPerms.value[subjectId]![perm] = value;
}

async function saveDefaults() {
  if (!orgId.value) return;
  isSaving.value = true;
  try {
    // Diff logic : trouver les rôles modifiés
    for (const role of roles.value) {
      const current = localPerms.value[role.id];
      const original = originalPerms.value[role.id];
      if (!current || !original) continue;

      const diff: Record<string, PermissionValue> = {};
      let changed = false;
      for (const [k, v] of Object.entries(current)) {
        if (v !== original[k]) {
          diff[k] = v;
          changed = true;
        }
      }

      if (changed) {
        await sfetch(`/api/orgs/${orgId.value}/roles/${role.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ permissions: diff }),
        });
      }
    }
    
    toast.show('Permissions par défaut sauvegardées', 'success');
    await loadData();
    const { invalidateCache } = usePermissions(orgId);
    invalidateCache();

  } catch (err) {
    toast.show('Erreur lors de la sauvegarde', 'error');
  } finally {
    isSaving.value = false;
  }
}

async function createRole() {
  if (!orgId.value || !newRole.value.name) return;
  try {
    const res = await sfetch(`/api/orgs/${orgId.value}/roles`, {
      method: 'POST',
      body: JSON.stringify({
        name: newRole.value.name,
        color: newRole.value.color || undefined,
      }),
    });
    if (!res.ok) throw new Error();
    toast.show('Rôle créé', 'success');
    showCreateModal.value = false;
    newRole.value = { name: '', color: '' };
    await loadData();
  } catch (err) {
    toast.show('Erreur de création', 'error');
  }
}

async function deleteRole(role: RoleData) {
  if (!orgId.value) return;
  if (!confirm(`Supprimer le rôle ${role.name} ?`)) return;
  try {
    const res = await sfetch(`/api/orgs/${orgId.value}/roles/${role.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error();
    toast.show('Rôle supprimé', 'success');
    await loadData();
  } catch (err) {
    toast.show('Erreur de suppression', 'error');
  }
}

</script>
