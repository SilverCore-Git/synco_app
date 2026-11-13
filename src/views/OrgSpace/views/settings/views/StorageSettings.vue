<template>
    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">

        <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
            
            <div class="max-w-5xl mx-auto space-y-12">
                
                <div class="mb-8">
                    <h3 class="text-2xl font-black text-(--text) mb-2">Stockage & Utilisation</h3>
                    <p class="text-sm text-(--text2)">Consultez l'espace de stockage consommé par votre organisation et gérez les fichiers.</p>
                </div>

                <section class="flex flex-col gap-8">

                    <!-- Jauge globale -->
                    <div class="w-full">
                        <CapacityGauge 
                            :used="Number((openedOrg as any)?.stats?.totalStorageUsed || 0)"
                            :max="Number(openedOrg?.maxStorage || 0)"
                            unit=""
                            icon="bi-hdd-network"
                            title="Stockage total"
                            :isBytes="true"
                        />
                    </div>

                    <!-- Détails par espace de travail -->
                    <div class="bg-(--bg2) border border-(--border-color) rounded-2xl p-6 shadow-sm flex flex-col gap-4 max-h-[420px]">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h4 class="text-sm font-bold text-(--text)">Détails par Espace de travail</h4>
                                <p class="text-xs text-(--text2) mt-1">Répartition de l'utilisation du stockage.</p>
                            </div>
                            <div class="relative w-full sm:w-60 group">
                                <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs group-focus-within:text-(--primary) transition-colors" />
                                <input
                                    v-model="spaceSearch"
                                    type="text"
                                    placeholder="Rechercher un espace..."
                                    class="w-full bg-(--bg) border border-(--border-color) rounded-xl pl-9 pr-3 py-2 text-xs text-(--text) focus:outline-none focus:border-(--primary) transition-all placeholder:text-(--text2)"
                                />
                            </div>
                        </div>
                        <div class="overflow-y-auto min-h-0 pr-2 space-y-2 mt-2 custom-scrollbar">
                            <div v-if="filteredSpaces.length" v-for="space in filteredSpaces" :key="space.id" class="flex items-center justify-between p-3 bg-(--bg) border border-(--border-color) rounded-xl group hover:border-(--primary)/50 transition-colors">
                                <div class="flex items-center gap-3 overflow-hidden">
                                    <div class="w-8 h-8 rounded-lg bg-(--primary)/10 text-(--primary) flex items-center justify-center shrink-0 overflow-hidden">
                                        <img v-if="space.logo && space.logo.includes('data:')" :src="space.logo" :alt="space.name" class="w-full h-full object-cover" />
                                        <i v-else-if="space.logo" class="bi" :class="space.logo"></i>
                                        <span v-else class="text-[11px] font-black">{{ space.name.substring(0, 2).toUpperCase() }}</span>
                                    </div>
                                    <span class="font-medium text-sm truncate group-hover:text-(--primary) transition-colors">{{ space.name }}</span>
                                </div>
                                <span class="font-mono text-xs font-bold bg-(--bg3) px-2 py-1 rounded-md border border-(--border-color) shrink-0 whitespace-nowrap">
                                    {{ formatBytes(Number((space as any).stats?.storageUsed || 0)) }}
                                </span>
                            </div>
                            <div v-else class="text-sm text-(--text2) italic mt-2 p-6 text-center border border-dashed border-(--border-color) rounded-xl bg-(--bg)/50">
                                {{ spaceSearch ? 'Aucun espace ne correspond à la recherche.' : "Aucun espace de travail n'utilise de stockage." }}
                            </div>
                        </div>
                    </div>

                </section>

                <section class="bg-(--bg2) rounded-2xl border border-(--border-color) shadow-sm overflow-hidden flex flex-col">
                    
                    <div class="p-6 border-b border-(--border-color) flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-(--bg3)/20">

                        <h3 class="text-lg font-bold text-(--text) flex items-center gap-3">
                            Fichiers 
                            <span class="bg-(--primary)/10 text-(--primary) py-1 px-2.5 rounded-lg text-xs">
                                {{ filteredFiles.length }}
                            </span>
                        </h3>

                        <div class="relative w-full sm:w-80 group">
                            <i class="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-(--text2) group-focus-within:text-(--primary) transition-colors" />
                            <input 
                                v-model="searchQuery"
                                type="text" 
                                placeholder="Rechercher un fichier..."
                                class="w-full bg-(--bg) border border-(--border-color) rounded-xl pl-11 pr-4 py-2.5 text-sm text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner placeholder:text-(--text2)"
                            />
                        </div>

                    </div>

                    <div class="px-6 py-4 border-b border-(--border-color) flex flex-wrap items-center gap-3">
                        <select v-model="typeFilter" class="bg-(--bg) border border-(--border-color) rounded-xl px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)">
                            <option value="all">Tous les types</option>
                            <option v-for="t in fileTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
                        </select>
                        <select v-model="spaceFilter" class="bg-(--bg) border border-(--border-color) rounded-xl px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)">
                            <option value="all">Tous les espaces</option>
                            <option value="__org__">Organisation</option>
                            <option v-for="s in openedOrg?.spaces || []" :key="s.id" :value="s.id">{{ s.name }}</option>
                        </select>
                        <select v-model="sortOrder" class="bg-(--bg) border border-(--border-color) rounded-xl px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)">
                            <option value="date">Plus récents</option>
                            <option value="size-desc">Taille décroissante</option>
                            <option value="size-asc">Taille croissante</option>
                        </select>
                        <button
                            v-if="typeFilter !== 'all' || spaceFilter !== 'all' || sortOrder !== 'date' || searchQuery"
                            @click="resetFilters"
                            class="text-xs text-(--text2) hover:text-(--primary) transition-colors"
                        >
                            Réinitialiser
                        </button>
                    </div>

                    <div class="overflow-auto max-h-[480px] custom-scrollbar">

                        <table class="w-full text-left border-collapse">

                            <thead>
                                <tr class="text-[10px] uppercase tracking-widest text-(--text2) bg-(--bg2) border-b border-(--border-color) sticky top-0 z-10">
                                    <th class="px-6 py-4 font-bold">Fichier</th>
                                    <th class="px-6 py-4 font-bold">Espace de travail</th>
                                    <th class="px-6 py-4 font-bold">Type</th>
                                    <th class="px-6 py-4 font-bold cursor-pointer select-none hover:text-(--primary)" @click="toggleSizeSort">
                                        Taille
                                        <i v-if="sortOrder !== 'date'" class="bi ml-1" :class="sortOrder === 'size-asc' ? 'bi-arrow-up' : 'bi-arrow-down'"></i>
                                    </th>
                                    <th class="px-6 py-4 font-bold">Ajouté le</th>
                                    <th class="px-6 py-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>

                            <tbody class="divide-y divide-(--border-color)">

                                <tr v-if="loadingFiles">
                                    <td colspan="6" class="px-6 py-12 text-center text-(--text2)">
                                        <div class="flex items-center justify-center gap-3">
                                            <div class="w-5 h-5 rounded-full border-2 border-(--text)/20 border-t-(--primary) animate-spin"></div>
                                            <span class="text-sm font-medium">Chargement des fichiers...</span>
                                        </div>
                                    </td>
                                </tr>

                                <tr v-else-if="filteredFiles.length === 0">
                                    <td colspan="6" class="px-6 py-16 text-center text-(--text2)">
                                        <div class="flex flex-col items-center justify-center gap-3">
                                            <i class="bi bi-inboxes text-4xl text-(--text2)"></i>
                                            <span class="text-sm font-medium">Aucun fichier trouvé.</span>
                                        </div>
                                    </td>
                                </tr>

                                <tr 
                                    v-else
                                    v-for="file in filteredFiles" 
                                    :key="file.id"
                                    class="group hover:bg-(--bg)/40 transition-colors"
                                >
                                    
                                    <td class="px-6 py-4">
                                        <div class="flex items-center gap-3 max-w-xs">
                                            <div class="w-10 h-10 rounded-xl bg-(--bg) flex items-center justify-center text-lg text-(--primary) border border-(--border-color) shadow-sm shrink-0">
                                                <i class="bi" :class="getFileIcon(file.mimeType)"></i>
                                            </div>
                                            <div class="flex flex-col overflow-hidden">
                                                <span class="font-bold text-sm text-(--text) truncate group-hover:text-(--primary) transition-colors" :title="file.originalName">{{ file.originalName }}</span>
                                                <span class="text-[10px] text-(--text2) font-mono mt-0.5">{{ file.id.substring(0,8) }}</span>
                                            </div>
                                        </div>
                                    </td>

                                    <td class="px-6 py-4">
                                        <span class="text-xs font-medium text-(--text) px-2.5 py-1 bg-(--bg) rounded-md border border-(--border-color)">
                                            {{ getSpaceName(file.workspaceId) }}
                                        </span>
                                    </td>
                                    
                                    <td class="px-6 py-4">
                                        <span class="text-[11px] font-mono font-bold text-(--text2) bg-(--bg3) px-2 py-1 rounded border border-(--text)/5 uppercase">{{ (file.mimeType.split('/')[1] || file.mimeType).substring(0, 10) }}</span>
                                    </td>

                                    <td class="px-6 py-4">
                                        <span class="text-xs font-mono font-bold text-(--text)">{{ formatBytes(Number(file.size)) }}</span>
                                    </td>

                                    <td class="px-6 py-4">
                                        <span class="text-xs text-(--text2)">{{ formatDate(file.createdAt) }}</span>
                                    </td>

                                    <td class="px-6 py-4 text-right">
                                        <button 
                                            @click="askDelete(file)"
                                            class="p-2 rounded-xl text-(--text2) hover:text-white hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 shadow-sm"
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
            :item-name="fileToDelete?.originalName || ''"
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
            toast.show("Impossible de récupérer la liste des fichiers.", "error");
        }
    } catch (err) {
        console.error(err);
        toast.show("Erreur lors de la récupération des fichiers.", "error");
    } finally {
        loadingFiles.value = false;
    }
};

