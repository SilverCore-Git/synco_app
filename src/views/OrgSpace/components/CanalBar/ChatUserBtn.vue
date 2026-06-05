<template>

    <button
        @click="emit('click')"
        class="
            tab w-full
        "
        :class="
            active
                ? 'active' 
                : ''
        "
    >

        <div class="relative shrink-0">

            <img
                :src="user?.user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.user?.name}&background=128a60&color=fff`"
                :alt="user?.user?.name"
                class="w-8 h-8 rounded-full object-cover border border-white/10 group-hover:border-(--primary)/30 transition-colors"
                @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${user?.user?.name}&background=128a60&color=fff`"
            />
            
            <div 
                class="
                    absolute -bottom-0.5 -right-0.5 
                    w-3 h-3 border-2 border-(--bg) 
                    rounded-full
                " 
                :class="user?.user ? getColorByStatus(user.user.data.status) : ''"
            />

        </div>

        <div class="flex flex-col flex-1 min-w-0">
            <span class="text-sm font-bold truncate tracking-tight">
                {{ user?.user?.name }}
            </span>
            <span class="text-[10px] opacity-40 uppercase tracking-widest font-medium leading-none">
                {{ user?.role }}
            </span>
        </div>

        <button
            v-if="user?.user?.id !== keycloak.subject"
            @click.stop="startCall(user.user!)"
            class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-(--primary)/10 text-(--text)/40 hover:text-(--primary) transition-all"
            title="Appel vocal"
        >
            <i class="bi bi-telephone-fill text-sm" />
        </button>

    </button>

</template>

<script lang="ts" setup>

import getColorByStatus from '@/assets/utils/getColorByStatus';
import type { OrgMember } from '@/types/types';
import useSecurePeer from '@/composables/useSecurePeer';
import keycloak from '@/assets/keycloak';

defineProps<{
  user: OrgMember;
  active?: boolean;
}>();

const emit = defineEmits(['click']);
const { startCall } = useSecurePeer();

</script>