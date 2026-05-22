<template>

                        <div 
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

</template>

<script lang="ts" setup>

import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile } from '@/assets/utils/downloadFile';
import type { StoredFile } from '@/types/types';

defineProps<{
    file: StoredFile,
    draggedFileId: string | number | null
}>();

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


</script>