<template>

    <div 
        class="flex flex-col h-full relative overflow-hidden w-full"
        @dragenter="handleExternalDragEnter"
        @dragover="handleExternalDragOver"
        @dragleave="handleExternalDragLeave"
        @drop="handleExternalDrop"
    >

        <header
            class="h-14 flex items-center px-4 border-b border-(--border-color) bg-(--bg2) backdrop-blur-md z-10 w-full shrink-0"
        >

            <div class="flex items-center gap-2">
                <MobileBackBtn />
                <i class="bi bi-folder-fill text-2xl text-(--text2)" />
                <h2 class="font-bold text-(--text) tracking-wide lowercase">
                    Fichiers
                </h2>
            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text2)">
                <button 
                    @click="showVerifyWatermark = true"
                    class="hover:text-(--primary) transition-colors"
                    title="Inspecter un fichier"
                >
                    <i class="bi bi-shield-check" />
                </button>
                <button 
                    @click="showPermissions = true"
                    class="hover:text-(--primary) transition-colors"
                    title="Permissions"
                >
                    <i class="bi bi-shield-lock" />
                </button>
                <button 
                    @click="showUsersBar = !showUsersBar"
                    class="hover:text-(--text) transition-colors"
                    :class="showUsersBar ? 'text-(--text)' : ''"
                    title="Membres"
                >
                    <i class="bi bi-people-fill" />
                </button>
            </div>

        </header>

        <main class="flex-1 overflow-y-auto p-4 w-full h-full space-y-4">

            <div class="w-full grid grid-cols-1 2xl:grid-cols-2 gap-3">

                <div class="relative group w-full">
                    
                    <i class="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-(--text2) group-focus-within:text-(--primary) group-focus-within:scale-110 transition-all duration-300" />

                    <input 
                        v-model="searchQuery"
                        type="text" 
                        placeholder="Rechercher..."
                        class="w-full bg-(--text)/[0.03] border border-(--text)/10 rounded-xl py-2.5 pl-11 pr-12 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/60 focus:bg-black/40 focus:ring-4 focus:ring-(--primary)/10 transition-all duration-300 shadow-inner"
                    >

                    <button 
                        v-if="searchQuery"
                        @click="searchQuery = ''"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-(--text2) hover:text-red-400 active:scale-90 transition-all"
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

            <section class="flex flex-col gap-4 relative min-h-[50vh]" @contextmenu.prevent="handleEmptyContextMenu">
                
                <div v-if="loading" class="w-full flex flex-col gap-8 animate-pulse">
                    
                    <div class="flex items-center gap-2 px-1">
                        <div class="w-12 h-3 bg-(--text)/10 rounded-full"></div>
                        <div class="w-3 h-3 bg-(--text)/10 rounded-full"></div>
                        <div class="w-20 h-3 bg-(--text)/10 rounded-full"></div>
                    </div>

                    <div class="grid grid-cols-1 gap-3">
                        <div v-for="i in 2" :key="'sf-'+i" class="w-full h-[72px] bg-(--text)/5 rounded-xl border border-(--border-color)"></div>
                    </div>

                    <div class="mt-4">
                        <div class="w-40 h-3 bg-(--text)/10 rounded-full mb-4 mx-1"></div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
                            <div v-for="i in 12" :key="'sk-'+i" class="w-full aspect-square bg-(--text)/5 rounded-2xl border border-(--border-color)"></div>
                        </div>
                    </div>

                </div>

                <template v-else>
                <nav class="flex items-center justify-start px-1 text-sm overflow-x-auto no-scrollbar">

                    <button 
                        @click="currentFolderId = 'root'"
                        @drop="handleDrop($event, 'root')"
                        @dragstart="handleFolderDragStart($event, 'root')"
                        @dragover.prevent="draggedIntoFolderId = 'root'"
                        @dragleave="draggedIntoFolderId = null"
                        class="hover:text-(--primary) transition-colors shrink-0 text-[10px] font-black uppercase tracking-widest"
                        :class="currentFolderId === 'root' || draggedIntoFolderId === 'root' ? 'text-(--primary)' : 'text-(--text2)'"
                    >
                        Racine
                    </button>
                        
                    <template 
                        v-for="crumb in breadcrumbs" 
                        :key="crumb.id"
                    >
                        <i class="bi bi-chevron-right text-[10px] text-(--text2)" />
                        <button 
                            @click="currentFolderId = crumb.id"
                            @drop="handleDrop($event, crumb.id)"
                            @dragstart="handleFolderDragStart($event, crumb.id)"
                            @dragover.prevent="draggedIntoFolderId = crumb.id"
                            @dragleave="draggedIntoFolderId = null"
                            class="
                                hover:text-(--primary) transition-colors shrink-0 
                                max-w-30 truncate text-[10px] font-black 
                                uppercase tracking-widest
                            "
                            :class="currentFolderId === crumb.id || draggedIntoFolderId === crumb.id ? 'text-(--primary)' : 'text-(--text2)'"
                        >
                            {{ crumb.name }}
                        </button>
                    </template>

                </nav>

                <div v-if="isUploading" class="w-full bg-(--text)/5 border border-(--text)/10 rounded-lg p-3 mb-4 animate-in fade-in slide-in-from-top-2">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-[10px] font-black uppercase text-(--primary) tracking-widest">
                            {{ fileSendProgress == 100 ? 'Finalisation...' : 'Envoi en cours...' }}
                        </span>
                        <span class="text-[10px] font-bold text-(--text2)">{{ fileSendProgress }}%</span>
                    </div>
                    <div class="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                        <div 
                            class="h-full bg-(--primary) transition-all duration-300 ease-out shadow-[0_0_10px_var(--primary)]"
                            :style="{ width: `${fileSendProgress}%` }"
                        ></div>
                    </div>
                </div>

                <div
                    v-if="filteredFolders.length > 0 || filteredFiles.length > 0"
                    class="grid grid-cols-1 gap-3"
                >

                <div
                    v-for="folder in filteredFolders"
                    :key="folder.id"
                    draggable="true"
                    @dragstart="handleFolderDragStart($event, folder.id)"
                    @dragend="handleDragEnd"
                    @dragover.prevent="draggedIntoFolderId = folder.id"
                    @dragleave="draggedIntoFolderId = null"
                    @drop="handleDrop($event, folder.id)"
                    @click="onFolderCardClick($event, folder.id)"
                >

                    <FolderCard
                        :folder="folder"
                        :draggedIntoFolderId="draggedIntoFolderId"
                        :draggedSourceFolderId="draggedSourceFolderId"
                        :allFiles="allFiles"
                        :isSelected="selectedItems.has(folder.id)"
                        :isSelectionMode="selectedItems.size > 0"
                        @toggle-select="toggleSelection(folder.id)"
                        @range-select="selectRangeTo(folder.id)"
                        @show-permissions="openFolderPermissions(folder)"
                        @request-delete="requestDeleteFolder"
                    />

                </div>

                <FileCard
                    v-for="file in filteredFiles"
                    :id="'file-' + file.id"
                    :key="file.id"
                    draggable="true"
                    :file="file"
                    :draggedFileId="draggedFileId"
                    :isSelected="selectedItems.has(file.id)"
                    :isSelectionMode="selectedItems.size > 0"
                    @toggle-select="toggleSelection(file.id)"
                    @range-select="selectRangeTo(file.id)"
                    @dragstart="handleDragStart($event, file.id)"
                    @dragend="handleDragEnd"
                    @file-deleted="handleFileDeleted"
                    @request-delete="requestDeleteFile"
                    @show-file-info="handleShowFileInfo"
                    @file-watermarked="handleFileWatermarked"
                    @show-permissions="openFilePermissions(file)"
                />

                </div>

                <div v-if="filteredFolders.length === 0 && filteredFiles.length === 0" class="py-20 flex flex-col items-center justify-center text-(--text2)">
                    <i class="bi bi-folder2-open text-5xl mb-3" />
                    <p class="text-sm font-medium">Ce dossier est vide</p>
                </div>

                </template>

            </section>

        </main>

        <div class="absolute left-5 bottom-5 z-20">
            <button 
                v-if="currentFolderId !== 'root'"
                class=" bg-(--primary-hover) transition-all duration-200 p-2 w-12 h-12 rounded-full" 
                :class="draggedIntoFolderId === 'parent' ? 'scale-125 bg-(--primary) ring-4 ring-green-500/50' : 'hover:scale-110 active:scale-90'"
                @click="goBack"
                @drop="handleDropToParent($event)"
                @dragover.prevent="draggedIntoFolderId = 'parent'"
                @dragleave="draggedIntoFolderId = null"
            >
                <i class="bi bi-arrow-left text-2xl " />
            </button>
        </div>

        <!-- Bulk Action Bar -->
        <transition
            enter-active-class="transition duration-300 ease-out"
            enter-from-class="transform translate-y-full opacity-0"
            enter-to-class="transform translate-y-0 opacity-100"
            leave-active-class="transition duration-200 ease-in"
            leave-from-class="transform translate-y-0 opacity-100"
            leave-to-class="transform translate-y-full opacity-0"
        >
            <div v-if="selectedItems.size > 0" class="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 bg-(--bg2) border border-(--border-color) rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-4">
                <span class="text-sm font-bold text-(--text) whitespace-nowrap">{{ selectedItems.size }} sélectionné(s)</span>
                
                <div class="h-6 w-px bg-(--border-color)"></div>
                
                <button 
                    @click="downloadSelected" 
                    class="p-2 rounded-lg hover:bg-(--primary)/10 text-(--text) hover:text-(--primary) transition-colors flex items-center gap-2 text-sm font-semibold"
                >
                    <i class="bi bi-download"></i>
                    <span>Télécharger</span>
                </button>

                <button 
                    @click="requestDeleteSelection" 
                    class="p-2 rounded-lg hover:bg-red-500/10 text-(--text) hover:text-red-500 transition-colors flex items-center gap-2 text-sm font-semibold"
                >
                    <i class="bi bi-trash"></i>
                    <span>Supprimer</span>
                </button>

                <div class="h-6 w-px bg-(--border-color)"></div>

                <button 
                    @click="clearSelection" 
                    class="p-2 rounded-lg hover:bg-(--text)/5 text-(--text2) hover:text-(--text) transition-colors"
                >
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </transition>

        <!-- Overlay de dépôt : fichiers glissés depuis l'ordinateur.
             pointer-events-none pour que les dossiers/fil d'Ariane situés
             dessous restent des cibles de dépôt valides. -->
        <div 
            v-if="isExternalDrag"
            class="
                absolute inset-0 z-40 bg-(--primary)/10 backdrop-blur-[2px]
                border-2 border-dashed border-(--primary) rounded-xl 
                flex flex-col items-center justify-center gap-2 
                pointer-events-none
            "
        >
            <i class="bi bi-cloud-arrow-up text-5xl text-(--primary)" />
            <span class="text-(--primary) font-bold">
                Relâchez pour envoyer dans
            </span>
            <span class="text-[10px] font-black uppercase tracking-widest text-(--text2) max-w-xs truncate">
                {{ currentFolderName }}
            </span>
        </div>

    </div>

    <!-- Dropdown for empty space right click -->
    <DropDown ref="emptySpaceDropdown" align="mouse">
        <template #content>
            <button 
                @click.stop.prevent="openCreateFolderPrompt"
                class="dropdown-item-annimate dropdown-item-style gap-2"
            >
                <i class="bi bi-folder-plus" />
                Nouveau dossier
            </button>
            <button 
                @click.stop.prevent="openFileSearchPrompt"
                class="dropdown-item-annimate dropdown-item-style gap-2"
            >
                <i class="bi bi-file-earmark-plus" />
                Ajouter des fichiers
            </button>
        </template>
    </DropDown>

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

    <ConfirmDelete
        :show="showDeletePopup"
        :itemName="deleteTarget?.type === 'selection' ? selectedItems.size + ' élément(s)' : 'cet élément'"
        :itemType="deleteTarget?.type === 'selection' ? 'ces éléments' : 'cet élément'"
        :checkbox="false"
        :checktext="false"
        :loading="isDeleting"
        @confirm="executeDeletion"
        @cancel="showDeletePopup = false"
    />

    <!-- File Info Modal -->
    <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
    >
        <div v-if="showFileInfoModal && selectedFileForInfo" class="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <div class="bg-(--bg) rounded-2xl border border-(--text)/10 shadow-2xl max-w-md w-full p-6 relative" @click.stop>
                <button @click="showFileInfoModal = false" class="absolute top-4 right-4 text-(--text2) hover:text-(--text) transition-colors">
                    <i class="bi bi-x-lg text-xl" />
                </button>
                
                <h2 class="text-xl font-bold text-(--text) mb-6">
                    <i class="bi bi-file-earmark mr-2" />
                    Informations du fichier
                </h2>
                
                <div class="space-y-4">
                    <div class="flex items-center gap-3">
                        <i class="bi bi-file-text text-(--text2) text-lg" />
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-widest text-(--text2)">Nom</p>
                            <p class="font-semibold text-(--text)">{{ selectedFileForInfo.originalName }}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        <i class="bi bi-filetype-pdf text-(--text2) text-lg" v-if="selectedFileForInfo.mimeType.includes('pdf')" />
                        <i class="bi bi-filetype-doc text-(--text2) text-lg" v-else-if="selectedFileForInfo.mimeType.includes('word')" />
                        <i class="bi bi-filetype-xls text-(--text2) text-lg" v-else-if="selectedFileForInfo.mimeType.includes('excel') || selectedFileForInfo.mimeType.includes('spreadsheet')" />
                        <i class="bi bi-filetype-ppt text-(--text2) text-lg" v-else-if="selectedFileForInfo.mimeType.includes('powerpoint')" />
                        <i class="bi bi-filetype-img text-(--text2) text-lg" v-else-if="selectedFileForInfo.mimeType.includes('image')" />
                        <i class="bi bi-filetype-code text-(--text2) text-lg" v-else-if="selectedFileForInfo.mimeType.includes('text') || selectedFileForInfo.mimeType.includes('code')" />
                        <i class="bi bi-file-earmark text-(--text2) text-lg" v-else />
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-widest text-(--text2)">Type</p>
                            <p class="font-semibold text-(--text)">{{ selectedFileForInfo.mimeType }}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        <i class="bi bi-hdd text-(--text2) text-lg" />
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-widest text-(--text2)">Taille</p>
                            <p class="font-semibold text-(--text)">{{ formatFileSize(selectedFileForInfo.size) }}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        <i class="bi bi-calendar text-(--text2) text-lg" />
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-widest text-(--text2)">Date de création</p>
                            <p class="font-semibold text-(--text)">{{ formatDate(selectedFileForInfo.createdAt) }}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3">
                        <i class="bi bi-shield-check text-(--text2) text-lg" />
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-widest text-(--text2)">Chiffrement</p>
                            <p class="font-semibold text-(--text)">{{ selectedFileForInfo.isEncrypted ? 'Oui' : 'Non' }}</p>
                        </div>
                    </div>
                    
                    <div v-if="selectedFileForInfo.folderId" class="flex items-center gap-3">
                        <i class="bi bi-folder text-(--text2) text-lg" />
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-widest text-(--text2)">Dossier</p>
                            <p class="font-semibold text-(--text)">Dans un dossier</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </transition>

    <Transition name="pop">
        <div v-if="isDragging" 
             class="fixed bottom-8 right-8 w-16 h-16 bg-red-500/90 text-white rounded-full flex items-center justify-center shadow-2xl z-[100] border-4 transition-all duration-500"
             :class="[
                isDeleting ? 'scale-0 translate-y-10 opacity-0 rotate-[360deg]' : 'scale-100',
                isHoveringTrash && !isDeleting ? 'border-red-300 scale-125 shadow-[0_0_40px_var(--glow-danger-strong)]' : 'border-transparent'
             ]"
             @dragover.prevent="isHoveringTrash = true"
             @dragleave.prevent="isHoveringTrash = false"
             @drop="onDropToTrash">
             
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 transition-transform" :class="isDeleting ? 'scale-50' : ''">
                <g class="transition-all duration-300" style="transform-origin: 21px 6px;" :class="isHoveringTrash && !isDeleting ? 'rotate-[40deg]' : ''">
                    <path d="M3 6h18"></path>
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </g>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>

        </div>
    </Transition>

    <VerifyWatermark 
        :is-open="showVerifyWatermark" 
        @close="showVerifyWatermark = false" 
    />

    <SpacePermissionsModal
        :show="showPermissions"
        :space-id="String(route.params.spaceId)"
        :space-name="'Fichiers'"
        @close="showPermissions = false"
    />

    <ManageAccessModal
        v-if="selectedFolderForPerms"
        :show="showFolderPermissions"
        item-type="folder"
        :item-id="selectedFolderForPerms.id"
        :item-name="selectedFolderForPerms.name"
        :space-id="String(route.params.spaceId)"
        @close="showFolderPermissions = false"
    />

    <ManageAccessModal
        v-if="selectedFileForPerms"
        :show="showFilePermissions"
        item-type="file"
        :item-id="selectedFileForPerms.id"
        :item-name="selectedFileForPerms.originalName"
        :space-id="String(route.params.spaceId)"
        @close="showFilePermissions = false"
    />

    <FileViewer
        v-if="selectedFileForViewer"
        :file="selectedFileForViewer"
        :isOpen="true"
        @close="selectedFileForViewer = null"
        @deleted="selectedFileForViewer = null"
    />

