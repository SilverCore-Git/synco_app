<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full ">
        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
            <div class="flex items-center gap-3">
                <MobileBackBtn />
                <i class="bi bi-check2-square text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Tâches</h3>
            </div>
            
            <TaskProgressGauge :tasks="visibleTasks" class="mx-auto" />
            
            <div class="flex items-center gap-4">
                <CreateTaskModal 
                    :defaultSpaceId="route.params.spaceId as string" 
                    :hideSpaceSelect="true"
                    @created="onTaskCreated"
                >
                    <button class="primary-glow !text-sm">
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
            
            <!-- Filter Bar : toujours sur une seule ligne, y compris sur mobile -->
            <div class="flex flex-row flex-nowrap items-center gap-2 w-full min-w-0 shrink-0">
                
                <!-- Hors glisser-déposer : un sélecteur compact (scalable à 100 membres) -->
                <TaskUserFilter
                    v-if="!isDraggingTask"
                    v-model="filterUserId"
                    :members="spaceMembers"
                    :current-user-id="user?.id || null"
                    :me="user"
                />

                <!-- Pendant un glisser-déposer : la liste des membres redevient visible,
                     chaque avatar servant de cible pour assigner la tâche déposée. -->
                <div v-else class="flex items-center gap-2 overflow-x-auto w-full min-w-0 scrollbar-hide pb-1">
                    <button
                        v-for="member in spaceMembers" :key="member.id"
                        @click="filterUserId = member.userId"
                        @dragover.prevent="dragOverMemberId = member.userId"
                        @dragleave.prevent="dragOverMemberId = null"
                        @drop="onDropToAssign($event, member)"
                        class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0"
                        :class="dragOverMemberId === member.userId ? 'bg-(--primary) text-white ring-2 ring-(--primary)/50 shadow-[0_4px_20px_var(--glow-primary-strong)]' : (filterUserId === member.userId ? 'bg-(--primary) text-white shadow-[0_4px_15px_var(--glow-primary-soft)]' : 'bg-(--text)/5 text-(--text)/50 hover:bg-(--text)/10')"
                    >
                        <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-5 h-5 rounded-full object-cover">
                        <div v-else class="w-5 h-5 rounded-full bg-(--text)/10 flex items-center justify-center text-[9px]">
                            {{ $p(member.user?.name)?.substring(0,2).toUpperCase() }}
                        </div>
                        {{ $p(member.user?.name) }}
                    </button>
                </div>

                <div class="hidden sm:block w-px h-6 bg-(--border-color) mx-2 shrink-0"></div>

                <DropDown align="left" content-iner-t-w="min-w-[280px]">
                    <template #trigger>
                        <button type="button" class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap h-full" :class="filterTagIds.length ? 'bg-(--primary)/15 text-(--primary)' : 'bg-(--text)/5 text-(--text)/70 hover:bg-(--text)/10'">
                            <i class="bi bi-tags"></i>
                            {{ filterTagIds.length ? `${filterTagIds.length} tag${filterTagIds.length > 1 ? 's' : ''}` : 'Tags' }}
                            <i class="bi bi-chevron-down text-[10px] opacity-60"></i>
                        </button>
                    </template>
                    <template #content>
                        <div @click.stop>
                            <button
                                v-if="filterTagIds.length"
                                type="button"
                                @click="filterTagIds = []"
                                class="text-[11px] font-bold text-(--text2) hover:text-(--text) flex items-center gap-1 mb-2"
                            >
                                <i class="bi bi-x-lg"></i>
                                Tout désélectionner
                            </button>
                            <TaskTagPicker :orgId="route.params.orgId as string" v-model="filterTagIds" />
                        </div>
                    </template>
                </DropDown>

                <button
                    v-if="filterUserId || filterTagIds.length"
                    type="button"
                    @click="filterUserId = null; filterTagIds = []"
                    class="text-[11px] font-bold text-(--text2) hover:text-(--text) flex items-center gap-1 ml-1 shrink-0"
                >
                    <i class="bi bi-x-circle"></i>
                    Réinitialiser les filtres
                </button>

                <button
                    v-if="archivedCount > 0 || isDraggingTask"
                    @click="router.push({ name: 'TasksSpaceArchived', params: { orgId: route.params.orgId, spaceId: route.params.spaceId } })"
                    @dragover.prevent="dragOverArchiveBtn = true"
                    @dragleave.prevent="dragOverArchiveBtn = false"
                    @drop="onDropToArchiveBtn"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ml-auto"
                    :class="dragOverArchiveBtn ? 'bg-amber-500 text-white ring-2 ring-amber-300 shadow-[0_4px_20px_var(--glow-warning-strong)]' : 'bg-(--text)/5 text-(--text)/50 hover:bg-(--text)/10'"
                >
                    <i class="bi bi-archive-fill" />
                    <span class="hidden sm:inline">Tâches archivées</span>
                </button>

            </div>

            <div v-if="loading" class="flex-1 min-h-0 w-full flex flex-col gap-6 animate-pulse pb-10">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
                    <div v-for="i in 3" :key="'skel-col-'+i" class="bg-(--surface-sunken) rounded-2xl p-4 flex flex-col gap-4 border border-(--border-color) h-full">
                        <div class="flex items-center justify-between mb-2 shrink-0">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-xl bg-(--text)/10"></div>
                                <div class="w-24 h-4 bg-(--text)/10 rounded-full"></div>
                            </div>
                            <div class="w-6 h-4 bg-(--text)/10 rounded-full"></div>
                        </div>
                        <div v-for="j in 3" :key="'skel-card-'+j" class="bg-(--text)/5 border border-(--border-color) p-4 rounded-xl h-28 shrink-0"></div>
                    </div>
                </div>
            </div>
            
            <!-- Mobile : un onglet à la fois, pas de glisser-déposer (ne marche pas au toucher) -->
            <div v-if="!loading" class="flex-1 min-h-0 flex flex-col md:hidden">
                <div class="relative flex items-center gap-1 p-1 bg-(--text)/5 rounded-xl mb-4 shrink-0">
                    <div
                        class="absolute top-1 bottom-1 rounded-lg bg-(--primary) shadow-lg transition-all duration-300 ease-out"
                        :style="tabIndicatorStyle"
                    ></div>
                    <button
                        v-for="(col, idx) in columns" :key="col.id"
                        :ref="(el) => setTabRef(idx, el)"
                        @click="mobileActiveColumn = col.id"
                        class="relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors"
                        :class="mobileActiveColumn === col.id ? 'text-white' : 'text-(--text2)'"
                    >
                        <i :class="col.icon"></i>
                        {{ col.title }}
                        <span class="bg-(--surface-sunken) px-1.5 rounded-full">{{ filteredTasks(col.id).length }}</span>
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto space-y-3 pr-1">
                    <div
                        v-for="task in filteredTasks(mobileActiveColumn)" :key="task.id"
                        @click="openTaskDetails(task)"
                        class="bg-(--bg2) border border-(--text)/10 p-4 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
                    >
                        <p class="text-sm font-bold text-(--text) leading-snug">{{ task.title }}</p>
                        <span v-if="task.parentTask" class="text-[9px] font-bold text-(--primary) uppercase flex items-center gap-1 opacity-80 mt-1">
                            <i class="bi bi-arrow-return-right"></i> {{ task.parentTask.title }}
                        </span>

                        <div v-if="task.tags?.length" class="flex flex-wrap gap-1 mt-2">
                            <span
                                v-for="tag in task.tags.slice(0, 3)" :key="tag.id"
                                class="px-2 py-0.5 rounded-full text-[9px] font-bold border"
                                :style="{ borderColor: tag.color, color: tag.color }"
                            >
                                {{ tag.name }}
                            </span>
                        </div>

                        <div class="flex items-center justify-between mt-3">
                            <div class="flex items-center -space-x-1.5" v-if="task.assignees?.length">
                                <template v-for="assignee in task.assignees.slice(0,3)" :key="assignee.id">
                                    <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="$p(assignee.name)" class="w-6 h-6 rounded-full object-cover border-2 border-(--bg2)">
                                    <div v-else :title="$p(assignee.name)" class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[9px] font-black border-2 border-(--bg2)">
                                        {{ $p(assignee.name).substring(0, 2).toUpperCase() }}
                                    </div>
                                </template>
                            </div>
                            <div v-else></div>

                            <div class="flex items-center gap-1.5" @click.stop>
                                <button
                                    v-if="prevStatus(task.status)"
                                    @click="changeTaskStatus(task, prevStatus(task.status)!)"
                                    class="w-8 h-8 rounded-lg bg-(--text)/5 hover:bg-(--text)/10 flex items-center justify-center transition-colors"
                                    :class="columnColor(prevStatus(task.status)!)"
                                    :title="`Repasser à « ${columnTitle(prevStatus(task.status)!)} »`"
                                >
                                    <i :class="columnIcon(prevStatus(task.status)!)"></i>
                                </button>
                                <button
                                    v-if="nextStatus(task.status)"
                                    @click="changeTaskStatus(task, nextStatus(task.status)!)"
                                    class="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-(--primary)/10 hover:bg-(--primary)/20 text-(--primary) font-bold text-[11px] transition-colors"
                                    :title="`Passer à « ${columnTitle(nextStatus(task.status)!)} »`"
                                >
                                    <i :class="columnIcon(nextStatus(task.status)!)"></i>
                                    {{ columnTitle(nextStatus(task.status)!) }}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-if="filteredTasks(mobileActiveColumn).length === 0" class="text-center text-(--text2) text-sm py-12">
                        Aucune tâche ici.
                    </div>
                </div>
            </div>

            <!-- Desktop : les 3 colonnes côte à côte avec glisser-déposer -->
            <div v-if="!loading" class="hidden md:grid flex-1 min-h-0 md:grid-cols-3 gap-6 pb-2">

                <!-- Columns -->
                <div v-for="col in columns" :key="col.id"
                     class="bg-(--bg2)/40 border rounded-2xl p-4 min-h-[400px] h-full flex flex-col transition-all"
                     :class="draggedOverCol === col.id ? 'border-(--primary) bg-(--primary)/5 shadow-[0_0_20px_var(--glow-primary-faint)]' : 'border-(--border-color)'"
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
                        <div class="flex items-center gap-2">
                            <button
                                v-if="col.id === 'DONE' && filteredTasks(col.id).length > 0"
                                @click="showArchiveAllConfirm = true"
                                :disabled="archivingAll"
                                class="text-amber-500/80 hover:text-amber-500 transition-colors disabled:opacity-50"
                                title="Archiver toutes les tâches terminées"
                            >
                                <i class="bi bi-archive" />
                            </button>
                            <span class="bg-(--text)/5 text-(--text2) text-xs px-2.5 py-1 rounded-full font-bold">
                                {{ filteredTasks(col.id).length }}
                            </span>
                        </div>
                    </div>

                    <div class="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1 custom-scrollbar">
                        <DropDown
                            v-for="task in filteredTasks(col.id)" :key="task.id"
                            align="mouse" click="right" class="w-full"
                        >
                        <template #trigger>
                        <div
                             :id="'task-' + task.id"
                             draggable="true"
                             @dragstart="onDragStart($event, task)"
                             @dragend="onDragEnd"
                             @dragover.prevent="onCardDragOver($event, task)"
                             @drop.stop="onCardDrop($event, task, col.id)"
                             @click="openTaskDetails(task)"
                             class="bg-(--bg2) border border-(--text)/10 p-4 rounded-xl cursor-pointer active:cursor-grabbing hover:border-(--primary)/50 transition-all shadow-lg hover:shadow-[0_8px_30px_var(--shadow-elevated)] group relative overflow-hidden"
                             :class="[
                                dragOverTaskId === task.id && dragOverPosition === 'before' ? 'border-t-2 border-t-(--primary)' : '',
                                dragOverTaskId === task.id && dragOverPosition === 'after' ? 'border-b-2 border-b-(--primary)' : ''
                             ]"
                        >
                            <div class="flex justify-between items-start gap-2">
                                <div class="flex flex-col gap-1">
                                    <p class="text-sm font-bold text-(--text) leading-snug">{{ task.title }}</p>
                                    <span v-if="task.parentTask" class="text-[9px] font-bold text-(--primary) uppercase flex items-center gap-1 opacity-80">
                                        <i class="bi bi-arrow-return-right"></i> {{ task.parentTask.title }}
                                    </span>
                                </div>
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

                            <div class="flex items-center justify-between mt-4">
                                <div class="flex items-center -space-x-1.5" v-if="task.assignees?.length">
                                    <template v-for="assignee in task.assignees.slice(0,3)" :key="assignee.id">
                                        <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="$p(assignee.name)" class="w-6 h-6 rounded-full object-cover border-2 border-(--bg2) z-10 hover:z-20">
                                        <div v-else :title="$p(assignee.name)" class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[9px] font-black border-2 border-(--bg2) z-10 hover:z-20">
                                            {{ $p(assignee.name).substring(0, 2).toUpperCase() }}
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

                        </div>
                        </template>
                        <template #content>
                            <button
                                @click="startRenameTask(task)"
                                class="dropdown-item-annimate dropdown-item-style gap-2"
                            >
                                <i class="bi bi-pencil" />
                                Modifier la tâche
                            </button>
                            <CreateTaskModal
                                :parentTaskId="task.id"
                                :hideSpaceSelect="true"
                                :defaultSpaceId="task.spaceId"
                                @created="(newTask: Task) => onSubtaskCreatedFromMenu(task, newTask)"
                            >
                                <button class="dropdown-item-annimate dropdown-item-style gap-2 w-full">
                                    <i class="bi bi-list-nested" />
                                    Ajouter une sous-tâche
                                </button>
                            </CreateTaskModal>
                            <button
                                @click="archiveTask(task)"
                                class="dropdown-item-annimate dropdown-item-style gap-2"
                            >
                                <i class="bi bi-archive" />
                                Archiver
                            </button>
                            <button
                                @click="handleContextDeleteTask(task)"
                                class="dropdown-item-annimate dropdown-item-style gap-2 text-red-500! hover:bg-red-500/5!"
                            >
                                <i class="bi bi-trash" />
                                Supprimer
                            </button>
                        </template>
                        </DropDown>
                    </div>
                </div>
            </div>
        </main>
        
        <TaskDetailsModal
            :task="selectedTask"
            :isOpen="!!selectedTask"
            :startInEditMode="openTaskInEditMode"
            @close="selectedTask = null"
            @update="onTaskUpdated"
            @delete="onTaskDeleted"
            @open-task="handleOpenTask"
        />

        <Transition name="pop">
            <div v-if="isDraggingTask"
                 class="fixed bottom-8 right-8 flex items-center gap-4 z-[100]">

                <div class="w-16 h-16 bg-red-500/90 text-white rounded-full flex items-center justify-center shadow-2xl border-4 transition-all duration-500"
                     :class="[
                        isDeleting ? 'scale-0 translate-y-10 opacity-0 rotate-[360deg]' : 'scale-100',
                        isHoveringTrash && !isDeleting ? 'border-red-300 scale-125 shadow-[0_0_40px_var(--glow-danger-strong)]' : 'border-transparent'
                     ]"
                     @dragover.prevent="isHoveringTrash = true"
                     @dragleave.prevent="isHoveringTrash = false"
                     @drop="onDropToTrash"
                     title="Supprimer">

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

            </div>
        </Transition>

        <ConfirmDelete
            :show="showArchiveAllConfirm"
            item-type="les tâches terminées"
            :item-name="`${filteredTasks('DONE').length} tâche(s)`"
            title="Archiver toutes les tâches terminées ?"
            :message="`Êtes-vous sûr de vouloir archiver les ${filteredTasks('DONE').length} tâche(s) terminée(s) ? Vous pourrez les restaurer plus tard depuis les tâches archivées.`"
            button-text="Archiver"
            :loading="archivingAll"
            @cancel="showArchiveAllConfirm = false"
            @confirm="confirmArchiveAll"
        />

        <ConfirmDelete
            :show="!!showDeleteTaskConfirm"
            item-type="la tâche"
            :item-name="showDeleteTaskConfirm?.title || 'cette tâche'"
            :loading="deletingTask"
            @cancel="showDeleteTaskConfirm = null"
            @confirm="confirmDeleteTask"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import { openedOrg, user } from '@/assets/var';
