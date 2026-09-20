<template>
    <Popup :is-open="isOpen" @close="closeModal">
        <template #title>
            <div class="flex flex-col gap-1">
                <div v-if="task?.parentTask" class="flex items-center gap-1 text-[10px] font-bold text-(--text2) uppercase hover:text-(--primary) cursor-pointer transition-colors" @click="emit('open-task', task.parentTask)">
                    <i class="bi bi-arrow-left-short text-sm"></i>
                    {{ task.parentTask.title }}
                </div>
                <div class="flex items-center gap-2">
                    <i class="bi bi-check2-square text-(--primary)"></i>
                    Détails de la Tâche
                </div>
            </div>
        </template>

        <div v-if="task" class="space-y-6 w-full max-w-full sm:w-[500px]">
            <!-- Header : chaque champ se modifie en cliquant directement dessus -->
            <div>
                <h3 v-if="!isEditingTitle" @click="startEditTitle" class="text-xl font-bold text-(--text) mb-2 break-words cursor-text rounded-lg px-2 -mx-2 py-0.5 hover:bg-(--text)/5 transition-colors" title="Cliquer pour modifier">{{ editForm.title }}</h3>
                <input
                    v-else
                    ref="titleInputEl"
                    v-model="editForm.title"
                    type="text"
                    @blur="commitEditTitle"
                    @keydown.enter="commitEditTitle"
                    @keydown.escape="cancelEditTitle"
                    class="w-full bg-black/40 border border-(--primary)/50 rounded-lg px-3 py-2 text-(--text) mb-2 font-bold focus:outline-none"
                />

                <p class="text-xs font-bold uppercase tracking-wide mb-3" :class="statusInfo.color">
                    {{ statusInfo.label }} depuis : {{ statusDuration }}
                </p>

                <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-(--text2) uppercase">
                    <span class="flex items-center gap-1 whitespace-nowrap">
                        <i class="bi bi-folder text-(--primary)/80"></i>
                        {{ task.space?.name || 'Général' }}
                    </span>
                    <span v-if="task?.creator" class="flex items-center gap-1.5 whitespace-nowrap">
                        <span class="text-(--text2)">Créée par</span>
                        <button @click.stop="(e) => task?.creator && openProfile(task.creator, e)" class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-(--text)/5 hover:bg-(--text)/10 border border-(--text)/10 text-(--text) font-bold transition-all shadow-sm" :title="'Profil de ' + $p(task.creator.name)">
                            <img v-if="task.creator.avatarUrl" :src="task.creator.avatarUrl" class="w-4 h-4 rounded-full object-cover border border-black/20">
                            <div v-else class="w-4 h-4 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black border border-black/20">
                                {{ $p(task.creator.name).substring(0, 2).toUpperCase() }}
                            </div>
                            {{ $p(task.creator.name).split(' ')[0] }}
                        </button>
                    </span>
                    <button
                        type="button"
                        @click="toggleSection('assignees')"
                        class="flex items-center gap-2 break-words rounded-md px-1.5 py-1 -mx-1.5 transition-colors"
                        :class="activeSection === 'assignees' ? 'bg-(--primary)/15 text-(--primary)' : 'hover:bg-(--text)/5'"
                        title="Cliquer pour modifier les assignés"
                    >
                        <i class="bi bi-people-fill" :class="activeSection === 'assignees' ? 'text-(--primary)' : 'text-(--primary)/80'"></i>
                        <span v-if="!task.assignees?.length">Personne</span>
                        <div v-else class="flex items-center -space-x-1.5">
                            <template v-for="assignee in task.assignees.slice(0,5)" :key="assignee.id">
                                <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="$p(assignee.name)" class="w-5 h-5 rounded-full object-cover border border-(--bg2) z-10">
                                <div v-else :title="$p(assignee.name)" class="w-5 h-5 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black border border-(--bg2) z-10">
                                    {{ $p(assignee.name).substring(0, 2).toUpperCase() }}
                                </div>
                            </template>
                            <div v-if="task.assignees.length > 5" class="w-5 h-5 rounded-full bg-(--text)/10 text-(--text) flex items-center justify-center text-[8px] font-black border border-(--bg2) z-10">
                                +{{ task.assignees.length - 5 }}
                            </div>
                        </div>
                    </button>
                    <button
                        type="button"
                        @click="toggleSection('date')"
                        class="flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 -mx-1.5 transition-colors"
                        :class="activeSection === 'date' ? 'bg-(--primary)/15 text-(--primary)' : (editForm.dueDate ? 'text-(--primary) hover:bg-(--text)/5' : 'hover:bg-(--text)/5')"
                        title="Cliquer pour modifier l'échéance"
                    >
                        <i class="bi bi-calendar-event"></i>
                        {{ dueDateLabel }}
                    </button>
                    <button
                        v-if="task.spaceId"
                        type="button"
                        @click="toggleSection('linkedFiles')"
                        class="flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 -mx-1.5 transition-colors"
                        :class="activeSection === 'linkedFiles' ? 'bg-(--primary)/15 text-(--primary)' : 'hover:bg-(--text)/5'"
                        title="Cliquer pour lier/voir des fichiers"
                    >
                        <i class="bi bi-link-45deg"></i>
                        {{ task.linkedFiles?.length ? `${task.linkedFiles.length} fichier${task.linkedFiles.length > 1 ? 's' : ''} lié${task.linkedFiles.length > 1 ? 's' : ''}` : 'Aucun fichier lié' }}
                    </button>
                </div>

                <button type="button" @click="toggleSection('tags')" class="flex flex-wrap items-center gap-1.5 mt-3 rounded-lg -mx-1.5 px-1.5 py-1 transition-colors" :class="activeSection === 'tags' ? 'bg-(--primary)/10' : 'hover:bg-(--text)/5'" title="Cliquer pour modifier les tags">
                    <span
                        v-for="tag in task.tags" :key="tag.id"
                        class="px-2.5 py-1 rounded-full text-[10px] font-bold border"
                        :style="{ borderColor: tag.color, color: tag.color }"
                    >
                        {{ tag.name }}
                    </span>
                    <span v-if="!task.tags?.length" class="text-[11px] font-bold text-(--text2) flex items-center gap-1">
                        <i class="bi bi-tag"></i>
                        Aucun tag
                    </span>
                </button>
            </div>

            <!-- Description -->
            <div class="bg-(--text)/5 rounded-xl p-4 border border-(--text)/10">
                <h4 class="text-xs font-bold text-(--text2) uppercase mb-2">Description</h4>
                <p
                    v-if="!isEditingDescription"
                    @click="startEditDescription"
                    class="text-sm whitespace-pre-wrap cursor-text rounded-lg -mx-2 px-2 py-1 hover:bg-(--text)/5 transition-colors"
                    :class="editForm.description ? 'text-(--text)/80' : 'text-(--text2) italic'"
                    title="Cliquer pour modifier"
                >{{ editForm.description || 'Aucune description fournie. Cliquez pour en ajouter une.' }}</p>
                <textarea
                    v-else
                    ref="descriptionInputEl"
                    v-model="editForm.description"
                    @blur="isEditingDescription = false"
                    @keydown.escape="cancelEditDescription"
                    @paste="handlePaste"
                    @dragenter.prevent="onAttachmentsDragEnter"
                    @dragover.prevent
                    @dragleave.prevent="onAttachmentsDragLeave"
                    @drop.prevent="onAttachmentsDrop"
                    rows="3"
                    class="w-full bg-black/40 border border-(--primary)/50 rounded-lg px-3 py-2 text-(--text)/80 placeholder:opacity-60 resize-none focus:outline-none"
                    placeholder="Plus de détails..."
                ></textarea>

                <!-- Barre d'images : toute la zone est cliquable ; Ctrl+V et glisser-déposer marchent aussi ici -->
                <div
                    :tabindex="uploadingImage ? -1 : 0"
                    role="button"
                    aria-label="Ajouter une image"
                    @click="!uploadingImage && imageInput?.click()"
                    @keydown.enter.prevent="!uploadingImage && imageInput?.click()"
                    @keydown.space.prevent="!uploadingImage && imageInput?.click()"
                    @paste="handlePaste"
                    @dragenter.prevent="onAttachmentsDragEnter"
                    @dragover.prevent
                    @dragleave.prevent="onAttachmentsDragLeave"
                    @drop.prevent="onAttachmentsDrop"
                    class="mt-3 flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 transition-colors cursor-pointer hover:border-(--primary)/50 hover:bg-(--primary)/5 focus:outline-none focus:border-(--primary)/50"
                    :class="[isAttachmentsDragOver ? 'border-(--primary) bg-(--primary)/5' : 'border-(--border-color)', uploadingImage ? 'opacity-50 pointer-events-none' : '']"
                >
                    <i v-if="uploadingImage" class="bi bi-arrow-repeat animate-spin text-(--text2) shrink-0"></i>
                    <i v-else class="bi bi-paperclip text-(--text2) shrink-0"></i>
                    <div v-if="task.attachments?.length" class="flex items-center gap-1.5 overflow-x-auto">
                        <div
                            v-for="attachment in task.attachments" :key="attachment.id"
                            class="relative group w-8 h-8 rounded-md overflow-hidden border border-(--border-color) shrink-0 cursor-pointer bg-(--bg3)"
                            @click.stop="openAttachment(attachment)"
                        >
                            <img v-if="attachmentPreviews[attachment.id]" :src="attachmentPreviews[attachment.id]" class="w-full h-full object-cover" />
                            <i v-else class="bi bi-image absolute inset-0 flex items-center justify-center text-(--text2) text-xs"></i>
                            <button
                                type="button"
                                @click.stop="removeAttachment(attachment)"
                                title="Retirer la pièce jointe"
                                class="absolute top-0 right-0 w-4 h-4 rounded-bl-md bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-red-500"
                            >
                                <i class="bi bi-x-lg text-[8px]"></i>
                            </button>
                        </div>
                    </div>
                    <span v-else class="text-xs text-(--text2)">Cliquez, glissez ou collez une image ici</span>
                </div>
                <input ref="imageInput" type="file" accept="image/*" multiple hidden @change="onPickImages" />
            </div>

            <!-- Volet d'édition : ouvert en cliquant sur le champ correspondant dans l'en-tête ci-dessus -->
            <div v-if="activeSection">
                <div class="bg-(--text)/5 rounded-xl p-4 border border-(--text)/10">

                    <template v-if="activeSection === 'date'">
                        <div class="flex gap-2">
                            <input
                                v-model="editForm.dueDate"
                                type="date"
                                class="w-full bg-black/40 border border-(--text)/20 rounded-lg px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50"
                                :disabled="loading"
                            />
                            <input
                                v-model="editForm.dueTime"
                                type="time"
                                class="w-28 bg-black/40 border border-(--text)/20 rounded-lg px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50"
                                :disabled="loading"
                            />
                            <button v-if="editForm.dueDate" type="button" @click="editForm.dueDate = ''; editForm.dueTime = ''" class="text-(--text2) hover:text-red-500 transition-colors px-2" title="Retirer l'échéance">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </template>

                    <template v-else-if="activeSection === 'assignees'">
                        <div class="relative mb-2">
                            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm"></i>
                            <input
                                v-model="searchAssignee"
                                placeholder="Rechercher une personne..."
                                class="w-full bg-black/40 border border-(--text)/20 rounded-xl pl-9 pr-4 py-2 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
                                :disabled="loading"
                            />
                        </div>
                        <div class="max-h-40 overflow-y-auto space-y-2">
                            <label v-for="member in filteredMembers" :key="member.id" class="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    :value="member.userId"
                                    v-model="editForm.assigneeIds"
                                    class="w-4 h-4 rounded bg-black/20 border-(--text)/20 text-(--primary) focus:ring-(--primary) focus:ring-offset-0"
                                    :disabled="loading"
                                />
                                <div class="flex items-center gap-2">
                                    <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-6 h-6 rounded-full object-cover">
                                    <div v-else class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[10px] font-bold">
                                        {{ ($p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                                    </div>
                                    <span class="text-sm font-medium text-(--text) group-hover:text-(--primary) transition-colors">
                                        {{ $p(member.user?.name) || member.userId }}
                                    </span>
                                </div>
                            </label>
                            <div v-if="filteredMembers.length === 0" class="text-xs text-center text-(--text2) py-2">
                                Aucun résultat
                            </div>
                        </div>
                    </template>

                    <template v-else-if="activeSection === 'tags'">
                        <TaskTagPicker
                            :orgId="route.params.orgId as string"
                            v-model="editForm.tagIds"
                        />
                    </template>

                    <template v-else-if="activeSection === 'linkedFiles'">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold text-(--text2) uppercase">Fichiers liés</span>
                            <button type="button" @click="showFilePicker = true" class="text-[11px] font-bold text-(--text2) hover:text-(--primary) flex items-center gap-1">
                                <i class="bi bi-link-45deg"></i>
                                Lier un fichier
                            </button>
                        </div>
                        <div v-if="task.linkedFiles?.length" class="space-y-1.5 max-h-52 overflow-y-auto">
                            <div
                                v-for="link in task.linkedFiles" :key="link.id"
                                class="flex items-center gap-3 p-2 rounded-lg border border-(--border-color) hover:border-(--primary)/50 cursor-pointer group transition-colors"
                                @click="openLinkedFile(link)"
                            >
                                <div class="w-8 h-8 flex items-center justify-center rounded-lg bg-(--bg3) shrink-0">
                                    <i :class="[getFileInfo(link.file as any).icon, getFileInfo(link.file as any).color]" class="text-base" />
                                </div>
                                <p class="flex-1 min-w-0 text-sm font-semibold text-(--text) truncate">{{ link.file.originalName }}</p>
                                <button
                                    type="button"
                                    @click.stop="unlinkFile(link)"
                                    class="text-(--text2) hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <i class="bi bi-x-lg"></i>
                                </button>
                            </div>
                        </div>
                        <p v-else class="text-xs text-(--text2) italic">Aucun fichier lié.</p>
                    </template>

                </div>
            </div>

            <div v-if="saveStatus !== 'idle'" class="flex justify-end items-center gap-2 text-xs font-semibold text-(--text2)">
                <i v-if="saveStatus === 'saving'" class="bi bi-arrow-repeat animate-spin"></i>
                <i v-else-if="saveStatus === 'saved'" class="bi bi-check-circle-fill text-green-500"></i>
                <span>{{ saveStatusLabel }}</span>
            </div>

            <!-- Subtasks -->
            <div class="space-y-3">
                <div class="flex items-center justify-between border-b border-(--text)/10 pb-2">
                    <h4 class="text-sm font-bold text-(--text) flex items-center gap-2">
                        <i class="bi bi-list-nested text-(--primary)"></i>
                        Sous-tâches
                        <span class="bg-(--text)/10 text-xs px-2 py-0.5 rounded-full font-normal">
                            {{ task.subtasks?.length || 0 }}
                        </span>
                    </h4>
                    
                    <!-- Create Subtask -->
                    <CreateTaskModal 
                        :defaultSpaceId="task.spaceId" 
                        :hideSpaceSelect="true" 
                        :parentTaskId="task.id"
                        @created="onSubtaskCreated"
                    >
                        <button class="primary !text-xs !px-3 !py-1.5">
                            + Ajouter
                        </button>
                    </CreateTaskModal>
                </div>
                
                <div class="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    <div v-for="subtask in task.subtasks" :key="subtask.id" 
                         @click="emit('open-task', subtask)"
                         class="bg-black/20 border border-(--border-color) rounded-xl p-3 flex flex-col gap-2 group cursor-pointer hover:border-(--primary)/50 transition-colors">
                        <div class="flex items-start justify-between">
                            <div class="flex items-center gap-3">
                                <button @click.stop="toggleSubtaskStatus(subtask)" class="text-xl transition-colors mt-0.5" :class="subtask.status === 'DONE' ? 'text-green-500' : 'text-(--text2) hover:text-(--primary)'">
                                    <i class="bi" :class="subtask.status === 'DONE' ? 'bi-check-circle-fill' : 'bi-circle'"></i>
                                </button>
                                <span class="text-sm font-bold" :class="subtask.status === 'DONE' ? 'text-(--text2) line-through' : 'text-(--text)'">{{ subtask.title }}</span>
                            </div>
                            <button @click.stop="deleteSubtask(subtask.id)" class="text-red-500/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <i class="bi bi-trash-fill"></i>
                            </button>
                        </div>

                        <div class="flex items-center justify-between pl-8" v-if="subtask.assignees?.length || subtask.dueDate">
                            <div class="flex items-center -space-x-1.5" v-if="subtask.assignees?.length">
                                <template v-for="assignee in subtask.assignees.slice(0,3)" :key="assignee.id">
                                    <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="$p(assignee.name)" class="w-5 h-5 rounded-full object-cover border-2 border-black/20 z-10 hover:z-20">
                                    <div v-else :title="$p(assignee.name)" class="w-5 h-5 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black border-2 border-black/20 z-10 hover:z-20">
                                        {{ $p(assignee.name).substring(0, 2).toUpperCase() }}
                                    </div>
                                </template>
                            </div>
                            <div v-else></div>

                            <div v-if="subtask.dueDate" class="text-[9px] font-bold uppercase tracking-widest text-(--primary)">
                                Échéance: {{ new Date(subtask.dueDate).toLocaleDateString() }}
                            </div>
                        </div>
                    </div>
                    
                    <div v-if="!task.subtasks || task.subtasks.length === 0" class="text-xs text-(--text2) italic text-center py-4">
                        Aucune sous-tâche pour le moment.
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <div class="flex items-center justify-between w-full">
                <div class="flex items-center gap-4">
                    <button @click="archiveTask" class="text-xs text-amber-500 font-bold hover:underline" :disabled="loading">
                        Archiver la tâche
                    </button>
                    <button @click="deleteTask" class="text-xs text-red-500 font-bold hover:underline" :disabled="loading">
                        Supprimer la tâche
                    </button>
                </div>
                <button @click="closeModal" class="default bg-(--text)/10 text-(--text) hover:bg-(--text)/20">
                    Fermer
                </button>
            </div>
        </template>
    </Popup>

    <ConfirmDelete
        :show="showDeleteConfirm"
        item-type="la tâche"
        :item-name="task?.title || 'cette tâche'"
        :loading="deleting"
        @cancel="showDeleteConfirm = false"
        @confirm="confirmDeleteTask"
    />

    <FileViewer
        v-if="viewingFile"
        :file="viewingFile"
        :isOpen="!!viewingFile"
        @close="viewingFile = null"
        @deleted="onAttachmentViewerDeleted"
    />

    <FilePickerModal
        v-if="task?.spaceId"
        :isOpen="showFilePicker"
        :spaceId="task.spaceId"
        @close="showFilePicker = false"
        @select="onFileLinked"
    />
</template>

<script setup lang="ts">
import { ref, watch, reactive, computed, nextTick, onBeforeUnmount } from 'vue';
import Popup from '@/components/Popup.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import CreateTaskModal from './CreateTaskModal.vue';
import TaskTagPicker from './TaskTagPicker.vue';
import FileViewer from './FileViewer.vue';
import FilePickerModal from './FilePickerModal.vue';
import type { Task, OrgMember, TaskAttachment, TaskLinkedFile, StoredFile } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';
import { useRoute } from 'vue-router';
import { useToast } from '@/composables/useToast';
import confetti from 'canvas-confetti';
import { openedOrg } from '@/assets/var';
import { openProfile } from '@/composables/useProfile';
import uploadFile from '@/assets/uploadFile';
import { getFilePreviewUrl } from '@/assets/utils/downloadFile';
import { getFileInfo } from '@/assets/utils/getFileIcon';

const props = defineProps<{
    task: Task | null;
    isOpen: boolean;
    startInEditMode?: boolean;
}>();

const emit = defineEmits(['close', 'update', 'delete', 'open-task']);
const route = useRoute();
const toast = useToast();

const loading = ref(false);

// ── Édition au clic, champ par champ (pas de mode "édition" global) ────
const isEditingTitle = ref(false);
const isEditingDescription = ref(false);
const titleInputEl = ref<HTMLInputElement | null>(null);
const descriptionInputEl = ref<HTMLTextAreaElement | null>(null);

const startEditTitle = () => {
    isEditingTitle.value = true;
    nextTick(() => titleInputEl.value?.focus());
};

// Un titre vide n'est jamais valide : on revient au dernier titre connu
// plutôt que de laisser le champ affiché vide après un blur/Enter.
const commitEditTitle = () => {
    if (!editForm.title.trim() && props.task) editForm.title = props.task.title;
    isEditingTitle.value = false;
};

const cancelEditTitle = () => {
    if (props.task) editForm.title = props.task.title;
    isEditingTitle.value = false;
};

const startEditDescription = () => {
    isEditingDescription.value = true;
    nextTick(() => descriptionInputEl.value?.focus());
};

const cancelEditDescription = () => {
    if (props.task) editForm.description = props.task.description || '';
    isEditingDescription.value = false;
};

// ── Pièces jointes (images) ─────────────────────────────────────────
const imageInput = ref<HTMLInputElement | null>(null);
const uploadingImage = ref(false);
const attachmentPreviews = ref<Record<string, string>>({});
const viewingFile = ref<StoredFile | null>(null);
let viewingAttachmentId: string | null = null;
let viewingLinkedFileId: string | null = null;

const resolveAttachmentPreview = async (attachment: TaskAttachment) => {
    if (attachmentPreviews.value[attachment.id]) return;
    try {
        const preview = await getFilePreviewUrl(attachment.id);
        attachmentPreviews.value[attachment.id] = preview.url;
    } catch (e) {
        console.error('[TaskDetailsModal] Failed to load attachment preview', e);
    }
};

const resolveAllAttachmentPreviews = () => {
    (props.task?.attachments || []).forEach(resolveAttachmentPreview);
};

// `props.task` vient souvent d'une liste/Kanban qui ne charge qu'un
// _count.attachments (pas les pièces jointes elles-mêmes, cf. tasksService.ts)
// — sans ce refetch, la popup pouvait ne jamais afficher de pièce jointe pour
// une tâche ouverte depuis le Kanban, même juste après en avoir ajouté une.
const refreshTaskAttachments = async () => {
    if (!props.task) return;
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${props.task.id}`);
        if (!res.ok) return;
        const fullTask = await res.json();
        if (!props.task || props.task.id !== fullTask.id) return; // la tâche a changé entre-temps
        props.task.attachments = fullTask.attachments;
        props.task.linkedFiles = fullTask.linkedFiles;
        resolveAllAttachmentPreviews();
    } catch (e) {
        console.error('[TaskDetailsModal] Failed to refresh task attachments', e);
    }
};

const uploadAttachments = async (files: File[]) => {
    if (!props.task) return;
    uploadingImage.value = true;
    try {
        for (const file of files) {
            const uploaded = await uploadFile(file, { taskId: props.task.id, workspaceId: props.task.spaceId || undefined });
            if (!props.task.attachments) props.task.attachments = [];
            props.task.attachments.unshift(uploaded);
            resolveAttachmentPreview(uploaded);
        }
        emit('update', props.task);
    } catch (e) {
        toast.show('Erreur lors de l\'ajout de l\'image', 'error');
    } finally {
        uploadingImage.value = false;
    }
};

const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    if (files.length) uploadAttachments(files);
};

const onPickImages = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) uploadAttachments(Array.from(input.files));
    input.value = '';
};

const isAttachmentsDragOver = ref(false);
let attachmentsDragCounter = 0;

const onAttachmentsDragEnter = () => {
    attachmentsDragCounter++;
    isAttachmentsDragOver.value = true;
};

const onAttachmentsDragLeave = () => {
    attachmentsDragCounter = Math.max(0, attachmentsDragCounter - 1);
    if (attachmentsDragCounter === 0) isAttachmentsDragOver.value = false;
};

const onAttachmentsDrop = (e: DragEvent) => {
    attachmentsDragCounter = 0;
    isAttachmentsDragOver.value = false;
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) uploadAttachments(files);
};

const openAttachment = async (attachment: TaskAttachment) => {
    try {
        const res = await sfetch(`/api/cdn/meta/${attachment.id}`);
        if (!res.ok) throw new Error();
        viewingAttachmentId = attachment.id;
        viewingLinkedFileId = null;
        viewingFile.value = await res.json();
    } catch (e) {
        toast.show('Impossible de charger la pièce jointe', 'error');
    }
};

// Le bouton "Supprimer" de FileViewer supprime le fichier réel : pour une
// pièce jointe cela retire l'image de la tâche, pour un fichier lié cela
// supprime le fichier du gestionnaire de fichiers (le lien disparaît en
// cascade côté serveur) — deux conséquences différentes, d'où le suivi
// séparé de quel type de fichier est actuellement ouvert dans la visionneuse.
const onAttachmentViewerDeleted = () => {
    if (props.task && viewingAttachmentId) {
        removeAttachmentLocally(viewingAttachmentId);
    } else if (props.task && viewingLinkedFileId) {
        removeLinkedFileLocally(viewingLinkedFileId);
    }
    viewingFile.value = null;
};

const removeAttachmentLocally = (attachmentId: string) => {
    if (!props.task?.attachments) return;
    props.task.attachments = props.task.attachments.filter(a => a.id !== attachmentId);
    if (attachmentPreviews.value[attachmentId]) {
        delete attachmentPreviews.value[attachmentId];
    }
    emit('update', props.task);
};

const removeAttachment = async (attachment: TaskAttachment) => {
    try {
        const res = await sfetch(`/api/cdn/${attachment.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        removeAttachmentLocally(attachment.id);
    } catch (e) {
        toast.show('Erreur lors de la suppression de la pièce jointe', 'error');
    }
};

// ── Fichiers liés ────────────────────────────────────────────────────
const showFilePicker = ref(false);

const removeLinkedFileLocally = (fileId: string) => {
    if (!props.task?.linkedFiles) return;
    props.task.linkedFiles = props.task.linkedFiles.filter(l => l.fileId !== fileId);
    emit('update', props.task);
};

const openLinkedFile = async (link: TaskLinkedFile) => {
    try {
        const res = await sfetch(`/api/cdn/meta/${link.fileId}`);
        if (!res.ok) throw new Error();
        viewingLinkedFileId = link.fileId;
        viewingAttachmentId = null;
        viewingFile.value = await res.json();
    } catch (e) {
        toast.show('Impossible de charger le fichier', 'error');
    }
};

const onFileLinked = async (file: StoredFile) => {
    if (!props.task) return;
    showFilePicker.value = false;
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${props.task.id}/files/${file.id}`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error();
        const link: TaskLinkedFile = await res.json();
        if (!props.task.linkedFiles) props.task.linkedFiles = [];
        if (!props.task.linkedFiles.some(l => l.fileId === file.id)) {
            props.task.linkedFiles.unshift(link);
        }
        emit('update', props.task);
    } catch (e) {
        toast.show('Erreur lors de la liaison du fichier', 'error');
    }
};

const unlinkFile = async (link: TaskLinkedFile) => {
    if (!props.task) return;
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${props.task.id}/files/${link.fileId}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error();
        removeLinkedFileLocally(link.fileId);
    } catch (e) {
        toast.show('Erreur lors de la suppression du lien', 'error');
    }
};

onBeforeUnmount(() => {
    Object.values(attachmentPreviews.value).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
});

const editForm = reactive({
    title: '',
    description: '',
    dueDate: '',
    dueTime: '',
    assigneeIds: [] as string[],
    tagIds: [] as string[]
});

type Section = 'date' | 'assignees' | 'tags' | 'linkedFiles';
const activeSection = ref<Section | null>(null);

const toggleSection = (key: Section) => {
    activeSection.value = activeSection.value === key ? null : key;
};

const dueDateLabel = computed(() => {
    if (!editForm.dueDate) return 'Aucune échéance';
    const d = new Date(editForm.dueDate + 'T00:00:00');
    const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return editForm.dueTime ? `${label} ${editForm.dueTime}` : label;
});

// ── Enregistrement automatique ────────────────────────────────────────
// Pas de bouton "Enregistrer" : chaque modification du formulaire
// déclenche une sauvegarde après un court débounce.
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle');
const saveStatusLabel = computed(() => {
    if (saveStatus.value === 'saving') return 'Enregistrement...';
    if (saveStatus.value === 'saved') return 'Enregistré';
    return '';
});
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let initializing = false;

const searchAssignee = ref('');

const statusInfo = computed(() => {
    switch (props.task?.status) {
        case 'TODO': return { label: 'À faire', color: 'text-gray-400' };
        case 'IN_PROGRESS': return { label: 'En cours', color: 'text-blue-400' };
        case 'DONE': return { label: 'Terminée', color: 'text-green-500' };
        default: return { label: '', color: 'text-(--text2)' };
    }
});

const formatDuration = (since: Date): string => {
    const minutes = Math.floor((Date.now() - since.getTime()) / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} heure${hours > 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} jour${days > 1 ? 's' : ''}`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} mois`;
    const years = Math.floor(months / 12);
    return `${years} an${years > 1 ? 's' : ''}`;
};

const statusDuration = computed(() => {
    const since = props.task?.statusChangedAt || props.task?.createdAt;
    if (!since) return '';
    return formatDuration(new Date(since));
});

const availableMembers = computed<OrgMember[]>(() => {
    if (!openedOrg.value?.members) return [];
    if (!props.task?.spaceId) return openedOrg.value.members;
    const space = openedOrg.value.spaces?.find(s => s.id === props.task!.spaceId);
    if (!space) return openedOrg.value.members;
    return openedOrg.value.members.filter(m => space.membersId.includes(m.userId));
});

const filteredMembers = computed<OrgMember[]>(() => {
    if (!searchAssignee.value.trim()) return availableMembers.value;
    const s = searchAssignee.value.toLowerCase();
    return availableMembers.value.filter(m => {
        const name = m.user?.name || m.userId;
        return name.toLowerCase().includes(s);
    });
});

watch(() => props.isOpen, async (newVal) => {
    if (newVal && props.task) {
        initializing = true;
        editForm.title = props.task.title;
        editForm.description = props.task.description || '';
        if (props.task.dueDate) {
            const d = new Date(props.task.dueDate);
            editForm.dueDate = d.toISOString().slice(0, 10);
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            editForm.dueTime = (hh === '00' && mm === '00') ? '' : `${hh}:${mm}`;
        } else {
            editForm.dueDate = '';
            editForm.dueTime = '';
        }
        editForm.assigneeIds = props.task.assignees ? props.task.assignees.map(a => a.id) : [];
        editForm.tagIds = props.task.tags ? props.task.tags.map(t => t.id) : [];
        searchAssignee.value = '';
        isEditingTitle.value = false;
        isEditingDescription.value = false;
        activeSection.value = null;
        saveStatus.value = 'idle';
        resolveAllAttachmentPreviews();
        refreshTaskAttachments();
        await nextTick();
        initializing = false;
        // "Renommer" depuis le menu contextuel : ouvre directement le titre en édition.
        if (props.startInEditMode) startEditTitle();
    }
});

const closeModal = () => {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    isEditingTitle.value = false;
    isEditingDescription.value = false;
    showDeleteConfirm.value = false;
    emit('close');
};

function scheduleAutosave() {
    if (initializing) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(performAutosave, 600);
}

watch(editForm, scheduleAutosave, { deep: true });

const performAutosave = async () => {
    if (!props.task || !editForm.title.trim()) return;
    saveStatus.value = 'saving';
    try {
        let dueDate = null;
        if (editForm.dueDate) {
            const dateStr = editForm.dueDate + (editForm.dueTime ? `T${editForm.dueTime}` : 'T00:00');
            dueDate = new Date(dateStr).toISOString();
        }

        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${props.task.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                title: editForm.title,
                description: editForm.description,
                dueDate,
                assigneeIds: editForm.assigneeIds,
                tagIds: editForm.tagIds
            })
        });
        if (res.ok) {
            const updated = await res.json();
            emit('update', updated);
            saveStatus.value = 'saved';
        } else {
            saveStatus.value = 'idle';
        }
    } catch (e) {
        saveStatus.value = 'idle';
        toast.show('Erreur lors de l\'enregistrement', 'error');
    }
};

const archiveTask = async () => {
    if (!props.task) return;
    loading.value = true;
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${props.task.id}`, {
            method: 'PUT',
            body: JSON.stringify({ archived: true })
        });
        if (res.ok) {
            toast.show('Tâche archivée', 'success');
            emit('delete', props.task.id);
            closeModal();
        }
    } catch (e) {
        toast.show('Erreur lors de l\'archivage', 'error');
    } finally {
        loading.value = false;
    }
};