</template>

<script lang="ts" setup>

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import { useUsersBar } from '@/composables/useUsersBar';
import { openedOrg } from '@/assets/var';
import CreateNewFolder from '../components/popup/CreateNewFolder.vue';
import VerifyWatermark from '../components/popup/VerifyWatermark.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { useToast } from '@/composables/useToast';
import useWSocket from '@/composables/useWSocket';
import { downloadFile } from '@/assets/utils/downloadFile';
import DropDown from '@/components/DropDown.vue';

import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import { uploadFiles } from '@/assets/uploadFile';
import FolderCard from '../components/SpaceFiles/FolderCard.vue';
import FileCard from '../components/SpaceFiles/FileCard.vue';
import FileViewer from '../components/popup/FileViewer.vue';
import type { StoredFile, Folder } from '@/types/types';
import { extractTextFromPDF } from '@/assets/utils/pdfExtractor';
import VectorWorker from '@/workers/semantic.worker?worker';
import { localSearchDB } from '@/services/LocalSearchVectorDB';
import SpacePermissionsModal from '@/components/permissions/SpacePermissionsModal.vue';
import ManageAccessModal from '@/components/permissions/ManageAccessModal.vue';


const { showUsersBar } = useUsersBar();
const route = useRoute();
const router = useRouter();
const toast = useToast();

