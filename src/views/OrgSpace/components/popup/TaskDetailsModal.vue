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
                    <span v-if="!isEditing">Détails de la Tâche</span>
                    <span v-else>Modifier la Tâche</span>
                </div>
            </div>
        </template>

        <div v-if="task" class="space-y-6 w-full max-w-full sm:w-[500px]">
            <!-- Header -->
            <div class="flex justify-between items-start gap-4">
                <div class="flex-1 min-w-0">
                    <h3 v-if="!isEditing" class="text-xl font-bold text-(--text) mb-2 break-words">{{ task.title }}</h3>
                    <input v-else v-model="editForm.title" type="text" class="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white mb-2 font-bold" />

                    <p v-if="!isEditing" class="text-xs font-bold uppercase tracking-wide mb-3" :class="statusInfo.color">
                        {{ statusInfo.label }} depuis : {{ statusDuration }}
                    </p>

                    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-(--text2) uppercase">
                        <span class="flex items-center gap-1 whitespace-nowrap">
                            <i class="bi bi-folder text-(--primary)/80"></i>
                            {{ task.space?.name || 'Général' }}
                        </span>
                        <span v-if="!isEditing && task?.creator" class="flex items-center gap-1.5 whitespace-nowrap">
                            <span class="text-(--text2)">Créée par</span>
                            <button @click.stop="(e) => task?.creator && openProfile(task.creator, e)" class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold transition-all shadow-sm" :title="'Profil de ' + $p(task.creator.name)">
                                <img v-if="task.creator.avatarUrl" :src="task.creator.avatarUrl" class="w-4 h-4 rounded-full object-cover border border-black/20">
                                <div v-else class="w-4 h-4 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black border border-black/20">
                                    {{ $p(task.creator.name).substring(0, 2).toUpperCase() }}
                                </div>
                                {{ $p(task.creator.name).split(' ')[0] }}
                            </button>
                        </span>
                        <span v-if="!isEditing" class="flex items-center gap-2 break-words">
                            <i class="bi bi-people-fill text-(--primary)/80"></i>
                            <span v-if="!task.assignees?.length">Personne</span>
                            <div v-else class="flex items-center -space-x-1.5">
                                <template v-for="assignee in task.assignees.slice(0,5)" :key="assignee.id">
                                    <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="$p(assignee.name)" class="w-5 h-5 rounded-full object-cover border border-(--bg2) z-10 hover:z-20">
                                    <div v-else :title="$p(assignee.name)" class="w-5 h-5 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black border border-(--bg2) z-10 hover:z-20">
                                        {{ $p(assignee.name).substring(0, 2).toUpperCase() }}
                                    </div>
                                </template>
                                <div v-if="task.assignees.length > 5" class="w-5 h-5 rounded-full bg-white/10 text-white flex items-center justify-center text-[8px] font-black border border-(--bg2) z-10">
                                    +{{ task.assignees.length - 5 }}
                                </div>
                            </div>
                        </span>
                    </div>

                    <div v-if="!isEditing && task.tags?.length" class="flex flex-wrap gap-1.5 mt-3">
                        <span
                            v-for="tag in task.tags" :key="tag.id"
                            class="px-2.5 py-1 rounded-full text-[10px] font-bold border"
                            :style="{ borderColor: tag.color, color: tag.color }"
                        >
                            {{ tag.name }}
                        </span>
                    </div>
                </div>

                <button @click="isEditing = !isEditing" class="text-(--text2) hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-lg">
                    <i class="bi" :class="isEditing ? 'bi-x-lg' : 'bi-pencil-fill'"></i>
                </button>
            </div>

            <!-- Description -->
            <div class="bg-white/5 rounded-xl p-4 border border-white/10">
                <h4 class="text-xs font-bold text-(--text2) uppercase mb-2">Description</h4>
                <p v-if="!isEditing" class="text-sm text-white/80 whitespace-pre-wrap">{{ task.description || 'Aucune description fournie.' }}</p>
                <textarea v-else v-model="editForm.description" @paste="handlePaste" rows="3" class="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white/80 resize-none" placeholder="Collez une image pour l'ajouter en pièce jointe"></textarea>
            </div>

            <!-- Pièces jointes -->
            <div class="bg-white/5 rounded-xl p-4 border border-white/10">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="text-xs font-bold text-(--text2) uppercase">Pièces jointes</h4>
                    <button type="button" @click="imageInput?.click()" class="text-[11px] font-bold text-(--text2) hover:text-(--primary) flex items-center gap-1" :disabled="uploadingImage">
                        <i class="bi bi-paperclip"></i>
                        Ajouter une image
                    </button>
                    <input ref="imageInput" type="file" accept="image/*" multiple hidden @change="onPickImages" />
                </div>
                <div v-if="task.attachments?.length" class="flex flex-wrap gap-2">
                    <div
                        v-for="attachment in task.attachments" :key="attachment.id"
                        class="relative group w-16 h-16 rounded-lg overflow-hidden border border-white/10 cursor-pointer bg-black/20"
                        @click="openAttachment(attachment)"
                    >
                        <img v-if="attachmentPreviews[attachment.id]" :src="attachmentPreviews[attachment.id]" class="w-full h-full object-cover" />
                        <i v-else class="bi bi-image absolute inset-0 flex items-center justify-center text-(--text2)"></i>
                        <button
                            type="button"
                            @click.stop="removeAttachment(attachment)"
                            class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs"
                        >
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>
                <p v-else class="text-xs text-(--text2) italic">Aucune pièce jointe. Collez ou ajoutez une image pour donner du contexte.</p>
            </div>

            <div v-if="isEditing" class="bg-white/5 rounded-xl p-4 border border-white/10 mt-4">
                <h4 class="text-xs font-bold text-(--text2) uppercase mb-2">Assignation</h4>
                <div class="relative mb-2">
                    <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm"></i>
                    <input 
                        v-model="searchAssignee" 
                        placeholder="Rechercher une personne..."
                        class="w-full bg-black/40 border border-white/20 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
                        :disabled="loading"
                    />
                </div>
                <div class="bg-black/40 border border-white/20 rounded-xl p-3 max-h-40 overflow-y-auto space-y-2">
                    <label v-for="member in filteredMembers" :key="member.id" class="flex items-center gap-3 cursor-pointer group">
                        <input 
                            type="checkbox" 
                            :value="member.userId" 
                            v-model="editForm.assigneeIds"
                            class="w-4 h-4 rounded bg-black/20 border-white/20 text-(--primary) focus:ring-(--primary) focus:ring-offset-0"
                            :disabled="loading"
                        />
                        <div class="flex items-center gap-2">
                            <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-6 h-6 rounded-full object-cover">
                            <div v-else class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[10px] font-bold">
                                {{ ($p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                            </div>
                            <span class="text-sm font-medium text-(--text) group-hover:text-white transition-colors">
                                {{ $p(member.user?.name) || member.userId }}
                            </span>
                        </div>
                    </label>
                    <div v-if="filteredMembers.length === 0" class="text-xs text-center text-(--text2) py-2">
                        Aucun résultat
                    </div>
                </div>
            </div>

            <div v-if="isEditing" class="bg-white/5 rounded-xl p-4 border border-white/10 mt-4">
                <TaskTagPicker
                    :orgId="route.params.orgId as string"
                    v-model="editForm.tagIds"
                />
            </div>

            <div v-if="isEditing" class="flex justify-end items-center gap-2 text-xs font-semibold text-(--text2)">
                <i v-if="saveStatus === 'saving'" class="bi bi-arrow-repeat animate-spin"></i>
                <i v-else-if="saveStatus === 'saved'" class="bi bi-check-circle-fill text-green-500"></i>
                <span>{{ saveStatusLabel }}</span>
            </div>

            <!-- Subtasks -->
            <div v-if="!isEditing" class="space-y-3">
                <div class="flex items-center justify-between border-b border-white/10 pb-2">
                    <h4 class="text-sm font-bold text-(--text) flex items-center gap-2">
                        <i class="bi bi-list-nested text-(--primary)"></i>
                        Sous-tâches
                        <span class="bg-white/10 text-xs px-2 py-0.5 rounded-full font-normal">
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
                                <span class="text-sm font-bold" :class="subtask.status === 'DONE' ? 'text-(--text2) line-through' : 'text-white'">{{ subtask.title }}</span>
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
                <button @click="closeModal" class="default bg-white/10 text-white hover:bg-white/20">
                    Fermer
                </button>
            </div>
        </template>
    </Popup>

    <FileViewer
        v-if="viewingFile"
        :file="viewingFile"
        :isOpen="!!viewingFile"
        @close="viewingFile = null"
        @deleted="onAttachmentViewerDeleted"
    />
</template>

<script setup lang="ts">
import { ref, watch, reactive, computed, nextTick, onBeforeUnmount } from 'vue';
import Popup from '@/components/Popup.vue';
import CreateTaskModal from './CreateTaskModal.vue';
import TaskTagPicker from './TaskTagPicker.vue';
import FileViewer from './FileViewer.vue';
import type { Task, OrgMember, TaskAttachment, StoredFile } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';
import { useRoute } from 'vue-router';
import { useToast } from '@/composables/useToast';
import confetti from 'canvas-confetti';
import { openedOrg } from '@/assets/var';
import { openProfile } from '@/composables/useProfile';
import { uploadFile } from '@/assets/uploadFile';
import { getFilePreviewUrl } from '@/assets/utils/downloadFile';

const props = defineProps<{
    task: Task | null;
    isOpen: boolean;
    startInEditMode?: boolean;
}>();

const emit = defineEmits(['close', 'update', 'delete', 'open-task']);
const route = useRoute();
const toast = useToast();

const isEditing = ref(false);
const loading = ref(false);

// ── Pièces jointes (images) ─────────────────────────────────────────
const imageInput = ref<HTMLInputElement | null>(null);
const uploadingImage = ref(false);
const attachmentPreviews = ref<Record<string, string>>({});
const viewingFile = ref<StoredFile | null>(null);
let viewingAttachmentId: string | null = null;

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

const openAttachment = async (attachment: TaskAttachment) => {
    try {
        const res = await sfetch(`/api/cdn/meta/${attachment.id}`);
        if (!res.ok) throw new Error();
        viewingAttachmentId = attachment.id;
        viewingFile.value = await res.json();
    } catch (e) {
        toast.show('Impossible de charger la pièce jointe', 'error');
    }
};

const onAttachmentViewerDeleted = () => {
    if (props.task && viewingAttachmentId) {
        removeAttachmentLocally(viewingAttachmentId);
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

onBeforeUnmount(() => {
    Object.values(attachmentPreviews.value).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
});

const editForm = reactive({
    title: '',
    description: '',
    assigneeIds: [] as string[],
    tagIds: [] as string[]
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
        editForm.assigneeIds = props.task.assignees ? props.task.assignees.map(a => a.id) : [];
        editForm.tagIds = props.task.tags ? props.task.tags.map(t => t.id) : [];
        searchAssignee.value = '';
        isEditing.value = props.startInEditMode || false;
        saveStatus.value = 'idle';
        resolveAllAttachmentPreviews();
        await nextTick();
        initializing = false;
    }
});

const closeModal = () => {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    isEditing.value = false;
    emit('close');
};

function scheduleAutosave() {
    if (initializing || !isEditing.value) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(performAutosave, 600);
}

watch(editForm, scheduleAutosave, { deep: true });

const performAutosave = async () => {
    if (!props.task || !editForm.title.trim()) return;
    saveStatus.value = 'saving';
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${props.task.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                title: editForm.title,
                description: editForm.description,
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

const deleteTask = async () => {
    if (!props.task) return;
    loading.value = true;
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${props.task.id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            toast.show('Tâche supprimée', 'success');
            emit('delete', props.task.id);
            closeModal();
        }
    } catch (e) {
        toast.show('Erreur de suppression', 'error');
    } finally {
        loading.value = false;
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