import type { Task, OrgMember } from '@/types/types';
import TaskProgressGauge from '../components/SpaceTasks/TaskProgressGauge.vue';

import { useToast } from '@/composables/useToast';
import { useUsersBar } from '@/composables/useUsersBar';
import useWSocket from '@/composables/useWSocket';
import CreateTaskModal from '../components/popup/CreateTaskModal.vue';
import TaskUserFilter from '../components/TaskUserFilter.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import TaskDetailsModal from '../components/popup/TaskDetailsModal.vue';
import DropDown from '@/components/DropDown.vue';
import TaskTagPicker from '../components/popup/TaskTagPicker.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import confetti from 'canvas-confetti';
import { useNotification } from '@/composables/useNotification';
import { useTaskOrder } from '@/composables/useTaskOrder';
import { usePersistedTaskFilters } from '@/composables/usePersistedTaskFilters';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { fetchOrder, sortByOrder, persistOrder } = useTaskOrder(route.params.orgId as string);
const { showUsersBar } = useUsersBar();
const { markTasksAsRead } = useNotification();

const tasks = ref<Task[]>([]);
const loading = ref(true);
const draggedOverCol = ref<string | null>(null);
const { filterUserId, filterTagIds } = usePersistedTaskFilters(
    () => `task-filters:${user.value?.id}:${route.params.orgId}:space:${route.params.spaceId}`
);

