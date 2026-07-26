<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full">
        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
            <div class="flex items-center gap-3">
                <MobileBackBtn />
                <i class="bi bi-check2-square text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Mes Tâches</h3>
            </div>
            
            <div class="ml-auto flex items-center gap-2">
                <CreateTaskModal @created="onTaskCreated">
                    <button class="bg-(--primary) text-white font-bold py-1.5 px-4 rounded-lg hover:brightness-110 active:scale-95 transition-all text-sm flex items-center gap-2">
                        <i class="bi bi-plus-lg"></i>
                        Nouvelle Tâche
                    </button>
                </CreateTaskModal>
            </div>
        </div>

        <main class="flex-1 overflow-y-auto p-6 w-full h-full space-y-8">
            <div v-if="loading" class="w-full flex flex-col gap-12 animate-pulse pb-10">
                <div v-for="s in 2" :key="'skel-space-'+s" class="space-y-4">
                    <div class="flex items-center justify-between border-b border-white/10 pb-2">
                        <div class="flex items-center gap-3">
                            <div class="w-6 h-6 bg-white/10 rounded-md"></div>
                            <div class="w-32 h-5 bg-white/10 rounded-full"></div>
                            <div class="w-16 h-4 bg-white/5 rounded-full ml-2"></div>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 items-start">
                        <div v-for="i in 3" :key="'skel-col-'+i" class="bg-black/20 rounded-2xl p-4 flex flex-col gap-4 border border-(--border-color) min-h-[40vh]">
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <div class="w-6 h-6 rounded-lg bg-white/10"></div>
                                    <div class="w-20 h-3 bg-white/10 rounded-full"></div>
                                </div>
                                <div class="w-5 h-3 bg-white/10 rounded-full"></div>
                            </div>
                            <div v-for="j in 2" :key="'skel-card-'+j" class="bg-white/5 border border-(--border-color) p-4 rounded-xl h-28"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div v-else class="space-y-12 pb-10">
                
                <!-- Swimlanes (Rows by Project) -->
                <div v-for="spaceGroup in spacesGroups" :key="spaceGroup.id" class="space-y-4">
                    
                    <div class="flex items-center justify-between border-b border-white/10 pb-2">
                        <div class="flex items-center gap-3">
                            <i class="bi bi-folder-fill text-(--primary) text-xl"></i>
                            <h3 class="text-xl font-black text-(--text) tracking-wide">
                                {{ spaceGroup.name }}
                            </h3>
                            <span class="bg-white/10 text-xs px-2 py-0.5 rounded-full font-bold">
                                {{ spaceGroup.tasks.length }} tâche(s)
                            </span>
                        </div>
                        
                        <CreateTaskModal :defaultSpaceId="spaceGroup.id === 'personal' ? null : spaceGroup.id" @created="onTaskCreated">
                            <button class="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-2">
                                <i class="bi bi-plus"></i> Ajouter ici
                            </button>
                        </CreateTaskModal>
                    </div>

                    <!-- Kanban Board inside the row -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 items-start">
                        
                        <div v-for="col in columns" :key="col.id" 
                             class="bg-black/20 border rounded-2xl p-4 min-h-[200px] flex flex-col transition-all"
                             :class="draggedOverCol === `${spaceGroup.id}-${col.id}` ? 'border-(--primary) bg-white/5 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]' : 'border-(--border-color)'"
                             @dragover.prevent
                             @dragenter.prevent="draggedOverCol = `${spaceGroup.id}-${col.id}`"
                             @dragleave.prevent="draggedOverCol = null"
                             @drop="onDrop($event, col.id, spaceGroup.id); draggedOverCol = null"
                        >
                            <div class="flex items-center justify-between mb-4">
                                <h4 class="font-bold text-sm tracking-wider uppercase flex items-center gap-2" :class="col.color">
                                    <i :class="col.icon"></i>
                                    {{ col.title }}
                                </h4>
                                <span class="bg-white/5 text-(--text)/50 text-xs px-2 py-0.5 rounded-full font-bold">
                                    {{ getTasks(spaceGroup.tasks, col.id).length }}
                                </span>
                            </div>

                            <div class="flex-1 space-y-3">
                                <div v-for="task in getTasks(spaceGroup.tasks, col.id)" :key="task.id" 
                                     draggable="true"
                                     @dragstart="onDragStart($event, task, spaceGroup.id)"
                                     @dragend="onDragEnd"
                                     @click="openTaskDetails(task)"
                                     class="bg-(--bg2) border border-white/10 p-4 rounded-xl cursor-pointer active:cursor-grabbing hover:border-(--primary)/50 transition-all shadow-lg hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] group relative overflow-hidden"
                                >
                                    <div class="flex justify-between items-start gap-2">
                                        <p class="text-sm font-bold text-(--text) leading-snug">{{ task.title }}</p>
                                    </div>
                                    
                                    <div class="flex items-center justify-between mt-4">
                                        <div class="flex items-center -space-x-1.5" v-if="task.assignees?.length">
                                            <template v-for="assignee in task.assignees.slice(0,3)" :key="assignee.id">
                                                <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="assignee.name" class="w-6 h-6 rounded-full object-cover border-2 border-(--bg2) z-10 hover:z-20">
                                                <div v-else :title="assignee.name" class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[9px] font-black border-2 border-(--bg2) z-10 hover:z-20">
                                                    {{ assignee.name.substring(0, 2).toUpperCase() }}
                                                </div>
                                            </template>
                                            <div v-if="task.assignees.length > 3" class="w-6 h-6 rounded-full bg-white/10 text-white flex items-center justify-center text-[9px] font-black border-2 border-(--bg2) z-10">
                                                +{{ task.assignees.length - 3 }}
                                            </div>
                                        </div>
                                        <div v-else></div>
                                        
                                        <div v-if="task.subtasks && task.subtasks.length > 0" class="flex items-center gap-1.5 text-xs bg-white/5 px-2.5 py-1 rounded-lg font-bold text-white/50">
                                            <i class="bi bi-check2-square text-(--primary)"></i>
                                            {{ task.subtasks.filter((st: any) => st.status === 'DONE').length }}/{{ task.subtasks.length }}
                                        </div>
                                    </div>

                                    <!-- Progress Bar (Gauge) -->
                                    <div class="mt-4 pt-3 border-t border-(--border-color)" v-if="task.dueDate && task.status !== 'DONE'">
                                        <div class="flex justify-between items-end mb-1.5">
                                            <span class="text-[9px] font-black uppercase tracking-widest text-(--text)/30">
                                                Échéance
                                            </span>
                                            <span class="text-[10px] font-black" :class="getProgress(task).color.replace('bg-', 'text-')">
                                                {{ getProgress(task).text }}
                                            </span>
                                        </div>
                                        <div class="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                                            <div class="h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(currentColor,0.5)]" 
                                                 :class="getProgress(task).color" 
                                                 :style="{ width: getProgress(task).percent + '%' }"></div>
                                        </div>
                                    </div>
                                    
                                    <div class="mt-4 pt-3 border-t border-(--border-color) flex items-center justify-center" v-else-if="task.status === 'DONE'">
                                        <span class="text-[10px] font-black uppercase tracking-widest text-green-500">
                                            <i class="bi bi-check-lg mr-1"></i> Terminée
                                        </span>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="spacesGroups.length === 0" class="py-20 flex flex-col items-center justify-center text-(--text)/20">
                    <i class="bi bi-emoji-smile text-6xl mb-4" />
                    <p class="text-base font-medium">Vous n'avez aucune tâche assignée.</p>
                </div>

            </div>
        </main>
        
        <TaskDetailsModal 
            :task="selectedTask" 
            :isOpen="!!selectedTask"
            @close="selectedTask = null"
            @update="onTaskUpdated"
            @delete="onTaskDeleted"
        />

        <Transition name="pop">
            <div v-if="isDraggingTask" 
                 class="fixed bottom-8 right-8 w-16 h-16 bg-red-500/90 text-white rounded-full flex items-center justify-center shadow-2xl z-[100] border-4 transition-all duration-500"
                 :class="[
                    isDeleting ? 'scale-0 translate-y-10 opacity-0 rotate-[360deg]' : 'scale-100',
                    isHoveringTrash && !isDeleting ? 'border-red-300 scale-125 shadow-[0_0_40px_rgba(239,68,68,0.8)]' : 'border-transparent'
                 ]"
                 @dragover.prevent="isHoveringTrash = true"
                 @dragleave.prevent="isHoveringTrash = false"
                 @drop="onDropToTrash">
                 
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 transition-transform" :class="isDeleting ? 'scale-50' : ''">
                    <g class="transition-all duration-300" style="transform-origin: 21px 6px;" :class="isHoveringTrash && !isDeleting ? 'rotate-[40deg]' : ''">
                        <path d="M3 6h18"></path>
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </g>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>

            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import type { Task, TodoList } from '@/types/types';
