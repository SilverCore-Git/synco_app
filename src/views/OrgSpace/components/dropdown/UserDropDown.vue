<script setup lang="ts">

import type { User } from '@/types/types';
import DropDown from '@/components/DropDown.vue';
import useWSocket from '@/composables/useWSocket';
import { openedOrg } from '@/assets/var';
import keycloak from '@/assets/keycloak';
import { computed } from 'vue';

const props = defineProps<{
    user: User | undefined;
}>();

const emit = defineEmits(['update:status']);

const statusColorClass = computed(() => {
    switch (props.user?.data?.status) {
        case 'online': return 'bg-green-500';
        case 'idle': return 'bg-yellow-500';
        case 'dnd': return 'bg-red-500';
        case 'offline': return 'bg-gray-500';
        default: return 'bg-gray-500';
    }
});

const role = computed(() => {
    if (!openedOrg.value?.members || !props.user?.id) return 'member';
    const member = openedOrg.value.members.find(m => m.userId === props.user?.id);
    return member?.role || 'member';
});

const translatedRole = computed(() => {
    if (role.value === 'owner' || role.value === 'ADMIN' || role.value === 'admin') return 'Administrateur';
    return 'Membre';
});

const roleColorClass = computed(() => {
    if (role.value === 'owner' || role.value === 'ADMIN' || role.value === 'admin') return 'bg-orange-500';
    return 'bg-(--primary)';
});

const formatDate = (date: string | Date | undefined) => {
  if (!date) return 'Inconnu';
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};


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
        align="top" 
        content-iner-t-w="
            z-100 sdropdown min-w-[290px] shadow-none! bottom-14!
            ring-transparent! border-b-transparent! rounded-b-none! 
        "
    >
        
        <template #trigger>
            <slot name="trigger" />
        </template>

        <template #content>

            <!-- Profil complet inspiré de UserProfile -->
            <div class="w-full relative rounded-t-lg overflow-hidden bg-(--bg) border-b border-white/5 mb-1 pb-2">
                <!-- Banner -->
                <div class="h-[80px] bg-gradient-to-tr from-(--primary-dark) to-(--primary) w-full relative z-0"></div>
                
                <!-- Avatar -->
                <div class="absolute top-[38px] left-4 p-1.5 bg-(--bg) rounded-full z-10 shadow-lg">
                    <div class="relative">
                        <img
                            :src="user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.name}&background=128a60&color=fff`"
                            class="w-[64px] h-[64px] rounded-full object-cover"
                        />
                        <div class="absolute bottom-0 right-0 w-4 h-4 rounded-full border-[3px] border-(--bg) shadow-sm" :class="statusColorClass"></div>
                    </div>
                </div>

                <!-- Content Area -->
                <div class="px-1 relative mt-2 z-0">
                    <!-- Spacer pour l'avatar -->
                    <div class="h-[28px]"></div>

                    <!-- Infos -->
                    <div class="bg-(--bg2) rounded-lg p-3 mt-2 border border-white/5 shadow-inner">
                        <h2 class="text-lg font-bold text-(--text) leading-tight">{{ user?.name }}</h2>
                        <p class="text-xs text-(--primary) font-bold uppercase tracking-wider mb-1" v-if="user?.job">{{ user?.job }}</p>
                        <p class="text-xs text-(--text)/60 mb-2">{{ user?.email }}</p>
                        
                        <div v-if="user?.description">
                            <div class="w-full h-px bg-white/5 my-2"></div>
                            <h3 class="text-[10px] font-bold text-(--text)/50 uppercase tracking-wide mb-1.5">À propos</h3>
                            <p class="text-xs text-(--text)/80 leading-relaxed line-clamp-3">{{ user?.description }}</p>
                        </div>
                        
                        <div class="w-full h-px bg-white/5 my-2"></div>

                        <!-- Rôles -->
                        <div class="mb-2">
                            <h3 class="text-[10px] font-bold text-(--text)/50 uppercase tracking-wide mb-1.5">Rôles</h3>
                            <div class="flex flex-wrap gap-1.5">
                                <span class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-(--bg) border border-white/5 text-[10px] font-medium text-(--text)/90 shadow-sm">
                                    <div class="w-2 h-2 rounded-full shadow-sm" :class="roleColorClass"></div>
                                    {{ translatedRole }}
                                </span>
                                <span v-if="user?.id === keycloak.subject" class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-(--bg) border border-white/5 text-[10px] font-medium text-(--text)/90 shadow-sm">
                                    Vous
                                </span>
                            </div>
                        </div>

                        <div class="w-full h-px bg-white/5 my-2"></div>

                        <!-- Membre depuis -->
                        <div>
                            <h3 class="text-[10px] font-bold text-(--text)/50 uppercase tracking-wide mb-1.5">Membre depuis</h3>
                            <p class="text-xs text-(--text)/90 flex items-center gap-1.5">
                                <i class="bi bi-calendar3 text-(--text)/50 text-[10px]"></i>
                                {{ formatDate(user?.createdAt) }}
                            </p>
                        </div>
                    </div>
                </div>
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
                <button @click="keycloak.logout()" class="text-red-500! hover:bg-red-500/5! dropdown-item-style dropdown-item-annimate">
                    <i class="bi bi-box-arrow-right mr-2" /> Déconnexion
                </button>
            </div>

        </template>

    </DropDown>
    
</template>