const isDraggingTask = ref(false);
const isHoveringTrash = ref(false);
const isDeleting = ref(false);
const archivingAll = ref(false);
const showArchiveAllConfirm = ref(false);
const archivedCount = ref(0);
const dragOverArchiveBtn = ref(false);
const dragOverMemberId = ref<string | null>(null);

const dragOverTaskId = ref<string | null>(null);
const dragOverPosition = ref<'before' | 'after' | null>(null);

const selectedTask = ref<Task | null>(null);
const openTaskInEditMode = ref(false);

const columns = [
    { id: 'TODO', title: 'À faire', color: 'text-gray-400', icon: 'bi-circle' },
    { id: 'IN_PROGRESS', title: 'En cours', color: 'text-blue-400', icon: 'bi-arrow-repeat' },
    { id: 'DONE', title: 'Terminé', color: 'text-green-500', icon: 'bi-check-circle-fill' }
];

// ── Vue mobile : le glisser-déposer natif ne fonctionne pas au toucher,
// donc pas de 3 colonnes côte à côte — un onglet à la fois, et de petites
// flèches sur chaque carte pour changer de statut sans glisser.
const mobileActiveColumn = ref<string>('TODO');

const prevStatus = (status: string): string | null => {
    const idx = columns.findIndex(c => c.id === status);
    return idx > 0 ? columns[idx - 1]?.id ?? null : null;
};

