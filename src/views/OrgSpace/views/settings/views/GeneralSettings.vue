<template>

    <div class="flex flex-col h-full bg-(--bg) w-full overflow-hidden">
        
        <main class="flex-1 overflow-y-auto p-6 lg:p-10">

            <div class="max-w-3xl mx-auto space-y-12">

                <section class="space-y-6">

                    <div class="flex flex-col gap-1">
                        <h3 class="text-lg font-bold">Profil de l'Organisation</h3>
                        <p class="text-sm text-(--text)/40">Mettez à jour les informations publiques de votre espace.</p>
                    </div>

                    <div class="flex flex-col md:flex-row gap-8 items-start">

                        <div class="relative group cursor-pointer">

                            <div 
                                class="
                                    w-32 h-32 rounded-3xl bg-white/5 border-2 border-dashed 
                                    border-white/10 flex flex-col items-center justify-center 
                                    group-hover:border-(--primary)/50 transition-all overflow-hidden
                                "
                            >
                                
                                <img 
                                    v-if="orgData.logo && orgData.logo.startsWith('http')" 
                                    :src="orgData.logo" 
                                    class="w-full h-full object-cover" 
                                />

                                <i 
                                    v-else-if="orgData.logo"
                                    class="bi text-7xl"
                                    :class="orgData.logo"
                                />
                                
                                <template v-else>
                                    <i class="bi bi-camera text-2xl text-(--text)/20 mb-2" />
                                    <span class="text-[10px] text-(--text)/30 font-bold uppercase tracking-widest">
                                        Modifier
                                    </span>
                                </template>

                            </div>

                        </div>

                        <div class="flex-1 w-full space-y-4">

                            <div class="space-y-2">

                                <label class="text-xs font-bold text-(--text)/40 uppercase ml-1">
                                    Nom de l'organisation
                                </label>

                                <input 
                                    v-model="orgData.name"
                                    type="text"
                                    class="
                                        w-full bg-white/5 border border-white/10 
                                        px-4 py-3 text-sm focus:outline-none rounded-xl
                                        focus:border-(--primary)/50 transition-all
                                    "
                                    placeholder="Ex: SilverCore Team"
                                />

                            </div>

                            <div class="space-y-2">

                                <label class="text-xs font-bold text-(--text)/40 uppercase ml-1">
                                    ID Unique (Permanent)
                                </label>

                                <div 
                                    class="
                                        w-full bg-black/20 
                                        border border-white/5
                                        rounded-xl px-4 py-3 text-sm 
                                        text-(--text)/30 italic
                                    "
                                >
                                    {{ openedOrg?.id }}
                                </div>

                            </div>

                        </div>

                    </div>

                </section>

                <hr class="border-white/5" />

                <section class="space-y-6">

                    <div class="flex flex-col gap-1">
                        <h3 class="text-lg font-bold ">
                            Sécurité & Accès
                        </h3>
                        <p class="text-sm text-(--text)/40">
                            Gérez le chiffrement et les invitations.
                        </p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                        <div class="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all">

                            <div class="flex items-center gap-3 mb-3">

                                <div class="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                                    <i class="bi bi-shield-lock-fill" />
                                </div>

                                <span class="font-bold text-sm ">Chiffrement AES-256</span>

                            </div>

                            <p class="text-xs text-(--text)/40 leading-relaxed">
                                Lorem ipsum dolor sit amet, consectetur adipisicing elit. 
                            </p>
                        
                        </div>

                        <div class="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all">

                            <div class="flex items-center gap-3 mb-3">
                                <div class="p-2 rounded-lg bg-(--primary)/10 text-(--primary)">
                                    <i class="bi bi-person-plus-fill" />
                                </div>
                                <span class="font-bold text-sm ">Lien d'invitation</span>
                            </div>

                            <button @click="copyInvite" class="default-primary w-full!">
                                Copier le lien d'accès
                            </button>

                        </div>

                    </div>

                </section>

                <hr class="border-white/5" />

                <section class="p-6 rounded-3xl bg-red-500/5 border border-red-500/10 space-y-4">

                    <div class="flex items-center gap-3 text-red-500">
                        <i class="bi bi-exclamation-triangle text-xl" />
                        <h3 class="text-lg font-bold">Zone de Danger</h3>
                    </div>

                    <p class="text-sm text-red-500/60">
                        La suppression d'une organisation est irréversible. Toutes les données, messages et fichiers seront définitivement effacés.
                    </p>

                    <button class=" danger">
                        Supprimer l'organisation
                    </button>

                </section>

            </div>
        </main>

        <footer 
            v-if="hasChanges" 
            class="p-4 bg-(--bg2)/80 backdrop-blur-xl border-t border-white/5 flex justify-end gap-3"
        >

            <button @click="resetChanges" class="default">
                Annuler
            </button>
            
            <button @click="saveSettings" class="primary">
                Enregistrer les modifications
            </button>

        </footer>

    </div>

</template>

<script lang="ts" setup>

import { ref, computed, watch } from 'vue';
import { openedOrg } from '@/assets/var';

const orgData = ref({
    name: openedOrg.value?.name || '',
    logo: openedOrg.value?.logo || ''
});

const hasChanges = computed(() => {
    return orgData.value.name !== openedOrg.value?.name;
});

const resetChanges = () => {
    orgData.value.name = openedOrg.value?.name || '';
};

const saveSettings = async () => {
    // save data
    console.log("Saving...", orgData.value);
};

const copyInvite = () => {
    // create logic for moderate copy link
    const link = `https://silverteams.app/invite/${openedOrg.value?.id}`;
    navigator.clipboard.writeText(link);
};

watch(() => openedOrg.value, (newOrg) => {
    if (newOrg)
    {
        orgData.value.name = newOrg.name;
        orgData.value.logo = newOrg.logo || '';
    }
}, { deep: true });

</script>