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
                    @click="showUsersBar = !showUsersBar"
                    class="hover:text-(--text) transition-colors"
                    :class="showUsersBar ? 'text-(--text)' : ''"
                    title="Membres"
                >
                    <i class="bi bi-people-fill" />
                </button>
            </div>

        </header>

        <main class="flex-1 overflow-y-auto p-4 w-full h-full flex flex-col gap-4">

            <!-- Recherche : en tête de vue, elle porte sur tout l'espace -->
            <div class="relative group w-full">

                <i class="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-(--text2) group-focus-within:text-(--primary) group-focus-within:scale-110 transition-all duration-300" />

                <input 
                    v-model="searchQuery"
                    type="text" 
                    placeholder="Rechercher un fichier ou un dossier..."
                    class="w-full bg-(--text)/[0.03] border border-(--text)/10 rounded-xl py-2.5 pl-11 pr-12 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/60 focus:ring-4 focus:ring-(--primary)/10 transition-all duration-300 shadow-inner"
                >

                <button 
                    v-if="searchQuery"
                    @click="searchQuery = ''"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-(--text2) hover:text-red-400 active:scale-90 transition-all"
                    title="Effacer la recherche"
                >
                    <i class="bi bi-x-circle-fill text-base" />
                </button>

            </div>

            <!-- Barre d'outils : trois contrôles, pas dix boutons. À gauche la
                 navigation (un seul bloc segmenté), au centre l'unique action
                 d'écriture, à droite les outils de l'espace. -->
            <div class="w-full flex items-center gap-3 overflow-x-auto no-scrollbar">

                <div class="flex items-center shrink-0 rounded-xl border border-(--border-color) bg-(--text)/[0.03] overflow-hidden divide-x divide-(--border-color)">

                    <button
                        @click="goHistoryBack"
                        :disabled="!canGoHistoryBack"
                        class="w-10 h-9.5 flex items-center justify-center text-(--text2) hover:text-(--text) hover:bg-(--text)/5 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                        title="Précédent"
                    >
                        <i class="bi bi-chevron-left text-sm" />
                    </button>

                    <button
                        @click="goHistoryForward"
                        :disabled="!canGoHistoryForward"
                        class="w-10 h-9.5 flex items-center justify-center text-(--text2) hover:text-(--text) hover:bg-(--text)/5 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                        title="Suivant"
                    >
                        <i class="bi bi-chevron-right text-sm" />
                    </button>

                    <button
                        @click="goBack"
                        :disabled="currentFolderId === 'root'"
                        class="w-10 h-9.5 flex items-center justify-center text-(--text2) hover:text-(--text) hover:bg-(--text)/5 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                        title="Remonter d'un niveau"
                    >
                        <i class="bi bi-arrow-up text-sm" />
                    </button>

                    <button
                        @click="refreshFolder"
                        :disabled="isRefreshing"
                        class="w-10 h-9.5 flex items-center justify-center text-(--text2) hover:text-(--text) hover:bg-(--text)/5 disabled:pointer-events-none transition-colors"
                        title="Recharger le dossier"
                    >
                        <i class="bi bi-arrow-clockwise text-sm" :class="isRefreshing ? 'inline-block animate-spin' : ''" />
                    </button>

                </div>

                <DropDown align="left" class="shrink-0">

                    <template #trigger>
                        <button class="primary gap-2 !text-sm !py-2 !px-4" title="Créer ou importer">
                            <i class="bi bi-plus-lg" />
                            <span>Nouveau</span>
                            <i class="bi bi-chevron-down text-[10px] opacity-70" />
                        </button>
                    </template>

                    <template #content>

                        <button @click="triggerFileSearch" class="dropdown-item-annimate dropdown-item-style gap-2">
                            <i class="bi bi-upload" />
                            Importer des fichiers
                        </button>

                        <div class="h-px my-1 bg-(--border-color)" />

                        <button @click="showFolderNamePrompt = true" class="dropdown-item-annimate dropdown-item-style gap-2">
                            <i class="bi bi-folder-plus" />
                            Nouveau dossier
                        </button>

                        <button @click="showFileNamePrompt = true" class="dropdown-item-annimate dropdown-item-style gap-2">
                            <i class="bi bi-file-earmark-plus" />
                            Nouveau fichier
                        </button>

                    </template>

                </DropDown>

                <DropDown align="right" class="shrink-0 ml-auto">

                    <template #trigger>
                        <button
                            class="w-10 h-9.5 flex items-center justify-center rounded-xl border border-(--border-color) bg-(--text)/[0.03] text-(--text2) hover:text-(--text) hover:bg-(--text)/5 transition-colors"
                            title="Outils de l'espace"
                        >
                            <i class="bi bi-three-dots text-base" />
                        </button>
                    </template>

                    <template #content>

                        <button @click="showVerifyWatermark = true" class="dropdown-item-annimate dropdown-item-style gap-2">
                            <i class="bi bi-file-earmark-binary" />
                            Vérifier un filigrane
                        </button>

                    </template>

                </DropDown>

            </div>

            <section class="flex flex-col gap-4 relative flex-1 min-h-[50vh]" @contextmenu.prevent="handleEmptyContextMenu">
                
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

                <div v-if="isZipping" class="w-full bg-(--text)/5 border border-(--text)/10 rounded-lg p-3 mb-4 animate-in fade-in slide-in-from-top-2">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-[10px] font-black uppercase text-(--primary) tracking-widest">
                            {{ zipProgress >= 95 ? 'Compression...' : 'Préparation de l\'archive...' }}
                        </span>
                        <span class="text-[10px] font-bold text-(--text2)">{{ zipProgress }}%</span>
                    </div>
                    <div class="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                        <div 
                            class="h-full bg-(--primary) transition-all duration-300 ease-out shadow-[0_0_10px_var(--primary)]"
                            :style="{ width: `${zipProgress}%` }"
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
                        @download="downloadFolder(folder)"
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

        <!-- Cible de dépôt « remonter d'un niveau » : elle n'apparaît que pendant
             un glisser, la navigation vers le parent étant désormais dans la
             barre d'outils. -->
        <div class="absolute left-5 bottom-5 z-20">
            <button 
                v-if="currentFolderId !== 'root' && isDragging"
                title="Déposer ici pour remonter d'un niveau"
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
            <!-- Mobile : barre pleine largeur posée au-dessus du bouton retour.
                 sm+ : pilule centrée. -->
            <div 
                v-if="selectedItems.size > 0" 
                class="
                    absolute z-30 bg-(--bg2) border border-(--border-color) rounded-2xl shadow-2xl
                    bottom-20 left-3 right-3 px-3 py-2
                    sm:bottom-5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:px-4 sm:py-3
                    flex items-center gap-1 sm:gap-4 max-w-[calc(100%-1.5rem)]
                "
            >
                <span class="text-sm font-bold text-(--text) whitespace-nowrap shrink-0 pl-1 flex items-center gap-1.5">
                    <i class="bi bi-check2-square sm:hidden" />
                    {{ selectedItems.size }}<span class="hidden sm:inline"> sélectionné(s)</span>
                </span>
                
                <div class="h-6 w-px bg-(--border-color) shrink-0"></div>

                <button 
                    @click="selectAllVisible" 
                    :disabled="allVisibleSelected"
                    class="p-2 rounded-lg hover:bg-(--primary)/10 text-(--text) hover:text-(--primary) transition-colors flex items-center justify-center gap-2 text-sm font-semibold flex-1 sm:flex-none min-w-0 disabled:opacity-40 disabled:hover:bg-transparent"
                    title="Tout sélectionner (Ctrl+A)"
                >
                    <i class="bi bi-check-all shrink-0"></i>
                    <span class="hidden sm:inline">Tout</span>
                </button>
                
                <button 
                    @click="downloadSelected" 
                    :disabled="isZipping"
                    class="p-2 rounded-lg hover:bg-(--primary)/10 text-(--text) hover:text-(--primary) transition-colors flex items-center justify-center gap-2 text-sm font-semibold flex-1 sm:flex-none min-w-0 disabled:opacity-40"
                    title="Télécharger"
                >
                    <i class="bi bi-download shrink-0"></i>
                    <span class="hidden sm:inline">Télécharger</span>
                </button>

                <button 
                    @click="requestDeleteSelection" 
                    class="p-2 rounded-lg hover:bg-red-500/10 text-(--text) hover:text-red-500 transition-colors flex items-center justify-center gap-2 text-sm font-semibold flex-1 sm:flex-none min-w-0"
                    title="Supprimer"
                >
                    <i class="bi bi-trash shrink-0"></i>
                    <span class="hidden sm:inline">Supprimer</span>
                </button>

                <div class="h-6 w-px bg-(--border-color) shrink-0"></div>

                <button 
                    @click="clearSelection" 
                    class="p-2 rounded-lg hover:bg-(--text)/5 text-(--text2) hover:text-(--text) transition-colors shrink-0"
                    title="Tout désélectionner"
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
                @click.stop.prevent="openCreateFilePrompt"
                class="dropdown-item-annimate dropdown-item-style gap-2"
            >
                <i class="bi bi-file-earmark-plus" />
                Nouveau fichier
            </button>
            <button 
                @click.stop.prevent="openFileSearchPrompt"
                class="dropdown-item-annimate dropdown-item-style gap-2"
            >
                <i class="bi bi-plus-circle" />
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

    <CreateNewFile
        :show="showFileNamePrompt"
        @close="showFileNamePrompt = false"
        @save="createFile"
    />

    <ConfirmDelete
        :show="showDeletePopup"
        :itemName="deleteTargetName"
        :itemType="deleteTargetType"
        :checkbox="deleteCount > 1"
        :checkboxLabel="`Je comprends que ces ${deleteCount} éléments seront supprimés définitivement.`"
        :extraWarning="deleteExtraWarning"
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
                            <p class="font-semibold text-(--text)">De bout en bout</p>
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
import CreateNewFile from '../components/popup/CreateNewFile.vue';
import { createFolderRequest, createTextFile } from '@/services/fileActions';
import VerifyWatermark from '../components/popup/VerifyWatermark.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { useToast } from '@/composables/useToast';
import useWSocket from '@/composables/useWSocket';
import { downloadFile } from '@/assets/utils/downloadFile';
import { downloadItemsAsZip, sanitizeZipName, type ZipItem } from '@/assets/utils/downloadZip';
import DropDown from '@/components/DropDown.vue';