onMounted(() => {
    if (openedOrg.value) {
        fetchFiles();
    }
});

const spaceSearch = ref('');
const filteredSpaces = computed(() => {
    const q = spaceSearch.value.trim().toLowerCase();
    const spaces = openedOrg.value?.spaces || [];
    return q ? spaces.filter(s => s.name.toLowerCase().includes(q)) : spaces;
});

const typeFilter = ref('all');
const spaceFilter = ref('all');
const sortOrder = ref<'date' | 'size-asc' | 'size-desc'>('date');

const fileTypes = [
    { value: 'image', label: 'Images' },
    { value: 'video', label: 'Vidéos' },
    { value: 'audio', label: 'Audio' },
    { value: 'pdf', label: 'PDF' },
    { value: 'archive', label: 'Archives' },
    { value: 'text', label: 'Texte' },
    { value: 'other', label: 'Autres' },
];

const getFileType = (mime: string) => {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return 'archive';
    if (mime.includes('text/') || mime.includes('json') || mime.includes('xml')) return 'text';
    return 'other';
};

const toggleSizeSort = () => {
    sortOrder.value = sortOrder.value === 'size-desc' ? 'size-asc' : 'size-desc';
};

const resetFilters = () => {
    typeFilter.value = 'all';
    spaceFilter.value = 'all';
    sortOrder.value = 'date';
    searchQuery.value = '';
};

