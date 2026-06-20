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
                                
                                    <button class="glass" @click.stop="downloadFile(file.id)">
                                        <i class="bi bi-download" />
                                    </button>

                                    <DropDown align="right">
                                        <template #trigger>
                                            <button class="glass" @click.stop>
                                                <i class="bi bi-three-dots-vertical" />
                                            </button>
                                        </template>
                                        <template #content>
                                            <button 
                                                @click.stop="showFileInfo(file)"
                                                class="dropdown-item-annimate dropdown-item-style gap-2"
                                            >
                                                <i class="bi bi-info-circle" />
                                                Voir les infos
                                            </button>
                                            <button 
                                                @click.stop="viewMessagesWithFile(file)"
                                                class="dropdown-item-annimate dropdown-item-style gap-2"
                                            >
                                                <i class="bi bi-chat-left" />
                                                Voir les messages
                                            </button>
                                            <button 
                                                @click.stop="deleteFile(file)"
                                                class="dropdown-item-annimate dropdown-item-style gap-2 text-red-400 hover:bg-red-500/10"
                                            >
                                                <i class="bi bi-trash" />
                                                Supprimer
                                            </button>
                                        </template>
                                    </DropDown>

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

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile } from '@/assets/utils/downloadFile';
import DropDown from '@/components/DropDown.vue';
import type { StoredFile } from '@/types/types';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';

const toast = useToast();
const router = useRouter();

const props = defineProps<{
    file: StoredFile,
    draggedFileId: string | number | null
}>();

const emit = defineEmits(['file-deleted', 'show-file-info']);

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

// Show file info - emit event for parent to handle
const showFileInfo = (file: StoredFile) => {
    emit('show-file-info', file);
};

// View messages that contain this file
const viewMessagesWithFile = async (file: StoredFile) => {
    try {
        if (!file.workspaceId) {
            toast.show('Ce fichier nest pas lié à un espace', 'error');
            return;
        }
        
        // Fetch messages containing this file
        const response = await sfetch(`/api/spaces/${file.workspaceId}/files/${file.id}/messages`, {
            method: 'GET'
        });
        
        const data = await response.json();
        
        // If there are thread messages, navigate to the first one
        if (data.threadMessages && data.threadMessages.length > 0) {
            const firstThreadMessage = data.threadMessages[0];
            router.push({
                name: 'OrgThreadChat',
                params: { threadId: firstThreadMessage.threadId },
                query: { select: firstThreadMessage.id }
            });
        } 
        // If there are DM messages, we would need to handle that differently
        else if (data.dmMessages && data.dmMessages.length > 0) {
            toast.show('Fichier partagé en message privé - navigation non implémentée', 'info');
        }
        else {
            toast.show('Aucun message ne contient ce fichier', 'info');
        }
    } catch (error) {
        console.error('Error fetching file messages:', error);
        toast.show('Erreur lors de la récupération des messages', 'error');
    }
};

// Delete file
const deleteFile = async (file: StoredFile) => {
    if (!file.workspaceId) {
        toast.show('Impossible de supprimer ce fichier', 'error');
        return;
    }
    
    try {
        const response = await sfetch(`/api/spaces/${file.workspaceId}/files/${file.id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            toast.show('Fichier supprimé avec succès', 'success');
            emit('file-deleted', file.id);
        } else {
            const errorData = await response.json();
            toast.show(errorData.error || 'Erreur lors de la suppression', 'error');
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        toast.show('Erreur lors de la suppression du fichier', 'error');
    }
};


</script>