import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import { uploadFiles } from '@/assets/uploadFile';
import { isAbortError } from '@/services/transfers/transferManager';
import FolderCard from '../components/SpaceFiles/FolderCard.vue';
import FileCard from '../components/SpaceFiles/FileCard.vue';
import FileViewer from '../components/popup/FileViewer.vue';
import type { StoredFile, Folder } from '@/types/types';
import { extractTextFromPDF } from '@/assets/utils/pdfExtractor';
import VectorWorker from '@/workers/semantic.worker?worker';
import { localSearchDB } from '@/services/LocalSearchVectorDB';
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

const allVisibleSelected = computed<boolean>(() => {
    const ids = visibleItemIds.value;
    return ids.length > 0 && ids.every(id => selectedItems.value.has(id));
});

// Tout le contenu affiché (recherche en cours comprise), pas toute la base :
// c'est ce que l'utilisateur a sous les yeux.
const selectAllVisible = () => {
    const ids = visibleItemIds.value;
    if (ids.length === 0) return;
    selectedItems.value = new Set(ids);
    selectionAnchorId.value = ids[0]!;
    selectionBeforeRange = null;
};

// Ctrl+A : raccourci habituel, mais seulement une fois une sélection commencée,
// pour ne pas voler le "tout sélectionner" du texte au reste de la vue.
const handleSelectAllShortcut = (e: KeyboardEvent) => {

    if (e.key !== 'a' && e.key !== 'A') return;
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    if (selectedItems.value.size === 0) return;

    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;

    e.preventDefault();
    selectAllVisible();

};

