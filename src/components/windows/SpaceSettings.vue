<template>

    <Window :isOpen="isOpen" @close="emit('close')">

        <div class="flex w-full h-full bg-(--bg) text-(--text) rounded-xl overflow-hidden shadow-2xl relative">
            
            <aside class="w-64 bg-(--bg2) border-r border-white/5 p-4 flex flex-col gap-2 shrink-0">

                <h2 class="text-xl font-black text-(--white) mb-4 px-3 pt-2">Paramètres</h2>
                
                <button 
                    v-for="tab in tabs" 
                    :key="tab.id"
                    @click="activeTab = tab.id"
                    class="tab"
                    :class="activeTab === tab.id ? 'active' : ''"
                >
                    <i :class="[tab.icon, 'text-lg']" />
                    {{ tab.label }}
                </button>

                <div class="mt-auto pt-4 border-t border-white/5">
                    <button class="danger w-full">
                        <i class="bi bi-door-open-fill text-lg" />
                        Quitter le Space
                    </button>
                </div>
                
            </aside>

            <main class="flex-1 p-8 overflow-y-auto bg-(--bg)">
                
                <section v-if="activeTab === 'general'" class="animate-fade-in space-y-8">

                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Vue d'ensemble</h3>
                        <p class="text-sm text-(--text)/60">Configurez l'identité visuelle de votre espace de travail.</p>
                    </div>

                    <div class="flex items-center gap-8 p-6 bg-(--bg2) rounded-2xl border border-white/5">
                        <div class="relative group">
                            <div class="w-24 h-24 rounded-2xl bg-(--bg) border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-(--primary)/50">
                                <i v-if="!formData.logo.startsWith('http')" :class="formData.logo" class="text-4xl text-(--primary)" />
                                <img v-else :src="formData.logo" class="w-full h-full object-cover" />
                                
                                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                                    <i class="bi bi-camera-fill text-white text-xl" />
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex-1 space-y-4">
                            <div class="space-y-1.5">
                                <label class="text-xs font-black uppercase text-(--text)/50">Nom du Space</label>
                                <input 
                                    type="text" 
                                    v-model="formData.name" 
                                    placeholder="Nom de l'espace"
                                    class="w-full bg-(--bg) border border-white/10 rounded-lg px-4 py-2.5 text-(--white) focus:outline-none focus:border-(--primary) transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <h4 class="text-xs font-black uppercase tracking-widest text-(--text)/50">ID de l'espace</h4>
                        <div class="flex items-center gap-2 bg-(--bg2) p-3 rounded-lg border border-white/5">
                            <code class="text-(--primary) text-sm flex-1">{{ space.id }}</code>
                            <button class="text-xs font-bold hover:text-(--white)">Copier</button>
                        </div>
                    </div>
                </section>

                <section v-if="activeTab === 'members'" class="animate-fade-in space-y-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-black text-(--white) mb-1">Membres</h3>
                            <p class="text-sm text-(--text)/60">{{ space.membersId.length }} personnes ont accès à ce space.</p>
                        </div>
                        <button class="primary !py-2">
                            <i class="bi bi-person-plus-fill mr-2" />Inviter
                        </button>
                    </div>

                    <div class="space-y-2">
                        <div v-for="memberId in space.membersId" :key="memberId" 
                            class="flex items-center justify-between p-3 bg-(--bg2) rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full bg-(--bg) border border-white/5 flex items-center justify-center text-xs font-bold text-(--primary)">
                                    {{ memberId.substring(0, 2).toUpperCase() }}
                                </div>
                                <span class="font-medium text-(--white)">{{ memberId === space.ownerId ? 'Propriétaire' : 'Membre' }}</span>
                                <span v-if="memberId === space.ownerId" class="text-[10px] bg-(--primary)/20 text-(--primary) px-2 py-0.5 rounded-full font-black uppercase">Owner</span>
                            </div>
                            <button v-if="memberId !== space.ownerId" class="text-(--text)/40 hover:text-red-400 p-2">
                                <i class="bi bi-x-circle" />
                            </button>
                        </div>
                    </div>
                </section>

                <section v-if="activeTab === 'security'" class="animate-fade-in space-y-6">
                    <div>
                        <h3 class="text-2xl font-black text-(--white) mb-1">Sécurité & Permissions</h3>
                        <p class="text-sm text-(--text)/60">Contrôlez qui peut voir et modifier ce salon.</p>
                    </div>

                    <div class="space-y-4">
                        <div class="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex gap-4">
                            <i class="bi bi-exclamation-triangle-fill text-orange-500 text-xl" />
                            <p class="text-sm text-orange-200/80">Seuls le propriétaire et les administrateurs de l'organisation peuvent modifier ces réglages.</p>
                        </div>

                        <div class="flex items-center justify-between p-4 bg-(--bg2) rounded-xl border border-white/5">
                            <div>
                                <h4 class="font-bold text-(--white)">Espace Privé</h4>
                                <p class="text-sm text-(--text)/60">Seuls les membres invités peuvent voir ce space</p>
                            </div>
                            <div class="w-12 h-6 bg-(--primary) rounded-full relative cursor-pointer">
                                <div class="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5"></div>
                            </div>
                        </div>
                    </div>
                </section>

            </main>

            <SaveUpdateOverlay 
                :show="isModified" 
                @close="resetForm" 
                @save="saveChanges"
            />
            
        </div>

    </Window>
    
</template>

<script setup lang="ts">

import { ref, reactive, computed, watch } from 'vue';
import Window from './Window.vue';
import type { WorkSpace } from '@/types/types';
import SaveUpdateOverlay from '../overlay/SaveUpdateOverlay.vue';
import { useToast } from '@/composables/useToast';

const props = defineProps<{
    space: WorkSpace;
    isOpen: boolean;
}>();

const toast = useToast();
const emit = defineEmits(['close']);

const activeTab = ref<string>('general');

const formData = reactive({
    name: props.space.name,
    logo: props.space.logo
});


watch(() => props.space, (newSpace) => {
    formData.name = newSpace.name;
    formData.logo = newSpace.logo;
}, { deep: true });

const isModified = computed(() => {
    return formData.name !== props.space.name || formData.logo !== props.space.logo;
});

const tabs = [
    { id: 'general', label: 'Général', icon: 'bi bi-grid-fill' },
    { id: 'members', label: 'Membres', icon: 'bi bi-people-fill' },
    { id: 'security', label: 'Sécurité', icon: 'bi bi-shield-lock-fill' },
];

const resetForm = () => {
    formData.name = props.space.name;
    formData.logo = props.space.logo;
};

const saveChanges = () => {
    // mettre call api
    console.log("Saving space changes...", formData);
    toast.show('Modifications enregistrées avec succès.', 'success');
};

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