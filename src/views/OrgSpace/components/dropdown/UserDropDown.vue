<script setup lang="ts">

import type { User } from '@/types/types';
import DropDown from '@/components/DropDown.vue';
import sfetch from '@/assets/utils/sfetch';

const props = defineProps<{
    user: User | undefined;
}>();

const emit = defineEmits(['update:status']);

const setStatus = async (status: 'online' | 'idle' | 'dnd' | 'offline') => {

    if (!props.user) return;
    
    try {

        const res = await sfetch('/api/users/status', {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        
        if (res.ok) 
        {
            emit('update:status', status);
        }

    } 
    catch (err) 
    {
        console.error("Erreur mise à jour statut:", err);
    }

};

</script>

<template>
    
    <DropDown align="left" content-iner-t-w="absolute! -top-90! left-2! z-100 sdropdown">
        
        <template #trigger>
            <slot name="trigger" />
        </template>

        <template #content>

            <div class="px-3 py-2 border-b border-white/5 mb-1">
                <p class="text-[10px] uppercase tracking-widest text-(--text)/30 font-bold">Profil</p>
                <p class="text-sm font-bold text-(--text) truncate">{{ user?.name }}</p>
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
                <button class="w-full flex items-center px-2 py-1.5 text-xs font-medium rounded-md transition-colors text-(--text)/70 hover:text-(--text) active:scale-95 duration-150">
                    <i class="bi bi-person-badge mr-2 opacity-50" /> Modifier le profil
                </button>
                <button class="w-full flex items-center px-2 py-1.5 text-xs font-medium rounded-md transition-colors text-(--text)/70 hover:text-(--text) active:scale-95 duration-150">
                    <i class="bi bi-shield-lock mr-2 opacity-50" /> Confidentialité
                </button>
            </div>

            <div class="h-px bg-white/5 my-1" />

            <div class="p-1">
                <button @click="" class="w-full flex items-center px-2 py-1.5 text-xs font-medium rounded-md transition-colors text-(--text)/70 hover:text-(--text) active:scale-95 duration-150 text-red-400 hover:bg-red-500/10">
                    <i class="bi bi-box-arrow-right mr-2" /> Déconnexion
                </button>
            </div>

        </template>

    </DropDown>
    
</template>