// CTRL/MAJ+clic sur un dossier sélectionne au lieu d'entrer dedans.
const onFolderCardClick = (event: MouseEvent, folderId: string) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    currentFolderId.value = folderId;
};

const isZipping = ref<boolean>(false);
const zipProgress = ref<number>(0);

// Aplatit un dossier et tout son contenu (sous-dossiers compris) en chemins
// relatifs destinés à l'archive.
const collectFolderItems = (folderId: string, prefix: string, visited = new Set<string>()): ZipItem[] => {

    // Un dossier déplacé dans l'un de ses propres descendants créerait un cycle :
    // sans ce garde-fou la récursion ne s'arrêterait jamais.
    if (visited.has(folderId)) return [];
    visited.add(folderId);

    const items: ZipItem[] = [];
    const childFolders = allFolders.value.filter(f => f.parentId === folderId);
    const childFiles = allFiles.value.filter(f => f.folderId === folderId);

    // Entrée de répertoire : préserve les dossiers vides dans le zip.
    items.push({ path: prefix });

    for (const file of childFiles) {
        items.push({
            path: `${prefix}/${sanitizeZipName(file.originalName)}`,
            fileId: file.id,
            size: file.size
        });
    }

    for (const child of childFolders) {
        items.push(...collectFolderItems(child.id, `${prefix}/${sanitizeZipName(child.name)}`, visited));
    }

    return items;

};