const searchQuery = ref<string>('');

const selectedItems = ref<Set<string>>(new Set());

// Dernier élément cliqué : point de départ des sélections par plage (MAJ+clic).
const selectionAnchorId = ref<string | null>(null);
// Sélection telle qu'elle était avant la plage en cours, pour qu'un second
// MAJ+clic remplace la plage précédente au lieu de s'y ajouter (comme un
// explorateur de fichiers classique).
let selectionBeforeRange: Set<string> | null = null;

const toggleSelection = (id: string) => {
    const newSet = new Set(selectedItems.value);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    selectedItems.value = newSet;
    selectionAnchorId.value = id;
    selectionBeforeRange = null;
};

// Ordre d'affichage de la grille : dossiers puis fichiers. C'est lui qui définit
// ce que "tous ceux entre les deux" veut dire pour MAJ+clic.
const visibleItemIds = computed<string[]>(() => [
    ...filteredFolders.value.map(f => f.id),
    ...filteredFiles.value.map(f => f.id),
]);

const selectRangeTo = (id: string) => {

    const ids = visibleItemIds.value;
    const toIndex = ids.indexOf(id);
    if (toIndex === -1) return;

    const fromIndex = selectionAnchorId.value ? ids.indexOf(selectionAnchorId.value) : -1;

    // Pas d'ancre (rien de sélectionné, ou ancre plus visible) : MAJ+clic se
    // comporte comme un simple clic de sélection et pose l'ancre.
    if (fromIndex === -1) {
        toggleSelection(id);
        return;
    }

    if (!selectionBeforeRange) selectionBeforeRange = new Set(selectedItems.value);

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);

    const newSet = new Set(selectionBeforeRange);
    for (let i = start; i <= end; i++) newSet.add(ids[i]!);
    selectedItems.value = newSet;

    // L'ancre ne bouge pas : les MAJ+clic suivants réétendent depuis le même point.

};