const showDeleteConfirm = ref(false);
const deleting = ref(false);

const deleteTask = () => {
    if (!props.task) return;
    showDeleteConfirm.value = true;
};

const confirmDeleteTask = async () => {
    if (!props.task) return;
    deleting.value = true;
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${props.task.id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            toast.show('Tâche supprimée', 'success');
            showDeleteConfirm.value = false;
            emit('delete', props.task.id);
            closeModal();
        }
    } catch (e) {
        toast.show('Erreur de suppression', 'error');
    } finally {
        deleting.value = false;
    }
};

const onSubtaskCreated = (newSubtask: Task) => {
    if (props.task) {
        if (!props.task.subtasks) props.task.subtasks = [];
        if (!props.task.subtasks.some(st => st.id === newSubtask.id)) {
            props.task.subtasks.push(newSubtask);
            emit('update', props.task);
        }
    }
};

const toggleSubtaskStatus = async (subtask: Task) => {
    const newStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    const oldStatus = subtask.status;
    subtask.status = newStatus;
    
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${subtask.id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
            subtask.status = oldStatus;
            toast.show("Erreur lors de la mise à jour", 'error');
            return;
        }

        if (newStatus === 'DONE') {
            try {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#4ade80', '#3b82f6', '#fbbf24', '#f87171'],
                    zIndex: 10000
                });
            } catch (e) {}
        }
        
        emit('update', props.task); // Force reactivity up
    } catch (e) {
        subtask.status = oldStatus;
        toast.show("Erreur lors de la mise à jour", 'error');
    }
};

const deleteSubtask = async (subtaskId: string) => {
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${subtaskId}`, {
            method: 'DELETE'
        });

        if (!res.ok) {
            toast.show("Erreur lors de la suppression", 'error');
            return;
        }

        if (props.task && props.task.subtasks) {
            props.task.subtasks = props.task.subtasks.filter(st => st.id !== subtaskId);
            emit('update', props.task);
        }
    } catch (e) {
        toast.show("Erreur", 'error');
    }
};
</script>
