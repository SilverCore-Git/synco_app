<template>

    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">
        
        <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">

            <div class="max-w-5xl mx-auto space-y-12">

                <div class="mb-8">
                    <h3 class="text-2xl font-black text-(--text) mb-2">Paramètres généraux</h3>
                    <p class="text-sm text-(--text2)">Gérez les informations globales de votre organisation.</p>
                </div>

                <section class="space-y-6">
                    <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2) mb-4">Informations</h4>
                    
                    <div class="w-full relative rounded-2xl bg-(--bg2) border border-(--border-color) shadow-sm hover:shadow-md transition-all p-6 sm:p-8">
                        
                        <div class="relative flex flex-col sm:flex-row justify-between sm:items-center gap-6">
                            <div class="p-1.5 bg-(--bg) border border-(--border-color) rounded-2xl shadow-sm shrink-0 w-fit">
                                <div class="relative w-[80px] h-[80px] sm:w-[110px] sm:h-[110px] rounded-2xl overflow-hidden bg-(--bg3) cursor-pointer group" @click="triggerFileInput">
                                    <img 
                                        v-if="orgData.logo && orgData.logo.startsWith('data:')" 
                                        :src="orgData.logo" 
                                        class="w-full h-full object-cover" 
                                    />
                                    <div v-else class="w-full h-full bg-(--bg3) flex items-center justify-center">
                                        <span class="text-3xl sm:text-4xl font-black text-(--primary)">{{ orgData.name ? orgData.name.substring(0, 2).toUpperCase() : '...' }}</span>
                                    </div>
                                    <div class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                        <i class="bi bi-camera text-xl sm:text-2xl text-white"></i>
                                    </div>
                                </div>
                            </div>

                            <button 
                                type="button"
                                @click="triggerFileInput" 
                                class="bg-(--bg3) hover:bg-(--bg) border border-(--border-color) text-(--text) flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-xl transition-colors font-medium shadow-sm w-full sm:w-auto"
                            >
                                <i class="bi bi-camera-fill text-(--text2)"></i>
                                Modifier le logo
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-2">
                            <label class="text-xs font-semibold text-(--text)">Nom de l'organisation</label>
                            <div class="relative group">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text2) group-focus-within:text-(--primary) transition-colors">
                                    <i class="bi bi-building"></i>
                                </div>
                                <input 
                                    v-model="orgData.name"
                                    type="text"
                                    class="w-full bg-(--bg) border border-(--border-color) rounded-xl pl-11 pr-4 py-3 text-sm text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner"
                                    placeholder="Ex: SilverCore Team"
                                />
                            </div>
                        </div>

                        <div class="space-y-2" v-if="devMode">
                            <label class="text-xs font-semibold text-(--text)">ID Unique (Permanent)</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text2)">
                                    <i class="bi bi-hash"></i>
                                </div>
                                <input 
                                    disabled
                                    type="text"
                                    :value="openedOrg?.id"
                                    class="w-full bg-black/10 border border-(--border-color) rounded-xl pl-11 pr-4 py-3 text-sm text-(--text2) font-mono shadow-inner cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <section class="space-y-6">
                    <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2) mb-4">Modules & Fonctionnalités</h4>
                    
                    <div class="grid grid-cols-1 gap-6">
                        
                        <!-- Module Tâches -->
                        <div 
                            @click="toggleModule('todo')"
                            class="bg-(--bg2) border rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden transition-all duration-300"
                            :class="[
                                !openedOrg?.features?.includes('todo') ? 'border-(--border-color) opacity-60 grayscale cursor-not-allowed' : 
                                orgData.todoEnabled ? 'border-(--primary) shadow-sm hover:shadow-md cursor-pointer' : 'border-(--border-color) hover:border-(--text)/20 cursor-pointer'
                            ]"
                        >
                            <div v-if="!openedOrg?.features?.includes('todo')" class="absolute top-3 right-3">
                                <i class="bi bi-lock-fill text-(--text2)" title="Non inclus"></i>
                            </div>
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-colors"
                                    :class="orgData.todoEnabled ? 'bg-(--primary)/10 text-(--primary)' : 'bg-(--bg) text-(--text2)'">
                                    <i class="bi bi-list-check"></i>
                                </div>
                                <div class="flex-1 pointer-events-none">
                                    <h4 class="font-bold text-sm text-(--text)">Tâches</h4>
                                </div>
                                <label class="relative inline-flex items-center pointer-events-none" :class="{'cursor-not-allowed': !openedOrg?.features?.includes('todo'), 'cursor-pointer': openedOrg?.features?.includes('todo')}">
                                    <input type="checkbox" v-model="orgData.todoEnabled" :disabled="!openedOrg?.features?.includes('todo')" class="sr-only peer">
                                    <div class="w-11 h-6 bg-black/20 border border-(--border-color) peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary) peer-checked:border-(--primary)"></div>
                                </label>
                            </div>
                            <p class="text-xs text-(--text2) mt-2 pointer-events-none">Gestion des tâches globales et par espace de travail.</p>
                        </div>

                        <!-- Module Fichiers -->
                        <div 
                            @click="toggleModule('files')"
                            class="bg-(--bg2) border rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden transition-all duration-300"
                            :class="[
                                !openedOrg?.features?.includes('files') ? 'border-(--border-color) opacity-60 grayscale cursor-not-allowed' : 
                                orgData.filesEnabled ? 'border-(--primary) shadow-sm hover:shadow-md cursor-pointer' : 'border-(--border-color) hover:border-(--text)/20 cursor-pointer'
                            ]"
                        >
                            <div v-if="!openedOrg?.features?.includes('files')" class="absolute top-3 right-3">
                                <i class="bi bi-lock-fill text-(--text2)" title="Non inclus"></i>
                            </div>
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-colors"
                                    :class="orgData.filesEnabled ? 'bg-(--primary)/10 text-(--primary)' : 'bg-(--bg) text-(--text2)'">
                                    <i class="bi bi-file-earmark"></i>
                                </div>
                                <div class="flex-1 pointer-events-none">
                                    <h4 class="font-bold text-sm text-(--text)">Fichiers</h4>
                                </div>
                                <label class="relative inline-flex items-center pointer-events-none" :class="{'cursor-not-allowed': !openedOrg?.features?.includes('files'), 'cursor-pointer': openedOrg?.features?.includes('files')}">
                                    <input type="checkbox" v-model="orgData.filesEnabled" :disabled="!openedOrg?.features?.includes('files')" class="sr-only peer">
                                    <div class="w-11 h-6 bg-black/20 border border-(--border-color) peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary) peer-checked:border-(--primary)"></div>
                                </label>
                            </div>
                            <p class="text-xs text-(--text2) mt-2 pointer-events-none">Système de stockage de fichiers par espace de travail.</p>
                        </div>

                        <!-- Module AI -->
                        <div 
                            @click="toggleModule('ai')"
                            class="bg-(--bg2) border rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden transition-all duration-300"
                            :class="[
                                !openedOrg?.features?.includes('ai') ? 'border-(--border-color) opacity-60 grayscale cursor-not-allowed' : 
                                orgData.aiEnabled ? 'border-(--primary) shadow-sm hover:shadow-md cursor-pointer' : 'border-(--border-color) hover:border-(--text)/20 cursor-pointer'
                            ]"
                        >
                            <div v-if="!openedOrg?.features?.includes('ai')" class="absolute top-3 right-3">
                                <i class="bi bi-lock-fill text-(--text2)" title="Non inclus"></i>
                            </div>
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-colors"
                                    :class="orgData.aiEnabled ? 'bg-(--primary)/10 text-(--primary)' : 'bg-(--bg) text-(--text2)'">
                                    <i class="bi bi-robot"></i>
                                </div>
                                <div class="flex-1 pointer-events-none">
                                    <h4 class="font-bold text-sm text-(--text)">Synco AI</h4>
                                </div>
                                <label class="relative inline-flex items-center pointer-events-none" :class="{'cursor-not-allowed': !openedOrg?.features?.includes('ai'), 'cursor-pointer': openedOrg?.features?.includes('ai')}">
                                    <input type="checkbox" v-model="orgData.aiEnabled" :disabled="!openedOrg?.features?.includes('ai')" class="sr-only peer">
                                    <div class="w-11 h-6 bg-black/20 border border-(--border-color) peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary) peer-checked:border-(--primary)"></div>
                                </label>
                            </div>
                            <p class="text-xs text-(--text2) mt-2 pointer-events-none">Assistant IA local (WebGPU) ou Cloud externe.</p>
                        </div>
                        
                        <!-- Module OnlyOffice -->
                        <div 
                            @click="toggleModule('onlyoffice')"
                            class="bg-(--bg2) border rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden transition-all duration-300"
                            :class="[
                                !openedOrg?.features?.includes('onlyoffice') ? 'border-(--border-color) opacity-60 grayscale cursor-not-allowed' : 
                                orgData.onlyofficeEnabled ? 'border-(--primary) shadow-sm hover:shadow-md cursor-pointer' : 'border-(--border-color) hover:border-(--text)/20 cursor-pointer'
                            ]"
                        >
                            <div v-if="!openedOrg?.features?.includes('onlyoffice')" class="absolute top-3 right-3">
                                <i class="bi bi-lock-fill text-(--text2)" title="Non inclus"></i>
                            </div>
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-colors"
                                    :class="orgData.onlyofficeEnabled ? 'bg-(--primary)/10 text-(--primary)' : 'bg-(--bg) text-(--text2)'">
                                    <i class="bi bi-file-word"></i>
                                </div>
                                <div class="flex-1 pointer-events-none">
                                    <h4 class="font-bold text-sm text-(--text)">Édition Bureautique (OnlyOffice)</h4>
                                </div>
                                <label class="relative inline-flex items-center pointer-events-none" :class="{'cursor-not-allowed': !openedOrg?.features?.includes('onlyoffice'), 'cursor-pointer': openedOrg?.features?.includes('onlyoffice')}">
                                    <input type="checkbox" v-model="orgData.onlyofficeEnabled" :disabled="!openedOrg?.features?.includes('onlyoffice')" class="sr-only peer">
                                    <div class="w-11 h-6 bg-black/20 border border-(--border-color) peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary) peer-checked:border-(--primary)"></div>
                                </label>
                            </div>
                            <p class="text-xs text-(--text2) mt-2 pointer-events-none">Édition collaborative de documents Word, Excel et PowerPoint.</p>
                        </div>

                        <!-- Module Repos -->
                        <div
                            @click="toggleModule('repos')"
                            class="bg-(--bg2) border rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden transition-all duration-300"
                            :class="[
                                !openedOrg?.features?.includes('repos') ? 'border-(--border-color) opacity-60 grayscale cursor-not-allowed' :
                                orgData.reposEnabled ? 'border-(--primary) shadow-sm hover:shadow-md cursor-pointer' : 'border-(--border-color) hover:border-(--text)/20 cursor-pointer'
                            ]"
                        >
                            <div v-if="!openedOrg?.features?.includes('repos')" class="absolute top-3 right-3">
                                <i class="bi bi-lock-fill text-(--text2)" title="Non inclus"></i>
                            </div>
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-colors"
                                    :class="orgData.reposEnabled ? 'bg-(--primary)/10 text-(--primary)' : 'bg-(--bg) text-(--text2)'">
                                    <i class="bi bi-diagram-3"></i>
                                </div>
                                <div class="flex-1 pointer-events-none">
                                    <h4 class="font-bold text-sm text-(--text)">Repos</h4>
                                </div>
                                <label class="relative inline-flex items-center pointer-events-none" :class="{'cursor-not-allowed': !openedOrg?.features?.includes('repos'), 'cursor-pointer': openedOrg?.features?.includes('repos')}">
                                    <input type="checkbox" v-model="orgData.reposEnabled" :disabled="!openedOrg?.features?.includes('repos')" class="sr-only peer">
                                    <div class="w-11 h-6 bg-black/20 border border-(--border-color) peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary) peer-checked:border-(--primary)"></div>
                                </label>
                            </div>
                            <p class="text-xs text-(--text2) mt-2 pointer-events-none">Suivi organisationnel de dépôts Git externes (lecture seule) — statuts, tags et arborescence de branches.</p>
                        </div>
                    </div>
                </section>

                <section class="space-y-6">
                    <h4 class="text-xs font-bold uppercase tracking-widest text-red-500 mb-4">Zone de Danger</h4>

                    <div class="p-6 rounded-2xl bg-red-500/5 border border-red-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                        <div>
                            <h4 class="font-bold text-red-500 text-sm mb-1">Supprimer l'organisation</h4>
                            <p class="text-xs text-red-500/70">
                                La suppression est irréversible. Toutes les données, messages et fichiers seront définitivement effacés.
                            </p>
                        </div>
                        <button class="danger flex items-center justify-center gap-2 text-sm px-6 py-2.5 rounded-xl whitespace-nowrap" @click="showDeleteOrg = !showDeleteOrg">
                            <i class="bi bi-trash-fill"></i>
                            Supprimer
                        </button>
                    </div>
                </section>

            </div>
        </main>

        <Transition name="fade-bottom">
            <footer 
                v-if="hasChanges" 
                class="p-4 bg-(--bg2)/80 backdrop-blur-xl border-t border-(--border-color) flex justify-end gap-3 z-20"
            >
                <button @click="resetChanges" class="default px-6 py-2.5 rounded-xl text-sm font-medium">
                    Annuler
                </button>
                <button @click="saveSettings" class="primary px-6 py-2.5 rounded-xl text-sm font-medium" :class="saving ? 'loader' : ''">
                    Enregistrer les modifications
                </button>
            </footer>
        </Transition>

    </div>

    <ConfirmDelete 
        :show="showDeleteOrg"
        item-type="l'organisation"
        :item-name="'l\'organisation ' + orgData.name"
        checkbox
        checktext
        @cancel="showDeleteOrg = false"
        @confirm="deleteOrg"
    />