const clearSelection = () => {
    selectedItems.value = new Set();
    selectionAnchorId.value = null;
    selectionBeforeRange = null;
};

// CTRL/MAJ+clic sur un dossier sélectionne au lieu d'entrer dedans.
const onFolderCardClick = (event: MouseEvent, folderId: string) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    currentFolderId.value = folderId;
};

const downloadSelected = async () => {
    const filesToDownload = allFiles.value.filter(f => selectedItems.value.has(f.id));
    if (filesToDownload.length === 0) {
        toast.show("Aucun fichier sélectionné (les dossiers ne peuvent être téléchargés groupés pour le moment).", "info");
        return;
    }
    
    for (const file of filesToDownload) {
        try {
            await downloadFile(file.id);
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            console.error(`Error downloading ${file.originalName}`, err);
        }
    }
    clearSelection();
};

const showDeletePopup = ref<boolean>(false);
const deleteTarget = ref<{id?: string, type: 'file' | 'folder' | 'selection'} | null>(null);

const requestDeleteSelection = () => {
    deleteTarget.value = { type: 'selection' };
    showDeletePopup.value = true;
};

const requestDeleteFile = (file: StoredFile) => {
    deleteTarget.value = { id: file.id, type: 'file' };
    showDeletePopup.value = true;
};