const nextStatus = (status: string): string | null => {
    const idx = columns.findIndex(c => c.id === status);
    return idx >= 0 && idx < columns.length - 1 ? columns[idx + 1]?.id ?? null : null;
};

const columnTitle = (status: string) => columns.find(c => c.id === status)?.title || status;
const columnIcon = (status: string) => columns.find(c => c.id === status)?.icon || 'bi-circle';
const columnColor = (status: string) => columns.find(c => c.id === status)?.color || 'text-(--text2)';

// Indicateur qui glisse d'un onglet à l'autre au lieu de sauter instantanément
// (mesuré en pixels sur le DOM plutôt que calculé en % : plus fiable que de
// recalculer des marges/gaps Tailwind à la main).
const tabRefs = ref<(HTMLElement | null)[]>([]);
const tabIndicatorStyle = ref({ left: '0px', width: '0px' });

const setTabRef = (idx: number, el: Element | { $el?: Element } | null) => {
    tabRefs.value[idx] = (el as HTMLElement) || null;
};

const updateTabIndicator = () => {
    const idx = columns.findIndex(c => c.id === mobileActiveColumn.value);
    const el = tabRefs.value[idx];
    if (el) {
        tabIndicatorStyle.value = { left: `${el.offsetLeft}px`, width: `${el.offsetWidth}px` };
    }
};

