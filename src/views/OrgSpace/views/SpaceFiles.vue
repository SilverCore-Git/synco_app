<template>

    <div class="flex flex-col h-full relative overflow-hidden w-full">

        <header
            class="h-14 flex items-center px-4 border-b border-white/5 bg-(--bg2) backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-2">
                <i class="bi bi-file-earmark text-xl text-(--text)/40" />
                <h2 class="font-bold text-(--text) tracking-wide lowercase">
                    Fichiers
                </h2>
            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text)/40">
                <button 
                    @click="showUsersBar = !showUsersBar"
                    class="hover:text-(--text) transition-colors"
                    :class="showUsersBar ? 'text-(--text)' : ''"
                >
                    <i class="bi bi-people-fill" />
                </button>
            </div>

        </header>

        <main class="flex-1 overflow-y-auto p-4 w-full h-full space-y-4">

            <div class="w-full grid grid-cols-1 2xl:grid-cols-2 gap-3">

                <div class="relative group w-full">
                    
                    <i class="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-(--text)/30 group-focus-within:text-(--primary) group-focus-within:scale-110 transition-all duration-300" />

                    <input 
                        v-model="searchQuery"
                        type="text" 
                        placeholder="Rechercher..."
                        class="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2.5 pl-11 pr-12 text-sm text-(--text) placeholder:text-(--text)/30 focus:outline-none focus:border-(--primary)/60 focus:bg-black/40 focus:ring-4 focus:ring-(--primary)/10 transition-all duration-300 shadow-inner"
                    >

                    <button 
                        v-if="searchQuery"
                        @click="searchQuery = ''"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-(--text)/40 hover:text-red-400 active:scale-90 transition-all"
                    >
                        <i class="bi bi-x-circle-fill text-base" />
                    </button>

                </div>

                <div class="gap-3 w-full grid grid-cols-2">

                    <button @click="showFolderNamePrompt = true" class="default gap-2">
                        <i class="bi bi-folder-plus" />
                        <span>Nouveau dossier</span>
                    </button>

                    <button @click="triggerFileSearch" class="primary gap-2">
                        <i class="bi bi-plus-circle" />
                        <span>Ajouter des fichiers</span>
                    </button>

                </div>

            </div>

            <section class="flex flex-col gap-4">
                
                <nav class="flex items-center justify-start px-1 text-sm overflow-x-auto no-scrollbar">

                    <button 
                        @click="currentFolderId = 'root'"
                        class="hover:text-(--primary) transition-colors shrink-0 text-[10px] font-black uppercase tracking-widest"
                        :class="currentFolderId === 'root' ? 'text-(--primary)' : 'text-(--text)/40'"
                    >
                        Racine
                    </button>
                        
                    <template v-for="crumb in breadcrumbs" :key="crumb.id">
                        <i class="bi bi-chevron-right text-[10px] text-(--text)/40" />
                        <button 
                            @click="currentFolderId = crumb.id"
                            class="hover:text-(--primary) transition-colors shrink-0 max-w-[120px] truncate text-[10px] font-black uppercase tracking-widest"
                            :class="currentFolderId === crumb.id ? 'text-(--primary)' : 'text-(--text)/40'"
                        >
                            {{ crumb.name }}
                        </button>
                    </template>

                </nav>

                <div v-if="isUploading" class="w-full bg-white/5 border border-white/10 rounded-lg p-3 mb-4 animate-in fade-in slide-in-from-top-2">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-[10px] font-black uppercase text-(--primary) tracking-widest">
                            {{ fileSendProgress == 100 ? 'Finalisation...' : 'Envoi en cours...' }}
                        </span>
                        <span class="text-[10px] font-bold text-(--text)/60">{{ fileSendProgress }}%</span>
                    </div>
                    <div class="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                        <div 
                            class="h-full bg-(--primary) transition-all duration-300 ease-out shadow-[0_0_10px_var(--primary)]"
                            :style="{ width: `${fileSendProgress}%` }"
                        ></div>
                    </div>
                </div>

                <div v-if="filteredFolders.length > 0" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    
                    <div 
                        v-for="folder in filteredFolders" 
                        :key="folder.id"
                        draggable="true"
                        @dragstart="handleFolderDragStart($event, folder.id)"
                        @click="currentFolderId = folder.id"
                        @dragover.prevent="draggedIntoFolderId = folder.id"
                        @dragleave="draggedIntoFolderId = null"
                        @drop="handleDrop($event, folder.id)"
                        class="group flex items-center gap-3 p-3 bg-(--bg2)/40 border border-white/5 rounded-xl transition-all cursor-pointer shadow-sm"
                        :class="[
                            draggedIntoFolderId === folder.id ? 'ring-2 ring-(--primary) bg-(--primary)/10 border-(--primary)/50' : 'hover:border-(--primary)/50 hover:bg-(--primary)/5',
                            draggedSourceFolderId === folder.id ? 'opacity-40 grayscale-50' : ''
                        ]"
                    >

                        <div class="w-10 h-10 flex items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-500 group-hover:scale-110 transition-transform">
                            <i class="bi bi-folder-fill text-xl" />
                        </div>

                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-(--text)/90 truncate">{{ folder.name }}</p>
                            <p class="text-[9px] text-(--text)/40 font-bold uppercase tracking-tighter">
                                {{ allFiles.filter(f => f.folderId === folder.id).length }} fichiers
                            </p>
                        </div>

                        <i class="bi bi-chevron-right text-(--text)/20 group-hover:text-(--primary) transition-colors" />

                    </div>

                </div>

                <div class="mt-4">

                    <h3 v-if="filteredFiles.length > 0" class="text-[10px] font-black uppercase tracking-[0.2em] text-(--text)/20 mb-4 px-1">
                        Fichiers dans ce dossier
                    </h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">

                        <div 
                            v-for="file in filteredFiles" 
                            :key="file.id"
                            draggable="true"
                            @dragstart="handleDragStart($event, file.id)"
                            @dragend="draggedFileId = null"
                            :class="draggedFileId === file.id ? 'opacity-40 scale-95' : ''"
                            class="
                                group relative flex flex-col bg-(--bg2)/40 
                                border border-white/5 rounded-2xl p-3 
                                hover:bg-(--bg3) hover:border-(--primary)/30 
                                transition-all cursor-pointer shadow-sm 
                                hover:shadow-xl hover:-translate-y-1
                            "
                        >
                        
                            <div 
                                class="
                                    relative aspect-square mb-3 rounded-xl bg-black/20 
                                    flex items-center justify-center overflow-hidden 
                                    border border-white/5 
                                "
                            >
                                
                                <i 
                                    :class="[getFileInfo(file).icon, getFileInfo(file).color]" 
                                    class="text-4xl transition-transform group-hover:scale-110 duration-300" 
                                />

                                <div class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-black uppercase text-white/70">
                                    {{ file.originalName.split('.').pop() }}
                                </div>

                                <div 
                                    class="
                                        absolute inset-0 bg-black/60 opacity-0 
                                        group-hover:opacity-100 transition-opacity 
                                        flex items-center justify-center gap-2
                                    "
                                >
                                
                                    <button class="glass" @click="downloadFile(file.id)">
                                        <i class="bi bi-download" />
                                    </button>

                                    <button class="glass">
                                        <i class="bi bi-three-dots-vertical" />
                                    </button>

                                </div>

                            </div>

                            <div class="flex flex-col gap-0.5 min-w-0">
                                <span class="text-xs font-semibold text-(--text)/90 truncate group-hover:text-(--primary) transition-colors" :title="file.originalName">
                                    {{ file.originalName }}
                                </span>
                                
                                <div class="flex items-center justify-between text-[9px] font-bold text-(--text)/30 uppercase tracking-tighter">
                                    <span>{{ formatSize(file.size) }}</span>
                                    <span v-if="file.createdAt">{{ formatDate(file.createdAt) }}</span>
                                </div>
                            </div>
                            
                        </div>

                    </div>

                    <div v-if="filteredFolders.length === 0 && filteredFiles.length === 0" class="py-20 flex flex-col items-center justify-center text-(--text)/20">
                        <i class="bi bi-folder2-open text-5xl mb-3" />
                        <p class="text-sm font-medium">Ce dossier est vide</p>
                    </div>
                </div>

            </section>

        </main>

        <div class="absolute left-5 bottom-5">
            <button 
                v-if="currentFolderId !== 'root'"
                class=" bg-(--primary-hover) hover:scale-110 active:scale-90 transition-all duration-200 p-2 w-12 h-12 rounded-full" 
                @click="goBack"
            >
                <i class="bi bi-arrow-left text-2xl " />
            </button>
        </div>

    </div>

    <input 
        type="file" 
        multiple 
        ref="fileInputRef" 
        class="hidden" 
        @change="(e) => handleFiles((e.target as any)!.files)"
    />

    <CreateNewFolder
        :show="showFolderNamePrompt"
        @close="showFolderNamePrompt = false"
        @save="createFolder"
    />

