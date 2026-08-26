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
      <div class="bg-(--bg) rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col relative overflow-hidden" @click.stop>

        <!-- Header -->
        <header class="flex items-center justify-between px-6 py-4 border-b border-(--border-color) shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-(--primary)/10 flex items-center justify-center">
              <i class="bi bi-shield-lock text-(--primary) text-lg" />
            </div>
            <div>
              <h2 class="text-lg font-bold text-(--text)">Gérer les accès</h2>
              <p class="text-xs text-(--text2)">{{ itemName }}</p>
            </div>
          </div>
          <button @click="$emit('close')" class="text-(--text2) hover:text-(--text) transition-colors p-2 rounded-lg hover:bg-white/5">
            <i class="bi bi-x-lg text-xl" />
          </button>
        </header>

        <!-- Main -->
        <main class="flex-1 overflow-y-auto p-6">
          <div v-if="isLoading" class="flex justify-center py-12">
            <div class="w-8 h-8 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
          </div>

          <div v-else class="space-y-4">
            <div 
              v-for="member in workspaceMembers" 
              :key="member.userId"
              class="flex items-center justify-between p-4 bg-(--bg2)/20 border border-(--border-color) rounded-xl"
            >
              <!-- Info utilisateur -->
              <div class="flex items-center gap-3">
                <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-10 h-10 rounded-full object-cover border border-white/10" />
                <div v-else class="w-10 h-10 rounded-full bg-(--primary)/20 flex items-center justify-center text-(--primary) font-bold uppercase">
                  {{ member.user?.name?.charAt(0) || '?' }}
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-(--text)">{{ member.user?.name || 'Utilisateur inconnu' }}</h4>
                  <p class="text-xs text-(--text2)">{{ getMemberRoleName(member) }}</p>
                </div>
              </div>

              <!-- Contrôles -->
              <div class="flex items-center gap-6">
                <!-- Toggle Lire -->
                <label class="flex items-center gap-2 cursor-pointer" :class="{ 'opacity-50 cursor-not-allowed': isSuperior(member) }">
                  <span class="text-sm text-(--text2)">Voir</span>
                  <input 
                    type="checkbox" 
                    class="toggle toggle-primary toggle-sm"
                    :checked="canRead(member)"
                    :disabled="isSuperior(member)"
                    @change="updatePerm(member.userId, 'READ', ($event.target as HTMLInputElement).checked)"
                  />
                </label>
                <!-- Toggle Écrire -->
                <label class="flex items-center gap-2 cursor-pointer" :class="{ 'opacity-50 cursor-not-allowed': isSuperior(member) }">
                  <span class="text-sm text-(--text2)">Écrire</span>
                  <input 
                    type="checkbox" 
                    class="toggle toggle-primary toggle-sm"
                    :checked="canWrite(member)"
                    :disabled="isSuperior(member)"
                    @change="updatePerm(member.userId, 'WRITE', ($event.target as HTMLInputElement).checked)"
                  />
                </label>
              </div>
            </div>
            <div v-if="workspaceMembers.length === 0" class="text-center text-(--text2) py-8">
              Aucun membre dans cet espace.
            </div>
          </div>
        </main>

        <!-- Footer -->
        <footer class="flex items-center justify-between px-6 py-4 border-t border-(--border-color) shrink-0 bg-(--bg2)/50">
          <p v-if="hasChanges" class="text-xs text-amber-400 flex items-center gap-1.5">
            <i class="bi bi-exclamation-circle" />
            Modifications non sauvegardées
          </p>
          <div v-else />
          <div class="flex items-center gap-3">
            <button @click="$emit('close')" class="default">Annuler</button>
            <button 
              @click="save" 
              class="primary"
              :class="{ 'loader': isSaving }"
              :disabled="!hasChanges || isSaving"
            >
              Enregistrer
            </button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { openedOrg, user } from '@/assets/var';
import { usePermissions } from '@/composables/usePermissions';
import { useToast } from '@/composables/useToast';
import type { PermissionOverride, RoleData } from '@/config/permissions.config';
import type { OrgMember } from '@/types/types';

const props = defineProps<{
  show: boolean;
  itemType: 'file' | 'folder';
  itemId: string;
  itemName: string;
  spaceId: string;
}>();

