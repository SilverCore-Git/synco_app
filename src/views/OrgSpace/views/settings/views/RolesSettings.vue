<template>
  <div class="p-6 max-w-6xl mx-auto flex flex-col gap-6 h-full pb-32">

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

    <!-- Layout Master-Detail -->
    <div v-else class="flex flex-col md:flex-row gap-6 mt-4">
      
      <!-- Colonne Gauche : Liste des Rôles -->
      <div class="w-full md:w-1/3 flex flex-col gap-3">
        <h2 class="text-xs font-black uppercase tracking-wider text-(--text2) mb-2">Vos rôles</h2>
        
        <div 
          v-for="role in roles" 
          :key="role.id"
          @click="selectRole(role)"
          class="p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between"
          :class="selectedRoleId === role.id ? 'bg-(--primary)/10 border-(--primary) shadow-sm' : 'bg-(--bg2) border-(--border-color) hover:border-white/10 hover:bg-(--bg2)/80'"
        >
          <div class="flex items-center gap-3">
            <div 
              v-if="role.color" 
              class="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              :style="{ backgroundColor: role.color + '30', color: role.color }"
            >
              <i :class="role.icon || 'bi-shield-check'" class="text-xs" />
            </div>
            <div v-else class="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center shrink-0">
              <i :class="role.icon || 'bi-shield-check'" class="text-xs text-(--text2)" />
            </div>
            <div>
              <p class="font-bold text-sm text-(--text) flex items-center gap-2">
                {{ role.name }}
                <span v-if="role.isSystem" class="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-(--text2) uppercase tracking-wider">
                  Système
                </span>
              </p>
              <p class="text-xs text-(--text2)">{{ role.memberCount }} membre{{ role.memberCount !== 1 ? 's' : '' }}</p>
            </div>
          </div>
          <i class="bi bi-chevron-right text-(--text2) text-sm transition-transform" :class="selectedRoleId === role.id ? 'translate-x-1 text-(--primary)' : ''" />
        </div>
      </div>

      <!-- Colonne Droite : Configuration du rôle sélectionné -->
      <div class="w-full md:w-2/3" v-if="selectedRole">
        
        <div class="bg-(--bg2) border border-(--border-color) rounded-2xl p-6 shadow-sm flex flex-col h-full">
          
          <!-- En-tête Rôle -->
          <div class="flex items-start justify-between mb-8 border-b border-(--border-color) pb-6">
            <div>
              <h2 class="text-xl font-bold text-(--text) flex items-center gap-2">
                {{ selectedRole.name }}
              </h2>
              <p class="text-sm text-(--text2) mt-1">
                Configurez les accès par défaut pour tous les membres ayant ce rôle.
              </p>
            </div>
            <div v-if="!selectedRole.isSystem" class="flex gap-2">
              <button 
                @click="deleteRole(selectedRole)"
                class="px-3 py-1.5 text-red-400 bg-red-400/10 hover:bg-red-400/20 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2"
              >
                <i class="bi bi-trash" />
                Supprimer
              </button>
            </div>
          </div>

          <!-- Groupes de Permissions -->
          <div class="flex flex-col gap-8 flex-1">
            <div v-for="group in permissionGroups" :key="group.name" class="flex flex-col gap-4">
              
              <h3 class="text-xs font-black uppercase tracking-widest text-(--text2)">{{ group.name }}</h3>
              
              <div class="bg-black/20 rounded-xl border border-(--border-color) divide-y divide-(--border-color) overflow-hidden">
                
                <div v-for="permKey in group.keys" :key="permKey" class="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                  <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-lg bg-(--bg2) flex items-center justify-center border border-(--border-color) text-(--text2)">
                      <i :class="PERMISSION_REGISTRY[permKey as Permission].icon" />
                    </div>
                    <div>
                      <p class="font-bold text-sm text-(--text)">{{ PERMISSION_REGISTRY[permKey as Permission].label }}</p>
                      <p class="text-xs text-(--text2) mt-0.5">{{ PERMISSION_REGISTRY[permKey as Permission].description }}</p>
                    </div>
                  </div>
                  
                  <!-- Switch Toggle -->
                  <button 
                    @click="togglePermission(selectedRole.id, permKey as Permission)"
                    :disabled="isRoleLocked(selectedRole)"
                    class="relative w-11 h-6 rounded-full transition-colors focus:outline-none"
                    :class="[
                      getPermissionValue(selectedRole.id, permKey as Permission) === 'ALLOW' ? 'bg-(--primary)' : 'bg-(--bg)',
                      isRoleLocked(selectedRole) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    ]"
                  >
                    <span 
                      class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm"
                      :class="getPermissionValue(selectedRole.id, permKey as Permission) === 'ALLOW' ? 'translate-x-5' : 'translate-x-0'"
                    />
                  </button>
                </div>

              </div>
            </div>
          </div>

          <!-- Barre de Sauvegarde (Sticky) -->
          <div class="mt-8 pt-6 border-t border-(--border-color) flex justify-end">
            <div class="flex items-center gap-4">
              <span v-if="hasChanges" class="text-xs font-bold text-yellow-500 animate-pulse">
                Modifications non sauvegardées
              </span>
              <button 
                @click="saveDefaults"
                :disabled="!hasChanges || isSaving"
                class="px-5 py-2.5 rounded-xl text-sm font-bold bg-(--primary) hover:bg-(--primary-hover) text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <div v-if="isSaving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Sauvegarder les modifications</span>
              </button>
            </div>
          </div>

        </div>
      </div>
      
      <!-- État vide (Aucun rôle sélectionné) -->
      <div v-else class="w-full md:w-2/3 flex flex-col items-center justify-center bg-(--bg2)/50 border border-(--border-color) rounded-2xl p-10 text-center">
        <div class="w-16 h-16 bg-(--bg2) border border-(--border-color) rounded-2xl flex items-center justify-center text-3xl mb-4">
          <i class="bi bi-shield-lock text-(--text2)" />
        </div>
        <h3 class="text-lg font-bold text-(--text)">Sélectionnez un rôle</h3>
        <p class="text-sm text-(--text2) mt-2 max-w-sm">
          Cliquez sur un rôle dans la liste de gauche pour configurer ses permissions par défaut.
        </p>
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
import { PERMISSION_REGISTRY, type Permission, type PermissionValue, type RoleData } from '@/config/permissions.config';

