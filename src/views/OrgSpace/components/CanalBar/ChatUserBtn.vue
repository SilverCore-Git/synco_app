<template>

    <div class="w-full group relative">
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

            <div class="flex flex-col overflow-hidden gap-1">
                <span class="text-sm font-bold truncate tracking-tight">
                    {{ user?.user?.name }}
                </span>
                <span class="text-[10px] opacity-40 uppercase tracking-widest font-medium leading-none">
                    {{ user?.role }}
                </span>
            </div>

        </button>

        <!-- Call Button - appears on hover -->
        <button
            v-if="user?.user?.id && user.user.id !== currentUserId"
            @click.stop="startP2PCall"
            class="
                absolute top-1/2 -translate-y-1/2 right-2 
                w-8 h-8 rounded-full bg-(--primary) hover:bg-(--primary-hover) 
                text-white flex items-center justify-center 
                transition-all duration-200 opacity-0 group-hover:opacity-100
                shadow-lg shadow-(--primary)/30
            "
            title="Appel P2P sécurisé"
        >
            <i class="bi bi-telephone-fill text-sm" />
        </button>
    </div>

</template>

<script lang="ts" setup>

import getColorByStatus from '@/assets/utils/getColorByStatus';
import type { OrgMember } from '@/types/types';
import useSecurePeer from '@/composables/useSecurePeer';
import { user as currentUser } from '@/assets/var';

const props = defineProps<{
  user: OrgMember;
  active?: boolean;
}>();

const emit = defineEmits(['click']);

const { startCall } = useSecurePeer();

const currentUserId = currentUser.value?.id;

const startP2PCall = () => {
    if (props.user?.user?.id) {
        startCall(props.user.user);
    }
};

</script>