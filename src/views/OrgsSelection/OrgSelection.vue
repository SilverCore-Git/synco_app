<script setup lang="ts">

import { organizations } from '@/assets/var';
import OrgBtn from './components/OrgBtn.vue';
import { onMounted, reactive, ref, computed } from 'vue';
import type { User } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';
import Popup from '@/components/Popup.vue';
import IconSelector from '@/components/common/IconSelector.vue';
import { useToast } from '@/composables/useToast';

const toast = useToast();

const me = ref<User | undefined>(undefined);

const showCreateNewOrg = ref<boolean>(false);
const canCreateOrg = ref<boolean>(false);
const newOrgForm = reactive({
  name: '',
  logo: ''
});

const searchQuery = ref('');

const filteredOrganizations = computed(() => {
    if (!searchQuery.value.trim()) return organizations.value;
    return organizations.value.filter(org => 
        org.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    );
});

const createNewOrg = async () => {

    showCreateNewOrg.value = false;

    // vérifier si le user a le droit 

    const res = await sfetch('/api/orgs', {
        method: 'POST',
        body: JSON.stringify({ name: newOrgForm.name, logo: newOrgForm.logo })  
    })

    if (res.ok)
    {
        const org = await res.json();
        organizations.value.push(org);
        toast.show('Organisation créer avec succès.', 'success');
    }
    else
    {
        const err = (await res.json()).error;
        toast.show(err, 'error');
    }

    newOrgForm.logo = '';
    newOrgForm.name = '';

}

onMounted(async () => {
    me.value = await sfetch('/api/users/me').then(res => res.json());
    const res = await sfetch('/api/users/me/cancreateorg');
    const data = await res.json();
    canCreateOrg.value = data.canCreateOrg;
})

</script>

<template>

    <div class="min-h-screen bg-(--bg2) flex flex-col items-center p-6 md:p-12 font-sans overflow-x-hidden">
        
        <header class="text-center mt-10 mb-12 space-y-4 w-full max-w-4xl">
            <h1 class="uppercase text-3xl md:text-5xl font-bold tracking-tight">
                SÉLECTIONNEZ VOTRE <span class="text-(--primary)">organisation</span>
            </h1>
            
            <!-- Barre de recherche -->
            <div class="relative w-full max-w-md mx-auto mt-8">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                    <i class="bi bi-search"></i>
                </div>
                <input 
                    v-model="searchQuery"
                    type="text" 
                    placeholder="Rechercher une organisation..."
                    class="w-full bg-(--bg) border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/50 transition-all shadow-lg"
                />
            </div>
        </header>

        <div class="w-full max-w-7xl">
            <div v-if="filteredOrganizations.length > 0 || canCreateOrg" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 place-items-stretch w-full max-w-6xl mx-auto">
                
                <div 
                    v-for="org in filteredOrganizations" 
                    :key="org.id"
                    :style="{ viewTransitionName: `openOrg-${org.id}` }"
                    class="w-full"
                >
                    <OrgBtn :org="org" />
                </div>

                <div v-if="canCreateOrg" class="w-full">
                    <OrgBtn 
                        :org="{ id: 'create', name: 'Créer une organisation', logo: '', role: '', memberCount: '' }" 
                        :isCreate="true" 
                        @click="showCreateNewOrg = true"
                    />
                </div>

            </div>
            
            <div v-else class="text-center py-20 flex flex-col items-center gap-4">
                <div class="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                    <i class="bi bi-search text-3xl text-white/30"></i>
                </div>
                <h3 class="text-xl font-bold text-(--text)">Aucune organisation trouvée</h3>
                <p class="text-(--text)/50 text-sm">Vérifiez l'orthographe ou essayez un autre nom.</p>
            </div>
        </div>

    </div>

    <Popup :isOpen="showCreateNewOrg" @close="showCreateNewOrg = false, newOrgForm.logo = '', newOrgForm.name = ''">

        <template #title>Créer un Espace de travail</template>

        <form @submit.prevent="createNewOrg()" class="space-y-5">

            <div class="flex gap-2 flex-col">

                <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                    Nom de l'espace
                </label>

                <input 
                    v-model="newOrgForm.name"
                    type="text" 
                    placeholder="Ex: Silvercore, silverteams..."
                    ref="nameInput"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text)/20 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all
                    "
                />

            </div>

            <div class="flex gap-2 flex-col">

                <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                    Icon de l'espace
                </label>

                <IconSelector :model-value="newOrgForm.logo" @on-base64="(logo: string) => newOrgForm.logo = logo" />

            </div>

        </form>

        <template #footer>

            <button 
                @click="showCreateNewOrg = false, newOrgForm.logo = '', newOrgForm.name = ''" 
                class="default"
            >
                Annuler
            </button>

            <button 
                @click="createNewOrg()"
                class="primary"
            >
                Créer l'espace
            </button>

        </template>

    </Popup>

</template>