watch(mobileActiveColumn, () => nextTick(updateTabIndicator));
onMounted(() => nextTick(updateTabIndicator));
window.addEventListener('resize', updateTabIndicator);
onUnmounted(() => window.removeEventListener('resize', updateTabIndicator));

const spaceMembers = computed<OrgMember[]>(() => {
    const space = openedOrg.value?.spaces?.find(s => s.id === route.params.spaceId);
    if (!space || !openedOrg.value?.members) return [];
    return openedOrg.value.members.filter(m => space.membersId.includes(m.userId));
});

// Base commune à la jauge de progression (TaskProgressGauge, dans le
// template ci-dessus) ET aux colonnes (filteredTasks ci-dessous) — avant ce
// fix, la jauge répliquait seulement le filtre membre à la main et ignorait
// complètement le filtre par tag, donc filtrer par tag changeait le tableau
// sans jamais faire bouger la jauge.
const visibleTasks = computed(() => {
    return tasks.value.filter(t => {
        if (filterUserId.value && !t.assignees?.some(a => a.id === filterUserId.value)) return false;
        if (filterTagIds.value.length && !t.tags?.some(tag => filterTagIds.value.includes(tag.id))) return false;
        return true;
    });
});

const filteredTasks = (status: string) => {
    return sortByOrder(visibleTasks.value.filter(t => t.status === status));
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
            markTasksAsRead(route.params.spaceId as string);

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
                            el.style.boxShadow = '0 0 0 4px var(--primary), 0 10px 30px var(--shadow-elevated)';
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
    openTaskInEditMode.value = false;
    selectedTask.value = task;
};

