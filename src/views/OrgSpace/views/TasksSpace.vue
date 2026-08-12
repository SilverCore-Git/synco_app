<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full ">
        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
            <div class="flex items-center gap-3">
                <MobileBackBtn />
                <i class="bi bi-check2-square text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Tâches</h3>
            </div>
            
            <div class="flex items-center gap-4">
                <CreateTaskModal 
                    :defaultSpaceId="route.params.spaceId as string" 
                    :hideSpaceSelect="true"
                    @created="onTaskCreated"
                >
                    <button class="primary !text-sm flex items-center gap-2 shadow-sm">
                        <i class="bi bi-plus-lg"></i> Créer une tâche
                    </button>
                </CreateTaskModal>
                <div class="ml-auto flex items-center gap-4 text-(--text2)">
                    <button 
                        @click="showUsersBar = !showUsersBar"
                        class="hover:text-(--text) transition-colors"
                        :class="showUsersBar ? 'text-(--text)' : ''"
                    >
                        <i class="bi bi-people-fill" />
                    </button>
                </div>
            </div>
        </div>

        <main class="flex-1 overflow-y-auto md:overflow-hidden flex flex-col p-6 w-full h-full gap-6">
            
            <!-- Filter Bar -->
            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full min-w-0 shrink-0">
                
                <div class="flex items-center gap-2 overflow-x-auto w-full sm:w-auto scrollbar-hide shrink-0 pb-1">
                    <button @click="filterUserId = null" class="px-4 py-2 font-bold text-xs transition-all whitespace-nowrap shrink-0" :class="!filterUserId ? 'primary shadow-[0_4px_15px_rgba(var(--primary-rgb),0.2)]' : 'bg-white/5 rounded-xl text-white/50 hover:bg-white/10'">
                        Toutes les tâches
                    </button>
                    <button @click="filterUserId = user?.id || null" class="px-4 py-2 font-bold text-xs transition-all whitespace-nowrap shrink-0" :class="filterUserId === user?.id ? 'primary shadow-[0_4px_15px_rgba(var(--primary-rgb),0.2)]' : 'bg-white/5 rounded-xl text-white/50 hover:bg-white/10'">
                        Mes tâches
                    </button>
                </div>
                
                <div class="hidden sm:block w-px h-6 bg-white/10 mx-2 shrink-0"></div>
                
                <div class="flex items-center gap-2 overflow-x-auto w-full min-w-0 scrollbar-hide pb-1">
                    <button v-for="member in spaceMembers" :key="member.id" @click="filterUserId = member.userId" class="flex items-center gap-2 px-3 py-1.5 font-bold text-xs transition-all whitespace-nowrap shrink-0" :class="filterUserId === member.userId ? 'primary shadow-[0_4px_15px_rgba(var(--primary-rgb),0.2)]' : 'bg-white/5 rounded-xl text-white/50 hover:bg-white/10'">
                        <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-5 h-5 rounded-full object-cover">
                        <div v-else class="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px]">
                            {{ $p(member.user?.name)?.substring(0,2).toUpperCase() }}
                        </div>
                        {{ $p(member.user?.name) }}
                    </button>
                </div>
                
            </div>

            <div v-if="loading" class="flex-1 min-h-0 w-full flex flex-col gap-6 animate-pulse pb-10">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
                    <div v-for="i in 3" :key="'skel-col-'+i" class="bg-black/20 rounded-2xl p-4 flex flex-col gap-4 border border-(--border-color) h-full">
                        <div class="flex items-center justify-between mb-2 shrink-0">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-xl bg-white/10"></div>
                                <div class="w-24 h-4 bg-white/10 rounded-full"></div>
                            </div>
                            <div class="w-6 h-4 bg-white/10 rounded-full"></div>
                        </div>
                        <div v-for="j in 3" :key="'skel-card-'+j" class="bg-white/5 border border-(--border-color) p-4 rounded-xl h-28 shrink-0"></div>
                    </div>
                </div>
            </div>
            
            <div v-else class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-6 pb-2">
                
                <!-- Columns -->
                <div v-for="col in columns" :key="col.id" 
                     class="bg-(--bg2)/40 border rounded-2xl p-4 min-h-[400px] h-full flex flex-col transition-all"
                     :class="draggedOverCol === col.id ? 'border-(--primary) bg-(--primary)/5 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]' : 'border-(--border-color)'"
                     @dragover.prevent
                     @dragenter.prevent="draggedOverCol = col.id"
                     @dragleave.prevent="draggedOverCol = null"
                     @drop="onDrop($event, col.id); draggedOverCol = null"
                >
                    <div class="flex items-center justify-between mb-5 shrink-0">
                        <h4 class="font-black text-sm tracking-widest uppercase flex items-center gap-2" :class="col.color">
                            <i :class="col.icon"></i>
                            {{ col.title }}
                        </h4>
                        <span class="bg-white/5 text-(--text2) text-xs px-2.5 py-1 rounded-full font-bold">
                            {{ filteredTasks(col.id).length }}
                        </span>
                    </div>

                    <div class="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1 custom-scrollbar">
                        <div v-for="task in filteredTasks(col.id)" :key="task.id" 
                             :id="'task-' + task.id"
                             draggable="true"
                             @dragstart="onDragStart($event, task)"
                             @dragend="onDragEnd"
                             @click="openTaskDetails(task)"
                             class="bg-(--bg2) border border-white/10 p-4 rounded-xl cursor-pointer active:cursor-grabbing hover:border-(--primary)/50 transition-all shadow-lg hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] group relative overflow-hidden"
                        >
                            <div class="flex justify-between items-start gap-2">
                                <div class="flex flex-col gap-1">
                                    <p class="text-sm font-bold text-(--text) leading-snug">{{ task.title }}</p>
                                    <span v-if="task.parentTask" class="text-[9px] font-bold text-(--primary) uppercase flex items-center gap-1 opacity-80">
                                        <i class="bi bi-arrow-return-right"></i> {{ task.parentTask.title }}
                                    </span>
                                </div>
                            </div>
                            
                            <div class="flex items-center justify-between mt-4">
                                <div class="flex items-center -space-x-1.5" v-if="task.assignees?.length">
                                    <template v-for="assignee in task.assignees.slice(0,3)" :key="assignee.id">
                                        <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="$p(assignee.name)" class="w-6 h-6 rounded-full object-cover border-2 border-(--bg2) z-10 hover:z-20">
                                        <div v-else :title="$p(assignee.name)" class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[9px] font-black border-2 border-(--bg2) z-10 hover:z-20">
                                            {{ $p(assignee.name).substring(0, 2).toUpperCase() }}
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
                                    <span class="text-[9px] font-black uppercase tracking-widest text-(--text2)">
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
        </main>
        
        <TaskDetailsModal 
            :task="selectedTask" 
            :isOpen="!!selectedTask"
            @close="selectedTask = null"
            @update="onTaskUpdated"
            @delete="onTaskDeleted"
            @open-task="handleOpenTask"
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import { openedOrg, user } from '@/assets/var';
import type { Task, OrgMember } from '@/types/types';

