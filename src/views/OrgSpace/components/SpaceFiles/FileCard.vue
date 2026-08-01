<template>

    <div 
        v-bind="$attrs"
        @click="showViewer = true"
        :class="[
            draggedFileId === file.id ? 'opacity-40 grayscale-50' : '',
            'max-w-full group flex items-center gap-3 p-3 bg-(--bg2)/40 border border-(--border-color) rounded-xl transition-all cursor-pointer shadow-sm hover:border-(--primary)/50 hover:bg-(--primary)/5'
        ]"
    >
        <div 
            class="
                w-10 h-10 flex items-center justify-center 
                rounded-lg bg-black/20 border border-(--border-color) shrink-0
            "
        >
            <i 
                :class="[getFileInfo(file).icon, getFileInfo(file).color]" 
                class="text-xl transition-transform group-hover:scale-110 duration-300" 
            />
        </div>

        <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-(--text)/90 truncate">{{ file.originalName }}</p>
            <div class="flex items-center gap-2 text-[9px] font-bold text-(--text)/40 uppercase tracking-tighter mt-1">
                <span>{{ formatSize(file.size) }}</span>
                <span>•</span>
                <span>{{ file.originalName.split('.').pop() }}</span>
                <template v-if="file.createdAt">
                    <span>•</span>
                    <span>{{ formatDate(file.createdAt) }}</span>
                </template>
            </div>
        </div>

        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
            <button class="w-8 h-8 rounded-lg hover:bg-(--primary)/10 flex items-center justify-center transition-colors hover:text-(--primary)" @click.stop="downloadFile(file.id)">
                <i class="bi bi-download text-lg" />
            </button>

            <DropDown align="right">
                <template #trigger>
                    <button class="w-8 h-8 rounded-lg hover:bg-(--primary)/10 flex items-center justify-center transition-colors hover:text-(--primary)" @click.prevent>
                        <i class="bi bi-three-dots-vertical text-lg" />
                    </button>
                </template>
                <template #content>
                    <button 
                        @click="showEditFile = true"
                        class="dropdown-item-annimate dropdown-item-style gap-2"
                    >
                        <i class="bi bi-pencil" />
                        Renommer
                    </button>
                    <button 
                        @click="showFileInfo(file)"
                        class="dropdown-item-annimate dropdown-item-style gap-2"
                    >
                        <i class="bi bi-info-circle" />
                        Voir les infos
                    </button>
                    <button 
                        v-if="file.messageId || file.dmMessageId"
                        @click="viewMessagesWithFile(file)"
                        class="dropdown-item-annimate dropdown-item-style gap-2"
                    >
                        <i class="bi bi-chat-left" />
                        Voir le message
                    </button>
                    <button 
                        @click="deleteFile(file)"
                        class="dropdown-item-annimate dropdown-item-style gap-2 text-red-500! hover:bg-red-500/5!"
                    >
                        <i class="bi bi-trash" />
                        Supprimer
                    </button>
                </template>
            </DropDown>
        </div>

    </div>

    <EditFile
        :is-open="showEditFile"
        :file="file"
        @close="showEditFile = false"
    />

    <FileViewer
        :is-open="showViewer"
        :file="file"
        @close="showViewer = false"
        @updated="onFileUpdated"
        @deleted="emit('file-deleted', file.id)"
    />

</template>

<script lang="ts" setup>

import { useRouter, useRoute } from 'vue-router';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile } from '@/assets/utils/downloadFile';
import DropDown from '@/components/DropDown.vue';
import EditFile from '../popup/EditFile.vue';
import FileViewer from '../popup/FileViewer.vue';
import type { StoredFile } from '@/types/types';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import { ref } from 'vue';

const toast = useToast();
const router = useRouter();
const route = useRoute();

const showEditFile = ref<boolean>(false);
const showViewer = ref<boolean>(false);

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

// View message that contains this file
const viewMessagesWithFile = async (file: StoredFile) => {
    try {
        if (!file.workspaceId) {
            toast.show('Ce fichier n\'est pas lié à un espace', 'error');
            return;
        }
        
        // Fetch messages containing this file
        const response = await sfetch(`/api/spaces/${file.workspaceId}/files/${file.id}/messages`, {
            method: 'GET'
        });
        
        const data = await response.json();
        
        // If there are thread messages, navigate to the space thread
        if (data.threadMessages && data.threadMessages.length > 0) {
            const firstThreadMessage = data.threadMessages[0];
            router.push({
                name: 'SpaceThreadView',
                params: { 
                    orgId: route.params.orgId,
                    spaceId: file.workspaceId,
                    threadId: firstThreadMessage.threadId 
                },
                query: { select: firstThreadMessage.id }
            });
        } 
        // If there are DM messages, navigate to the DM chat
        else if (data.dmMessages && data.dmMessages.length > 0) {
            const dm = data.dmMessages[0];
            router.push({
                name: 'OrgThreadChat',
                params: { 
                    orgId: route.params.orgId,
                    userId: dm.senderId
                },
                query: { select: dm.id }
            });
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

const onFileUpdated = (updatedMetadata: any) => {
    Object.assign(props.file, updatedMetadata);
};

</script>