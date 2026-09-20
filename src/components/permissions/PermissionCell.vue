<template>
  <button 
    @click="cycleValue"
    class="relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 group"
    :class="cellClass"
    :title="cellTitle"
  >
    <i :class="cellIcon" class="text-sm transition-transform duration-200 group-hover:scale-110" />
    
    <!-- Tooltip au hover -->
    <div class="absolute -top-10 left-1/2 -translate-x-1/2 bg-(--bg2) border border-(--border-color) rounded-lg px-2 py-1 text-[10px] font-bold text-(--text) whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50">
      {{ cellLabel }}
    </div>
  </button>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { PermissionValue } from '@/config/permissions.config';

const props = defineProps<{
  value: PermissionValue;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update', value: PermissionValue): void;
}>();

const cellClass = computed(() => {
  if (props.disabled) return 'opacity-30 cursor-not-allowed bg-transparent';
  switch (props.value) {
    case 'ALLOW':  return 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer';
    case 'DENY':   return 'bg-red-500/15 text-red-400 hover:bg-red-500/25 cursor-pointer';
    case 'INHERIT': return 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10 cursor-pointer';
    default: return '';
  }
});

const cellIcon = computed(() => {
  switch (props.value) {
    case 'ALLOW':  return 'bi bi-check-lg';
    case 'DENY':   return 'bi bi-x-lg';
    case 'INHERIT': return 'bi bi-dash';
    default: return '';
  }
});

const cellLabel = computed(() => {
  switch (props.value) {
    case 'ALLOW':  return 'Autorisé';
    case 'DENY':   return 'Refusé';
    case 'INHERIT': return 'Hérité';
    default: return '';
  }
});

const cellTitle = computed(() => cellLabel.value);

const cycleOrder: PermissionValue[] = ['INHERIT', 'ALLOW', 'DENY'];

function cycleValue() {
  if (props.disabled) return;
  const idx = cycleOrder.indexOf(props.value);
  const next = cycleOrder[(idx + 1) % cycleOrder.length]!;
  emit('update', next);
}
</script>
