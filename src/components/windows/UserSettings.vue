<template>

    <Window :isOpen="isOpen" @close="emit('close')">
        
        <div class="flex flex-col sm:flex-row w-full h-full text-(--text) overflow-hidden">
            
            <aside class="w-full sm:w-64 bg-(--bg2) border-b sm:border-b-0 sm:border-r border-(--border-color) p-2 sm:p-4 pr-14 sm:pr-4 flex flex-row sm:flex-col gap-2 shrink-0 overflow-x-auto hide-scrollbar">

                <h2 class="hidden sm:block text-xl font-black text-(--text) mb-4 px-3 pt-2">Paramètres</h2>
                
                <button 
                    v-for="tab in tabs" 
                    :key="tab.id"
                    @click="activeTab = tab.id"
                    class="tab whitespace-nowrap shrink-0 sm:w-full"
                    :class="activeTab === tab.id ? 'active' : 'text-(--text)/60'"
                >
                    <i :class="tab.icon" class="text-lg" />
                    {{ tab.label }}
                </button>

            </aside>

            <main class="flex-1 p-4 sm:p-8 overflow-y-auto bg-(--bg)">
                
                <!-- ACCOUNT -->
                <section 
                    v-if="activeTab === 'account'" 
                    class="animate-fade-in"
                >

                    <!-- Profil Banner inspiré de UserDropDown -->
                    <div class="w-full relative rounded-xl overflow-hidden bg-(--bg2) border border-(--border-color) mb-8 shadow-xl">
                        <!-- Banner -->
                        <div 
                            class="h-[120px] w-full relative z-0 transition-all duration-500"
                            :style="{ background: `linear-gradient(to top right, rgba(0,0,0,0.3), transparent), ${dominantColor}` }"
                        ></div>
                        
                        <!-- Avatar & Actions -->
                        <div class="px-4 sm:px-6 relative flex flex-col sm:flex-row sm:justify-between items-start sm:items-end pb-4 sm:pb-6">
                            <!-- Overlapping Avatar -->
                            <div class="absolute -top-10 sm:-top-12 left-4 sm:left-6 p-1.5 bg-(--bg2) rounded-full z-10 shadow-lg">
                                <div class="relative w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] rounded-full overflow-hidden bg-(--bg)">
                                    <img 
                                        :src="user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.name}&background=128a60&color=fff`" 
                                        :alt="user?.name" 
                                        @error="(e: any) => e.target.src = `https://ui-avatars.com/api/?name=${user?.name}&background=128a60&color=fff`"
                                        class="w-full h-full object-cover"
                                    />
                                </div>
                            </div>

                            <!-- Spacer pour l'avatar -->
                            <div class="w-full sm:w-[110px] h-[30px] sm:h-auto"></div>

                            <button 
                                @click="avatarChange = true" 
                                class="mt-2 sm:mt-4 primary flex items-center gap-2 text-sm self-end"
                            >
                                <i class="bi bi-camera-fill"></i>
                                Modifier l'avatar
                            </button>
                        </div>

                        <ProfileUploader 
                            :show="avatarChange" 
                            @close="avatarChange = false" 
                        />
                    </div>

                    <div class="mb-6">
                        <h3 class="text-xl font-black text-(--text) mb-1">Informations personnelles</h3>
                        <p class="text-sm text-(--text)/60">Mettez à jour votre profil et vos coordonnées.</p>
                    </div>

                    <div class="space-y-6 max-w-lg">
                       
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">Nom d'utilisateur</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                                    <i class="bi bi-person-fill"></i>
                                </div>
                                <input 
                                    type="text" 
                                    v-model="formData.name" 
                                    class="w-full bg-(--bg2) border border-(--border-color) rounded-xl pl-11 pr-4 py-3 text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner"
                                />
                            </div>
                        </div>

                        <div class="space-y-1.5">
                            <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">Adresse Email</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                                    <i class="bi bi-envelope-fill"></i>
                                </div>
                                <input 
                                    type="email" 
                                    v-model="formData.email" 
                                    class="w-full bg-(--bg2) border border-(--border-color) rounded-xl pl-11 pr-4 py-3 text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner"
                                />
                            </div>
                        </div>
                        
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">Poste</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                                    <i class="bi bi-briefcase-fill"></i>
                                </div>
                                <input 
                                    type="text" 
                                    v-model="formData.job" 
                                    placeholder="Mon poste"
                                    class="w-full bg-(--bg2) border border-(--border-color) rounded-xl pl-11 pr-4 py-3 text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner"
                                />
                            </div>
                        </div>

                        <div class="space-y-1.5">
                            <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">Description</label>
                            <div class="relative">
                                <textarea 
                                    v-model="formData.description" 
                                    placeholder="Dites-nous en plus sur vous..."
                                    rows="3"
                                    class="w-full bg-(--bg2) border border-(--border-color) rounded-xl p-4 text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner resize-none"
                                ></textarea>
                            </div>
                        </div>
                        
                        <div class="pt-4">
                            <button  
                                @click="updateProfile"
                                class="w-full sm:w-auto primary flex items-center justify-center gap-2 text-sm" 
                                :disabled="!isModified || isUpdating"
                            >
                                <i v-if="isUpdating" class="bi bi-arrow-repeat animate-spin"></i>
                                <i v-else class="bi bi-check-circle-fill"></i>
                                <span>{{ isUpdating ? 'Enregistrement...' : 'Enregistrer les modifications' }}</span>
                            </button>
                        </div>

                    </div>

                </section>

                <!-- SECURITY -->
                <section 
                    v-if="activeTab === 'security'" 
                    class="animate-fade-in"
                >
                    <div class="mb-6">
                        <h3 class="text-xl font-black text-(--text) mb-1">Sécurité & Confidentialité</h3>
                        <p class="text-sm text-(--text)/60">Vos conversations sont entièrement privées et illisibles par quiconque (y compris nous).</p>
                    </div>

                </section>

                <!-- APPEARANCE -->
                <section 
                    v-if="activeTab === 'appearance'" 
                    class="animate-fade-in space-y-8"
                >

                    <div>
                        <h3 class="text-2xl font-black text-(--text) mb-1">Apparence</h3>
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
                                            : 'border-(--border-color) bg-(--bg2) hover:border-white/20 scale-95 opacity-70 hover:opacity-100'
                                    "
                                    @click="theme = 'dark'"
                                >
                                    <div class="w-full h-24 bg-(--bg) rounded-lg border border-white/10 flex items-center justify-center shadow-inner">
                                        <i class="bi bi-moon-stars-fill text-(--primary) text-3xl drop-shadow-md" />
                                    </div>
                                    <span class="font-bold text-(--text)">Sombre</span>
                                    <div v-if="theme == 'dark'" class="absolute top-2 right-2 w-3 h-3 bg-(--primary) rounded-full shadow-[0_0_10px_var(--primary)]"></div>
                                </button>

                                <button 
                                    class="relative overflow-hidden flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300"
                                    :class="
                                        theme == 'light' 
                                            ? 'border-(--primary) bg-(--primary)/5 scale-100 shadow-[0_0_20px_var(--primary-glow)]' 
                                            : 'border-(--border-color) bg-(--bg2) hover:border-white/20 scale-95 opacity-70 hover:opacity-100'
                                    "
                                    @click="theme = 'light'"
                                >
                                    <div class="w-full h-24 bg-gray-100 rounded-lg border border-black/10 flex items-center justify-center shadow-inner">
                                        <i class="bi bi-sun-fill text-yellow-500 text-3xl drop-shadow-md" />
                                    </div>
                                    <span class="font-bold text-(--text)">Clair</span>
                                    <div v-if="theme == 'light'" class="absolute top-2 right-2 w-3 h-3 bg-(--primary) rounded-full shadow-[0_0_10px_var(--primary)]"></div>
                                </button>

                            </div>

                        </div>

                        <div class="space-y-4">
                            <h4 class="text-xs font-black uppercase tracking-widest text-(--text)/50">Avancé</h4>

                            <div 
                                @click="devMode = !devMode"
                                class="flex items-center justify-between p-5 bg-(--bg2) rounded-xl border border-(--border-color) cursor-pointer hover:bg-white/5 transition-all max-w-md"
                            >
                                <div>
                                    <h4 class="font-bold text-(--text)">Mode développeur</h4>
                                    <p class="text-sm text-(--text)/60 mt-0.5">Affiche les identifiants techniques et options avancées</p>
                                </div>
                                <div 
                                    class="w-12 h-6 rounded-full relative transition-colors duration-300 shrink-0"
                                    :class="devMode ? 'bg-(--primary)' : 'bg-white/10'"
                                >
                                    <div 
                                        class="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300"
                                        :class="devMode ? 'right-0.5' : 'left-0.5 opacity-50'"
                                    ></div>
                                </div>
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
                        <h3 class="text-2xl font-black text-(--text) mb-1">Notifications</h3>
                        <p class="text-sm text-(--text)/60">Gérez comment et quand vous êtes alerté.</p>
                    </div>

                    <div class="space-y-4 max-w-lg">
                        
                        <div 
                            @click="updateNotificationPrefs('push', !notifPrefs.push)"
                            class="flex items-center justify-between p-5 bg-(--bg2) rounded-xl border border-(--border-color) cursor-pointer hover:bg-white/5 transition-all"
                        >
                            <div>
                                <h4 class="font-bold text-(--text)">Notifications Push</h4>
                                <p class="text-sm text-(--text)/60 mt-0.5">Recevoir des alertes sur cet appareil</p>
                            </div>
                            <div 
                                class="w-12 h-6 rounded-full relative transition-colors duration-300"
                                :class="notifPrefs.push ? 'bg-(--primary)' : 'bg-white/10'"
                            >
                                <div 
                                    class="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300"
                                    :class="notifPrefs.push ? 'right-0.5' : 'left-0.5 opacity-50'"
                                ></div>
                            </div>
                        </div>

                        <div 
                            @click="updateNotificationPrefs('email', !notifPrefs.email)"
                            class="flex items-center justify-between p-5 bg-(--bg2) rounded-xl border border-(--border-color) cursor-pointer hover:bg-white/5 transition-all"
                        >
                            <div>
                                <h4 class="font-bold text-(--text)">Notifications par Email</h4>
                                <p class="text-sm text-(--text)/60 mt-0.5">Recevoir un résumé des messages non lus</p>
                            </div>
                            <div 
                                class="w-12 h-6 rounded-full relative transition-colors duration-300"
                                :class="notifPrefs.email ? 'bg-(--primary)' : 'bg-white/10'"
                            >
                                <div 
                                    class="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300"
                                    :class="notifPrefs.email ? 'right-0.5' : 'left-0.5 opacity-50'"
                                ></div>
                            </div>
                        </div>

                        <div 
                            @click="updateNotificationPrefs('sound', !notifPrefs.sound)"
                            class="flex items-center justify-between p-5 bg-(--bg2) rounded-xl border border-(--border-color) cursor-pointer hover:bg-white/5 transition-all"
                        >
                            <div>
                                <h4 class="font-bold text-(--text)">Sons des messages</h4>
                                <p class="text-sm text-(--text)/60 mt-0.5">Jouer un son lors de la réception d'un message</p>
                            </div>
                            <div 
                                class="w-12 h-6 rounded-full relative transition-colors duration-300"
                                :class="notifPrefs.sound ? 'bg-(--primary)' : 'bg-white/10'"
                            >
                                <div 
                                    class="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300"
                                    :class="notifPrefs.sound ? 'right-0.5' : 'left-0.5 opacity-50'"
                                ></div>
                            </div>
                        </div>

                        <div 
                            @click="updateNotificationPrefs('mentionsOnly', !notifPrefs.mentionsOnly)"
                            class="flex items-center justify-between p-5 bg-(--bg2) rounded-xl border border-(--border-color) cursor-pointer hover:bg-white/5 transition-all"
                        >
                            <div>
                                <h4 class="font-bold text-(--text)">Mentions @ uniquement</h4>
                                <p class="text-sm text-(--text)/60 mt-0.5">M'alerter uniquement quand on me mentionne directement</p>
                            </div>
                            <div 
                                class="w-12 h-6 rounded-full relative transition-colors duration-300"
                                :class="notifPrefs.mentionsOnly ? 'bg-(--primary)' : 'bg-white/10'"
                            >
                                <div 
                                    class="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300"
                                    :class="notifPrefs.mentionsOnly ? 'right-0.5' : 'left-0.5 opacity-50'"
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
import { getAverageColor } from '@/assets/utils/getAverageColor';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);
const toast = useToast();

