<template>

    <Window :isOpen="isOpen" @close="emit('close')">
        
        <div class="flex w-full h-full bg-(--bg) text-(--text) rounded-xl overflow-hidden shadow-2xl">
            
            <aside class="w-64 bg-(--bg2) border-r border-white/5 p-4 flex flex-col gap-2 shrink-0">

                <h2 class="text-xl font-black text-(--white) mb-4 px-3 pt-2">Paramètres</h2>
                
                <button 
                    v-for="tab in tabs" 
                    :key="tab.id"
                    @click="activeTab = tab.id"
                    class="tab"
                    :class="activeTab === tab.id ? 'active' : ''"
                >
                    <i :class="tab.icon" class="text-lg" />
                    {{ tab.label }}
                </button>

            </aside>

            <main class="flex-1 p-8 overflow-y-auto bg-(--bg)">
                
                <!-- account -->
                <section 
                    v-if="activeTab === 'account'" 
                    class="animate-fade-in space-y-8"
                >

                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Mon Compte</h3>
                        <p class="text-sm text-(--text)/60">Gérez vos informations personnelles et votre profil.</p>
                    </div>

                    <div class="flex items-cente justify-between gap-6 p-4 bg-(--bg2) rounded-xl border border-white/5">
                       
                        <div class="w-22 h-22 rounded-full bg-(--bg) border-2 border-(--primary) flex items-center justify-center overflow-hidden shrink-0">
                            <img :src="user?.user?.avatarUrl || 'https://cdn.silvercore.fr/static/files/silverteams/avatar/default.png'" />
                        </div>
                        
                        <div class="flex flex-col justify-between">
                            <button @click="avatarChange = true" class="primary">
                                Changer l'avatar
                            </button>
                            <button class="danger">
                                Supprimer
                            </button>
                        </div>

                        <ProfileUploader 
                            :show="avatarChange" 
                            @close="avatarChange = false" 
                        />

                    </div>

                    <div class="space-y-5 max-w-md">
                       
                        <div class="space-y-1.5">

                            <label class="text-sm font-bold text-(--text)">Nom d'utilisateur</label>
                           
                            <input 
                                type="text" 
                                v-model="formData.username" 
                                class="w-full bg-(--bg2) border border-white/10 rounded-lg px-4 py-2.5 text-(--white) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                            />

                        </div>

                        <div class="space-y-1.5">

                            <label class="text-sm font-bold text-(--text)">Adresse Email</label>
                            
                            <input 
                                type="email" 
                                v-model="formData.email" 
                                class="w-full bg-(--bg2) border border-white/10 rounded-lg px-4 py-2.5 text-(--white) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                            />

                        </div>

                    </div>

                    <div class="pt-6 border-t border-white/5" >
                        <button  
                            class="primary" 
                            :class="isModified ? 'grayscale cursor-not-allowed!' : ''"
                        >
                            Enregistrer les modifications
                        </button>
                    </div>

                </section>

                <!-- apparence -->
                <section 
                    v-if="activeTab === 'appearance'" 
                    class="animate-fade-in space-y-8"
                >

                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Apparence</h3>
                        <p class="text-sm text-(--text)/60">Personnalisez l'interface de SilverTeams à votre goût.</p>
                    </div>

                    <div class="space-y-8">

                        <div class="space-y-3">

                            <h4 class="text-xs font-black uppercase tracking-widest text-(--text)/50">Thème global</h4>

                            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">

                                <button 
                                    class=""
                                    :class="
                                        theme == 'dark' 
                                            ? 'flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-(--primary) bg-(--bg2) transition-all' 
                                            : 'flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-transparent bg-(--bg2) hover:border-white/10 transition-all'
                                    "
                                    @click="theme = 'dark'"
                                >
                                    <div class="w-full h-24 bg-(--bg) rounded-lg border border-white/10 flex items-center justify-center">
                                        <i class="bi bi-moon-stars-fill text-(--primary) text-3xl" />
                                    </div>
                                    <span class="font-bold text-(--white)">Sombre</span>
                                </button>

                                <button 
                                    :class="
                                        theme == 'light' 
                                            ? 'flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-(--primary) bg-(--bg2) transition-all' 
                                            : 'flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-transparent bg-(--bg2) hover:border-white/10 transition-all'
                                    "
                                    @click="theme = 'light'"
                                >
                                    <div class="w-full h-24 bg-gray-200 rounded-lg border border-black/10 flex items-center justify-center">
                                        <i class="bi bi-sun-fill text-gray-500 text-3xl" />
                                    </div>
                                    <span class="font-bold">Clair</span>
                                </button>

                            </div>

                        </div>

                    </div>

                </section>

                <!-- notifications -->
                <section 
                    v-if="activeTab === 'notifications'" 
                    class="animate-fade-in space-y-8"
                >

                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Notifications</h3>
                        <p class="text-sm text-(--text)/60">Gérez comment et quand vous êtes alerté.</p>
                    </div>

                    <div class="space-y-3">
                        <div class="flex items-center justify-between p-4 bg-(--bg2) rounded-xl border border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                            <div>
                                <h4 class="font-bold text-(--white)">Sons des messages</h4>
                                <p class="text-sm text-(--text)/60 mt-0.5">Jouer un son lors de la réception d'un message</p>
                            </div>
                            <div class="w-12 h-6 bg-(--primary) rounded-full relative transition-colors">
                                <div class="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
                            </div>
                        </div>

                        <div class="flex items-center justify-between p-4 bg-(--bg2) rounded-xl border border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                            <div>
                                <h4 class="font-bold text-(--white)">Mentions @</h4>
                                <p class="text-sm text-(--text)/60 mt-0.5">M'alerter uniquement quand on me mentionne</p>
                            </div>
                            <div class="w-12 h-6 bg-white/10 rounded-full relative transition-colors">
                                <div class="w-5 h-5 bg-white/50 rounded-full absolute left-0.5 top-0.5 shadow-sm"></div>
                            </div>
                        </div>
                    </div>

                </section>

            </main>

        </div>

    </Window>

</template>

<script setup lang="ts">

import { ref, reactive, computed } from 'vue';
import Window from './Window.vue';
import useSettingsItem from '@/composables/useSettingsItem';
import type { OrgMember } from '@/types/types';
import { openedOrg } from '@/assets/var';
import keycloak from '@/assets/keycloak';
import ProfileUploader from '../common/ProfileUploader.vue';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);

const { Item: theme } = useSettingsItem('theme', 'dark');
const user = computed<OrgMember | undefined>(() => openedOrg.value?.members?.find(member => member.user?.id == keycloak.userInfo?.sub));

const isModified = computed<boolean>(() => formData.email !== user.value?.user?.email || formData.username !== user.value?.user?.name )
const activeTab = ref<string>('account');

const formData = reactive({
    username: user.value?.user?.name,
    email: user.value?.user?.email
});

const avatarChange = ref<boolean>(false);

const tabs = [
    { id: 'account', label: 'Mon Compte', icon: 'bi bi-person-fill' },
    { id: 'appearance', label: 'Apparence', icon: 'bi bi-palette-fill' },
    { id: 'notifications', label: 'Notifications', icon: 'bi bi-bell-fill' },
    { id: 'security', label: 'Sécurité', icon: 'bi bi-shield-lock-fill' },
];

</script>

<style scoped>

.animate-fade-in {
    animation: fadeIn 0.15s ease-out forwards;
}

@keyframes fadeIn {
    from { 
        opacity: 0; 
        transform: translateY(4px); 
    }
    to { 
        opacity: 1; 
        transform: translateY(0); 
    }
}

</style>