const requestDeleteFolder = (id: string) => {
    deleteTarget.value = { id, type: 'folder' };
    showDeletePopup.value = true;
};

const executeDeletion = async () => {
    isDeleting.value = true;
    if (!deleteTarget.value) {
        showDeletePopup.value = false;
        isDeleting.value = false;
        return;
    }

    let successCount = 0;

    if (deleteTarget.value.type === 'selection') {
        const idsToDelete = Array.from(selectedItems.value);
        for (const id of idsToDelete) {
            try {
                const isFolder = allFolders.value.some(f => f.id === id);
                const endpoint = isFolder ? `/api/spaces/${route.params.spaceId}/folders/${id}` : `/api/cdn/${id}`;
                const res = await sfetch(endpoint, { method: 'DELETE' });
                if (res.ok) {
                    if (isFolder) allFolders.value = allFolders.value.filter(f => f.id !== id);
                    else allFiles.value = allFiles.value.filter(f => f.id !== id);
                    successCount++;
                }
            } catch (err) { console.error(`Error deleting ${id}`, err); }
        }
        clearSelection();
        toast.show(`${successCount} élément(s) supprimé(s)`, 'success');
    } else {
        const id = deleteTarget.value.id!;
        const isFolder = deleteTarget.value.type === 'folder';
        const endpoint = isFolder ? `/api/spaces/${route.params.spaceId}/folders/${id}` : `/api/cdn/${id}`;
        
        try {
            const res = await sfetch(endpoint, { method: 'DELETE' });
            if (res.ok) {
                if (isFolder) allFolders.value = allFolders.value.filter(f => f.id !== id);
                else allFiles.value = allFiles.value.filter(f => f.id !== id);
                toast.show(`${isFolder ? 'Dossier' : 'Fichier'} supprimé`, 'success');
            } else {
                toast.show(`Erreur lors de la suppression`, 'error');
            }
        } catch (err) { console.error(err); toast.show(`Erreur`, 'error'); }
    }
    deleteTarget.value = null;
    showDeletePopup.value = false;
    isDeleting.value = false;
};

const allFiles = ref<StoredFile[]>([]);
const allFolders = ref<Folder[]>([]);
const loading = ref<boolean>(true);
const emptySpaceDropdown = ref<any>(null);

const handleEmptyContextMenu = (e: MouseEvent) => {
    emptySpaceDropdown.value?.toggleDropdown(e);
};

const currentFolderId = ref<string>('root');
const showFolderNamePrompt = ref<boolean>(false);

const openCreateFolderPrompt = () => {
    emptySpaceDropdown.value?.closeDropdown();
    setTimeout(() => {
        showFolderNamePrompt.value = true;
    }, 10);
};

const openFileSearchPrompt = () => {
    emptySpaceDropdown.value?.closeDropdown();
    setTimeout(() => {
        triggerFileSearch();
    }, 10);
};

const showVerifyWatermark = ref<boolean>(false);
const showPermissions = ref<boolean>(false);
const showFolderPermissions = ref<boolean>(false);
const showFilePermissions = ref<boolean>(false);

const selectedFolderForPerms = ref<Folder | null>(null);
const selectedFileForPerms = ref<StoredFile | null>(null);