</template>

<script lang="ts" setup>

import { ref, computed, watch } from 'vue';
import { openedOrg, organizations } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import useWSocket from '@/composables/useWSocket';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { useRouter } from 'vue-router';
import { getAverageColor } from '@/assets/utils/getAverageColor';
import useSettingsItem from '@/composables/useSettingsItem';

const { Item: devMode } = useSettingsItem('devMode', false);


const toast = useToast();
const router = useRouter();


const triggerFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                orgData.value.logo = ev.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
};
const saving = ref<boolean>(false);
const showDeleteOrg = ref<boolean>(false);
const bannerColor = ref<string>('var(--primary)');
    
const orgData = ref({
    name: openedOrg.value?.name || '',
    logo: openedOrg.value?.logo || '',
    todoEnabled: openedOrg.value?.features?.includes('todo') ? (openedOrg.value?.activeModules?.todo || false) : false,
    filesEnabled: openedOrg.value?.features?.includes('files') ? (openedOrg.value?.activeModules?.files !== false) : false,
    aiEnabled: openedOrg.value?.features?.includes('ai') ? (openedOrg.value?.activeModules?.ai === true) : false,
    onlyofficeEnabled: openedOrg.value?.features?.includes('onlyoffice') ? (openedOrg.value?.activeModules?.onlyoffice === true) : false,
    reposEnabled: openedOrg.value?.features?.includes('repos') ? (openedOrg.value?.activeModules?.repos === true) : false
});

