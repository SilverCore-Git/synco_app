<template>

    <div 
        v-bind="$attrs"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
        @click="handleClick"
        class="max-w-full group flex items-center gap-3 p-3 bg-(--bg2)/40 border rounded-xl transition-all cursor-pointer shadow-sm"
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
                @click.stop="showEditFolder = true"
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
            <DropDown align="right" @click.stop @toggled="val => isDropdownOpen = val">
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
                        @click="showEditFolder = true"
                        class="dropdown-item-annimate dropdown-item-style gap-2"
                    >
                        <i class="bi bi-pencil" />
                        Renommer
                    </button>
                    <button 
                        @click="$emit('show-permissions', folder)"
                        class="dropdown-item-annimate dropdown-item-style gap-2"
                    >
                        <i class="bi bi-shield-lock" />
                        Permissions
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

const emit = defineEmits(['toggle-select', 'click', 'show-permissions']);

let longPressTimer: any = null;

const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
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

const handleClick = (e: Event) => {
    if (props.isSelectionMode) {
        e.stopPropagation();
        emit('toggle-select');
    }
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

</script>