import { useToast } from '@/composables/useToast';
import { useUsersBar } from '@/composables/useUsersBar';
import useWSocket from '@/composables/useWSocket';
import CreateTaskModal from '../components/popup/CreateTaskModal.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import TaskDetailsModal from '../components/popup/TaskDetailsModal.vue';
import confetti from 'canvas-confetti';
import { useNotification } from '@/composables/useNotification';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { showUsersBar } = useUsersBar();
const { markTasksAsRead } = useNotification();

const tasks = ref<Task[]>([]);
const loading = ref(true);
const draggedOverCol = ref<string | null>(null);
const filterUserId = ref<string | null>(null);

const isDraggingTask = ref(false);
const isHoveringTrash = ref(false);
const isDeleting = ref(false);

const selectedTask = ref<Task | null>(null);

const columns = [
    { id: 'TODO', title: 'À faire', color: 'text-gray-400', icon: 'bi-circle' },
    { id: 'IN_PROGRESS', title: 'En cours', color: 'text-blue-400', icon: 'bi-arrow-repeat' },
    { id: 'DONE', title: 'Terminé', color: 'text-green-500', icon: 'bi-check-circle-fill' }
];

const spaceMembers = computed<OrgMember[]>(() => {
    const space = openedOrg.value?.spaces?.find(s => s.id === route.params.spaceId);
    if (!space || !openedOrg.value?.members) return [];
    return openedOrg.value.members.filter(m => space.membersId.includes(m.userId));
});

