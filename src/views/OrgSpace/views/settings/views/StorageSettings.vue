<template>
    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">

        <main class="flex-1 overflow-y-auto p-6 lg:p-10">
            
            <div class="max-w-5xl mx-auto space-y-12">
                
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">

                    <div>
                        <h1 class="text-2xl font-bold text-(--text) flex items-center gap-3">
                            <i class="bi bi-hdd-network text-(--primary)" />
                            Stockage & Utilisation
                        </h1>
                        <p class="text-(--text)/60 text-sm mt-1">
                            Consultez l'espace de stockage consommé par votre organisation et gérez les fichiers.
                        </p>
                    </div>
                    
                    <div class="w-full md:w-64">
                        <CapacityGauge 
                            :used="Number(openedOrg?.stats?.totalStorageUsed || 0)"
                            :max="Number(openedOrg?.maxStorage || 0)"
                            unit=""
                            icon="bi-hdd-network"
                            title="Stockage total"
                            :isBytes="true"
                        />
                    </div>

                </div>

                <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="p-6 rounded-2xl bg-(--bg2) border border-(--text)/10 flex flex-col space-y-4">
                        <h3 class="text-lg font-bold text-(--text) flex items-center gap-2">
                            <i class="bi bi-folder-fill text-(--primary)"></i>
                            Détails par Espace de travail
                        </h3>
                        <div v-if="openedOrg?.spaces?.length" class="space-y-2 mt-4 max-h-64 overflow-y-auto pr-2">
                            <div v-for="space in openedOrg?.spaces" :key="space.id" class="flex justify-between items-center text-sm p-3 bg-(--bg3) border border-(--text)/5 rounded-xl hover:bg-white/5 transition-colors">
                                <span class="flex items-center gap-2 font-medium"><i class="bi bi-folder text-(--primary)"></i> {{ space.name }}</span>
                                <span class="font-mono text-(--text)/60 text-xs">{{ formatBytes(Number(space.stats?.storageUsed || 0)) }}</span>
                            </div>
                        </div>
                        <div v-else class="text-sm text-(--text)/40 italic mt-4">
                            Aucun espace de travail.
                        </div>
                    </div>
                    
                    <div class="p-6 rounded-2xl bg-(--bg2) border border-(--text)/10 flex flex-col justify-between space-y-4 relative overflow-hidden group">
                        <div class="absolute -right-10 -top-10 w-32 h-32 bg-(--primary)/5 rounded-full blur-3xl group-hover:bg-(--primary)/10 transition-colors pointer-events-none" />
                        <div class="flex items-start flex-col relative z-10">
                            <div class="w-10 h-10 rounded-xl bg-(--primary-dark)/50 text-(--primary) flex items-center justify-center mb-4 border border-(--primary)/20">
                                <i class="bi bi-file-earmark-bar-graph text-xl" />
                            </div>
                            <h3 class="text-lg font-bold text-(--text)">Statistiques globales</h3>
                            <p class="text-sm text-(--text)/60 mt-1">
                                Retrouvez ci-dessous la liste intégrale de tous les fichiers hébergés sur l'organisation.
                            </p>
                        </div>
                    </div>
                </section>

                <section class="bg-(--bg2) rounded-3xl border border-(--text)/10 overflow-hidden flex flex-col">
                    
                    <div class="p-6 border-b border-(--text)/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-(--bg3)/30">

                        <h3 class="text-lg font-bold text-(--text) flex items-center gap-2">
                            Fichiers 
                            <span class="bg-(--primary)/10 text-(--primary) py-0.5 px-2 rounded-md text-xs">
                                {{ filteredFiles.length }}
                            </span>
                        </h3>

                        <div class="relative w-full sm:w-72">
                            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text)/40" />
                            <input 
                                v-model="searchQuery"
                                type="text" 
                                placeholder="Rechercher un fichier..."
                                class="w-full bg-(--bg3) border border-(--text)/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-(--text) focus:outline-none focus:border-(--primary)/40 transition-all placeholder:text-(--text)/30"
                            />
                        </div>

                    </div>

                    <div class="overflow-x-auto">

                        <table class="w-full text-left border-collapse">

                            <thead>
                                <tr class="text-[10px] uppercase tracking-widest text-(--text)/50 bg-(--bg3)/50 border-b border-(--text)/5">
                                    <th class="px-6 py-4 font-bold">Nom du fichier</th>
                                    <th class="px-6 py-4 font-bold">Espace de travail</th>
                                    <th class="px-6 py-4 font-bold">Type</th>
                                    <th class="px-6 py-4 font-bold">Taille</th>
                                    <th class="px-6 py-4 font-bold">Date d'ajout</th>
                                    <th class="px-6 py-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>

                            <tbody class="divide-y divide-(--text)/5">

                                <tr v-if="loadingFiles">
                                    <td colspan="6" class="px-6 py-12 text-center text-(--text)/40">
                                        <div class="flex items-center justify-center gap-2">
                                            <div class="w-4 h-4 rounded-full border-2 border-(--text)/20 border-t-(--primary) animate-spin"></div>
                                            Chargement des fichiers...
                                        </div>
                                    </td>
                                </tr>

                                <tr v-else-if="filteredFiles.length === 0">
                                    <td colspan="6" class="px-6 py-12 text-center text-(--text)/40 italic text-sm">
                                        Aucun fichier trouvé.
                                    </td>
                                </tr>

                                <tr 
                                    v-else
                                    v-for="file in filteredFiles" 
                                    :key="file.id"
                                    class="hover:bg-(--bg3)/50 transition-colors group"
                                >
                                    
                                    <td class="px-6 py-4">
                                        <div class="flex items-center gap-3">
                                            <div class="w-8 h-8 rounded-lg bg-(--bg) flex items-center justify-center text-(--text)/60 border border-(--text)/5">
                                                <i class="bi" :class="getFileIcon(file.mimeType)"></i>
                                            </div>
                                            <div class="flex flex-col">
                                                <span class="font-medium text-sm text-(--text) truncate max-w-[200px]" :title="file.originalName">{{ file.originalName }}</span>
                                                <span class="text-xs text-(--text)/40 font-mono">{{ file.id.substring(0,8) }}</span>
                                            </div>
                                        </div>
                                    </td>

                                    <td class="px-6 py-4">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs font-medium text-(--text)/70 px-2 py-1 bg-(--bg3) rounded-md border border-(--text)/5">
                                                {{ getSpaceName(file.workspaceId) }}
                                            </span>
                                        </div>
                                    </td>
                                    
                                    <td class="px-6 py-4">
                                        <span class="text-xs text-(--text)/60">{{ file.mimeType.split('/')[1] || file.mimeType }}</span>
                                    </td>

                                    <td class="px-6 py-4">
                                        <span class="text-xs font-mono text-(--text)/80">{{ formatBytes(Number(file.size)) }}</span>
                                    </td>

                                    <td class="px-6 py-4">
                                        <div class="flex flex-col">
                                            <span class="text-sm text-(--text)/80">{{ formatDate(file.createdAt) }}</span>
                                        </div>
                                    </td>

                                    <td class="px-6 py-4 text-right">
                                        <button 
                                            @click="askDelete(file)"
                                            class="p-2 rounded-xl text-(--text)/40 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            title="Supprimer ce fichier"
                                        >
                                            <i class="bi bi-trash3" />
                                        </button>
                                    </td>

                                </tr>

                            </tbody>

                        </table>

                    </div>

                </section>

            </div>

        </main>
        
        <ConfirmDelete 
            :show="!!fileToDelete"
            item-type="le fichier"
            :item-name="fileToDelete?.originalName"
            @cancel="fileToDelete = null"
            @confirm="deleteFile"
        />

    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { openedOrg } from '@/assets/var';
