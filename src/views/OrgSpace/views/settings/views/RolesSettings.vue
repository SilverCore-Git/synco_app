<template>
  <div class="flex flex-col md:flex-row h-full w-full bg-(--bg) overflow-hidden">
    
    <!-- Colonne Gauche : Liste des Rôles (Sidebar) -->
    <div class="w-full md:w-1/4 max-w-[320px] min-w-[280px] bg-(--bg2)/50 border-r border-(--border-color) flex flex-col h-full shrink-0">
      
      <!-- En-tête Sidebar avec Bouton Créer -->
      <div class="p-6 border-b border-(--border-color) flex items-center justify-between shrink-0">
        <div>
          <h1 class="text-xl font-bold text-(--text)">Rôles</h1>
          <p class="text-xs text-(--text2) mt-1">Gérez l'accès au workspace</p>
        </div>
        <button 
          @click="showCreateModal = true"
          class="w-8 h-8 flex items-center justify-center bg-(--primary) hover:bg-(--primary-hover) text-white rounded-lg transition-colors shadow-sm"
          title="Créer un nouveau rôle"
        >
          <i class="bi bi-plus-lg text-lg" />
        </button>
      </div>

      <!-- Liste scrollable -->
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-2 relative">
        <!-- Loading global -->
        <div v-if="loading && roles.length === 0" class="absolute inset-0 flex items-center justify-center">
          <div class="w-6 h-6 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
        </div>

        <div 
          v-for="role in roles" 
          :key="role.id"
          @click="selectRole(role)"
          class="px-4 py-3 rounded-xl transition-all cursor-pointer flex items-center justify-between group border border-transparent"
          :class="selectedRoleId === role.id ? 'bg-(--primary)/10 border-(--primary)/20 shadow-sm' : 'hover:bg-(--bg2)'"
        >
          <div class="flex items-center gap-3">
            <!-- Pastille de couleur ronde -->
            <div 
              class="w-3 h-3 rounded-full shrink-0 shadow-inner"
              :style="{ backgroundColor: role.color || '#6b7280' }"
            />
            <div class="flex flex-col">
              <span class="font-bold text-sm flex items-center gap-2" :class="selectedRoleId === role.id ? 'text-(--primary)' : 'text-(--text)'">
                {{ role.name }}
                <span v-if="role.isSystem" class="text-[9px] font-black bg-white/5 px-1.5 py-0.5 rounded text-(--text2) uppercase tracking-wider border border-(--border-color)">
                  Sys
                </span>
              </span>
              <span class="text-xs text-(--text2) mt-0.5">{{ role.memberCount }} membre{{ role.memberCount !== 1 ? 's' : '' }}</span>
            </div>
          </div>
          <i class="bi bi-chevron-right text-xs transition-transform opacity-0 group-hover:opacity-100" :class="selectedRoleId === role.id ? 'opacity-100 translate-x-1 text-(--primary)' : 'text-(--text2)'" />
        </div>
      </div>
    </div>

    <!-- Colonne Droite : Configuration (Main Content) -->
    <div class="flex-1 flex flex-col h-full bg-(--bg) relative overflow-hidden">
      
      <template v-if="selectedRole">
        <!-- Header Rôle -->
        <div class="px-8 py-6 border-b border-(--border-color) shrink-0 flex items-end justify-between bg-(--bg)/95 backdrop-blur-sm z-10">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <div class="w-4 h-4 rounded-full shadow-inner" :style="{ backgroundColor: selectedRole.color || '#6b7280' }" />
              <h2 class="text-2xl font-black text-(--text)">{{ selectedRole.name }}</h2>
            </div>
            <p class="text-sm text-(--text2)">
              Définissez les permissions par défaut pour ce rôle.
            </p>
          </div>
          
          <div class="flex items-center gap-3">
            <!-- Barre de recherche -->
            <div class="relative">
              <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs" />
              <input 
                type="search" 
                v-model="searchQuery"
                placeholder="Chercher..."
                class="pl-8 pr-4 py-2 bg-(--bg2) border border-(--border-color) rounded-lg text-sm text-(--text) outline-none focus:border-(--primary) w-48 transition-all placeholder-(--text2)/50"
              />
            </div>
            <!-- Bouton Supprimer -->
            <button 
              v-if="!selectedRole.isSystem"
              @click="deleteRole(selectedRole)"
              class="w-10 h-10 flex items-center justify-center text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-lg transition-colors"
              title="Supprimer le rôle"
            >
              <i class="bi bi-trash" />
            </button>
          </div>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto p-8 relative bg-(--bg)">
          
          <!-- Loading state discret (overlay) lors de la re-sync -->
          <div v-if="loading" class="absolute top-4 right-4 z-20">
            <div class="w-4 h-4 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
          </div>

          <div class="max-w-3xl flex flex-col gap-10 pb-32">
            <template v-for="group in filteredPermissionGroups" :key="group.name">
              <div v-if="group.keys.length > 0" class="flex flex-col gap-4">
                
                <h3 class="text-xs font-black uppercase tracking-widest text-(--primary) border-b border-(--border-color) pb-2">
                  {{ group.name }}
                </h3>
                
                <div class="flex flex-col gap-1">
                  <div 
                    v-for="permKey in group.keys" 
                    :key="permKey" 
                    @click="togglePermission(selectedRole.id, permKey as Permission)"
                    class="flex items-center justify-between p-3 -mx-3 rounded-xl hover:bg-(--bg2)/50 transition-colors group/item cursor-pointer"
                  >
                    <div class="flex items-start gap-4">
                      <div class="w-8 h-8 rounded-lg bg-(--bg2) flex items-center justify-center border border-(--border-color) text-(--text2) mt-0.5">
                        <i :class="PERMISSION_REGISTRY[permKey as Permission].icon" />
                      </div>
                      <div class="flex flex-col">
                        <span class="font-bold text-sm text-(--text)">{{ PERMISSION_REGISTRY[permKey as Permission].label }}</span>
                        <span class="text-xs text-(--text2) mt-0.5 max-w-md leading-relaxed">
                          {{ PERMISSION_REGISTRY[permKey as Permission].description }}
                        </span>
                      </div>
                    </div>
                    
                    <!-- Switch Toggle -->
                    <button 
                      :disabled="isRoleLocked(selectedRole)"
                      class="relative w-11 h-6 rounded-full transition-colors focus:outline-none shrink-0 border border-black/10 pointer-events-none"
                      :class="[
                        getPermissionValue(selectedRole.id, permKey as Permission) === 'ALLOW' ? 'bg-(--primary)' : 'bg-(--bg2)',
                        isRoleLocked(selectedRole) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
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
            </template>
            
            <div v-if="filteredPermissionGroups.every(g => g.keys.length === 0)" class="py-12 text-center">
              <p class="text-(--text2) text-sm">Aucune permission ne correspond à "{{ searchQuery }}"</p>
            </div>
          </div>
        </div>

        <!-- Barre de Sauvegarde (Sticky Footer) -->
        <div 
          class="absolute bottom-0 left-0 right-0 border-t border-(--border-color) bg-(--bg)/90 backdrop-blur-md p-4 flex items-center justify-between transition-transform duration-300 z-10"
          :class="hasChanges ? 'translate-y-0' : 'translate-y-full opacity-0 pointer-events-none'"
        >
          <span class="text-sm font-semibold text-yellow-500 flex items-center gap-2 ml-4">
            <i class="bi bi-exclamation-triangle-fill" />
            Modifications non enregistrées
          </span>
          <div class="flex items-center gap-3">
            <button 
              @click="resetChanges"
              :disabled="isSaving"
              class="px-4 py-2 text-sm font-semibold text-(--text2) hover:text-(--text) transition-colors"
            >
              Annuler
            </button>
            <button 
              @click="saveDefaults"
              :disabled="isSaving"
              class="px-5 py-2 rounded-xl text-sm font-bold bg-(--primary) hover:bg-(--primary-hover) text-white transition-all flex items-center gap-2"
            >
              <div v-if="isSaving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Enregistrer les modifications</span>
            </button>
          </div>
        </div>

      </template>

      <!-- État vide -->
      <div v-else class="flex-1 flex flex-col items-center justify-center p-10 text-center relative z-0">
        <div class="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
          <i class="bi bi-shield-lock" style="font-size: 20rem;" />
        </div>
        <div class="w-16 h-16 bg-(--bg2) border border-(--border-color) rounded-2xl flex items-center justify-center text-3xl mb-4 relative z-10">
          <i class="bi bi-shield-check text-(--primary)" />
        </div>
        <h3 class="text-xl font-bold text-(--text) relative z-10">Gestion des rôles</h3>
        <p class="text-sm text-(--text2) mt-2 max-w-sm relative z-10">
          Sélectionnez un rôle dans la liste de gauche pour configurer ses accès par défaut à l'ensemble du workspace.
        </p>
      </div>

    </div>

    <!-- Modal Création -->
    <Popup 
      :is-open="showCreateModal" 
      @close="showCreateModal = false"
    >
      <template #title>Créer un rôle</template>
      
      <div class="flex flex-col gap-5">
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-(--text2) mb-2">Nom du rôle</label>
          <input 
            ref="nameInput"
            v-model="newRole.name" 
            type="text" 
            class="w-full bg-(--bg2) border border-(--border-color) rounded-lg px-4 py-2.5 text-sm text-(--text) font-semibold outline-none focus:border-(--primary)"
            placeholder="Ex: Designer, Externe..."
          />
        </div>
        
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-(--text2) mb-2">Couleur</label>
          <div class="flex items-center gap-3">
            <!-- Selecteur natif stylisé via un wrapper -->
            <div class="relative w-10 h-10 rounded-full overflow-hidden shrink-0 cursor-pointer shadow-inner border border-white/10">
              <input 
                type="color" 
                v-model="newRole.color" 
                class="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
              />
            </div>
            <input 
              v-model="newRole.color" 
              type="text" 
              class="flex-1 bg-(--bg2) border border-(--border-color) rounded-lg px-4 py-2.5 text-sm text-(--text) uppercase font-mono outline-none focus:border-(--primary)"
              placeholder="#3b82f6"
            />
          </div>
          
          <!-- Palettes prédéfinies -->
          <div class="flex items-center gap-2 mt-3">
            <button 
              v-for="color in presetColors" 
              :key="color"
              @click="newRole.color = color"
              class="w-6 h-6 rounded-full border border-black/20 hover:scale-110 transition-transform shadow-inner"
              :style="{ backgroundColor: color }"
              :class="newRole.color?.toLowerCase() === color ? 'ring-2 ring-white ring-offset-2 ring-offset-(--bg)' : ''"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <button @click="showCreateModal = false" class="px-4 py-2 text-sm font-semibold text-(--text2) hover:text-(--text)">
          Annuler
        </button>
        <button 
          @click="createRole"
          :disabled="!newRole.name || isSaving"
          class="px-5 py-2 bg-(--primary) hover:bg-(--primary-hover) text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <div v-if="isSaving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Créer
        </button>
      </template>
    </Popup>

  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { usePermissions } from '@/composables/usePermissions';
