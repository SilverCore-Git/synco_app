<template>
    <div
         class="border p-4 rounded-xl cursor-pointer transition-all group relative overflow-hidden text-left w-full"
         :class="[!archived && isTaskOverdue(task) ? TASK_CARD_OVERDUE_CLASS : TASK_CARD_NORMAL_CLASS, archived ? 'flex flex-col' : '']"
    >
        <div class="flex justify-between items-start gap-2">
            <div class="flex flex-col gap-1 w-full">
                <p class="font-bold text-(--text) leading-snug flex items-start gap-2" :class="featured ? 'text-lg' : 'text-sm'">
                    <i class="bi mt-0.5 opacity-80 shrink-0" :class="archived ? 'bi-archive text-amber-500' : 'bi-check2-square text-(--primary)'"></i>
                    <span>{{ task.title }}</span>
                </p>
                <span v-if="task.parentTask" class="text-[9px] font-bold text-(--primary) uppercase flex items-center gap-1 opacity-80">
                    <i class="bi bi-arrow-return-right"></i> {{ task.parentTask.title }}
                </span>
                <span v-if="!archived && isTaskOverdue(task)" class="self-start mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black uppercase tracking-wider">
                    <i class="bi bi-exclamation-triangle-fill"></i> {{ overdueLabel(task.dueDate!) }}
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
                    <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="$p(assignee.name)" class="w-6 h-6 rounded-full object-cover border-2 border-(--bg2) z-10 hover:z-20">
                    <div v-else :title="$p(assignee.name)" class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[9px] font-black border-2 border-(--bg2) z-10 hover:z-20">
                        {{ $p(assignee.name)?.substring(0, 2).toUpperCase() || 'U' }}
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

        <!-- Archivée : ni échéance ni « Terminée » (la tâche n'est plus en cours),
             mais quand elle a été rangée et dans quel état. -->
        <!-- Pousse le pied en bas : dans la grille des archives, les cartes d'une rangée ont la même hauteur. -->
        <div v-if="archived" class="flex-1 min-h-4" aria-hidden="true"></div>
        <div class="pt-3 border-t border-(--border-color) flex items-center justify-between gap-2 text-[11px]" v-if="archived">
            <span class="font-bold text-(--text2) flex items-center gap-1.5 min-w-0" :title="archivedFull">
                <i class="bi bi-archive-fill text-amber-500"></i>
                <span class="truncate">{{ archivedAgo }}</span>
            </span>
            <span class="font-bold shrink-0" :class="task.status === 'DONE' ? 'text-green-500' : 'text-(--text2)'">
                <i class="bi mr-0.5" :class="task.status === 'DONE' ? 'bi-check-lg' : 'bi-circle'"></i>
                {{ task.status === 'DONE' ? 'Terminée' : 'Non terminée' }}
            </span>
        </div>

        <div class="mt-4 pt-3 border-t border-(--border-color)" v-else-if="task.dueDate && task.status !== 'DONE'">
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
import { computed } from 'vue';
import type { Task } from '@/types/types';
import { archivedAgoLabel } from '@/assets/utils/taskArchive';
import { deadlineProgress, isTaskOverdue, overdueLabel, TASK_CARD_NORMAL_CLASS, TASK_CARD_OVERDUE_CLASS } from '@/assets/utils/taskOverdue';

// featured : la tâche « à la une » de l'accueil, titre plus grand.
// archived : variante de l'écran des archives (TasksArchive.vue).
const props = defineProps<{ task: Task; featured?: boolean; archived?: boolean }>();

const archivedAgo = computed(() => archivedAgoLabel(props.task.archivedAt));
const archivedFull = computed(() => props.task.archivedAt
    ? `Archivée le ${new Date(props.task.archivedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}`
    : 'Date d\'archivage inconnue');

const getProgress = deadlineProgress;
</script>
