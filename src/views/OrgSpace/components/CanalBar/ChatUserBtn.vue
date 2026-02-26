<template>

    <button
        @click="emit('click')"
        class="
            w-full flex items-center justify-start text-left gap-3 px-3 py-2 rounded-xl
            transition-all duration-200 group cursor-pointer relative
            hover:bg-white/3 active:scale-[0.98]
        "
        :class="
            active
                ? 'bg-white/5 text-(--text) shadow-sm' 
                : 'text-(--text)/50 hover:text-(--text)/80' 
        "
    >
        <div 
            v-if="active" 
            class="absolute left-0 w-1 h-5 bg-(--primary) rounded-r-full"
        />

        <div class="relative shrink-0">

            <img
                :src="user.user?.avatarUrl"
                :alt="user.user?.name"
                class="w-8 h-8 rounded-full object-cover border border-white/10 group-hover:border-(--primary)/30 transition-colors"
                @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${user.user?.name}&background=random`"
            />
            
            <div 
                class="
                    absolute -bottom-0.5 -right-0.5 
                    w-3 h-3 border-2 border-(--bg) 
                    rounded-full
                " 
                :class="getColorByStatus(user.user!.data.status)"
            />

        </div>

        <div class="flex flex-col overflow-hidden gap-1">
            <span class="text-sm font-bold truncate tracking-tight">
                {{ user.user?.name }}
            </span>
            <span class="text-[10px] opacity-40 uppercase tracking-widest font-medium leading-none">
                {{ user.role }}
            </span>
        </div>

        <i class="bi bi-chevron-right ml-auto text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"/>

    </button>

</template>

<script lang="ts" setup>

import getColorByStatus from '@/assets/utils/getColorByStatus';
import type { OrgMember } from '@/types/types';

defineProps<{
  user: OrgMember;
  active?: boolean;
}>();

const emit = defineEmits(['click']);

</script>