<template>
    <div
         class="bg-(--bg2) border border-(--text)/10 p-4 rounded-xl cursor-pointer hover:border-(--primary)/50 transition-all shadow-lg hover:shadow-[0_8px_30px_var(--shadow-elevated)] group relative overflow-hidden text-left w-full"
    >
        <div class="flex justify-between items-start gap-2">
            <div class="flex flex-col gap-1 w-full">
                <p class="text-sm font-bold text-(--text) leading-snug flex items-start gap-2">
                    <i class="bi bi-check2-square text-(--primary) mt-0.5 opacity-80 shrink-0"></i>
                    <span>{{ task.title }}</span>
                </p>
                <span v-if="task.parentTask" class="text-[9px] font-bold text-(--primary) uppercase flex items-center gap-1 opacity-80">
                    <i class="bi bi-arrow-return-right"></i> {{ task.parentTask.title }}
                </span>
            </div>
            <slot name="header-right"></slot>
        </div>

        <div v-if="task.tags?.length" class="flex flex-wrap gap-1 mt-2">
            <span
                v-for="tag in task.tags.slice(0, 3)" :key="tag.id"
                class="px-2 py-0.5 rounded-full text-[9px] font-bold border"
                :style="{ borderColor: tag.color, color: tag.color }"
            >
                {{ tag.name }}
            </span>
            <span v-if="task.tags.length > 3" class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-(--text)/5 text-(--text2)">
                +{{ task.tags.length - 3 }}
            </span>
        </div>

        <div class="flex items-center justify-between mt-4" v-if="task.assignees?.length || (task.subtasks && task.subtasks.length > 0) || task._count?.attachments">
            <div class="flex items-center -space-x-1.5" v-if="task.assignees?.length">
                <template v-for="assignee in task.assignees.slice(0,3)" :key="assignee.id">
                    <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="assignee.name" class="w-6 h-6 rounded-full object-cover border-2 border-(--bg2) z-10 hover:z-20">
                    <div v-else :title="assignee.name" class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[9px] font-black border-2 border-(--bg2) z-10 hover:z-20">
                        {{ assignee.name?.substring(0, 2).toUpperCase() || 'U' }}
                    </div>
                </template>
                <div v-if="task.assignees.length > 3" class="w-6 h-6 rounded-full bg-(--text)/10 text-(--text) flex items-center justify-center text-[9px] font-black border-2 border-(--bg2) z-10">
                    +{{ task.assignees.length - 3 }}
                </div>
            </div>
            <div v-else></div>
            
            <div class="flex items-center gap-1.5">
                <div v-if="task._count?.attachments" class="flex items-center gap-1 text-xs bg-(--text)/5 px-2 py-1 rounded-lg font-bold text-(--text2)">
                    <i class="bi bi-paperclip"></i>
                    {{ task._count.attachments }}
                </div>
                <div v-if="task.subtasks && task.subtasks.length > 0" class="flex items-center gap-1.5 text-xs bg-(--text)/5 px-2.5 py-1 rounded-lg font-bold text-(--text)/50">
                    <i class="bi bi-check2-square text-(--primary)"></i>
                    {{ task.subtasks.filter((st: any) => st.status === 'DONE').length }}/{{ task.subtasks.length }}
                </div>
            </div>
        </div>

        <div class="mt-4 pt-3 border-t border-(--border-color)" v-if="task.dueDate && task.status !== 'DONE'">
            <div class="flex justify-between items-end mb-1.5">
                <span class="text-[9px] font-black uppercase tracking-widest text-(--text2)">
                    Échéance
                </span>
                <span class="text-[10px] font-black" :class="getProgress(task).color.replace('bg-', 'text-')">
                    {{ getProgress(task).text }}
                </span>
            </div>
            <div class="w-full h-1.5 bg-(--surface-sunken) rounded-full overflow-hidden">
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
        
        <slot name="footer"></slot>
    </div>
</template>

<script setup lang="ts">
import type { Task } from '@/types/types';

defineProps<{ task: Task }>();

const getProgress = (task: Task) => {
    if (!task.dueDate) return { percent: 0, text: '', color: 'bg-green-500' };
    const start = new Date(task.createdAt || Date.now()).getTime();
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
    
    let color = 'bg-green-500';
    if (percent > 60) color = 'bg-orange-400';
    if (percent > 85) color = 'bg-red-500';
    if (percent > 95) color = 'bg-red-600 animate-pulse';

    return { percent, text, color };
};
</script>