const filteredFiles = computed(() => {
    const q = searchQuery.value.toLowerCase();
    const result = files.value.filter(f => {
        if (q && !f.originalName.toLowerCase().includes(q) && !f.id.toLowerCase().includes(q)) return false;
        if (typeFilter.value !== 'all' && getFileType(f.mimeType) !== typeFilter.value) return false;
        if (spaceFilter.value === '__org__') return !f.workspaceId;
        if (spaceFilter.value !== 'all') return f.workspaceId === spaceFilter.value;
        return true;
    });
    if (sortOrder.value === 'size-asc') return result.sort((a, b) => Number(a.size) - Number(b.size));
    if (sortOrder.value === 'size-desc') return result.sort((a, b) => Number(b.size) - Number(a.size));
    return result;
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
        const res = await sfetch(`/api/cdn/${fileToDelete.value.id}`, { method: 'DELETE' });
        if (res.ok) {
            toast.show("Fichier supprimé avec succès.", "success");
            files.value = files.value.filter(f => f.id !== fileToDelete.value!.id);
            if ((openedOrg.value as any)?.stats?.totalStorageUsed !== undefined) {
                (openedOrg.value as any).stats.totalStorageUsed = Number((openedOrg.value as any).stats.totalStorageUsed) - Number(fileToDelete.value.size);
            }
        } else {
            toast.show("Erreur lors de la suppression du fichier.", "error");
        }
    } catch (err) {
        console.error(err);
        toast.show("Erreur inattendue.", "error");
    } finally {
        fileToDelete.value = null;
    }
};

</script>
