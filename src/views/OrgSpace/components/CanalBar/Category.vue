<template>

    <div class="mb-4">

        <button 
            @click="isOpen = !isOpen"
            class="
                w-full flex items-center px-1 mb-1 
                cursor-pointer group
                text-(--text)/40 hover:text-(--text)/80 
                transition-colors duration-200
            "
        >

            <i 
                class="bi bi-chevron-right text-[10px] transition-transform duration-200"
                :class="{ 'rotate-90': isOpen }"
            ></i>

            <span class="ml-1 text-[11px] font-bold uppercase tracking-wider truncate">
                {{ category.name }}
            </span>

            <i class="bi bi-plus-lg ml-auto opacity-0 group-hover:opacity-100 hover:text-(--primary) transition-opacity text-sm"></i>

        </button>

        <div v-show="isOpen" class="space-y-0.5 transition-all">
            <ThreadBtn 
                v-for="thread in category.threads" 
                :key="thread.id" 
                :thread="thread" 
            />
        </div>
        
    </div>

</template>

<script lang="ts" setup>

import { ref } from 'vue';
import type { Category } from '@/types/workSpace';
import ThreadBtn from './ThreadBtn.vue';

defineProps<{
    category: Category
}>();

const isOpen = ref<boolean>(true);

</script>

<style scoped>
.v-show-aria-expanded {
  transition: all 0.3s ease-out;
}
</style>