watch(() => orgData.value.logo, async (newLogo) => {
    if (newLogo && newLogo.startsWith('data:')) {
        bannerColor.value = await getAverageColor(newLogo);
    } else {
        bannerColor.value = 'var(--primary)';
    }
}, { immediate: true });

const toggleModule = (module: 'todo' | 'files' | 'ai' | 'onlyoffice' | 'repos') => {
    if (!openedOrg.value?.features?.includes(module)) return;
    if (module === 'todo') orgData.value.todoEnabled = !orgData.value.todoEnabled;
    if (module === 'files') orgData.value.filesEnabled = !orgData.value.filesEnabled;
    if (module === 'ai') orgData.value.aiEnabled = !orgData.value.aiEnabled;
    if (module === 'onlyoffice') orgData.value.onlyofficeEnabled = !orgData.value.onlyofficeEnabled;
    if (module === 'repos') orgData.value.reposEnabled = !orgData.value.reposEnabled;
};

const hasChanges = computed(() => {
    return (
        orgData.value.name !== openedOrg.value?.name
        || orgData.value.logo !== openedOrg.value?.logo
        || orgData.value.todoEnabled !== (openedOrg.value?.activeModules?.todo || false)
        || orgData.value.filesEnabled !== (openedOrg.value?.activeModules?.files !== false)
        || orgData.value.aiEnabled !== (openedOrg.value?.activeModules?.ai === true)
        || orgData.value.onlyofficeEnabled !== (openedOrg.value?.activeModules?.onlyoffice === true)
        || orgData.value.reposEnabled !== (openedOrg.value?.activeModules?.repos === true)
    )
});

