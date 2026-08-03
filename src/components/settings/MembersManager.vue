<template>

    <section class="space-y-6">

        <div class="flex items-center justify-between gap-4">

            <div class="flex items-center gap-4">

                <h3 class="text-lg font-bold text-(--text)">
                    Membres 
                    <span class="text-(--text)/30 font-medium ml-2 text-sm">
                        {{ filteredMembers.length }}
                    </span>
                </h3>
                
                <div class="relative">
                    <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text)/30 text-[10px]" />
                    <input 
                        v-model="searchQuery"
                        type="text" 
                        placeholder="Rechercher..."
                        class="bg-(--white)/5 border border-(--white)/10 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-(--primary)/40 w-48 lg:w-64 transition-all"
                    />
                </div>

            </div>

            <button @click="showAddModal = true" class="primary gap-2">
                <i class="bi bi-person-plus-fill" />
                Ajouter
            </button>

        </div>

        <div class="rounded-2xl border border-(--white)/5 overflow-hidden bg-(--white)/1 shadow-xl">

            <div class="overflow-x-auto">

                <table class="w-full text-left border-collapse">

                    <thead>
                        <tr class="text-[10px] uppercase tracking-widest text-(--text2) border-b border-(--white)/5 bg-(--white)/2">
                            <th class="px-6 py-4 font-black">Utilisateur</th>
                            <th class="px-6 py-4 font-black text-right">Actions</th>
                        </tr>
                    </thead>

                    <tbody class="divide-y divide-(--white)/5">

                        <tr 
                            v-for="member in filteredMembers" 
                            :key="member.userId" 
                            class="group hover:bg-(--white)/2 transition-all"
                        >

                            <td class="px-6 py-4">

                                <div class="flex items-center gap-3">

                                    <div class="relative">

                                        <img 
                                            :src="member.user?.avatarUrl || 'https://cdn.silvercore.fr/static/files/silverteams/avatar/default.png'" 
                                            class="w-9 h-9 rounded-full border border-(--white)/10 object-cover" 
                                            :class="{ 'ring-2 ring-(--primary) ring-offset-2 ring-offset-(--bg)': isSelf(member.userId) }"
                                        />

                                        <div v-if="member.userId === ownerId" 
                                            class="absolute -top-1 -right-1 bg-amber-400 text-black text-[8px] px-1 rounded-sm font-black shadow-sm"
                                            title="Owner">
                                            <i class="bi bi-star-fill" />
                                        </div>

                                    </div>

                                    <div class="flex flex-col">
                                        <span class="text-sm font-bold text-(--text) flex items-center gap-2">
                                            {{ member.user?.name || 'Utilisateur inconnu' }}
                                            <span v-if="isSelf(member.userId)" class="text-[9px] bg-(--white)/10 px-1.5 py-0.5 rounded text-(--text2)">VOUS</span>
                                        </span>
                                        <span class="text-[10px] text-(--text2)">{{ member.user?.email || 'Email non disponible' }}</span>
                                    </div>

                                </div>

                            </td>

                            <td class="px-6 py-4 text-right">
                                <button 
                                    v-if="canManage(member) && member.user?.id !== ownerId"
                                    @click="emit('remove', member.user?.id)"
                                    class="danger"
                                    title="Exclure"
                                >
                                    <i class="bi bi-person-x-fill text-lg" />
                                </button>
                            </td>

                        </tr>

                    </tbody>

                </table>

            </div>
            
            <div v-if="filteredMembers.length === 0" class="p-12 text-center">
                <i class="bi bi-people text-4xl text-(--text)/10 mb-3 block" />
                <p class="text-(--text2) text-sm">Aucun membre trouvé pour cette recherche.</p>
            </div>

        </div>

    </section>

    <Popup :is-open="showAddModal" @close="showAddModal = false">

        <template #title>Ajouter des membres</template>
                
        <p class="text-xs text-(--text2) mb-4 font-medium uppercase tracking-widest">Membres de l'organisation</p>
                
        <div class="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">

            <div 
                v-for="orgMember in availableToInvite" 
                :key="orgMember.id" 
                class="flex items-center justify-between p-3 bg-(--white)/2 border border-(--white)/5 rounded-xl hover:bg-(--white)/5 transition-colors group"
            >

                <div class="flex items-center gap-3">
                    <img 
                        :src="orgMember.user?.avatarUrl || 'https://cdn.silvercore.fr/static/files/silverteams/avatar/default.png'" 
                        class="w-8 h-8 rounded-full" 
                    />
                    <span class="text-sm font-bold text-(--text)/80">{{ orgMember.user?.name }}</span>
                </div>

                <button @click="invite(orgMember)" class="text-(--primary) text-xs font-black opacity-0 group-hover:opacity-100 transition-opacity">
                    AJOUTER
                </button>

            </div>

        </div>


    </Popup>

</template>

<script setup lang="ts">

import { ref, computed } from 'vue';
import type { OrgMember } from '@/types/types';
import { keycloak } from '@/assets/keycloak';
import Popup from '../Popup.vue';
import { openedOrg } from '@/assets/var';
import isAdmin from '@/assets/isAdmin';

const props = defineProps<{
    members: OrgMember[];        // members already in this scope
    ownerId: string;
}>();

const emit = defineEmits(['remove', 'add']);

const searchQuery = ref<string>('');
const showAddModal = ref<boolean>(false);

const filteredMembers = computed(() => {
    return props.members.filter(m => 
        m.user?.name?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        m.user?.email?.toLowerCase().includes(searchQuery.value.toLowerCase())
    );
});

const availableToInvite = computed(() => {
    return openedOrg.value?.members?.filter(orgM => 
        !props.members.some(m => m.userId === orgM.userId)
    );
});

const isSelf = (userId: string) => userId === keycloak.userInfo?.sub;

const canManage = (member: OrgMember) => {
    if (isSelf(member.userId)) return false;
    return isAdmin.value || keycloak.userInfo?.sub === props.ownerId;
};

const invite = (member: OrgMember) => {
    emit('add', member);
};

</script>