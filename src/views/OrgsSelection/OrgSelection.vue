<script setup lang="ts">

import { organizations } from '@/assets/var';
import OrgBtn from './components/OrgBtn.vue';
import { onMounted, reactive, ref } from 'vue';
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

    <div v-if="organizations.length" class="min-h-screen bg-(--bg2) flex flex-col items-center justify-center p-8 font-sans">
        
        <header class="text-center mb-20 space-y-4">
            <h1 class="uppercase text-4xl md:text-5xl font-bold tracking-tight">
                SÉLECTIONNEZ VOTRE <span class="text-(--primary)">organisation</span>
            </h1>
        </header>

        <div class="flex flex-wrap justify-center gap-10 md:gap-16 max-w-6xl">

            <div 
                v-for="org in organizations" 
                :key="org.id"
                :style="{ viewTransitionName: `openOrg-${org.id}` }"
            >

                <OrgBtn
                    :org="org"
                />
            
            </div>

            <div v-if="canCreateOrg" @click="showCreateNewOrg = !showCreateNewOrg">
                <OrgBtn
                    :org="{ id: '', name: 'Créer une organisation', logo: 'bi-plus', role: '', memberCount: '' }"
                />
            </div>

        </div>

    </div>

    <div v-else class="min-h-screen bg-(--bg2) flex flex-col items-center justify-center p-8 font-sans ">
        
        <header class="text-center mb-20 space-y-4 max-w-4xl">
            <h1 class="uppercase text-xl md:text-5xl font-bold tracking-tight">
                Partager votre identifiant pour rejoindre une <span class="text-(--primary)">organisation</span>
            </h1>
        </header>

        <div class="flex flex-wrap justify-center gap-10 md:gap-16 max-w-4xl">

            <h2 class="text-lg">
                Identifiant : <span class="text-(--primary)">{{ me?.id }}</span>
            </h2>

        </div>

        <span class="text-md my-10">ou</span>

        <div v-if="canCreateOrg" @click="showCreateNewOrg = !showCreateNewOrg">
            <OrgBtn
                :org="{ id: '', name: 'Créer une organisation', logo: 'bi-plus', role: '', memberCount: '' }"
            />
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

                <IconSelector @on-base64="(logo: string) => newOrgForm.logo = logo" />

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
