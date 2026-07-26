<template>

    <div class="flex flex-col w-full overflow-hidden h-full">
        
        <main class="flex-1 overflow-y-auto p-6 lg:p-10">

            <div class="max-w-lg space-y-12">

                <section>
                    <div class="mb-6">
                        <h3 class="text-xl font-black text-(--text) mb-1">Paramètres généraux</h3>
                        <p class="text-sm text-(--text)/60">Gérez les informations globales de votre organisation.</p>
                    </div>

                    <div class="w-full relative rounded-xl overflow-hidden bg-(--bg2) border border-(--border-color) mb-8 shadow-xl">
                        <div class="h-[120px] bg-gradient-to-tr from-(--primary-dark) to-(--primary) w-full relative z-0"></div>
                        
                        <div class="px-6 relative flex justify-between items-end pb-6">
                            <div class="absolute -top-12 left-6 p-1.5 bg-(--bg2) rounded-full z-10 shadow-lg">
                                <div class="relative w-[100px] h-[100px] rounded-full overflow-hidden bg-(--bg) cursor-pointer" @click="showIconSelector = !showIconSelector">
                                    <img 
                                        v-if="orgData.logo && orgData.logo.startsWith('data:')" 
                                        :src="orgData.logo" 
                                        class="w-full h-full object-cover" 
                                    />
                                    <div v-else class="w-full h-full bg-(--bg) flex items-center justify-center">
                                        <span class="text-4xl font-black text-(--primary)">{{ orgData.name.substring(0, 2).toUpperCase() }}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="w-[110px]"></div>

                            <button 
                                @click="showIconSelector = !showIconSelector" 
                                class="mt-4 primary flex items-center gap-2 text-sm"
                            >
                                <i class="bi bi-camera-fill"></i>
                                Modifier le logo
                            </button>
                        </div>
                        
                        <div class="fixed inset-0 cursor-auto z-50" @click="showIconSelector = false" v-if="showIconSelector" />
                        <Transition name="pop">
                            <div class="absolute z-50 left-6 top-16" v-if="showIconSelector">
                                <IconSelector v-model:model-value="orgData.logo" @on-base64="(icon: string) => orgData.logo = icon" />
                            </div>
                        </Transition>
                    </div>

                    <div class="space-y-6">

                        <div class="space-y-1.5">
                            <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">Nom de l'organisation</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                                    <i class="bi bi-building"></i>
                                </div>
                                <input 
                                    v-model="orgData.name"
                                    type="text"
                                    class="w-full bg-(--bg2) border border-(--border-color) rounded-xl pl-11 pr-4 py-3 text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner"
                                    placeholder="Ex: SilverCore Team"
                                />
                            </div>
                        </div>

                        <div class="space-y-1.5">
                            <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">ID Unique (Permanent)</label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                                    <i class="bi bi-hash"></i>
                                </div>
                                <input 
                                    disabled
                                    type="text"
                                    :value="openedOrg?.id"
                                    class="w-full bg-black/20 border border-(--border-color) rounded-xl pl-11 pr-4 py-3 text-(--text)/30 italic shadow-inner"
                                />
                            </div>
                        </div>

                    </div>
                </section>

                <section>
                    <div class="mb-6">
                        <h3 class="text-xl font-black text-(--text) mb-1">Modules & Fonctionnalités</h3>
                        <p class="text-sm text-(--text)/60">Activez ou désactivez des fonctionnalités spécifiques.</p>
                    </div>

                    <div class="space-y-4">
                        <div class="flex items-center justify-between p-4 bg-(--bg2) border border-(--border-color) rounded-xl">
                            <div class="flex items-center gap-4">
                                <i class="bi bi-list-check text-xl text-(--primary)" :class="{'opacity-50 grayscale': !openedOrg?.features?.includes('todo')}"></i>
                                <div>
                                    <h4 class="font-bold text-sm text-(--text)">Module Tâches <span v-if="!openedOrg?.features?.includes('todo')" class="ml-2 text-[10px] font-normal text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">Désactivé par l'administration</span></h4>
                                    <p class="text-xs text-(--text)/40">Activer la gestion des tâches globales et par projet.</p>
                                </div>
                            </div>
                            <label class="relative inline-flex items-center" :class="{'cursor-not-allowed opacity-50': !openedOrg?.features?.includes('todo'), 'cursor-pointer': openedOrg?.features?.includes('todo')}">
                                <input type="checkbox" v-model="orgData.todoEnabled" :disabled="!openedOrg?.features?.includes('todo')" class="sr-only peer">
                                <div class="w-11 h-6 bg-black/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                            </label>
                        </div>

                        <div class="flex items-center justify-between p-4 bg-(--bg2) border border-(--border-color) rounded-xl">
                            <div class="flex items-center gap-4">
                                <i class="bi bi-file-earmark text-xl text-(--primary)" :class="{'opacity-50 grayscale': !openedOrg?.features?.includes('files')}"></i>
                                <div>
                                    <h4 class="font-bold text-sm text-(--text)">Module Fichiers <span v-if="!openedOrg?.features?.includes('files')" class="ml-2 text-[10px] font-normal text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">Désactivé par l'administration</span></h4>
                                    <p class="text-xs text-(--text)/40">Activer le système de stockage de fichiers par projet.</p>
                                </div>
                            </div>
                            <label class="relative inline-flex items-center" :class="{'cursor-not-allowed opacity-50': !openedOrg?.features?.includes('files'), 'cursor-pointer': openedOrg?.features?.includes('files')}">
                                <input type="checkbox" v-model="orgData.filesEnabled" :disabled="!openedOrg?.features?.includes('files')" class="sr-only peer">
                                <div class="w-11 h-6 bg-black/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                            </label>
                        </div>
                        
                        <div class="flex items-center justify-between p-4 bg-(--bg2) border border-(--border-color) rounded-xl">
                            <div class="flex items-center gap-4">
                                <i class="bi bi-robot text-xl text-(--primary)" :class="{'opacity-50 grayscale': !openedOrg?.features?.includes('ai')}"></i>
                                <div>
                                    <h4 class="font-bold text-sm text-(--text)">Synco AI <span v-if="!openedOrg?.features?.includes('ai')" class="ml-2 text-[10px] font-normal text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">Désactivé par l'administration</span></h4>
                                    <p class="text-xs text-(--text)/40">Activer l'assistant IA localement (WebGPU).</p>
                                </div>
                            </div>
                            <label class="relative inline-flex items-center" :class="{'cursor-not-allowed opacity-50': !openedOrg?.features?.includes('ai'), 'cursor-pointer': openedOrg?.features?.includes('ai')}">
                                <input type="checkbox" v-model="orgData.aiEnabled" :disabled="!openedOrg?.features?.includes('ai')" class="sr-only peer">
                                <div class="w-11 h-6 bg-black/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                            </label>
                        </div>
                    </div>
                </section>

                <section>
                    <div class="mb-6">
                        <h3 class="text-xl font-black text-red-500 mb-1">Zone de Danger</h3>
                        <p class="text-sm text-(--text)/60">Ces actions sont irréversibles et entraînent la perte de données.</p>
                    </div>

                    <div class="p-6 rounded-2xl bg-red-500/5 border border-red-500/10 flex flex-col items-start gap-4">
                        <p class="text-sm text-red-500/60">
                            La suppression d'une organisation est irréversible. Toutes les données, messages et fichiers seront définitivement effacés.
                        </p>
                        <button class="danger flex items-center gap-2 text-sm" @click="showDeleteOrg = !showDeleteOrg">
                            <i class="bi bi-trash-fill"></i>
                            Supprimer l'organisation
                        </button>
                    </div>
                </section>

            </div>
        </main>

        <Transition name="fade-bottom">
            <footer 
                v-if="hasChanges" 
                class="p-4 bg-(--bg2)/80 backdrop-blur-xl border-t border-(--border-color) flex justify-end gap-3"
            >

                <button @click="resetChanges" class="default">
                    Annuler
                </button>
                
                <button @click="saveSettings" class="primary" :class="saving ? 'loader' : ''">
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
import IconSelector from '@/components/common/IconSelector.vue';
import sfetch from '@/assets/utils/sfetch';
import useWSocket from '@/composables/useWSocket';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { useRouter } from 'vue-router';