import CapacityGauge from '@/components/common/CapacityGauge.vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import type { StoredFile } from '@/types/types';

const toast = useToast();
const files = ref<StoredFile[]>([]);
const loadingFiles = ref(true);
const searchQuery = ref('');
const fileToDelete = ref<StoredFile | null>(null);

const fetchFiles = async () => {
    loadingFiles.value = true;
    try {
        const res = await sfetch(`/api/orgs/${openedOrg.value?.id}/files`);
        if (res.ok) {
            files.value = await res.json();
        } else {
            toast.error("Impossible de récupérer la liste des fichiers.");
        }
    } catch (err) {
        console.error(err);
        toast.error("Erreur lors de la récupération des fichiers.");
    } finally {
        loadingFiles.value = false;
    }
};

onMounted(() => {
    if (openedOrg.value) {
        fetchFiles();
    }
});

const filteredFiles = computed(() => {
    if (!searchQuery.value) return files.value;
    const q = searchQuery.value.toLowerCase();
    return files.value.filter(f => 
        f.originalName.toLowerCase().includes(q) || 
        f.id.toLowerCase().includes(q)
    );
});

const getSpaceName = (spaceId?: string | null) => {
    if (!spaceId) return 'Organisation';
    const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
    return space?.name || 'Espace inconnu';
};

const getFileIcon = (mime: string) => {
    if (mime.startsWith('image/')) return 'bi-file-image';
    if (mime.startsWith('video/')) return 'bi-file-play';
    if (mime.startsWith('audio/')) return 'bi-file-music';
    if (mime.includes('pdf')) return 'bi-file-pdf';
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return 'bi-file-zip';
    if (mime.includes('text/') || mime.includes('json') || mime.includes('xml')) return 'bi-file-text';
    return 'bi-file-earmark';
};

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateString: string | Date) => {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
    }).format(d);
};

const askDelete = (file: StoredFile) => {
    fileToDelete.value = file;
};

const deleteFile = async () => {
    if (!fileToDelete.value) return;
    try {
        const res = await sfetch(`/cdn/${fileToDelete.value.id}`, { method: 'DELETE' });
        if (res.ok) {
            toast.success("Fichier supprimé avec succès.");
            files.value = files.value.filter(f => f.id !== fileToDelete.value!.id);
            // Deduct size logically if needed, but a reload of the org or files would be better
            if (openedOrg.value?.stats?.totalStorageUsed !== undefined) {
                openedOrg.value.stats.totalStorageUsed = Number(openedOrg.value.stats.totalStorageUsed) - Number(fileToDelete.value.size);
            }
        } else {
            toast.error("Erreur lors de la suppression du fichier.");
        }
    } catch (err) {
        console.error(err);
        toast.error("Erreur inattendue.");
    } finally {
        fileToDelete.value = null;
    }
};

</script>