import { useToast } from '@/composables/useToast';
import CreateTaskModal from '../components/popup/CreateTaskModal.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import TaskDetailsModal from '../components/popup/TaskDetailsModal.vue';
import { user } from '@/assets/var';
import confetti from 'canvas-confetti';
import useWSocket from '@/composables/useWSocket';

const route = useRoute();
const toast = useToast();

const rawTasks = ref<Task[]>([]);
const loading = ref(true);
const draggedOverCol = ref<string | null>(null);
const selectedTask = ref<Task | null>(null);

const isDraggingTask = ref(false);
const isHoveringTrash = ref(false);
const isDeleting = ref(false);

const columns = [
    { id: 'TODO', title: 'À faire', color: 'text-gray-400', icon: 'bi-circle' },
    { id: 'IN_PROGRESS', title: 'En cours', color: 'text-blue-400', icon: 'bi-arrow-repeat' },
    { id: 'DONE', title: 'Terminé', color: 'text-green-500', icon: 'bi-check-circle-fill' }
];

const spacesGroups = computed(() => {
    const groups: Record<string, { id: string, name: string, tasks: Task[] }> = {};
    
    // Group "Tâches personnelles"
    groups['personal'] = {
        id: 'personal',
        name: 'Tâches personnelles',
        tasks: []
    };

    rawTasks.value.forEach(task => {
        // Exclude subtasks from main board
        if (task.parentTaskId) return;

        // Only show tasks assigned to me
        if (!task.assignees?.some(a => a.id === user.value?.id)) return;

        if (!task.spaceId) {
            groups['personal']!.tasks.push(task);
        } else {
            if (!groups[task.spaceId]) {
                groups[task.spaceId] = {
                    id: task.spaceId,
                    name: task.space?.name || 'Projet inconnu',
                    tasks: []
                };
            }
            groups[task.spaceId]!.tasks.push(task);
        }
    });

    // Remove empty groups, except maybe personal if you want it always there
    return Object.values(groups).filter(g => g.tasks.length > 0 || g.id === 'personal');
});