const fileSendProgress = ref<number>(0);
const isUploading = ref<boolean>(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const draggedFileId = ref<string | null>(null);
const draggedSourceFolderId = ref<string | null>(null);
const draggedIntoFolderId = ref<string | null>(null);

const isDragging = ref<boolean>(false);
const isHoveringTrash = ref<boolean>(false);
const isDeleting = ref<boolean>(false);

const vectorWorker = new VectorWorker();
vectorWorker.onmessage = async (e) => {
    const { status, id, vector, text, type, metadata } = e.data;
    if (status === 'complete') {
        const workspaceId = String(route.params.spaceId) || null;
        if (!workspaceId) return;

        // Save locally
        await localSearchDB.insertDocument({
            id,
            workspaceId,
            type,
            textContent: text,
            vector,
            metadata
        });
        
        // Note: Backend sync skipped here as we need a symmetric workspace key which might not exist globally.
    }
};


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

const filteredFolders = computed(() => {

    const query = searchQuery.value.toLowerCase().trim();
    
    let baseFolders = allFolders.value.filter(f => {
        if (currentFolderId.value === 'root') return !f.parentId;
        return f.parentId === currentFolderId.value;
    });

    if (!query) return baseFolders;

    return baseFolders.filter(f => f.name.toLowerCase().includes(query));

});

watch(currentFolderId, () => {
    // Clear selection when navigating folders
    clearSelection();
});

const openFolderPermissions = (folder: Folder) => {
    selectedFolderForPerms.value = folder;
    showFolderPermissions.value = true;
};

const openFilePermissions = (file: StoredFile) => {
    selectedFileForPerms.value = file;
    showFilePermissions.value = true;
};

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


watch(() => currentFolderId.value, () => {
    router.push({
        name: route.name || undefined, 
        params: route.params,
        query: {
            ...route.query, 
            path: '/' + breadcrumbs.value.map(b => b.id).join('/'),
            folderId: undefined, // Clear folderId since we now use path
            highlightFileId: undefined // Don't persist highlight on normal navigation
        } 
    });
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
            if (!allFolders.value.some(f => f.id === newFolder.id)) {
                allFolders.value.push(newFolder);
            }
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
            body: JSON.stringify({ fileId, folderId: folderId === 'root' ? null : folderId })
        });

        if (res.ok) 
        {
            const fileIndex = allFiles.value.findIndex(f => f.id === fileId);
            if (fileIndex !== -1) {
                allFiles.value[fileIndex]!.folderId = folderId === 'root' ? undefined : folderId;
            }
        }
        
    } catch (e) {
        console.error("Erreur lors du déplacement du fichier:", e);
    }

};

const triggerFileSearch = () => fileInputRef.value?.click();

const handleFolderDragStart = (event: DragEvent, folderId: string) => {
    isDragging.value = true;
    isDeleting.value = false;
    draggedSourceFolderId.value = folderId;
    if (event.dataTransfer) 
    {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('folderId', folderId);
        event.dataTransfer.setData('type', 'folder');
    }
};

const handleDragStart = (event: DragEvent, fileId: string) => {
    isDragging.value = true;
    isDeleting.value = false;
    draggedFileId.value = fileId;
    if (event.dataTransfer) 
    {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('fileId', fileId);
        event.dataTransfer.setData('type', 'file');
    }
};

// --- Drag & drop de fichiers depuis l'ordinateur -----------------------------

const isExternalDrag = ref<boolean>(false);
// dragenter/dragleave remontent aussi depuis chaque enfant survolé : on compte
// les entrées/sorties pour ne masquer l'overlay qu'en quittant vraiment la vue.
let externalDragDepth = 0;

const currentFolderName = computed(() => {
    if (currentFolderId.value === 'root') return 'Racine';
    return allFolders.value.find(f => f.id === currentFolderId.value)?.name || 'Racine';
});

// Un drag interne (fichier/dossier déjà stocké) n'expose pas de type 'Files'.
const isExternalFileDrag = (event: DragEvent) => {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
};

const resetExternalDrag = () => {
    externalDragDepth = 0;
    isExternalDrag.value = false;
};

const handleExternalDragEnter = (event: DragEvent) => {
    if (!isExternalFileDrag(event)) return;
    externalDragDepth++;
    isExternalDrag.value = true;
};

const handleExternalDragOver = (event: DragEvent) => {
    if (!isExternalFileDrag(event)) return;
    // Sans preventDefault le navigateur ouvre le fichier au lieu de le déposer.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    isExternalDrag.value = true;
};

const handleExternalDragLeave = (event: DragEvent) => {
    if (!isExternalFileDrag(event)) return;
    externalDragDepth = Math.max(0, externalDragDepth - 1);
    if (externalDragDepth === 0) isExternalDrag.value = false;
};

const handleExternalDrop = async (event: DragEvent) => {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    await uploadDroppedItems(event.dataTransfer, currentFolderId.value);
};