</template>

<script lang="ts" setup>

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import useSettingsItem from '@/composables/useSettingsItem';
import type { Folder, StoredFile } from '@/types/types';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile } from '@/assets/utils/downloadFile';
import { openedOrg } from '@/assets/var';
import CreateNewFolder from '../components/popup/CreateNewFolder.vue';
import { useToast } from '@/composables/useToast';
import { uploadFiles } from '@/assets/uploadFile';


const { Item: showUsersBar } = useSettingsItem('showUsersBar', true);
const route = useRoute();
const toast = useToast();

const searchQuery = ref<string>('');
const allFiles = ref<StoredFile[]>([]);
const allFolders = ref<Folder[]>([]);
const loading = ref<boolean>(true);
const currentFolderId = ref<string>('root');
const showFolderNamePrompt = ref<boolean>(false);

const fileSendProgress = ref<number>(0);
const isUploading = ref<boolean>(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const draggedFileId = ref<string | null>(null);
const draggedSourceFolderId = ref<string | null>(null);
const draggedIntoFolderId = ref<string | null>(null);


const filteredFiles = computed(() => {
    
    const query = searchQuery.value.toLowerCase().trim();

    if (!query) 
    {
        return allFiles.value.filter(file => {
            if (currentFolderId.value === 'root') return !file.folderId;
            return file.folderId === currentFolderId.value;
        });
    }
    
    let allowedFolderIds: string[] = [];
    
    if (currentFolderId.value !== 'root') 
    {
        const getChildFolderIds = (parentId: string): string[] => {
            const children = allFolders.value.filter(f => f.parentId === parentId);
            let ids = [parentId];
            children.forEach(child => {
                ids = [...ids, ...getChildFolderIds(child.id)];
            });
            return ids;
        };
        allowedFolderIds = getChildFolderIds(currentFolderId.value);
    }

    return allFiles.value.filter(file => {

        const nameMatches = file.originalName.toLowerCase().includes(query);
        
        if (currentFolderId.value === 'root') 
        {
            return nameMatches;
        } 
        else 
        {
            return nameMatches && file.folderId && allowedFolderIds.includes(file.folderId);
        }

    });

});


const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
    });
};


