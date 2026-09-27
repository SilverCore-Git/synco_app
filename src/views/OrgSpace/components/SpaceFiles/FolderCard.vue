<template>

    <div 
        v-bind="$attrs"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
        @click="handleClick"
        @contextmenu.prevent.stop="handleContextMenu"
        class="max-w-full group flex items-center gap-3 p-3 bg-(--bg2)/40 border rounded-xl transition-all cursor-pointer shadow-sm select-none"
        :class="[
            draggedIntoFolderId === folder.id 
                ? 'ring-2 ring-(--primary) bg-(--primary)/10 border-(--primary)/50'
                : '',
            isSelected 
                ? 'border-(--primary) bg-(--primary)/10'
                : 'border-(--border-color) hover:border-(--primary)/50 hover:bg-(--primary)/5',
            draggedSourceFolderId === folder.id ? 'opacity-40 grayscale-50' : ''
        ]"
    >
        <!-- Selection Checkbox -->
        <button 
            v-if="isSelectionMode"
            @click.stop="$emit('toggle-select')"
            class="shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-all duration-200"
            :class="[
                isSelected 
                    ? 'bg-(--primary) border-(--primary) text-white' 
                    : 'border-(--text)/30 hover:border-(--primary) text-transparent'
            ]"
        >
            <i v-if="isSelected" class="bi bi-check text-sm" />
        </button>

            <div 
                @click.stop="onIconClick"
                class="
                    group/icon w-10 h-10 flex items-center justify-center 
                    rounded-lg group-hover:scale-110 transition-transform cursor-pointer
                "
                :class="[
                    colorTextMap[folder.color || 'yellow'],
                    colorBgMap[folder.color || 'yellow']
                ]"
            >
            
            <i class="bi bi-folder-fill text-xl z-10 group-hover:opacity-10 transition-all duration-300" />
            
            <i class="
                bi bi-pencil-fill text-xl text-(--primary)
                absolute opacity-0 z-20 transition-all duration-200
                group-hover/icon:opacity-100 group-hover:opacity-50
            " />

        </div>

        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
                <p class="text-sm font-semibold text-(--text) truncate">{{ folder.name }}</p>
                <i v-if="folder._count?.folderPermissions" class="bi bi-shield-lock-fill text-xs text-(--primary)" title="Permissions spécifiques" />
            </div>
            <p class="text-[9px] text-(--text2) font-bold uppercase tracking-tighter">
                {{ allFiles.filter(f => f.folderId === folder.id).length }} fichiers
            </p>
        </div>

        <div 
            class="flex items-center gap-1 transition-opacity pr-1"
            :class="isDropdownOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        >
            <button 
                class="w-8 h-8 rounded-lg hover:bg-(--primary)/10 flex items-center justify-center transition-colors hover:text-(--primary)" 
                title="Télécharger le dossier (.zip)"
                @click.stop="$emit('download')"
            >
                <i class="bi bi-download text-lg" />
            </button>

            <DropDown ref="dropdownRef" align="mouse" @click.stop @toggled="val => isDropdownOpen = val">
                <template #trigger>
                    <button class="w-8 h-8 rounded-lg hover:bg-(--primary)/10 flex items-center justify-center transition-colors hover:text-(--primary)">
                        <i class="bi bi-three-dots-vertical text-lg" />
                    </button>
                </template>
                <template #content>
                    <button 
                        v-if="!isSelectionMode"
                        @click="$emit('toggle-select')"
                        class="dropdown-item-annimate dropdown-item-style gap-2"
                    >
                        <i class="bi bi-check2-square" />
                        Sélectionner
                    </button>
                    <button 
                        @click="$emit('download')"
                        class="dropdown-item-annimate dropdown-item-style gap-2"
                    >
                        <i class="bi bi-download" />
                        Télécharger (.zip)
                    </button>
                    <button 
                        @click="showEditFolder = true"
                        class="dropdown-item-annimate dropdown-item-style gap-2"
                    >
                        <i class="bi bi-pencil" />
                        Renommer
                    </button>
                    <button 
                        v-if="user?.id === folder.ownerId"
                        @click="$emit('show-permissions', folder)"
                        class="dropdown-item-annimate dropdown-item-style gap-2"
                    >
                        <i class="bi bi-shield-lock" />
                        Gérer les accès
                    </button>
                    <button 
                        @click="$emit('request-delete', folder.id)"
                        class="dropdown-item-annimate dropdown-item-style gap-2 text-red-500! hover:bg-red-500/5!"
                    >
                        <i class="bi bi-trash" />
                        Supprimer
                    </button>
                </template>
            </DropDown>
        </div>

    </div>

    <EditFolder
        :is-open="showEditFolder"
        :folder="folder"
        @close="showEditFolder = false"
    />

</template>

<script lang="ts" setup>  

import type { Folder, StoredFile } from '@/types/types';
import { user } from '@/assets/var';
import { ref } from 'vue';
import EditFolder from '../popup/EditFolder.vue';
import DropDown from '@/components/DropDown.vue';

const props = defineProps<{
    folder: Folder,
    draggedIntoFolderId: any,
    draggedSourceFolderId: any,
    allFiles: StoredFile[],
    isSelected?: boolean,
    isSelectionMode?: boolean
}>();

const emit = defineEmits(['toggle-select', 'range-select', 'click', 'download', 'show-permissions', 'request-delete']);

let longPressTimer: any = null;

const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // CTRL/CMD/MAJ : c'est un clic de sélection, pas un appui long.
    if (selectionModifier(e)) return;
    longPressTimer = setTimeout(() => {
        emit('toggle-select');
        if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
};

const onPointerUp = () => {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
};

// CTRL/CMD → (dé)sélectionne l'élément cliqué. MAJ → sélectionne toute la
// plage entre le dernier élément sélectionné et celui-ci.
const selectionModifier = (e: MouseEvent | PointerEvent): 'toggle' | 'range' | null => {
    if (e.ctrlKey || e.metaKey) return 'toggle';
    if (e.shiftKey) return 'range';
    return null;
};

const handleClick = (e: MouseEvent) => {
    const modifier = selectionModifier(e);

    if (modifier) {
        // Empêche l'ouverture du dossier portée par le parent
        e.stopPropagation();
        e.preventDefault();
        emit(modifier === 'range' ? 'range-select' : 'toggle-select');
        return;
    }

    if (props.isSelectionMode) {
        e.stopPropagation();
        emit('toggle-select');
    }
};

// L'icône ouvre le panneau de renommage, sauf avec CTRL/MAJ où le clic sert à sélectionner.
const onIconClick = (e: MouseEvent) => {
    if (selectionModifier(e)) {
        handleClick(e);
        return;
    }
    showEditFolder.value = true;
};

const colorTextMap: Record<string, string> = {
  'yellow': 'text-yellow-500',
  'blue':   'text-blue-500',
  'red':    'text-red-500',
  'green':  'text-green-500',
  'purple': 'text-purple-500',
  'pink':   'text-pink-500',
};

const colorBgMap: Record<string, string> = {
  'yellow': 'bg-yellow-500/10',
  'blue':   'bg-blue-500/10',
  'red':    'bg-red-500/10',
  'green':  'bg-green-500/10',
  'purple': 'bg-purple-500/10',
  'pink':   'bg-pink-500/10',
};

const showEditFolder = ref<boolean>(false);
const isDropdownOpen = ref<boolean>(false);
const dropdownRef = ref<any>(null);

const handleContextMenu = (e: MouseEvent) => {
    dropdownRef.value?.toggleDropdown(e);
};

</script>