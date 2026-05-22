<template>

    <div 
        class="max-w-full group flex items-center gap-3 p-3 bg-(--bg2)/40 border border-white/5 rounded-xl transition-all cursor-pointer shadow-sm"
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

</template>

<script lang="ts" setup>  

import type { Folder, StoredFile } from '@/types/types';

defineProps<{
    folder: Folder,
    draggedIntoFolderId: any,
    draggedSourceFolderId: any,
    allFiles: StoredFile[]
}>();

</script>