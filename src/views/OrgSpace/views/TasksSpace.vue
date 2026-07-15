<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full ">
        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-white/5 bg-(--bg2) z-10 shrink-0">
            <div class="flex items-center gap-3">
                <i class="bi bi-check2-square text-white"></i>
                <h3 class="font-semibold text-white">Tâches</h3>
            </div>
            
            <div class="flex items-center gap-4">
                <CreateTaskModal 
                    :defaultSpaceId="route.params.spaceId as string" 
                    :hideSpaceSelect="true"
                    @created="onTaskCreated"
                >
                    <button class="bg-(--primary) text-white font-bold py-1.5 px-4 rounded-lg hover:brightness-110 active:scale-95 transition-all text-sm flex items-center gap-2 shadow-sm">
                        <i class="bi bi-plus-lg"></i> Créer une tâche
                    </button>
                </CreateTaskModal>
                <div class="ml-auto flex items-center gap-4 text-(--text)/40">
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

        <main class="flex-1 overflow-y-auto p-6 w-full h-full space-y-6">
            
            <!-- Filter Bar -->
            <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button @click="filterUserId = null" class="px-4 py-2 rounded-xl font-bold text-xs transition-all" :class="!filterUserId ? 'bg-(--primary) text-white shadow-[0_4px_15px_rgba(var(--primary-rgb),0.2)]' : 'bg-white/5 text-white/50 hover:bg-white/10'">
                    Toutes les tâches
                </button>
                <button @click="filterUserId = user?.id" class="px-4 py-2 rounded-xl font-bold text-xs transition-all" :class="filterUserId === user?.id ? 'bg-(--primary) text-white shadow-[0_4px_15px_rgba(var(--primary-rgb),0.2)]' : 'bg-white/5 text-white/50 hover:bg-white/10'">
                    Mes tâches
                </button>
                <div class="w-px h-6 bg-white/10 mx-2"></div>
                <button v-for="member in spaceMembers" :key="member.id" @click="filterUserId = member.userId" class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all" :class="filterUserId === member.userId ? 'bg-(--primary) text-white shadow-[0_4px_15px_rgba(var(--primary-rgb),0.2)]' : 'bg-white/5 text-white/50 hover:bg-white/10'">
                    <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-5 h-5 rounded-full object-cover">
                    <div v-else class="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px]">
                        {{ member.user?.name?.substring(0,2).toUpperCase() }}
                    </div>
                    {{ member.user?.name }}
                </button>
            </div>

            <div v-if="loading" class="w-full flex flex-col gap-6 animate-pulse pb-10 h-full">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-start h-full">
                    <div v-for="i in 3" :key="'skel-col-'+i" class="bg-black/20 rounded-2xl p-4 flex flex-col gap-4 border border-white/5 min-h-[60vh]">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-xl bg-white/10"></div>
                                <div class="w-24 h-4 bg-white/10 rounded-full"></div>
                            </div>
                            <div class="w-6 h-4 bg-white/10 rounded-full"></div>
                        </div>
                        <div v-for="j in 3" :key="'skel-card-'+j" class="bg-white/5 border border-white/5 p-4 rounded-xl h-28"></div>
                    </div>
                </div>
            </div>
            
            <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6 items-start h-full pb-10">
                
                <!-- Columns -->
                <div v-for="col in columns" :key="col.id" 
                     class="bg-(--bg2)/40 border rounded-2xl p-4 min-h-[500px] flex flex-col transition-all"
                     :class="draggedOverCol === col.id ? 'border-(--primary) bg-(--primary)/5 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]' : 'border-white/5'"
                     @dragover.prevent
                     @dragenter.prevent="draggedOverCol = col.id"
                     @dragleave.prevent="draggedOverCol = null"
                     @drop="onDrop($event, col.id); draggedOverCol = null"
                >
                    <div class="flex items-center justify-between mb-5">
                        <h4 class="font-black text-sm tracking-widest uppercase flex items-center gap-2" :class="col.color">
                            <i :class="col.icon"></i>
                            {{ col.title }}
                        </h4>
                        <span class="bg-white/5 text-(--text)/50 text-xs px-2.5 py-1 rounded-full font-bold">
                            {{ filteredTasks(col.id).length }}
                        </span>
                    </div>

                    <div class="flex-1 space-y-4">
                        <div v-for="task in filteredTasks(col.id)" :key="task.id" 
                             draggable="true"
                             @dragstart="onDragStart($event, task)"
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
                            <div class="mt-4 pt-3 border-t border-white/5" v-if="task.dueDate && task.status !== 'DONE'">
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
                            
                            <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-center" v-else-if="task.status === 'DONE'">
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
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import { openedOrg, user } from '@/assets/var';
import type { Task, OrgMember } from '@/types/types';
import SpinLoader from '@/components/SpinLoader.vue';
import { useToast } from '@/composables/useToast';
import useSettingsItem from '@/composables/useSettingsItem';
import CreateTaskModal from '../components/popup/CreateTaskModal.vue';
import TaskDetailsModal from '../components/popup/TaskDetailsModal.vue';
import confetti from 'canvas-confetti';

const route = useRoute();
const toast = useToast();
const { Item: showUsersBar } = useSettingsItem('showUsersBar', true);

const tasks = ref<Task[]>([]);
const loading = ref(true);
const draggedOverCol = ref<string | null>(null);
const filterUserId = ref<string | null>(null);

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
        if (t.status !== status || t.parentTaskId) return false;
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

const onTaskCreated = (task: Task) => {
    tasks.value.unshift(task);
};

const onTaskUpdated = (updatedTask: Task) => {
    const idx = tasks.value.findIndex(t => t.id === updatedTask.id);
    if (idx !== -1) tasks.value[idx] = updatedTask;
};

const onTaskDeleted = (taskId: string) => {
    tasks.value = tasks.value.filter(t => t.id !== taskId);
};

const onDragStart = (e: DragEvent, task: Task) => {
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('taskId', task.id);
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
                    colors: ['#4ade80', '#3b82f6', '#fbbf24', '#f87171']
                });
            } catch (e) {}
        }
        
    } catch (err) {
        taskToMove.status = oldStatus; 
        toast.show("Erreur lors du déplacement", "error");
    }
};

onMounted(() => {
    loadTasks();
});
</script>