const startRenameTask = (task: Task) => {
    openTaskInEditMode.value = true;
    selectedTask.value = task;
};

const showDeleteTaskConfirm = ref<Task | null>(null);
const deletingTask = ref(false);

const handleContextDeleteTask = (task: Task) => {
    showDeleteTaskConfirm.value = task;
};

const confirmDeleteTask = async () => {
    const task = showDeleteTaskConfirm.value;
    if (!task) return;
    deletingTask.value = true;
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${task.id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error();
        onTaskDeleted(task.id);
        toast.show('Tâche supprimée', 'success');
        showDeleteTaskConfirm.value = null;
    } catch (e) {
        toast.show('Erreur lors de la suppression', 'error');
    } finally {
        deletingTask.value = false;
    }
};

const onSubtaskCreatedFromMenu = (parentTask: Task, newTask: Task) => {
    onTaskCreated(newTask);
    if (!parentTask.subtasks) parentTask.subtasks = [];
    if (!parentTask.subtasks.some(st => st.id === newTask.id)) {
        parentTask.subtasks.push(newTask);
    }
};

const handleOpenTask = async (taskPartial: any) => {
    openTaskInEditMode.value = false;
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
    if (!tasks.value.some(t => t.id === task.id)) {
        tasks.value.unshift(task);
    }
};