const filteredFolders = computed(() => {

    const query = searchQuery.value.toLowerCase().trim();
    
    let baseFolders = allFolders.value.filter(f => {
        if (currentFolderId.value === 'root') return !f.parentId;
        return f.parentId === currentFolderId.value;
    });

    if (!query) return baseFolders;

    return baseFolders.filter(f => f.name.toLowerCase().includes(query));

});

const breadcrumbs = computed(() => {

    const crumbs = [];
    let tempId = currentFolderId.value;

    while (tempId && tempId !== 'root')
    {
        const folder = allFolders.value.find(f => f.id === tempId);
        if (folder)
        {
            crumbs.unshift(folder);
            tempId = folder.parentId || 'root';
        } 
        else 
        {
            tempId = 'root';
        }
    }
    return crumbs;

});

const goBack = () => {
    
    if (!currentFolderId.value || currentFolderId.value === 'root') return;

    const currentFolder = allFolders.value.find(f => f.id === currentFolderId.value);

    if (currentFolder && currentFolder.parentId) 
    {
        currentFolderId.value = currentFolder.parentId;
    } 
    else 
    {
        currentFolderId.value = 'root';
    }

};

const createFolder = async (name: string) => {

    try {

        const res = await sfetch(`/api/spaces/${route.params.spaceId}/folders`, {
            method: 'POST',
            body: JSON.stringify({
                orgId: openedOrg.value?.id,
                name: name,
                parentId: currentFolderId.value === 'root' ? null : currentFolderId.value
            })
        });

        if (res.ok) 
        {
            const newFolder = await res.json();
            allFolders.value.push(newFolder);
        }

    } catch (e) {
        console.error("Erreur lors de la création du dossier:", e);
    } finally {
        showFolderNamePrompt.value = false;
    }

};



