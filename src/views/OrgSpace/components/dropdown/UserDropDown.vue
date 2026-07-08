<script setup lang="ts">

import type { User } from '@/types/types';
import DropDown from '@/components/DropDown.vue';
import useWSocket from '@/composables/useWSocket';
import { openedOrg } from '@/assets/var';
import keycloak from '@/assets/keycloak';
import useSecurePeer from '@/composables/useSecurePeer';

const props = defineProps<{
    user: User | undefined;
}>();

const emit = defineEmits(['update:status']);

const { startCall } = useSecurePeer();

const setStatus = async (status: 'online' | 'idle' | 'dnd' | 'offline') => {

    if (!props.user) return;
    
    try {

        const socket = await useWSocket();

        socket.value?.emit('update-status', { orgId: openedOrg.value?.id, status });

        const me = openedOrg.value?.members?.find(member => member.user?.id == props.user?.id);
        if (me && me.user) me.user.data!.status = status;

        emit('update:status', status);

    } 
    catch (err) 
    {
        console.error("Erreur mise à jour statut:", err);
    }

};

</script>

<template>
    
    <DropDown 
        align="left" 
        content-iner-t-w="
            z-100 sdropdown min-w-[290px] shadow-none!
            ring-transparent! border-b-transparent! rounded-b-none! 
        "
    >
        
        <template #trigger>
            <slot name="trigger" />
        </template>

        <template #content>

            <div class="px-3 py-2 border-b border-white/5 mb-1">
                <p class="text-[10px] uppercase tracking-widest text-(--text)/30 font-bold">Profil</p>
                <p class="text-sm font-bold text-(--text) truncate">{{ user?.name }}</p>
                <p class="text-xs text-(--text)/70 truncate">id : {{ user?.id }}</p>
            </div>

            <div class="p-1">

                <button @click="setStatus('online')" class="dropdown-item-style dropdown-item-annimate">
                    <div class="w-2 h-2 rounded-full bg-green-500 mr-2 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                    En ligne
                </button>

                <button @click="setStatus('idle')" class="dropdown-item-style dropdown-item-annimate">
                    <div class="w-2 h-2 rounded-full bg-yellow-500 mr-2" />
                    Absent
                </button>

                <button @click="setStatus('dnd')" class="dropdown-item-style dropdown-item-annimate">
                    <div class="w-2 h-2 rounded-full bg-red-500 mr-2" />
                    Ne pas déranger
                </button>

                <button @click="setStatus('offline')" class="dropdown-item-style dropdown-item-annimate">
                    <div class="w-2 h-2 rounded-full bg-gray-500 mr-2" />
                    Invisible
                </button>

            </div>

            <div class="h-px bg-white/5 my-1" />

            <div class="p-1">
                <button 
                    v-if="props.user?.id !== keycloak.subject"
                    @click="startCall(props.user!)"
                    class="dropdown-item-style dropdown-item-annimate gap-2 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                >
                    <i class="bi bi-telephone-fill" />
                    Appel vocal
                </button>
            </div>

            <div class="h-px bg-white/5 my-1" />

            <div class="p-1">
                <button @click="keycloak.logout()" class="text-red-500! hover:bg-red-500/5! dropdown-item-style dropdown-item-annimate">
                    <i class="bi bi-box-arrow-right mr-2" /> Déconnexion
                </button>
            </div>

        </template>

    </DropDown>
    
</template>