const onTaskUpdated = (updatedTask: Task) => {
    const idx = tasks.value.findIndex(t => t.id === updatedTask.id);
    if (idx !== -1) tasks.value[idx] = updatedTask;
    // selectedTask est une référence séparée passée à TaskDetailsModal : sans
    // ça, la modale ouverte continue d'afficher l'ancien titre/description/
    // assignés tant qu'on ne la referme pas (elle ne suit pas le remplacement
    // ci-dessus dans tasks).
    if (selectedTask.value?.id === updatedTask.id) {
        selectedTask.value = updatedTask;
    }
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
    dragOverTaskId.value = null;
    dragOverPosition.value = null;
    dragOverArchiveBtn.value = false;
    dragOverMemberId.value = null;
    if (!isDeleting.value) {
        isDraggingTask.value = false;
        isHoveringTrash.value = false;
    }
};

// Le serveur émet 'todo-updated' (io.to(room).emit, tasksService.ts) avant
// même de répondre à la requête HTTP, et diffuse à tout le salon org y
// compris à l'auteur de l'action : selon la latence relative du websocket et
// du fetch, l'écho peut arriver avant OU après que archiveTaskById() traite
// sa propre réponse. countedArchiveIds coordonne les deux chemins pour que le
// premier des deux à traiter un taskId incrémente le compteur, et l'autre
// (que ce soit notre propre écho ou celui d'un archivage par quelqu'un
// d'autre) soit un no-op.
const countedArchiveIds = new Set<string>();

const registerArchivedTask = (taskId: string) => {
    onTaskDeleted(taskId);
    if (!countedArchiveIds.has(taskId)) {
        countedArchiveIds.add(taskId);
        archivedCount.value++;
    }
};

const archiveTaskById = async (taskId: string) => {
    const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ archived: true })
    });
    if (!res.ok) throw new Error("API Error");
    registerArchivedTask(taskId);
};

const onDropToArchiveBtn = async (e: DragEvent) => {
    const taskId = e.dataTransfer?.getData('taskId');
    dragOverArchiveBtn.value = false;
    if (!taskId) return;

    try {
        await archiveTaskById(taskId);
        toast.show("Tâche archivée", "success");
    } catch (err) {
        toast.show("Erreur lors de l'archivage", "error");
    }
};

const onDropToAssign = async (e: DragEvent, member: OrgMember) => {
    const taskId = e.dataTransfer?.getData('taskId');
    dragOverMemberId.value = null;
    if (!taskId) return;

    const task = tasks.value.find(t => t.id === taskId);
    if (!task) return;

    if (task.assignees?.some(a => a.id === member.userId)) {
        toast.show(`${member.user?.name || 'Cet utilisateur'} est déjà assigné à cette tâche`, "info");
        return;
    }

    const newAssigneeIds = [...(task.assignees?.map(a => a.id) || []), member.userId];

    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify({ assigneeIds: newAssigneeIds })
        });
        if (!res.ok) throw new Error("API Error");
        const updatedTask = await res.json();
        onTaskUpdated(updatedTask);
        toast.show(`Tâche assignée à ${member.user?.name || "l'utilisateur"}`, "success");
    } catch (err) {
        toast.show("Erreur lors de l'assignation", "error");
    }
};

const archiveTask = async (task: Task) => {
    try {
        await archiveTaskById(task.id);
        toast.show("Tâche archivée", "success");
    } catch (e) {
        toast.show("Erreur lors de l'archivage", "error");
    }
};