const moveFile = async (fileId: string, folderId: string) => {
    
    try {

        const res = await sfetch(`/api/spaces/${route.params.spaceId}/files/move`, {
            method: 'PATCH',
            body: JSON.stringify({ fileId, folderId })
        });

        if (res.ok) 
        {
            const fileIndex = allFiles.value.findIndex(f => f.id === fileId);
            if (fileIndex !== -1) {
                allFiles.value[fileIndex]!.folderId = folderId;
            }
        }
        
    } catch (e) {
        console.error("Erreur lors du déplacement du fichier:", e);
    }

};

const triggerFileSearch = () => fileInputRef.value?.click();

const handleFolderDragStart = (event: DragEvent, folderId: string) => {
    draggedSourceFolderId.value = folderId;
    if (event.dataTransfer) 
    {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('folderId', folderId);
        event.dataTransfer.setData('type', 'folder');
    }
};

const handleDragStart = (event: DragEvent, fileId: string) => {
    draggedFileId.value = fileId;
    if (event.dataTransfer) 
    {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('fileId', fileId);
        event.dataTransfer.setData('type', 'file');
    }
};

const handleDrop = async (event: DragEvent, targetFolderId: string) => {

    event.preventDefault();
    draggedIntoFolderId.value = null;
    
    const type = event.dataTransfer?.getData('type');
    const sourceId = type === 'file' 
        ? event.dataTransfer?.getData('fileId') 
        : event.dataTransfer?.getData('folderId');

    if (!sourceId || sourceId === targetFolderId) return;

    if (type === 'file') 
    {
        await moveFile(sourceId, targetFolderId);
    } 
    else
    {
        await moveFolder(sourceId, targetFolderId);
    }
    
    draggedFileId.value = null;
    draggedSourceFolderId.value = null;

};

const moveFolder = async (folderId: string, parentId: string) => {

    try {

        const res = await sfetch(`/api/spaces/${route.params.spaceId}/folders/move`, {
            method: 'PATCH',
            body: JSON.stringify({ folderId, parentId })
        });

        if (res.ok) 
        {
            const index = allFolders.value.findIndex(f => f.id === folderId);
            if (index !== -1) {
                allFolders.value[index]!.parentId = parentId;
            }
        }

    } catch (e) {
        console.error("Erreur déplacement dossier:", e);
    }

};


const handleFiles = async (files: FileList | File[]) => {

    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;

    const MAX_SIZE = 10 * 1024 * 1024 * 1024;
    const oversized = selectedFiles.some(f => f.size > MAX_SIZE);
    if (oversized) 
    {
        toast.show("Un ou plusieurs fichiers dépassent la limite de 2Go", "error");
        return;
    }

    try {

        isUploading.value = true;
        fileSendProgress.value = 0;

        const uploadedFiles = await uploadFiles(
            selectedFiles,
            {
                workspaceId: String(route.params.spaceId),
                folderId: currentFolderId.value === 'root' ? undefined : currentFolderId.value,
            },
            (percent: number) => {
                fileSendProgress.value = percent;
            }
        );

        if (uploadedFiles && Array.isArray(uploadedFiles)) 
        {
            allFiles.value.push(...uploadedFiles);
            toast.show(`${uploadedFiles.length} fichier(s) ajouté(s)`, "success");
        }

    } catch (e) {
        console.error("Upload Error:", e);
        toast.show("Erreur lors de l'envoi des fichiers", "error");
    } finally {
        isUploading.value = false;
        fileSendProgress.value = 0;
        if (fileInputRef.value) fileInputRef.value.value = '';
    }
};


onMounted(async() => {
    try {
        const res = await sfetch(`/api/spaces/${route.params.spaceId}/files`);
        const data = await res.json();
        allFiles.value = data.files || [];
        allFolders.value = data.folders || [];
    } catch (e) {
        console.error("Erreur:", e);
    } finally {
        loading.value = false;
    }
});

</script>