const toast = useToast();
const orgId = computed(() => openedOrg.value?.id);
const { fetchRoles } = usePermissions(orgId);

const loading = ref(true);
const isSaving = ref(false);
const roles = ref<RoleData[]>([]);
const selectedRoleId = ref<string | null>(null);

const showCreateModal = ref(false);
const newRole = ref({ name: '', color: '' });

// État local des permissions par défaut
const localPerms = ref<Record<string, Record<string, PermissionValue>>>({});
const originalPerms = ref<Record<string, Record<string, PermissionValue>>>({});

const permissionGroups = [
  {
    name: 'Visibilité & Lecture',
    keys: ['VIEW', 'READ']
  },
  {
    name: 'Édition',
    keys: ['WRITE', 'UPLOAD', 'DELETE']
  },
  {
    name: 'Gestion & Administration',
    keys: ['SHARE', 'MANAGE', 'ADMIN']
  }
];

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
      // Initialize all to DENY first to ensure complete coverage in UI
      for (const k of Object.keys(PERMISSION_REGISTRY)) {
        perms[role.id]![k] = 'DENY';
      }
      // Apply actual values
      for (const p of role.permissions) {
        perms[role.id]![p.permission] = p.value;
      }
    }
    localPerms.value = JSON.parse(JSON.stringify(perms));
    originalPerms.value = JSON.parse(JSON.stringify(perms));
    
    if (roles.value.length > 0 && !selectedRoleId.value) {
      selectedRoleId.value = roles.value[0]?.id || null;
    }

  } catch (err) {
    console.error(err);
    toast.show('Erreur de chargement', 'error');
  } finally {
    loading.value = false;
  }
}

const selectedRole = computed(() => roles.value.find(r => r.id === selectedRoleId.value));

function selectRole(role: RoleData) {
  selectedRoleId.value = role.id;
}

const hasChanges = computed(() => {
  return JSON.stringify(localPerms.value) !== JSON.stringify(originalPerms.value);
});

// Empêcher la modification de OWNER ou d'ADMIN si besoin
function isRoleLocked(role: RoleData): boolean {
  return role.name === 'OWNER'; 
}

function getPermissionValue(roleId: string, perm: Permission): PermissionValue {
  return localPerms.value[roleId]?.[perm] || 'DENY';
}

function togglePermission(roleId: string, perm: Permission) {
  if (!localPerms.value[roleId]) return;
  const current = localPerms.value[roleId][perm];
  localPerms.value[roleId][perm] = current === 'ALLOW' ? 'DENY' : 'ALLOW';
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
    // Select the new role (it should be the last one, or we can just find it by name)
    const createdRole = roles.value.find(r => r.name === newRole.value.name);
    if(createdRole) selectedRoleId.value = createdRole.id;

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
    selectedRoleId.value = roles.value[0]?.id || null;
    await loadData();
  } catch (err) {
    toast.show('Erreur de suppression', 'error');
  }
}

</script>