const confirmArchiveAll = async () => {
    const doneTasks = filteredTasks('DONE');
    if (doneTasks.length === 0) {
        showArchiveAllConfirm.value = false;
        return;
    }

    archivingAll.value = true;
    try {
        await Promise.all(doneTasks.map(t => archiveTaskById(t.id)));
        toast.show("Tâches archivées", "success");
        showArchiveAllConfirm.value = false;
    } catch (e) {
        toast.show("Erreur lors de l'archivage groupé", "error");
    } finally {
        archivingAll.value = false;
    }
};

const loadArchivedCount = async () => {
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/spaces/${route.params.spaceId}/archived`);
        if (res.ok) {
            const data = await res.json();
            archivedCount.value = data.archivedTasks.length;
        }
    } catch (e) {
        // Le badge d'archives est secondaire : pas d'erreur bloquante ici.
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

const changeTaskStatus = async (taskToMove: Task, newStatus: string) => {
    if (taskToMove.status === newStatus) return;

    const oldStatus = taskToMove.status;
    taskToMove.status = newStatus as 'TODO' | 'IN_PROGRESS' | 'DONE';

    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${taskToMove.id}`, {
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

const onDrop = async (e: DragEvent, newStatus: string) => {
    const taskId = e.dataTransfer?.getData('taskId');
    if (!taskId) return;

    const taskToMove = tasks.value.find(t => t.id === taskId);
    if (!taskToMove) return;

    const columnTaskIds = filteredTasks(newStatus)
        .filter(t => t.id !== taskId)
        .map(t => t.id);
    columnTaskIds.push(taskId);
    await persistOrder(columnTaskIds);

    await changeTaskStatus(taskToMove, newStatus);
};

const onCardDragOver = (e: DragEvent, task: Task) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    dragOverTaskId.value = task.id;
    dragOverPosition.value = e.clientY < midpoint ? 'before' : 'after';
};

const onCardDrop = async (e: DragEvent, targetTask: Task, newStatus: string) => {
    const taskId = e.dataTransfer?.getData('taskId');
    const position = dragOverPosition.value;
    dragOverTaskId.value = null;
    dragOverPosition.value = null;

    if (!taskId || taskId === targetTask.id) return;

    const taskToMove = tasks.value.find(t => t.id === taskId);
    if (!taskToMove) return;

    const columnTasks = filteredTasks(newStatus).filter(t => t.id !== taskId);
    const targetIndex = columnTasks.findIndex(t => t.id === targetTask.id);
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    columnTasks.splice(insertIndex, 0, taskToMove);

    await persistOrder(columnTasks.map(t => t.id));
    await changeTaskStatus(taskToMove, newStatus);
};

onMounted(async () => {
    fetchOrder();
    loadTasks();
    loadArchivedCount();

    const socket = await useWSocket();
    socket.value?.on('todo-added', ({ task }: { task: Task }) => {
        if (task.spaceId === route.params.spaceId) {
            if (!tasks.value.some(t => t.id === task.id)) {
                tasks.value.unshift(task);
            }
            if (task.parentTaskId) {
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
            if (task.archived) {
                registerArchivedTask(task.id);
            } else if (!tasks.value.some(t => t.id === task.id)) {
                // Absente de la liste alors qu'elle n'est pas archivée : elle
                // vient d'être restaurée (par nous ou quelqu'un d'autre) et
                // ne s'était pas réaffichée depuis — l'ancien panneau popup
                // rattrapait ce cas en recomptant à chaque ouverture, ce qui
                // n'existe plus, donc on la réinsère et on corrige le badge.
                tasks.value.unshift(task);
                countedArchiveIds.delete(task.id);
                if (archivedCount.value > 0) archivedCount.value--;
            } else {
                onTaskUpdated(task);
            }
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