const uploadDroppedItems = async (dataTransfer: DataTransfer | null, targetFolderId: string) => {

    resetExternalDrag();
    if (!dataTransfer) return;

    // L'extraction doit rester synchrone : le DataTransfer est vidé dès que le
    // handler de drop rend la main.
    const files: File[] = [];
    let droppedFolders = 0;

    if (dataTransfer.items && dataTransfer.items.length > 0)
    {
        for (const item of Array.from(dataTransfer.items))
        {
            if (item.kind !== 'file') continue;

            const entry = item.webkitGetAsEntry?.();
            if (entry?.isDirectory)
            {
                droppedFolders++;
                continue;
            }

            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    else
    {
        files.push(...Array.from(dataTransfer.files));
    }

    if (droppedFolders > 0)
    {
        toast.show("Les dossiers ne peuvent pas être déposés, seulement des fichiers", "info");
    }

    if (files.length === 0) return;

    await handleFiles(files, targetFolderId);

};

const handleDragEnd = () => {
    if (!isDeleting.value) {
        isDragging.value = false;
        isHoveringTrash.value = false;
    }
    draggedFileId.value = null;
    draggedSourceFolderId.value = null;
};



const handleFileWatermarked = (newFile: StoredFile) => {
    allFiles.value.push(newFile);
};

const onDropToTrash = async (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer?.getData('type');
    const id = type === 'file' ? e.dataTransfer?.getData('fileId') : e.dataTransfer?.getData('folderId');
    if (!id) return;

    isDeleting.value = true;
    isHoveringTrash.value = false;

    setTimeout(() => {
        isDragging.value = false;
        isDeleting.value = false;
    }, 600);

    try {
        if (type === 'file') {
            if (selectedItems.value.has(id)) {
                requestDeleteSelection();
            } else {
                requestDeleteFile(allFiles.value.find(f => f.id === id)!);
            }
        } else {
            if (selectedItems.value.has(id)) {
                requestDeleteSelection();
            } else {
                requestDeleteFolder(id);
            }
        }
    } catch (err) {
        toast.show("Erreur lors de la suppression", "error");
    }
};

const handleDropToParent = async (event: DragEvent) => {
    if (!currentFolderId.value || currentFolderId.value === 'root') return;
    
    const currentFolder = allFolders.value.find(f => f.id === currentFolderId.value);
    const parentFolderId = currentFolder?.parentId || 'root';
    
    await handleDrop(event, parentFolderId);
};

const handleDrop = async (event: DragEvent, targetFolderId: string) => {

    event.preventDefault();
    draggedIntoFolderId.value = null;

    // Fichiers glissés depuis l'ordinateur et lâchés sur un dossier (carte,
    // fil d'Ariane ou bouton retour) : upload directement dedans. stopPropagation
    // pour que le handler global du root ne les réenvoie pas dans le dossier courant.
    if (isExternalFileDrag(event))
    {
        event.stopPropagation();
        await uploadDroppedItems(event.dataTransfer, targetFolderId);
        return;
    }

    const type = event.dataTransfer?.getData('type');
    const sourceId = type === 'file' 
        ? event.dataTransfer?.getData('fileId') 
        : event.dataTransfer?.getData('folderId');

    if (!sourceId || sourceId === targetFolderId) return;

    if (selectedItems.value.has(sourceId)) {
        const filesToMove = Array.from(selectedItems.value).filter(id => allFiles.value.some(f => f.id === id));
        for (const fId of filesToMove) {
            await moveFile(fId, targetFolderId);
        }
        
        const foldersToMove = Array.from(selectedItems.value).filter(id => allFolders.value.some(f => f.id === id));
        for (const foldId of foldersToMove) {
            if (foldId !== targetFolderId) await moveFolder(foldId, targetFolderId);
        }
        clearSelection();
    } else {
        if (type === 'file') {
            await moveFile(sourceId, targetFolderId);
        } else {
            await moveFolder(sourceId, targetFolderId);
        }
    }
    
    draggedFileId.value = null;
    draggedSourceFolderId.value = null;

};

const moveFolder = async (folderId: string, parentId: string) => {

    try {

        const res = await sfetch(`/api/spaces/${route.params.spaceId}/folders/move`, {
            method: 'PATCH',
            body: JSON.stringify({ folderId, parentId: parentId === 'root' ? null : parentId })
        });

        if (res.ok) 
        {
            const index = allFolders.value.findIndex(f => f.id === folderId);
            if (index !== -1) {
                allFolders.value[index]!.parentId = parentId === 'root' ? null : parentId;
            }
        }

    } catch (e) {
        console.error("Erreur déplacement dossier:", e);
    }

};


const handleFiles = async (files: FileList | File[], targetFolderId: string = currentFolderId.value) => {

    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;

    // Un seul envoi à la fois : la barre de progression est partagée et un
    // dépôt est très facile à répéter pendant qu'un upload tourne déjà.
    if (isUploading.value)
    {
        toast.show("Un envoi est déjà en cours, patientez", "info");
        return;
    }

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
                folderId: targetFolderId === 'root' ? undefined : targetFolderId,
            },
            (percent: number) => {
                fileSendProgress.value = percent;
            }
        );

        if (uploadedFiles && Array.isArray(uploadedFiles))
        {
            const newFiles = uploadedFiles.filter(f => !allFiles.value.some(existing => existing.id === f.id));
            allFiles.value.push(...newFiles);
            toast.show(`${uploadedFiles.length} fichier(s) ajouté(s)`, "success");

            // Process PDFs for semantic search
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                const uploadedFile = uploadedFiles[i];
                if (file && uploadedFile && file.type.includes('pdf')) {
                    extractTextFromPDF(file).then(text => {
                        if (text && text.trim() !== '') {
                            vectorWorker.postMessage({
                                id: uploadedFile.id,
                                text,
                                type: 'FILE',
                                metadata: { folderId: targetFolderId }
                            });
                        }
                    }).catch(err => console.error("PDF Extraction failed:", err));
                }
            }
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

        handleRouteQuery();

    } catch (e) {
        console.error("Erreur:", e);
    } finally {
        loading.value = false;
    }
    
    const socket = await useWSocket();
    socket.value?.on('file-added', ({ file }: { file: StoredFile }) => {
        if (file.workspaceId === route.params.spaceId && !allFiles.value.some(f => f.id === file.id)) {
            allFiles.value.push(file);
        }
    });
    socket.value?.on('file-updated', ({ file }: { file: StoredFile }) => {
        if (file.workspaceId === route.params.spaceId) {
            const index = allFiles.value.findIndex(f => f.id === file.id);
            if (index !== -1) allFiles.value[index] = file;
        }
    });
    socket.value?.on('file-moved', ({ file }: { file: StoredFile }) => {
        if (file.workspaceId === route.params.spaceId) {
            const index = allFiles.value.findIndex(f => f.id === file.id);
            if (index !== -1) allFiles.value[index] = file;
        }
    });
    socket.value?.on('file-deleted', ({ fileId, workspaceId }: { fileId: string, workspaceId: string }) => {
        if (workspaceId === route.params.spaceId) {
            allFiles.value = allFiles.value.filter(f => f.id !== fileId);
        }
    });
    socket.value?.on('folder-added', ({ folder }: { folder: Folder }) => {
        if (folder.workspaceId === route.params.spaceId && !allFolders.value.some(f => f.id === folder.id)) {
            allFolders.value.push(folder);
        }
    });
    socket.value?.on('folder-updated', ({ folder }: { folder: Folder }) => {
        if (folder.workspaceId === route.params.spaceId) {
            const index = allFolders.value.findIndex(f => f.id === folder.id);
            if (index !== -1) allFolders.value[index] = folder;
        }
    });
    socket.value?.on('folder-moved', ({ folder }: { folder: Folder }) => {
        if (folder.workspaceId === route.params.spaceId) {
            const index = allFolders.value.findIndex(f => f.id === folder.id);
            if (index !== -1) allFolders.value[index] = folder;
        }
    });
    socket.value?.on('folder-deleted', ({ folderId, workspaceId }: { folderId: string, workspaceId: string }) => {
        if (workspaceId === route.params.spaceId) {
            allFolders.value = allFolders.value.filter(f => f.id !== folderId);
        }
    });

});

