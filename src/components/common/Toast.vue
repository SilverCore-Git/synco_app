<template>

    <div class="fixed top-4 right-4 z-1000 flex flex-col gap-2 w-80 pointer-events-none">

        <TransitionGroup name="list">

            <div 
                v-for="toast in toasts" 
                :key="toast.id"
                class="pointer-events-auto flex items-center gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-md transition-all duration-300"
                :class="getStyles(toast.type)"
            >

                <i :class="['bi text-lg', getIcon(toast.type)]" />
                
                <span class="text-sm font-medium flex-1">{{ toast.message }}</span>

                <button @click="remove(toast.id)" class="opacity-40 hover:opacity-100 transition-opacity">
                    <i class="bi bi-x-lg text-xs" />
                </button>
                
            </div>

        </TransitionGroup>

    </div>

</template>

<script setup lang="ts">

import { useToast } from '@/composables/useToast';

const { toasts, remove } = useToast();

const getIcon = (type: string) => {
  switch (type) {
    case 'success': return 'bi-check-circle-fill text-green-400';
    case 'error': return 'bi-exclamation-octagon-fill text-red-400';
    case 'warning': return 'bi-exclamation-triangle-fill text-yellow-400';
    default: return 'bi-info-circle-fill text-blue-400';
  }
};

const getStyles = (type: string) => {
  switch (type) {
    case 'success': return 'bg-green-500/10 border-green-500/20 text-green-200';
    case 'error': return 'bg-red-500/10 border-red-500/20 text-red-200';
    case 'warning': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-200';
    default: return 'bg-blue-500/10 border-blue-500/20 text-blue-200';
  }
};

</script>

<style scoped>

.list-enter-from { opacity: 0; transform: translateX(50px) scale(0.9); }
.list-leave-to { opacity: 0; transform: scale(0.8); }

.list-move { transition: all 0.4s ease; }

</style>