import { openedOrg } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import { PERMISSION_REGISTRY, type Permission, type PermissionValue, type RoleData } from '@/config/permissions.config';
import useWSocket from '@/composables/useWSocket';
import Popup from '@/components/Popup.vue';

const toast = useToast();
const orgId = computed(() => openedOrg.value?.id);
const { fetchRoles, invalidateRolesCache, invalidateCache } = usePermissions(orgId);

const loading = ref(true);
const isSaving = ref(false);
const roles = ref<RoleData[]>([]);
const selectedRoleId = ref<string | null>(null);

const showCreateModal = ref(false);
const nameInput = ref<HTMLInputElement | null>(null);

watch(showCreateModal, (val) => {
  if (val) {
    nextTick(() => {
      nameInput.value?.focus();
    });
  }
});
const presetColors = ['#94a3b8', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
const newRole = ref({ name: '', color: presetColors[0] });
const searchQuery = ref('');

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

let socketRef: any = null;

onMounted(async () => {
  await loadData();
  
  // Setup WebSocket listening
  const socketRefObj = await useWSocket();
  if (socketRefObj.value) {
    socketRef = socketRefObj.value;
    socketRef.on('roles:updated', handleRolesUpdated);
  }
});

onUnmounted(() => {
  if (socketRef) {
    socketRef.off('roles:updated', handleRolesUpdated);
  }
});

const handleRolesUpdated = () => {
  invalidateCache();
  invalidateRolesCache();
  // Ne pas écraser les modifications locales en cours si possible,
  // mais pour faire simple et sûr : on recharge tout discrètement.
  if (!hasChanges.value) {
    loadData(true);
  }
};

async function loadData(silent = false) {
  if (!orgId.value) return;
  if (!silent) loading.value = true;
  
  try {
    invalidateRolesCache();
    const data = await fetchRoles();
    roles.value = data;
    
    // Initialiser l'état local
    const perms: Record<string, Record<string, PermissionValue>> = {};
    for (const role of data) {
      perms[role.id] = {};
      // Initialize all to DENY first
      for (const k of Object.keys(PERMISSION_REGISTRY)) {
        perms[role.id]![k] = 'DENY';
      }
      // Apply actual values
      for (const p of role.permissions) {
        perms[role.id]![p.permission] = p.value;
      }
    }
    
    // Si on a des changements locaux, on ne les écrase pas lors d'un push websocket
    // sauf si c'est le chargement initial
    if (!silent || !hasChanges.value) {
      localPerms.value = JSON.parse(JSON.stringify(perms));
      originalPerms.value = JSON.parse(JSON.stringify(perms));
    } else {
      // Mettre à jour seulement l'original pour le diff futur
      originalPerms.value = JSON.parse(JSON.stringify(perms));
    }
    
    if (roles.value.length > 0 && !selectedRoleId.value) {
      selectedRoleId.value = roles.value[0]?.id || null;
    }

  } catch (err) {
    console.error(err);
    if (!silent) toast.show('Erreur de chargement', 'error');
  } finally {
    loading.value = false;
  }
}

const selectedRole = computed(() => roles.value.find(r => r.id === selectedRoleId.value));

function selectRole(role: RoleData) {
  if (hasChanges.value) {
    if (!confirm("Vous avez des modifications non enregistrées. Voulez-vous vraiment changer de rôle ?")) {
      return;
    }
    resetChanges();
  }
  selectedRoleId.value = role.id;
  searchQuery.value = ''; // Reset search on role change
}

const filteredPermissionGroups = computed(() => {
  if (!searchQuery.value) return permissionGroups;
  
  const query = searchQuery.value.toLowerCase();
  
  return permissionGroups.map(group => {
    const filteredKeys = group.keys.filter(key => {
      const meta = PERMISSION_REGISTRY[key as Permission];
      return meta.label.toLowerCase().includes(query) || 
             meta.description.toLowerCase().includes(query);
    });
    
    return {
      ...group,
      keys: filteredKeys
    };
  });
});

const hasChanges = computed(() => {
  return JSON.stringify(localPerms.value) !== JSON.stringify(originalPerms.value);
});

function resetChanges() {
  localPerms.value = JSON.parse(JSON.stringify(originalPerms.value));
}

// Empêcher la modification de OWNER
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
    
    toast.show('Modifications enregistrées', 'success');
    await loadData(true);
    
    // Invalidate local cache explicitly just in case WebSocket is slow
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
  isSaving.value = true;
  const roleName = newRole.value.name; // Sauvegarder le nom car on va réinitialiser
  
  try {
    const res = await sfetch(`/api/orgs/${orgId.value}/roles`, {
      method: 'POST',
      body: JSON.stringify({
        name: roleName,
        color: newRole.value.color || undefined,
      }),
    });
    
    if (!res.ok) throw new Error();
    
    const createdRoleData = await res.json(); // Le backend retourne le rôle créé
    
    toast.show('Rôle créé', 'success');
    showCreateModal.value = false;
    newRole.value = { name: '', color: presetColors[0] };
    
    // Assigner l'ID directement pour que l'UI soit instantanée
    selectedRoleId.value = createdRoleData.id;
    
    // Recharger la liste
    await loadData(true);

  } catch (err) {
    toast.show('Erreur de création', 'error');
  } finally {
    isSaving.value = false;
  }
}

async function deleteRole(role: RoleData) {
  if (!orgId.value) return;
  if (!confirm(`Êtes-vous sûr de vouloir supprimer le rôle "${role.name}" ?`)) return;
  try {
    const res = await sfetch(`/api/orgs/${orgId.value}/roles/${role.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error();
    toast.show('Rôle supprimé', 'success');
    
    if (selectedRoleId.value === role.id) {
      selectedRoleId.value = null;
    }
    
    // Le websocket s'occupera de recharger la liste,
    // mais on force localement pour l'UI instantanée
    await loadData(true);
  } catch (err) {
    toast.show('Erreur de suppression', 'error');
  }
}

</script>