const filteredTasks = (status: string) => {
    return tasks.value.filter(t => {
        if (t.status !== status) return false;
        if (filterUserId.value) {
            return t.assignees?.some(a => a.id === filterUserId.value);
        }
        return true;
    });
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

const loadTasks = async () => {
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/spaces/${route.params.spaceId}/lists`);
        if (res.ok) {
            const data = await res.json();
            // In the new model, we just use unlistedTasks for the space Kanban
            tasks.value = data.unlistedTasks;
            
            // Clear unread notifications
            markTasksAsRead();

            // Handle deep linking from search
            if (route.query.select) {
                const searchId = route.query.select as string;
                let foundTask = data.unlistedTasks.find((t: any) => t.id === searchId);
                
                if (!foundTask && data.lists) {
                    for (const list of data.lists) {
                        if (list.tasks) {
                            const t = list.tasks.find((t: any) => t.id === searchId);
                            if (t) { foundTask = t; break; }
                        }
                    }
                }

                if (foundTask) {
                    selectedTask.value = foundTask;
                    
                    // Highlight the card if it's in the Kanban
                    setTimeout(() => {
                        const el = document.getElementById('task-' + searchId);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            const originalTransition = el.style.transition;
                            const originalTransform = el.style.transform;
                            const originalBoxShadow = el.style.boxShadow;
                            
                            el.style.transition = 'all 0.3s ease';
                            el.style.transform = 'scale(1.05)';
                            el.style.boxShadow = '0 0 0 4px var(--primary), 0 10px 30px rgba(0,0,0,0.5)';
                            el.style.zIndex = '10';
                            
                            setTimeout(() => {
                                el.style.transform = originalTransform;
                                el.style.boxShadow = originalBoxShadow;
                                el.style.zIndex = '';
                                setTimeout(() => el.style.transition = originalTransition, 300);
                            }, 3000);
                        }
                    }, 500);

                    router.replace({ query: { ...route.query, select: undefined } });
                }
            }
        }
    } catch (e) {
        toast.show("Erreur chargement des tâches", "error");
    } finally {
        loading.value = false;
    }
};

const openTaskDetails = (task: Task) => {
    selectedTask.value = task;
};

const handleOpenTask = async (taskPartial: any) => {
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${taskPartial.id}`);
        if (res.ok) {
            const fullTask = await res.json();
            selectedTask.value = fullTask;
        } else {
            selectedTask.value = taskPartial; // Fallback
        }
    } catch (e) {
        selectedTask.value = taskPartial; // Fallback
    }
};

const onTaskCreated = (task: Task) => {
    if (!task.parentTaskId && !tasks.value.some(t => t.id === task.id)) {
        tasks.value.unshift(task);
    }
};

const onTaskUpdated = (updatedTask: Task) => {
    const idx = tasks.value.findIndex(t => t.id === updatedTask.id);
    if (idx !== -1) tasks.value[idx] = updatedTask;
};

const onTaskDeleted = (taskId: string) => {
    tasks.value = tasks.value.filter(t => t.id !== taskId);
};

const onDragStart = (e: DragEvent, task: Task) => {
    isDraggingTask.value = true;
    isDeleting.value = false;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('taskId', task.id);
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

const onDrop = async (e: DragEvent, newStatus: string) => {
    const taskId = e.dataTransfer?.getData('taskId');
    if (!taskId) return;

    const taskToMove = tasks.value.find(t => t.id === taskId);
    if (!taskToMove || taskToMove.status === newStatus) return;

    const oldStatus = taskToMove.status;
    taskToMove.status = newStatus as 'TODO' | 'IN_PROGRESS' | 'DONE'; 
    
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!res.ok) throw new Error("API Error");
        
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

onMounted(async () => {
    loadTasks();
    
    const socket = await useWSocket();
    socket.value?.on('todo-added', ({ task }: { task: Task }) => {
        if (task.spaceId === route.params.spaceId) {
            if (!task.parentTaskId) {
                if (!tasks.value.some(t => t.id === task.id)) {
                    tasks.value.unshift(task);
                }
            } else {
                const parent = tasks.value.find(t => t.id === task.parentTaskId);
                if (parent) {
                    if (!parent.subtasks) parent.subtasks = [];
                    if (!parent.subtasks.some(st => st.id === task.id)) {
                        parent.subtasks.push(task);
                    }
                }
            }
        }
    });
    socket.value?.on('todo-updated', ({ task }: { task: Task }) => {
        if (task.spaceId === route.params.spaceId) {
            onTaskUpdated(task);
        }
    });
    socket.value?.on('todo-deleted', ({ taskId }: { taskId: string }) => {
        onTaskDeleted(taskId);
    });
});

onUnmounted(async () => {
    const socket = await useWSocket();
    socket.value?.off('todo-added');
    socket.value?.off('todo-updated');
    socket.value?.off('todo-deleted');
});
</script>