const emit = defineEmits(['close']);
const toast = useToast();

const orgId = computed(() => openedOrg.value?.id);
const { fetchRoles, fetchOverrides, saveOverrides } = usePermissions(orgId);

const isLoading = ref(false);
const isSaving = ref(false);
const roles = ref<RoleData[]>([]);
const originalOverrides = ref<PermissionOverride[]>([]);
const localOverrides = ref<PermissionOverride[]>([]);

const hasChanges = computed(() => {
  if (localOverrides.value.length !== originalOverrides.value.length) return true;
  for (const lo of localOverrides.value) {
    const match = originalOverrides.value.find(
      o => o.userId === lo.userId && o.permission === lo.permission && o.value === lo.value
    );
    if (!match) return true;
  }
  return false;
});

const workspaceMembers = computed(() => {
  if (!openedOrg.value) return [];
  const space = openedOrg.value.spaces?.find(s => s.id === props.spaceId);
  if (!space) return [];
  
  return openedOrg.value.members?.filter(m => space.membersId.includes(m.userId) && m.userId !== user.value?.id) || [];
});

const getUserMaxPosition = (member: OrgMember) => {
  if (!member.memberRoles || member.memberRoles.length === 0) return 0;
  return Math.max(...member.memberRoles.map((mr: any) => mr.role?.position || 0), 0);
};

const currentUserMaxPosition = computed(() => {
  const currentMember = openedOrg.value?.members?.find(m => m.userId === user.value?.id);
  if (!currentMember) return 0;
  return getUserMaxPosition(currentMember);
});

const isSuperior = (member: OrgMember) => {
  return getUserMaxPosition(member) > currentUserMaxPosition.value;
};

const getMemberRoleName = (member: OrgMember) => {
  if (member.memberRoles && member.memberRoles.length > 0) {
    return member.memberRoles.map((mr: any) => mr.role?.name).join(', ');
  }
  return member.role || 'MEMBER';
};

const getOverride = (userId: string, permission: string) => {
  return localOverrides.value.find(o => o.userId === userId && o.permission === permission);
};

const canRead = (member: OrgMember) => {
  if (isSuperior(member)) return true;
  const o = getOverride(member.userId, 'READ');
  return o ? o.value === 'ALLOW' : false; 
};

const canWrite = (member: OrgMember) => {
  if (isSuperior(member)) return true;
  const o = getOverride(member.userId, 'WRITE');
  return o ? o.value === 'ALLOW' : false;
};

const updatePerm = (userId: string, permission: 'READ' | 'WRITE', checked: boolean) => {
  const val = checked ? 'ALLOW' : 'DENY';
  const existingIndex = localOverrides.value.findIndex(o => o.userId === userId && o.permission === permission);
  if (existingIndex >= 0) {
    const existing = localOverrides.value[existingIndex];
    if (existing) {
        existing.value = val as any;
    }
  } else {
    localOverrides.value.push({
      userId,
      permission: permission as any,
      value: val as any
    });
  }
};

watch(() => props.show, async (show) => {
  if (!show || !orgId.value) return;
  isLoading.value = true;
  try {
    const [rolesData, overridesData] = await Promise.all([
      fetchRoles(),
      fetchOverrides(props.itemType, props.itemId, props.spaceId)
    ]);
    roles.value = rolesData;
    originalOverrides.value = overridesData.filter((o: PermissionOverride) => o.userId); // On ne garde que les overrides individuels
    localOverrides.value = JSON.parse(JSON.stringify(originalOverrides.value));
  } catch (err) {
    toast.show('Erreur de chargement', 'error');
  } finally {
    isLoading.value = false;
  }
});

const save = async () => {
  isSaving.value = true;
  try {
    const success = await saveOverrides(props.itemType, props.itemId, localOverrides.value, props.spaceId);
    if (success) {
      toast.show('Accès mis à jour', 'success');
      originalOverrides.value = JSON.parse(JSON.stringify(localOverrides.value));
      emit('close');
    } else {
      toast.show('Erreur de sauvegarde', 'error');
    }
  } catch (err) {
    toast.show('Erreur de sauvegarde', 'error');
  } finally {
    isSaving.value = false;
  }
};
</script>