const { Item: theme } = useSettingsItem('theme', 'dark');
const { Item: devMode } = useSettingsItem('devMode', false);

const activeTab = ref<string>('account');
const avatarChange = ref<boolean>(false);
const isUpdating = ref<boolean>(false);
const dominantColor = ref('#16ac77');

const formData = reactive({
    name: '',
    email: '',
    job: '',
    description: ''
});

const notifPrefs = reactive({
    push: true,
    email: true,
    sound: true,
    mentionsOnly: false
});

// Sync user data to form
watch(user, (newVal) => {
    if (newVal) {
        formData.name = newVal.name || '';
        formData.email = newVal.email || '';
        formData.job = newVal.job || '';
        formData.description = newVal.description || '';
        
        if (newVal.notificationPreferences) {
            let prefs = newVal.notificationPreferences;
            if (typeof prefs === 'string') {
                try {
                    prefs = JSON.parse(prefs);
                } catch(e) {}
            }
            if (typeof prefs === 'object' && prefs !== null) {
                notifPrefs.push = prefs.push ?? true;
                notifPrefs.email = prefs.email ?? true;
                notifPrefs.sound = prefs.sound ?? true;
                notifPrefs.mentionsOnly = prefs.mentionsOnly ?? false;
            }
        }
    }
}, { immediate: true });