const runZipDownload = async (items: ZipItem[], zipName: string) => {

    if (isZipping.value) {
        toast.show("Une archive est déjà en cours de préparation", "info");
        return;
    }

    const fileCount = items.filter(i => i.fileId).length;

    isZipping.value = true;
    zipProgress.value = 0;

    try {

        const { failed } = await downloadItemsAsZip(items, zipName, (percent) => {
            zipProgress.value = percent;
        });

        if (failed.length > 0) {
            toast.show(`${failed.length} fichier(s) n'ont pas pu être ajoutés à l'archive`, "error");
        } else {
            toast.show(`Archive prête (${fileCount} fichier(s))`, "success");
        }

    } catch (e) {

        if ((e as Error).message === 'ARCHIVE_TOO_LARGE') {
            toast.show("Ce dossier est trop volumineux pour être compressé (limite 4 Go)", "error");
        } else {
            console.error("Zip Error:", e);
            toast.show("Erreur lors de la création de l'archive", "error");
        }

    } finally {
        isZipping.value = false;
        zipProgress.value = 0;
    }

};

const downloadFolder = async (folder: Folder) => {
    const name = sanitizeZipName(folder.name);
    await runZipDownload(collectFolderItems(folder.id, name), name);
};

const downloadSelected = async () => {

    const selectedFolders = allFolders.value.filter(f => selectedItems.value.has(f.id));
    const selectedFiles = allFiles.value.filter(f => selectedItems.value.has(f.id));

    if (selectedFolders.length === 0 && selectedFiles.length === 0) return;

    // Dès qu'un dossier est sélectionné, tout part dans une seule archive :
    // c'est le seul moyen de conserver l'arborescence.
    if (selectedFolders.length > 0)
    {
        const items: ZipItem[] = [];

        for (const file of selectedFiles) {
            items.push({ path: sanitizeZipName(file.originalName), fileId: file.id, size: file.size });
        }

        for (const folder of selectedFolders) {
            items.push(...collectFolderItems(folder.id, sanitizeZipName(folder.name)));
        }

        const zipName = (selectedFolders.length === 1 && selectedFiles.length === 0)
            ? sanitizeZipName(selectedFolders[0]!.name)
            : sanitizeZipName(currentFolderName.value);

        clearSelection();
        await runZipDownload(items, zipName);
        return;
    }

    for (const file of selectedFiles) {
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
const deleteTarget = ref<{id?: string, name?: string, type: 'file' | 'folder' | 'selection'} | null>(null);

const requestDeleteSelection = () => {
    deleteTarget.value = { type: 'selection' };
    showDeletePopup.value = true;
};

const requestDeleteFile = (file: StoredFile) => {
    deleteTarget.value = { id: file.id, name: file.originalName, type: 'file' };
    showDeletePopup.value = true;
};

const requestDeleteFolder = (id: string) => {
    const folder = allFolders.value.find(f => f.id === id);
    deleteTarget.value = { id, name: folder?.name, type: 'folder' };
    showDeletePopup.value = true;
};

// Confirmation à deux niveaux : un seul élément -> confirmation simple ;
// plusieurs -> case à cocher obligatoire avant de pouvoir valider.
const deleteCount = computed<number>(() => {
    if (!deleteTarget.value) return 0;
    return deleteTarget.value.type === 'selection' ? selectedItems.value.size : 1;
});

const isFolderId = (id: string) => allFolders.value.some(f => f.id === id);

const resolveItemName = (id: string) => {
    return allFolders.value.find(f => f.id === id)?.name
        || allFiles.value.find(f => f.id === id)?.originalName
        || 'cet élément';
};

const deleteTargetName = computed<string>(() => {

    if (!deleteTarget.value) return '';

    if (deleteTarget.value.type !== 'selection') return deleteTarget.value.name || 'cet élément';

    const ids = Array.from(selectedItems.value);
    if (ids.length === 1) return resolveItemName(ids[0]!);

    return `${ids.length} éléments`;

});

const deleteTargetType = computed<string>(() => {

    if (!deleteTarget.value) return 'cet élément';

    if (deleteTarget.value.type === 'selection')
    {
        const ids = Array.from(selectedItems.value);
        if (ids.length === 1) return isFolderId(ids[0]!) ? 'ce dossier' : 'ce fichier';
        return 'ces éléments';
    }

    return deleteTarget.value.type === 'folder' ? 'ce dossier' : 'ce fichier';

});

// Supprimer un dossier supprime aussi son contenu côté API : on le dit.
const deleteExtraWarning = computed<string | undefined>(() => {

    if (!deleteTarget.value) return undefined;

    if (deleteTarget.value.type === 'folder') {
        return "Les fichiers et sous-dossiers de ce dossier seront également supprimés.";
    }

    if (deleteTarget.value.type === 'selection' && Array.from(selectedItems.value).some(isFolderId)) {
        return "Les fichiers et sous-dossiers contenus dans les dossiers sélectionnés seront également supprimés.";
    }

    return undefined;

});

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

const openCreateFilePrompt = () => {
    emptySpaceDropdown.value?.closeDropdown();
    setTimeout(() => {
        showFileNamePrompt.value = true;
    }, 10);
};

const openFileSearchPrompt = () => {
    emptySpaceDropdown.value?.closeDropdown();
    setTimeout(() => {
        triggerFileSearch();
    }, 10);
};

const showVerifyWatermark = ref<boolean>(false);
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

// Historique de navigation des flèches « précédent / suivant » de la barre
// d'outils. Le dossier courant est changé depuis une dizaine d'endroits
// (fil d'Ariane, double-clic, remontée d'un niveau, lien profond) : on empile
// donc depuis un watcher plutôt que dans chaque appelant. `flush: 'sync'`
// garantit que le drapeau posé juste avant l'affectation est bien consommé
// par ce watcher-ci, et pas par la navigation suivante.
const folderHistory = ref<string[]>(['root']);
const historyIndex = ref<number>(0);
const isHistoryNavigating = ref<boolean>(false);

const canGoHistoryBack = computed<boolean>(() => historyIndex.value > 0);
const canGoHistoryForward = computed<boolean>(() => historyIndex.value < folderHistory.value.length - 1);

watch(currentFolderId, (folderId, previousFolderId) => {

    if (folderId === previousFolderId) return;

    if (isHistoryNavigating.value) {
        isHistoryNavigating.value = false;
        return;
    }

    // Une nouvelle navigation efface les entrées « suivant » restantes.
    folderHistory.value = [...folderHistory.value.slice(0, historyIndex.value + 1), folderId];
    historyIndex.value = folderHistory.value.length - 1;

}, { flush: 'sync' });

const goHistoryBack = () => {
    if (!canGoHistoryBack.value) return;
    isHistoryNavigating.value = true;
    historyIndex.value -= 1;
    currentFolderId.value = folderHistory.value[historyIndex.value] || 'root';
};

const goHistoryForward = () => {
    if (!canGoHistoryForward.value) return;
    isHistoryNavigating.value = true;
    historyIndex.value += 1;
    currentFolderId.value = folderHistory.value[historyIndex.value] || 'root';
};

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
            highlightFileId: undefined, // Don't persist highlight on normal navigation
            reveal: undefined,
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

        const newFolder = await createFolderRequest(
            String(route.params.spaceId),
            String(openedOrg.value?.id),
            name,
            currentFolderId.value
        );

        if (!allFolders.value.some(f => f.id === newFolder.id)) {
            allFolders.value.push(newFolder);
        }

    } catch (e) {
        console.error("Erreur lors de la création du dossier:", e);
        toast.show((e as Error).message || "Erreur lors de la création du dossier", "error");
    } finally {
        showFolderNamePrompt.value = false;
    }

};