const toast = useToast();
const router = useRouter();


const showIconSelector = ref<boolean>(false);
const saving = ref<boolean>(false);
const showDeleteOrg = ref<boolean>(false);
    
const orgData = ref({
    name: openedOrg.value?.name || '',
    logo: openedOrg.value?.logo || '',
    todoEnabled: openedOrg.value?.activeModules?.todo || false,
    filesEnabled: openedOrg.value?.activeModules?.files !== false,
    aiEnabled: openedOrg.value?.activeModules?.ai === true
});

const hasChanges = computed(() => {
    return (
        orgData.value.name !== openedOrg.value?.name
        || orgData.value.logo !== openedOrg.value?.logo
        || orgData.value.todoEnabled !== (openedOrg.value?.activeModules?.todo || false)
        || orgData.value.filesEnabled !== (openedOrg.value?.activeModules?.files !== false)
        || orgData.value.aiEnabled !== (openedOrg.value?.activeModules?.ai === true)
    )
});

const resetChanges = () => {
    orgData.value.name = openedOrg.value?.name || '';
    orgData.value.logo = openedOrg.value?.logo || '';
    orgData.value.todoEnabled = openedOrg.value?.activeModules?.todo || false;
    orgData.value.filesEnabled = openedOrg.value?.activeModules?.files !== false;
    orgData.value.aiEnabled = openedOrg.value?.activeModules?.ai === true;
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
                    ai: orgData.value.aiEnabled
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
                ai: orgData.value.aiEnabled
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
        organizations.value.filter(org => org.id !== openedOrg.value?.id);
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
        orgData.value.todoEnabled = newOrg.activeModules?.todo || false;
    }
}, { deep: true });

</script>