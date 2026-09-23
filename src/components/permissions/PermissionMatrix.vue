<template>
  <div class="w-full overflow-x-auto">
    <table class="w-full border-collapse">

      <!-- En-tête : colonnes de permissions -->
      <thead>
        <tr class="border-b border-(--border-color)">
          <th class="text-left py-3 px-3 text-[10px] font-black uppercase tracking-widest text-(--text2) min-w-[180px] sticky left-0 bg-(--bg) z-10">
            {{ subjectLabel }}
          </th>
          <th 
            v-for="perm in PERMISSION_KEYS" 
            :key="perm"
            class="py-3 px-1 text-center"
          >
            <div class="flex flex-col items-center gap-1">
              <i :class="'bi ' + PERMISSION_REGISTRY[perm].icon" class="text-sm text-(--text2)" />
              <span class="text-[9px] font-bold uppercase tracking-wider text-(--text2)">
                {{ PERMISSION_REGISTRY[perm].label }}
              </span>
            </div>
          </th>
        </tr>
      </thead>

      <!-- Corps : une ligne par sujet (rôle ou user) -->
      <tbody>
        <tr 
          v-for="subject in subjects" 
          :key="subject.id"
          class="border-b border-(--border-color)/30 hover:bg-(--text)/[0.02] transition-colors"
        >
          <!-- Nom du sujet -->
          <td class="py-2 px-3 sticky left-0 bg-(--bg) z-10">
            <div class="flex items-center gap-2.5">
              <div 
                v-if="subject.color" 
                class="w-3 h-3 rounded-full shrink-0 ring-2 ring-(--text)/10"
                :style="{ backgroundColor: subject.color }"
              />
              <i v-else-if="subject.icon" :class="'bi ' + subject.icon" class="text-sm text-(--text2)" />
              <div>
                <p class="text-sm font-semibold text-(--text) leading-tight">{{ subject.name }}</p>
                <p v-if="subject.memberCount !== undefined" class="text-[10px] text-(--text2)">
                  {{ subject.memberCount }} membre{{ subject.memberCount !== 1 ? 's' : '' }}
                </p>
              </div>
              <span 
                v-if="subject.isSystem" 
                class="ml-auto text-[8px] font-bold uppercase tracking-widest text-(--text2) bg-(--text)/5 rounded px-1.5 py-0.5"
              >
                Système
              </span>
            </div>
          </td>

          <!-- Cellules de permission -->
          <td 
            v-for="perm in PERMISSION_KEYS" 
            :key="perm"
            class="py-2 px-1 text-center"
          >
            <div class="flex justify-center">
              <PermissionCell
                :value="getPermValue(subject.id, perm)"
                :disabled="subject.name === 'OWNER'"
                @update="(val) => setPermValue(subject.id, perm, val)"
              />
            </div>
          </td>
        </tr>

        <!-- Ligne vide si aucun sujet -->
        <tr v-if="subjects.length === 0">
          <td :colspan="PERMISSION_KEYS.length + 1" class="py-8 text-center text-(--text2) text-sm">
            Aucun rôle configuré
          </td>
        </tr>
      </tbody>

    </table>
  </div>
</template>

<script lang="ts" setup>
import { PERMISSION_KEYS, PERMISSION_REGISTRY, type Permission, type PermissionValue } from '@/config/permissions.config';
import PermissionCell from './PermissionCell.vue';

export interface MatrixSubject {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  isSystem?: boolean;
  memberCount?: number;
}

const props = withDefaults(defineProps<{
  /** Les sujets (rôles ou utilisateurs) affichés en lignes */
  subjects: MatrixSubject[];
  /** Label de la colonne de sujets */
  subjectLabel?: string;
  /** Map des permissions : subjectId -> permission -> value */
  permissions: Record<string, Record<string, PermissionValue>>;
}>(), {
  subjectLabel: 'Rôles',
});

const emit = defineEmits<{
  (e: 'update', subjectId: string, permission: Permission, value: PermissionValue): void;
}>();

function getPermValue(subjectId: string, perm: Permission): PermissionValue {
  return (props.permissions[subjectId]?.[perm] as PermissionValue) || 'INHERIT';
}

function setPermValue(subjectId: string, perm: Permission, value: PermissionValue) {
  emit('update', subjectId, perm, value);
}
</script>
