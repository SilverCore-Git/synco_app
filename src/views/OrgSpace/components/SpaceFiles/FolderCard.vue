<template>

    <div 
        class="max-w-full group flex items-center gap-3 p-3 bg-(--bg2)/40 border border-white/5 rounded-xl transition-all cursor-pointer shadow-sm"
        :class="[
            draggedIntoFolderId === folder.id 
                ? 'ring-2 ring-(--primary) bg-(--primary)/10 border-(--primary)/50'
                : 'hover:border-(--primary)/50 hover:bg-(--primary)/5',
            draggedSourceFolderId === folder.id ? 'opacity-40 grayscale-50' : ''
        ]"
    >

            <div 
                @click="showEditFolder = true"
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
            <p class="text-sm font-semibold text-(--text)/90 truncate">{{ folder.name }}</p>
            <p class="text-[9px] text-(--text)/40 font-bold uppercase tracking-tighter">
                {{ allFiles.filter(f => f.folderId === folder.id).length }} fichiers
            </p>
        </div>

        <i class="bi bi-chevron-right text-(--text)/20 group-hover:text-(--primary) transition-colors" />

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

defineProps<{
    folder: Folder,
    draggedIntoFolderId: any,
    draggedSourceFolderId: any,
    allFiles: StoredFile[]
}>();


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

</script>