const showFileNamePrompt = ref<boolean>(false);

const createFile = async (payload: { name: string, ext: string }) => {

    showFileNamePrompt.value = false;

    try {

        isUploading.value = true;
        fileSendProgress.value = 0;

        const newFile = await createTextFile({
            spaceId: String(route.params.spaceId),
            name: payload.name,
            ext: payload.ext,
            folderId: currentFolderId.value,
            onProgress: (percent) => { fileSendProgress.value = percent; }
        });

        if (!allFiles.value.some(f => f.id === newFile.id)) {
            allFiles.value.push(newFile);
        }

        toast.show(`Fichier « ${newFile.originalName} » créé`, "success");

    } catch (e) {
        console.error("Erreur lors de la création du fichier:", e);
        toast.show((e as Error).message || "Erreur lors de la création du fichier", "error");
    } finally {
        isUploading.value = false;
        fileSendProgress.value = 0;
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

    // Même limite par défaut que synco_api (CDN_MAX_CHUNKED_UPLOAD_BYTES),
    // vérifiée ici pour prévenir avant d'envoyer quoi que ce soit.
    const MAX_SIZE = 10 * 1024 * 1024 * 1024;
    const oversized = selectedFiles.some(f => f.size > MAX_SIZE);
    if (oversized) 
    {
        toast.show("Un ou plusieurs fichiers dépassent la limite de 10 Go", "error");
        return;
    }

    // Plusieurs dépôts peuvent se succéder sans attendre : le gestionnaire de
    // transferts met les fichiers en file et affiche leur progression dans
    // son panneau (plus de barre partagée ici).
    try {

        const uploadedFiles = await uploadFiles(
            selectedFiles,
            {
                workspaceId: String(route.params.spaceId),
                folderId: targetFolderId === 'root' ? undefined : targetFolderId,
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
        if (isAbortError(e)) return;
        console.error("Upload Error:", e);
        toast.show("Erreur lors de l'envoi des fichiers", "error");
    } finally {
        if (fileInputRef.value) fileInputRef.value.value = '';
    }
};


const isRefreshing = ref<boolean>(false);

// Chargement de l'espace (fichiers + dossiers). En mode `silent` — le bouton
// « Recharger le dossier » de la barre d'outils — la vue reste affichée au
// lieu de repasser par le squelette de chargement.
const fetchSpaceContent = async (options: { silent?: boolean } = {}) => {

    if (options.silent) isRefreshing.value = true;
    else loading.value = true;

    try {

        const res = await sfetch(`/api/spaces/${route.params.spaceId}/files`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        allFiles.value = data.files || [];
        allFolders.value = data.folders || [];
        loadedSpaceId = String(route.params.spaceId);

        handleRouteQuery();

    } catch (e) {
        console.error("Erreur:", e);
        if (options.silent) toast.show("Impossible de recharger le dossier", "error");
    } finally {
        loading.value = false;
        isRefreshing.value = false;
    }

};

const refreshFolder = () => fetchSpaceContent({ silent: true });

onMounted(async() => {

    window.addEventListener('keydown', handleSelectAllShortcut);

    await fetchSpaceContent();
    
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
    window.removeEventListener('keydown', handleSelectAllShortcut);
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

// Fait défiler jusqu'à un fichier et le met en surbrillance quelques
// secondes (styles en ligne : indépendants des classes de la carte).
const highlightFile = (fileId: string) => {
    // Laisse le temps au dossier ouvert de s'afficher.
    setTimeout(() => {
        const el = document.getElementById('file-' + fileId);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        }, 4000);
    }, 600);
};

// Espace dont allFiles reflète le contenu : un ?reveal arrivé avant son
// chargement attend fetchSpaceContent (qui rappelle handleRouteQuery).
let loadedSpaceId: string | null = null;

const handleRouteQuery = () => {
    const urlPath = route.query.path as string;
    const folderId = route.query.folderId as string;
    const highlightFileId = route.query.highlightFileId as string;
    const selectFileId = route.query.select as string | undefined;
    // ?reveal=<fileId> : « Afficher dans les fichiers » depuis une pièce
    // jointe ou une référence <file:id> — ouvre le dossier du fichier, quel
    // qu'il soit, et le met en surbrillance.
    const revealFileId = route.query.reveal as string | undefined;

    if (revealFileId) {
        if (loadedSpaceId !== String(route.params.spaceId)) return;
        const found = allFiles.value.find(f => f.id === revealFileId);
        router.replace({ query: { ...route.query, reveal: undefined } });
        if (!found) {
            toast.show('Ce fichier n\'est plus dans cet espace (déplacé ou supprimé).', 'warning');
            return;
        }
        currentFolderId.value = found.folderId || 'root';
        highlightFile(found.id);
        return;
    }

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

    if (highlightFileId) highlightFile(highlightFileId);
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