const resetChanges = () => {
    orgData.value.name = openedOrg.value?.name || '';
    orgData.value.logo = openedOrg.value?.logo || '';
    orgData.value.todoEnabled = openedOrg.value?.features?.includes('todo') ? (openedOrg.value?.activeModules?.todo || false) : false;
    orgData.value.filesEnabled = openedOrg.value?.features?.includes('files') ? (openedOrg.value?.activeModules?.files !== false) : false;
    orgData.value.aiEnabled = openedOrg.value?.features?.includes('ai') ? (openedOrg.value?.activeModules?.ai === true) : false;
    orgData.value.onlyofficeEnabled = openedOrg.value?.features?.includes('onlyoffice') ? (openedOrg.value?.activeModules?.onlyoffice === true) : false;
    orgData.value.reposEnabled = openedOrg.value?.features?.includes('repos') ? (openedOrg.value?.activeModules?.repos === true) : false;
};

const saveSettings = async () => {

    if (!hasChanges.value) return;

    saving.value = true;

    const socket = await useWSocket();

    try {

        const res = await sfetch(`/api/orgs/${openedOrg.value?.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                name: orgData.value.name,
                logo: orgData.value.logo,
                activeModules: {
                    ...(openedOrg.value?.activeModules || {}),
                    todo: orgData.value.todoEnabled,
                    files: orgData.value.filesEnabled,
                    ai: orgData.value.aiEnabled,
                    onlyoffice: orgData.value.onlyofficeEnabled,
                    repos: orgData.value.reposEnabled
                }
            })
        }).then(res => res.json())

        if (res.error)
        {
            toast.show(res.error, 'error');
        }
        else
        {

            if (!openedOrg.value) return toast.show('Organisation non trouvée.', 'error');

            openedOrg.value.name = orgData.value.name;
            openedOrg.value.logo = orgData.value.logo;
            openedOrg.value.activeModules = {
                ...(openedOrg.value.activeModules || {}),
                todo: orgData.value.todoEnabled,
                files: orgData.value.filesEnabled,
                ai: orgData.value.aiEnabled,
                onlyoffice: orgData.value.onlyofficeEnabled,
                repos: orgData.value.reposEnabled
            };

            const curentOrg = organizations.value.find(org => org.id === openedOrg.value?.id);

            if (curentOrg)
            {
                curentOrg.name = orgData.value.name;
                curentOrg.logo = orgData.value.logo;
                curentOrg.activeModules = openedOrg.value.activeModules;
            }

            socket.value?.emit('update-org-data', { 
                orgId: openedOrg.value.id, 
                data: {
                    name: orgData.value.name,
                    logo: orgData.value.logo
                } 
            });

            toast.show('Modifications sauvegardées avec succès.', 'success');

        }

    }
    catch (err) {
        console.log(err);
        toast.show('Une erreur est survenue lors de la sauvegarde des modifications.', 'error');
    }
    finally {
        saving.value = false;
    }

};

const deleteOrg = async () => {

    showDeleteOrg.value = false;

    const res = await sfetch(`/api/orgs/${openedOrg.value?.id}`, {
        method: 'DELETE'
    })

    if (res.ok)
    {
        toast.show('Organisation supprimer avec succès.', 'success');
        router.push('/');
        organizations.value = organizations.value.filter(org => org.id !== openedOrg.value?.id);
        openedOrg.value = null
    }
    else
    {
        const err = ( await res.json() ).error;
        toast.show(err, 'error');
    }

}


watch(() => openedOrg.value, (newOrg) => {
    if (newOrg)
    {
        orgData.value.name = newOrg.name;
        orgData.value.logo = newOrg.logo || '';
        orgData.value.todoEnabled = newOrg.features?.includes('todo') ? (newOrg.activeModules?.todo || false) : false;
        orgData.value.filesEnabled = newOrg.features?.includes('files') ? (newOrg.activeModules?.files !== false) : false;
        orgData.value.aiEnabled = newOrg.features?.includes('ai') ? (newOrg.activeModules?.ai === true) : false;
        orgData.value.onlyofficeEnabled = newOrg.features?.includes('onlyoffice') ? (newOrg.activeModules?.onlyoffice === true) : false;
        orgData.value.reposEnabled = newOrg.features?.includes('repos') ? (newOrg.activeModules?.repos === true) : false;
    }
}, { deep: true });

</script>