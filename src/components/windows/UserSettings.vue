<template>

    <Window :isOpen="isOpen" @close="emit('close')">
        
        <div class="flex w-full h-full text-(--text) overflow-hidden">
            
            <aside class="w-64 bg-(--bg2) border-r border-white/5 p-4 flex flex-col gap-2 shrink-0">

                <h2 class="text-xl font-black text-(--white) mb-4 px-3 pt-2">Paramètres</h2>
                
                <button 
                    v-for="tab in tabs" 
                    :key="tab.id"
                    @click="activeTab = tab.id"
                    class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-sm font-bold transition-all duration-200"
                    :class="activeTab === tab.id ? 'text-(--white) bg-white/10 shadow-sm' : 'text-(--text)/60 hover:text-(--white) hover:bg-white/5'"
                >
                    <i :class="tab.icon" class="text-lg" />
                    {{ tab.label }}
                </button>

            </aside>

            <main class="flex-1 p-8 overflow-y-auto bg-(--bg)">
                
                <!-- ACCOUNT -->
                <section 
                    v-if="activeTab === 'account'" 
                    class="animate-fade-in space-y-8"
                >

                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Mon Compte</h3>
                        <p class="text-sm text-(--text)/60">Gérez vos informations personnelles et votre profil.</p>
                    </div>

                    <div class="flex items-center justify-between gap-6 p-4 bg-(--bg2) rounded-xl border border-white/5">
                       
                        <div class="w-22 h-22 rounded-full bg-(--bg) border-2 border-(--primary) flex items-center justify-center overflow-hidden shrink-0">
                            <img 
                                :src="user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.name}&background=128a60&color=fff`" 
                                :alt="user?.name" 
                                @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${user?.name}&background=128a60&color=fff`"
                                class="w-full h-full object-cover"
                            />
                        </div>
                        
                        <div class="flex flex-col justify-between">
                            <button @click="avatarChange = true" class="primary px-6 py-2">
                                Changer l'avatar
                            </button>
                        </div>

                        <ProfileUploader 
                            :show="avatarChange" 
                            @close="avatarChange = false" 
                        />

                    </div>

                    <div class="space-y-5 max-w-md bg-(--bg2) p-6 rounded-xl border border-white/5">
                       
                        <div class="space-y-1.5">
                            <label class="text-sm font-bold text-(--text)">Nom d'utilisateur</label>
                            <input 
                                type="text" 
                                v-model="formData.name" 
                                class="w-full bg-(--bg) border border-white/10 rounded-lg px-4 py-2.5 text-(--white) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                            />
                        </div>

                        <div class="space-y-1.5">
                            <label class="text-sm font-bold text-(--text)">Adresse Email</label>
                            <input 
                                type="email" 
                                v-model="formData.email" 
                                class="w-full bg-(--bg) border border-white/10 rounded-lg px-4 py-2.5 text-(--white) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                            />
                        </div>
                        
                        <div class="pt-4 flex justify-end">
                            <button  
                                @click="updateProfile"
                                class="primary px-6 py-2 text-sm font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all" 
                                :disabled="!isModified || isUpdating"
                            >
                                <span v-if="isUpdating">Enregistrement...</span>
                                <span v-else>Enregistrer les modifications</span>
                            </button>
                        </div>

                    </div>

                </section>

                <!-- SECURITY -->
                <section 
                    v-if="activeTab === 'security'" 
                    class="animate-fade-in space-y-8"
                >
                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Sécurité (E2EE)</h3>
                        <p class="text-sm text-(--text)/60">Gérez vos paramètres de chiffrement de bout en bout (E2EE).</p>
                    </div>

                    <div class="bg-(--bg2) p-6 rounded-xl border border-white/5 space-y-6">
                        
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0" :class="E2EEUnloked ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'">
                                <i class="bi text-2xl" :class="E2EEUnloked ? 'bi-shield-check' : 'bi-shield-lock'" />
                            </div>
                            <div>
                                <h4 class="font-bold text-(--white) text-lg">Statut du chiffrement</h4>
                                <p class="text-sm text-(--text)/70 mt-1">
                                    {{ E2EEUnloked ? 'Vos clés E2EE sont déverrouillées. Vos messages sont chiffrés.' : 'Vos clés E2EE sont actuellement verrouillées.' }}
                                </p>
                            </div>
                        </div>

                        <div class="pt-6 border-t border-white/5 space-y-3" v-if="user?.publicKey">
                            <h4 class="text-xs font-black uppercase tracking-widest text-(--text)/50">Votre empreinte publique (Public Key)</h4>
                            <div class="bg-(--bg) p-3 rounded-lg border border-white/10 font-mono text-[10px] text-(--text)/50 break-all select-all">
                                {{ user.publicKey }}
                            </div>
                        </div>

                    </div>
                </section>

                <!-- APPEARANCE -->
                <section 
                    v-if="activeTab === 'appearance'" 
                    class="animate-fade-in space-y-8"
                >

                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Apparence</h3>
                        <p class="text-sm text-(--text)/60">Personnalisez l'interface de SilverTeams à votre goût.</p>
                    </div>

                    <div class="space-y-8">

                        <div class="space-y-4">

                            <h4 class="text-xs font-black uppercase tracking-widest text-(--text)/50">Thème global</h4>

                            <div class="grid grid-cols-2 gap-4 max-w-md">

                                <button 
                                    class="relative overflow-hidden flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300"
                                    :class="
                                        theme == 'dark' 
                                            ? 'border-(--primary) bg-(--primary)/5 scale-100 shadow-[0_0_20px_var(--primary-glow)]' 
                                            : 'border-white/5 bg-(--bg2) hover:border-white/20 scale-95 opacity-70 hover:opacity-100'
                                    "
                                    @click="theme = 'dark'"
                                >
                                    <div class="w-full h-24 bg-(--bg) rounded-lg border border-white/10 flex items-center justify-center shadow-inner">
                                        <i class="bi bi-moon-stars-fill text-(--primary) text-3xl drop-shadow-md" />
                                    </div>
                                    <span class="font-bold text-(--white)">Sombre</span>
                                    <div v-if="theme == 'dark'" class="absolute top-2 right-2 w-3 h-3 bg-(--primary) rounded-full shadow-[0_0_10px_var(--primary)]"></div>
                                </button>

                                <button 
                                    class="relative overflow-hidden flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300"
                                    :class="
                                        theme == 'light' 
                                            ? 'border-(--primary) bg-(--primary)/5 scale-100 shadow-[0_0_20px_var(--primary-glow)]' 
                                            : 'border-white/5 bg-(--bg2) hover:border-white/20 scale-95 opacity-70 hover:opacity-100'
                                    "
                                    @click="theme = 'light'"
                                >
                                    <div class="w-full h-24 bg-gray-100 rounded-lg border border-black/10 flex items-center justify-center shadow-inner">
                                        <i class="bi bi-sun-fill text-yellow-500 text-3xl drop-shadow-md" />
                                    </div>
                                    <span class="font-bold text-(--white)">Clair</span>
                                    <div v-if="theme == 'light'" class="absolute top-2 right-2 w-3 h-3 bg-(--primary) rounded-full shadow-[0_0_10px_var(--primary)]"></div>
                                </button>

                            </div>

                        </div>

                    </div>

                </section>

                <!-- NOTIFICATIONS -->
                <section 
                    v-if="activeTab === 'notifications'" 
                    class="animate-fade-in space-y-8"
                >

                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Notifications</h3>
                        <p class="text-sm text-(--text)/60">Gérez comment et quand vous êtes alerté.</p>
                    </div>

                    <div class="space-y-4 max-w-lg">
                        <div 
                            @click="messageSounds = !messageSounds"
                            class="flex items-center justify-between p-5 bg-(--bg2) rounded-xl border border-white/5 cursor-pointer hover:bg-white/5 transition-all"
                        >
                            <div>
                                <h4 class="font-bold text-(--white)">Sons des messages</h4>
                                <p class="text-sm text-(--text)/60 mt-0.5">Jouer un son lors de la réception d'un message</p>
                            </div>
                            <div 
                                class="w-12 h-6 rounded-full relative transition-colors duration-300"
                                :class="messageSounds ? 'bg-(--primary)' : 'bg-white/10'"
                            >
                                <div 
                                    class="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300"
                                    :class="messageSounds ? 'right-0.5' : 'left-0.5 opacity-50'"
                                ></div>
                            </div>
                        </div>

                        <div 
                            @click="mentionsOnly = !mentionsOnly"
                            class="flex items-center justify-between p-5 bg-(--bg2) rounded-xl border border-white/5 cursor-pointer hover:bg-white/5 transition-all"
                        >
                            <div>
                                <h4 class="font-bold text-(--white)">Mentions @ uniquement</h4>
                                <p class="text-sm text-(--text)/60 mt-0.5">M'alerter uniquement quand on me mentionne directement</p>
                            </div>
                            <div 
                                class="w-12 h-6 rounded-full relative transition-colors duration-300"
                                :class="mentionsOnly ? 'bg-(--primary)' : 'bg-white/10'"
                            >
                                <div 
                                    class="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300"
                                    :class="mentionsOnly ? 'right-0.5' : 'left-0.5 opacity-50'"
                                ></div>
                            </div>
                        </div>
                    </div>

                </section>

            </main>

        </div>

    </Window>

</template>

<script setup lang="ts">

import { ref, reactive, watch, computed } from 'vue';
import Window from './Window.vue';
import useSettingsItem from '@/composables/useSettingsItem';
import ProfileUploader from '../common/ProfileUploader.vue';
import { user } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import { E2EEUnloked } from '@/assets/utils/crypto';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);
const toast = useToast();

const { Item: theme } = useSettingsItem('theme', 'dark');
const { Item: messageSounds } = useSettingsItem('messageSounds', true);
const { Item: mentionsOnly } = useSettingsItem('mentionsOnly', false);

const activeTab = ref<string>('account');
const avatarChange = ref<boolean>(false);
const isUpdating = ref<boolean>(false);

const formData = reactive({
    name: '',
    email: ''
});

// Sync user data to form
watch(user, (newVal) => {
    if (newVal) {
        formData.name = newVal.name || '';
        formData.email = newVal.email || '';
    }
}, { immediate: true });

const isModified = computed(() => {
    return formData.name !== user.value?.name || formData.email !== user.value?.email;
});

const updateProfile = async () => {
    if (!isModified.value) return;
    
    isUpdating.value = true;
    try {
        const response = await sfetch('/api/users/me', {
            method: 'PATCH',
            body: JSON.stringify({
                name: formData.name,
                email: formData.email
            })
        });
        
        if (response.ok) {
            const updatedUser = await response.json();
            user.value = { ...user.value, ...updatedUser };
            toast.show('Profil mis à jour avec succès', 'success');
        } else {
            toast.show('Erreur lors de la mise à jour', 'error');
        }
    } catch (e) {
        console.error(e);
        toast.show('Une erreur est survenue', 'error');
    } finally {
        isUpdating.value = false;
    }
};

const tabs = [
    { id: 'account', label: 'Mon Compte', icon: 'bi bi-person-fill' },
    { id: 'security', label: 'Sécurité', icon: 'bi bi-shield-lock-fill' },
    { id: 'appearance', label: 'Apparence', icon: 'bi bi-palette-fill' },
    { id: 'notifications', label: 'Notifications', icon: 'bi bi-bell-fill' }
];

</script>

<style scoped>

.animate-fade-in {
    animation: fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes fadeIn {
    from { 
        opacity: 0; 
        transform: translateY(8px); 
    }
    to { 
        opacity: 1; 
        transform: translateY(0); 
    }
}

</style>