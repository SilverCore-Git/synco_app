<template>

    <DropDown v-if="editable" align="left" contentInerTW="!w-44">
        <template #trigger>
            <button
                type="button"
                class="text-xs px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 transition-all hover:brightness-110 active:scale-95"
                :class="[meta.bg, meta.text]"
            >
                <i :class="meta.icon" />
                {{ meta.label }}
                <i class="bi bi-chevron-down text-[9px] opacity-60" />
            </button>
        </template>
        <template #content>
            <button
                v-for="status in ALL_REPO_STATUSES"
                :key="status"
                type="button"
                @click="$emit('update:modelValue', status)"
                class="dropdown-item-annimate dropdown-item-style gap-2"
                :class="status === modelValue ? 'bg-(--primary)/10!' : ''"
            >
                <span class="w-2 h-2 rounded-full shrink-0" :class="REPO_STATUS_META[status].dot" />
                {{ REPO_STATUS_META[status].label }}
            </button>
        </template>
    </DropDown>

    <span
        v-else
        class="text-xs px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
        :class="[meta.bg, meta.text]"
    >
        <i :class="meta.icon" />
        {{ meta.label }}
    </span>

</template>

<script lang="ts">
import type { RepoStatus } from '@/types/repos';
import { ALL_REPO_STATUSES } from '@/types/repos';

// ============================================
// Palette partagée statut -> couleur/label/icône
// ============================================
// Convention pastilles de l'app (bg-{color}-500/20 text-{color}-500), cf.
// WebhookList.vue. Exportée pour être réutilisée telle quelle par
// BranchTree.vue (couleurs des branches = même palette de statut).
export const REPO_STATUS_META: Record<RepoStatus, {
  label: string;
  icon: string;
  bg: string;
  text: string;
  dot: string;
  hex: string;
}> = {
  idea: {
    label: 'Idée',
    icon: 'bi bi-lightbulb',
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    dot: 'bg-gray-400',
    hex: '#9ca3af'
  },
  in_progress: {
    label: 'En cours',
    icon: 'bi bi-arrow-repeat',
    bg: 'bg-green-500/20',
    text: 'text-green-500',
    dot: 'bg-green-500',
    hex: '#22c55e'
  },
  in_review: {
    label: 'En revue',
    icon: 'bi bi-eye',
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-500',
    dot: 'bg-yellow-500',
    hex: '#eab308'
  },
  stale: {
    label: 'Obsolète',
    icon: 'bi bi-hourglass-bottom',
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    dot: 'bg-red-400',
    hex: '#f87171'
  }
};

export { ALL_REPO_STATUSES };
</script>

<script setup lang="ts">
import { computed } from 'vue';
import DropDown from '@/components/DropDown.vue';

const props = defineProps<{
  modelValue: RepoStatus;
  editable?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', status: RepoStatus): void;
}>();

const meta = computed(() => REPO_STATUS_META[props.modelValue]);
</script>
