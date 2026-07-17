<template>

    <div class="flex flex-col w-full overflow-hidden h-full">
        
        <main class="flex-1 overflow-y-auto p-6 lg:p-10">

            <div class="max-w-3xl mx-auto space-y-12">

                <section class="space-y-6">

                    <div class="flex flex-col gap-1">
                        <h3 class="text-lg font-bold">Profil de l'Organisation</h3>
                        <p class="text-sm text-(--text)/40">Mettez à jour les informations publiques de votre espace.</p>
                    </div>

                    <div class="flex flex-col md:flex-row gap-8 items-center">

                        <div class="relative group cursor-pointer">

                            <div 
                                @click="showIconSelector = !showIconSelector"
                                class="
                                    w-35 h-35 rounded-3xl bg-white/5 border-2 border-dashed 
                                    border-white/10 flex flex-col items-center justify-center 
                                    group-hover:border-(--primary)/50 transition-all overflow-hidden
                                "
                            >
                                
                                <img 
                                    v-if="orgData.logo && orgData.logo.startsWith('data:')" 
                                    :src="orgData.logo" 
                                    class="w-full h-full object-cover" 
                                />

                                <div v-else class="w-full h-full bg-(--bg) flex items-center justify-center">
                                    <span class="text-4xl font-black text-(--primary)">{{ orgData.name.substring(0, 2).toUpperCase() }}</span>
                                </div>

                            </div>

                            <div class="fixed inset-0 cursor-auto" @click="showIconSelector = false" v-if="showIconSelector" />
                            <Transition name="pop">
                                <div class="absolute" v-if="showIconSelector">
                                    <IconSelector v-model:model-value="orgData.logo" @on-base64="(icon: string) => orgData.logo = icon" />
                                </div>
                            </Transition>

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
                        <h3 class="text-lg font-bold">Modules & Fonctionnalités</h3>
                        <p class="text-sm text-(--text)/40">Activez ou désactivez des fonctionnalités spécifiques pour l'organisation.</p>
                    </div>

                    <div class="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                        <div class="flex items-center gap-3">
                            <i class="bi bi-list-check text-2xl text-(--primary)"></i>
                            <div>
                                <h4 class="font-bold text-sm text-(--text)">Module Tâches (Todo List)</h4>
                                <p class="text-xs text-(--text)/40">Activer la gestion des tâches globales et par projet.</p>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" v-model="orgData.todoEnabled" class="sr-only peer">
                            <div class="w-11 h-6 bg-black/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                        </label>
                    </div>

                    <div class="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl mt-4">
                        <div class="flex items-center gap-3">
                            <i class="bi bi-file-earmark text-2xl text-(--primary)"></i>
                            <div>
                                <h4 class="font-bold text-sm text-(--text)">Module Fichiers</h4>
                                <p class="text-xs text-(--text)/40">Activer le système de stockage de fichiers par projet.</p>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" v-model="orgData.filesEnabled" class="sr-only peer">
                            <div class="w-11 h-6 bg-black/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                        </label>
                    </div>
                    <div class="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl mt-4">
                        <div class="flex items-center gap-3">
                            <i class="bi bi-robot text-2xl text-(--primary)"></i>
                            <div>
                                <h4 class="font-bold text-sm text-(--text)">Synco AI</h4>
                                <p class="text-xs text-(--text)/40">Activer l'assistant IA exécuté localement dans le navigateur (WebGPU).</p>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" v-model="orgData.aiEnabled" class="sr-only peer">
                            <div class="w-11 h-6 bg-black/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary)"></div>
                        </label>
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

                    <button class=" danger" @click="showDeleteOrg = !showDeleteOrg">
                        Supprimer l'organisation
                    </button>

                </section>

            </div>
        </main>

        <Transition name="fade-bottom">
            <footer 
                v-if="hasChanges" 
                class="p-4 bg-(--bg2)/80 backdrop-blur-xl border-t border-white/5 flex justify-end gap-3"
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