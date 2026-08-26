<script setup lang="ts">

import { organizations } from '@/assets/var';
import OrgBtn from './components/OrgBtn.vue';
import { onMounted, reactive, ref, computed } from 'vue';
import type { User } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';
import Popup from '@/components/Popup.vue';
import IconSelector from '@/components/common/IconSelector.vue';
import { useToast } from '@/composables/useToast';
import { keycloak } from '@/assets/keycloak';
import DropDown from '@/components/DropDown.vue';
import UserSettings from '@/components/windows/UserSettings.vue';

const toast = useToast();

const me = ref<User | undefined>(undefined);

const showCreateNewOrg = ref<boolean>(false);
const canCreateOrg = ref<boolean>(false);
const newOrgForm = reactive({
  name: '',
  logo: ''
});

const searchQuery = ref('');
const isSuperAdmin = ref(false);

const showUserSettings = ref(false);

const showDeleteAccount = ref(false);
const deleteAccountLoading = ref(false);

const handleDeleteAccount = async () => {
    deleteAccountLoading.value = true;
    try {
        await sfetch('/api/users/me', { method: 'DELETE' });
        // S'il n'y a pas de route DELETE, on peut aussi rediriger vers le management Keycloak
        keycloak.accountManagement();
    } catch(e) {
        toast.show("Erreur lors de la suppression ou action déléguée au fournisseur d'identité.", "error");
        keycloak.accountManagement();
    } finally {
        deleteAccountLoading.value = false;
        showDeleteAccount.value = false;
    }
}

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
    
    try {
        const adminRes = await sfetch('/api/admin/isAdmin');
        if (adminRes.ok) {
            isSuperAdmin.value = (await adminRes.json()).isAdmin === true;
        }
    } catch(e) {}
})

</script>

<template>

    <div class="h-full bg-(--bg2) flex flex-col items-center p-6 md:p-12 font-sans overflow-x-hidden overflow-y-auto relative">
        
        <div class="absolute top-6 right-6 md:top-8 md:right-8 z-10 flex items-center gap-3">

            <DropDown align="right" content-iner-t-w="w-64">
                <template #trigger>
                    <button class="w-10 h-10 rounded-full overflow-hidden border-2 border-white/10 hover:border-(--primary)/50 transition-all shadow-sm focus:outline-none">
                        <img 
                            :src="me?.avatarUrl || `https://ui-avatars.com/api/?name=${me?.name || 'User'}&background=128a60&color=fff`" 
                            alt="Profile" 
                            class="w-full h-full object-cover"
                        />
                    </button>
                </template>
                <template #content>
                    <div class="p-3 border-b border-white/5 bg-(--bg2) rounded-t-xl">
                        <p class="text-sm font-bold text-(--text) truncate">{{ me?.name || 'Utilisateur' }}</p>
                        <p class="text-xs text-(--text2) truncate">{{ me?.email || '' }}</p>
                    </div>
                    <div class="p-1">
                        <button @click="showUserSettings = true" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-(--text) hover:text-(--text) hover:bg-white/5 rounded-lg transition-colors">
                            <i class="bi bi-person-fill"></i> Mon Profil
                        </button>
                    </div>
                    
                    <template v-if="isSuperAdmin">
                        <div class="h-px bg-white/5 my-1" />
                        <div class="p-1">
                            <router-link to="/root" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-(--primary) hover:bg-(--primary)/20 rounded-lg transition-colors font-bold">
                                <i class="bi bi-shield-lock-fill"></i> Panel admin
                            </router-link>
                        </div>
                    </template>

                    <div class="h-px bg-white/5 my-1" />
                    <div class="p-1">
                        <router-link to="/support" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-(--text) hover:text-(--text) hover:bg-white/5 rounded-lg transition-colors">
                            <i class="bi bi-headset"></i> Support SAV
                        </router-link>
                    </div>

                    <div class="h-px bg-white/5 my-1" />
                    <div class="p-1">
                        <button @click="showDeleteAccount = true" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                            <i class="bi bi-trash-fill"></i> Supprimer mon compte
                        </button>
                    </div>
                    <div class="h-px bg-white/5 my-1" />
                    <div class="p-1">
                        <button @click="keycloak.logout()" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 font-bold hover:bg-red-500 hover:text-white rounded-lg transition-colors">
                            <i class="bi bi-box-arrow-right"></i> Déconnexion
                        </button>
                    </div>
                </template>
            </DropDown>
        </div>

        <header class="text-center mt-10 mb-12 space-y-4 w-full max-w-4xl relative z-0">
            <h1 class="uppercase text-3xl md:text-5xl font-bold tracking-tight">
                SÉLECTIONNEZ VOTRE <span class="text-(--primary)">organisation</span>
            </h1>
            
            <!-- Barre de recherche -->
            <div class="relative w-full max-w-md mx-auto mt-8">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text2)">
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
                <p class="text-(--text2) text-sm">Vérifiez l'orthographe ou essayez un autre nom.</p>
            </div>
        </div>

    </div>

    <Popup :isOpen="showCreateNewOrg" @close="showCreateNewOrg = false, newOrgForm.logo = '', newOrgForm.name = ''">

        <template #title>Créer un Espace de travail</template>

        <form @submit.prevent="createNewOrg()" class="space-y-5">

            <div class="flex gap-2 flex-col">

                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                    Nom de l'espace
                </label>

                <input 
                    v-model="newOrgForm.name"
                    type="text" 
                    placeholder="Ex: Silvercore, silverteams..."
                    ref="nameInput"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text2) 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all
                    "
                />

            </div>

            <div class="flex gap-2 flex-col">

                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                    Icon de l'espace
                </label>

                <IconSelector type="square" :model-value="newOrgForm.logo" @on-base64="(logo: string) => newOrgForm.logo = logo" />

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

    <UserSettings :is-open="showUserSettings" @close="showUserSettings = false" />

    <Popup :isOpen="showDeleteAccount" @close="showDeleteAccount = false">
        <template #title>
            <div class="flex items-center gap-2 text-red-500">
                <i class="bi bi-exclamation-triangle-fill"></i>
                Supprimer le compte
            </div>
        </template>
        <div class="space-y-4">
            <p class="text-sm text-(--text) leading-relaxed">
                Êtes-vous sûr de vouloir supprimer définitivement votre compte ? 
                Cette action est irréversible et supprimera toutes vos données personnelles.
            </p>
        </div>
        <template #footer>
            <button @click="showDeleteAccount = false" class="default" :disabled="deleteAccountLoading">Annuler</button>
            <button @click="handleDeleteAccount" class="danger flex items-center gap-2" :disabled="deleteAccountLoading">
                <i v-if="deleteAccountLoading" class="bi bi-arrow-repeat animate-spin"></i>
                Confirmer la suppression
            </button>
        </template>
    </Popup>


</template>