onUnmounted(async () => {
    const socket = await useWSocket();
    socket.value?.off('file-added');
    socket.value?.off('file-updated');
    socket.value?.off('file-moved');
    socket.value?.off('file-deleted');
    socket.value?.off('folder-added');
    socket.value?.off('folder-updated');
    socket.value?.off('folder-moved');
    socket.value?.off('folder-deleted');
});

const handleRouteQuery = () => {
    const urlPath = route.query.path as string;
    const folderId = route.query.folderId as string;
    const highlightFileId = route.query.highlightFileId as string;
    const selectFileId = route.query.select as string | undefined;

    if (selectFileId) {
        const found = allFiles.value.find(f => f.id === selectFileId);
        if (found) {
            selectedFileForViewer.value = found;
            router.replace({ query: { ...route.query, select: undefined } });
        }
    }

    if (urlPath) 
    {
        const pathIds = urlPath.split('/');
        currentFolderId.value = pathIds.length > 0 ? pathIds?.[pathIds.length - 1] || 'root' : 'root';
    }
    else if (folderId) 
    {
        currentFolderId.value = folderId;
    }

    if (highlightFileId) 
    {
        setTimeout(() => {
            const el = document.getElementById('file-' + highlightFileId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add highlight animation via guaranteed inline styles
                const originalTransition = el.style.transition;
                const originalTransform = el.style.transform;
                const originalBoxShadow = el.style.boxShadow;
                
                el.style.transition = 'all 0.3s ease';
                el.style.transform = 'scale(1.05)';
                el.style.boxShadow = '0 0 0 4px var(--primary), 0 10px 30px var(--shadow-elevated)';
                el.style.zIndex = '10';
                
                setTimeout(() => {
                    el.style.transform = originalTransform;
                    el.style.boxShadow = originalBoxShadow;
                    el.style.zIndex = '';
                    setTimeout(() => el.style.transition = originalTransition, 300);
                }, 3000);
            }
        }, 600); // 600ms to ensure DOM is ready
    }
};

watch(() => route.query, () => {
    handleRouteQuery();
}, { deep: true });

// File actions handlers
const selectedFileForInfo = ref<StoredFile | null>(null);
const showFileInfoModal = ref<boolean>(false);
// Ouvert via un chip <file:id> (référence inline dans un message/tâche) ou
// tout lien profond ?select=<fileId> — distinct de showViewer, local à
// chaque FileCard.vue.
const selectedFileForViewer = ref<StoredFile | null>(null);

const handleFileDeleted = (fileId: string) => {
    allFiles.value = allFiles.value.filter(f => f.id !== fileId);
    toast.show('Fichier supprimé avec succès', 'success');
};

const handleShowFileInfo = (file: StoredFile) => {
    selectedFileForInfo.value = file;
    showFileInfoModal.value = true;
};

// Format file size for display
const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Format date for display
const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

</script>