watch(() => [user.value?.avatarUrl, user.value?.name], async () => {
    if (user.value) {
        const url = user.value.avatarUrl || `https://ui-avatars.com/api/?name=${user.value.name}&background=128a60&color=fff`;
        dominantColor.value = await getAverageColor(url);
    }
}, { immediate: true });

const updateNotificationPrefs = async (key: keyof typeof notifPrefs, value: boolean) => {
    notifPrefs[key] = value;
    try {
        const response = await sfetch('/api/users/me', {
            method: 'PATCH',
            body: JSON.stringify({
                notificationPreferences: notifPrefs
            })
        });
        
        if (response.ok) {
            const updatedUser = await response.json();
            user.value = { ...user.value, ...updatedUser };
        } else {
            toast.show('Erreur lors de la sauvegarde', 'error');
            notifPrefs[key] = !value;
        }
    } catch (e) {
        console.error(e);
        toast.show('Erreur de connexion', 'error');
        notifPrefs[key] = !value;
    }
};

const isModified = computed(() => {
    return formData.name !== user.value?.name || 
           formData.email !== user.value?.email ||
           formData.job !== (user.value?.job || '') ||
           formData.description !== (user.value?.description || '');
});

const updateProfile = async () => {
    if (!isModified.value) return;
    
    isUpdating.value = true;
    try {
        const response = await sfetch('/api/users/me', {
            method: 'PATCH',
            body: JSON.stringify({
                name: formData.name,
                email: formData.email,
                job: formData.job,
                description: formData.description
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

.hide-scrollbar::-webkit-scrollbar {
    display: none;
}
.hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

</style>