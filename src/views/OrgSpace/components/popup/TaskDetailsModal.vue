<template>
    <Popup :is-open="isOpen" @close="closeModal">
        <template #title>
            <div class="flex items-center gap-2">
                <i class="bi bi-check2-square text-(--primary)"></i>
                <span v-if="!isEditing">Détails de la Tâche</span>
                <span v-else>Modifier la Tâche</span>
            </div>
        </template>

        <div v-if="task" class="space-y-6 w-full max-w-full sm:w-[500px]">
            <!-- Header -->
            <div class="flex justify-between items-start gap-4">
                <div class="flex-1 min-w-0">
                    <h3 v-if="!isEditing" class="text-xl font-bold text-white mb-2 break-words">{{ task.title }}</h3>
                    <input v-else v-model="editForm.title" type="text" class="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white mb-2 font-bold" />
                    
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-(--text)/50 uppercase">
                        <span class="flex items-center gap-1 whitespace-nowrap">
                            <i class="bi bi-folder text-(--primary)/80"></i>
                            {{ task.space?.name || 'Général' }}
                        </span>
                        <span class="flex items-center gap-1 break-words">
                            <i class="bi bi-person-circle text-(--primary)/80"></i>
                            Assignée à {{ task.assignees?.length ? task.assignees.map((a: any) => a.name).join(', ') : 'Personne' }}
                        </span>
                    </div>
                </div>
                
                <button @click="isEditing = !isEditing" class="text-(--text)/50 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-lg">
                    <i class="bi" :class="isEditing ? 'bi-x-lg' : 'bi-pencil-fill'"></i>
                </button>
            </div>

            <!-- Description -->
            <div class="bg-white/5 rounded-xl p-4 border border-white/10">
                <h4 class="text-xs font-bold text-(--text)/50 uppercase mb-2">Description</h4>
                <p v-if="!isEditing" class="text-sm text-white/80 whitespace-pre-wrap">{{ task.description || 'Aucune description fournie.' }}</p>
                <textarea v-else v-model="editForm.description" rows="3" class="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white/80 resize-none"></textarea>
            </div>

            <div v-if="isEditing" class="flex justify-end">
                <button @click="saveTask" class="primary px-6 py-2 !text-sm" :disabled="loading">
                    {{ loading ? 'Enregistrement...' : 'Enregistrer les modifications' }}
                </button>
            </div>

            <!-- Subtasks -->
            <div v-if="!isEditing" class="space-y-3">
                <div class="flex items-center justify-between border-b border-white/10 pb-2">
                    <h4 class="text-sm font-bold text-white flex items-center gap-2">
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
                        <button class="text-xs bg-(--primary)/20 text-(--primary) hover:bg-(--primary) hover:text-white px-3 py-1.5 rounded-lg transition-all font-bold">
                            + Ajouter
                        </button>
                    </CreateTaskModal>
                </div>
                
                <div class="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    <div v-for="subtask in task.subtasks" :key="subtask.id" class="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between group">
                        <div class="flex items-center gap-3">
                            <button @click="toggleSubtaskStatus(subtask)" class="text-xl transition-colors" :class="subtask.status === 'DONE' ? 'text-green-500' : 'text-(--text)/30 hover:text-(--primary)'">
                                <i class="bi" :class="subtask.status === 'DONE' ? 'bi-check-circle-fill' : 'bi-circle'"></i>
                            </button>
                            <span class="text-sm font-medium" :class="subtask.status === 'DONE' ? 'text-(--text)/40 line-through' : 'text-white'">{{ subtask.title }}</span>
                        </div>
                        <button @click="deleteSubtask(subtask.id)" class="text-red-500/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <i class="bi bi-trash-fill"></i>
                        </button>
                    </div>
                    
                    <div v-if="!task.subtasks || task.subtasks.length === 0" class="text-xs text-(--text)/40 italic text-center py-4">
                        Aucune sous-tâche pour le moment.
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <div class="flex items-center justify-between w-full">
                <button @click="deleteTask" class="text-xs text-red-500 font-bold hover:underline" :disabled="loading">
                    Supprimer la tâche
                </button>
                <button @click="closeModal" class="default bg-white/10 text-white hover:bg-white/20">
                    Fermer
                </button>
            </div>
        </template>
    </Popup>
</template>

<script setup lang="ts">
import { ref, watch, reactive } from 'vue';
import Popup from '@/components/Popup.vue';
import CreateTaskModal from './CreateTaskModal.vue';
import type { Task } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';
import { useRoute } from 'vue-router';
import { useToast } from '@/composables/useToast';
import confetti from 'canvas-confetti';

const props = defineProps<{
    task: Task | null;
    isOpen: boolean;
}>();

const emit = defineEmits(['close', 'update', 'delete']);
const route = useRoute();
const toast = useToast();

const isEditing = ref(false);
const loading = ref(false);

const editForm = reactive({
    title: '',
    description: ''
});

watch(() => props.isOpen, (newVal) => {
    if (newVal && props.task) {
        editForm.title = props.task.title;
        editForm.description = props.task.description || '';
        isEditing.value = false;
    }
});

const closeModal = () => {
    isEditing.value = false;
    emit('close');
};

const saveTask = async () => {
    if (!props.task || !editForm.title.trim()) return;
    loading.value = true;
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${props.task.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                title: editForm.title,
                description: editForm.description
            })
        });
        if (res.ok) {
            const updated = await res.json();
            emit('update', updated);
            isEditing.value = false;
            toast.show('Tâche mise à jour', 'success');
        }
    } catch (e) {
        toast.show('Erreur', 'error');
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
        props.task.subtasks.push(newSubtask);
        emit('update', props.task);
    }
};

const toggleSubtaskStatus = async (subtask: Task) => {
    const newStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    const oldStatus = subtask.status;
    subtask.status = newStatus;
    
    try {
        await sfetch(`/api/tasks/${route.params.orgId}/tasks/${subtask.id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        
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
        await sfetch(`/api/tasks/${route.params.orgId}/tasks/${subtaskId}`, {
            method: 'DELETE'
        });
        if (props.task && props.task.subtasks) {
            props.task.subtasks = props.task.subtasks.filter(st => st.id !== subtaskId);
            emit('update', props.task);
        }
    } catch (e) {
        toast.show("Erreur", 'error');
    }
};
</script>