const getTasks = (tasks: Task[], status: string) => {
    return tasks.filter((t: Task) => t.status === status);
};

const getProgress = (task: Task) => {
    if (!task.dueDate) return { percent: 0, text: '', color: 'bg-green-500' };
    const start = new Date(task.createdAt).getTime();
    const end = new Date(task.dueDate).getTime();
    const now = new Date().getTime();
    
    if (now > end) return { percent: 100, text: 'En retard', color: 'bg-red-500' };
    
    const total = end - start;
    const passed = now - start;
    let percent = (passed / total) * 100;
    if (percent < 0) percent = 0;
    
    const remainingMs = end - now;
    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingDays = Math.floor(remainingHours / 24);
    
    let text = remainingHours < 24 ? `${remainingHours}h restantes` : `${remainingDays}j restants`;
    
    let color = 'bg-green-500'; // Safe
    if (percent > 60) color = 'bg-orange-400'; // Warning
    if (percent > 85) color = 'bg-red-500'; // Danger
    if (percent > 95) color = 'bg-red-600 animate-pulse'; // Critical

    return { percent, text, color };
};

const loadLists = async () => {
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/lists/me`);
        if (res.ok) {
            const data = await res.json();
            
            // Flatten all tasks
            let allTasks: Task[] = [];
            
            data.lists.forEach((list: TodoList) => {
                if (list.tasks) {
                    list.tasks.forEach(t => {
                        // Keep a reference to the list for UI display
                        t.todoList = list;
                        allTasks.push(t);
                    });
                }
            });
            
            data.unlistedTasks.forEach((t: Task) => {
                allTasks.push(t);
            });
            
            rawTasks.value = allTasks;
        }
    } catch (e) {
        toast.show("Erreur chargement des tâches", "error");
    } finally {
        loading.value = false;
    }
};

const onDragStart = (e: DragEvent, task: Task, spaceGroupId: string) => {
    isDraggingTask.value = true;
    isDeleting.value = false;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('taskId', task.id);
        e.dataTransfer.setData('sourceGroupId', spaceGroupId);
    }
};

const onDragEnd = () => {
    if (!isDeleting.value) {
        isDraggingTask.value = false;
        isHoveringTrash.value = false;
    }
};

const onDropToTrash = async (e: DragEvent) => {
    const taskId = e.dataTransfer?.getData('taskId');
    if (!taskId) return;

    isDeleting.value = true;
    isHoveringTrash.value = false;

    setTimeout(() => {
        isDraggingTask.value = false;
        isDeleting.value = false;
    }, 600);

    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        if (!res.ok) throw new Error("API Error");
        
        onTaskDeleted(taskId);
        toast.show("Tâche supprimée", "success");
    } catch (err) {
        toast.show("Erreur lors de la suppression", "error");
    }
};

const onDrop = async (e: DragEvent, newStatus: string, targetGroupId: string) => {
    const taskId = e.dataTransfer?.getData('taskId');
    const sourceGroupId = e.dataTransfer?.getData('sourceGroupId');
    if (!taskId || !sourceGroupId) return;

    if (sourceGroupId !== targetGroupId) {
        toast.show("Déplacement entre projets non supporté depuis cette vue", "info");
        return;
    }

    const taskToMove = rawTasks.value.find(t => t.id === taskId);
    if (!taskToMove || taskToMove.status === newStatus) return;

    const oldStatus = taskToMove.status;
    taskToMove.status = newStatus as 'TODO' | 'IN_PROGRESS' | 'DONE'; 

    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw new Error();
        
        if (newStatus === 'DONE') {
            try {
                confetti({
                    particleCount: 150,
                    spread: 80,
                    origin: { y: 0.6 },
                    colors: ['#4ade80', '#3b82f6', '#fbbf24', '#f87171'],
                    zIndex: 10000
                });
            } catch (e) {}
        }
        
    } catch (err) {
        taskToMove.status = oldStatus; 
        toast.show("Erreur lors du déplacement", "error");
    }
};

const openTaskDetails = (task: Task) => {
    selectedTask.value = task;
};

const onTaskCreated = (task: Task) => {
    rawTasks.value.push(task);
};

const onTaskUpdated = (updatedTask: Task) => {
    const idx = rawTasks.value.findIndex(t => t.id === updatedTask.id);
    if (idx !== -1) {
        rawTasks.value[idx] = updatedTask;
    }
};

const onTaskDeleted = (taskId: string) => {
    rawTasks.value = rawTasks.value.filter(t => t.id !== taskId);
};

onMounted(async () => {
    loadLists();
    
    const socket = await useWSocket();
    socket.value?.on('todo-added', ({ task }: { task: Task }) => {
        // Prevent duplicate tasks
        if (!rawTasks.value.some(t => t.id === task.id)) {
            rawTasks.value.unshift(task);
        }
    });
    socket.value?.on('todo-updated', ({ task }: { task: Task }) => {
        onTaskUpdated(task);
    });
    socket.value?.on('todo-deleted', ({ taskId }: { taskId: string }) => {
        onTaskDeleted(taskId);
    });
});
</script>
