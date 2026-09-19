<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full">
        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
            <div class="flex items-center gap-3">
                <MobileBackBtn />
                <i class="bi bi-check2-square text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Mes Tâches</h3>
            </div>

            <TaskProgressGauge :tasks="myTasks" class="mx-auto" />

            <div class="ml-auto flex items-center gap-4">
                <CreateTaskModal @created="onTaskCreated">
                    <button class="primary-glow !text-sm">
                        <i class="bi bi-plus-lg"></i>
                        Nouvelle Tâche
                    </button>
                </CreateTaskModal>
            </div>
        </div>

        <main class="flex-1 overflow-y-auto md:overflow-hidden flex flex-col p-6 w-full h-full gap-6">
            <!-- Filtres : espace (perso + tous les projets où j'ai des tâches) et tags -->
            <div class="flex items-center gap-2 w-full shrink-0 flex-wrap">
                <DropDown align="left" content-iner-t-w="min-w-[240px]">
                    <template #trigger>
                        <button type="button" class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap h-full" :class="filterSpaceId ? 'bg-(--primary)/15 text-(--primary)' : 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10'">
                            <i class="bi bi-folder2"></i>
                            {{ filterSpaceLabel }}
                            <i class="bi bi-chevron-down text-[10px] opacity-60"></i>
                        </button>
                    </template>
                    <template #content>
                        <div @click.stop class="flex flex-col gap-0.5 min-w-[220px]">
                            <button
                                type="button"
                                @click="filterSpaceId = null"
                                class="text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                                :class="!filterSpaceId ? 'bg-(--primary)/15 text-(--primary)' : 'hover:bg-(--text)/5 text-(--text)'"
                            >
                                <i class="bi bi-collection"></i>
                                Tous mes espaces
                            </button>
                            <button
                                type="button"
                                @click="filterSpaceId = 'personal'"
                                class="text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                                :class="filterSpaceId === 'personal' ? 'bg-(--primary)/15 text-(--primary)' : 'hover:bg-(--text)/5 text-(--text)'"
                            >
                                <i class="bi bi-person"></i>
                                Personnel
                            </button>
                            <div v-if="spaceOptions.length" class="h-px bg-(--border-color) my-1"></div>
                            <button
                                v-for="space in spaceOptions" :key="space.id"
                                type="button"
                                @click="filterSpaceId = space.id"
                                class="text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 truncate"
                                :class="filterSpaceId === space.id ? 'bg-(--primary)/15 text-(--primary)' : 'hover:bg-(--text)/5 text-(--text)'"
                            >
                                <img v-if="space.logo && space.logo.includes('data:')" :src="space.logo" class="w-4 h-4 rounded object-cover shrink-0" />
                                <i v-else-if="space.logo" class="bi shrink-0" :class="space.logo"></i>
                                <span v-else class="w-4 h-4 rounded bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black shrink-0">
                                    {{ space.name.substring(0, 2).toUpperCase() }}
                                </span>
                                <span class="truncate">{{ $p(space.name) }}</span>
                            </button>
                        </div>
                    </template>
                </DropDown>

                <DropDown align="left" content-iner-t-w="min-w-[280px]">
                    <template #trigger>
                        <button type="button" class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap h-full" :class="filterTagIds.length ? 'bg-(--primary)/15 text-(--primary)' : 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10'">
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
                    v-if="filterSpaceId || filterTagIds.length"
                    type="button"
                    @click="filterSpaceId = null; filterTagIds = []"
                    class="text-[11px] font-bold text-(--text2) hover:text-(--text) flex items-center gap-1 ml-1"
                >
                    <i class="bi bi-x-circle"></i>
                    Réinitialiser
                </button>

                <button
                    v-if="archivedCount > 0 || isDraggingTask"
                    @click="showArchivedPanel = true"
                    @dragover.prevent="dragOverArchiveBtn = true"
                    @dragleave.prevent="dragOverArchiveBtn = false"
                    @drop="onDropToArchiveBtn"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ml-auto"
                    :class="dragOverArchiveBtn ? 'bg-amber-500 text-white ring-2 ring-amber-300 shadow-[0_4px_20px_rgba(245,158,11,0.5)]' : (showArchivedPanel ? 'bg-(--primary) text-white shadow-[0_4px_15px_rgba(var(--primary-rgb),0.2)]' : 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10')"
                >
                    <i class="bi bi-archive-fill" />
                    <span class="hidden sm:inline">Tâches archivées</span>
                </button>
            </div>

            <div v-if="loading" class="flex-1 min-h-0 w-full flex flex-col gap-4 animate-pulse pb-10">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 items-start h-full">
                    <div v-for="i in 3" :key="'skel-col-'+i" class="bg-black/20 rounded-2xl p-4 flex flex-col gap-4 border border-(--border-color) h-full">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2">
                                <div class="w-6 h-6 rounded-lg bg-(--text)/10"></div>
                                <div class="w-20 h-3 bg-(--text)/10 rounded-full"></div>
                            </div>
                            <div class="w-5 h-3 bg-(--text)/10 rounded-full"></div>
                        </div>
                        <div v-for="j in 2" :key="'skel-card-'+j" class="bg-(--text)/5 border border-(--border-color) p-4 rounded-xl h-28"></div>
                    </div>
                </div>
            </div>

            <div v-else-if="myTasks.length === 0" class="flex-1 min-h-0 flex flex-col items-center justify-center text-(--text2)">
                <i class="bi bi-emoji-smile text-6xl mb-4" />
                <p class="text-base font-medium">Vous n'avez aucune tâche assignée.</p>
            </div>

            <template v-else>

                <!-- Onglets de statut (mobile) -->
                <div class="relative flex items-center gap-1 p-1 bg-(--text)/5 rounded-xl md:hidden shrink-0">
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
                    </button>
                </div>

                <!-- Mobile : liste simple filtrée par l'onglet actif, pas de glisser-déposer -->
                <div class="flex-1 min-h-0 overflow-y-auto md:hidden space-y-3">
                    <TaskCard
                        v-for="task in filteredTasks(mobileActiveColumn)" :key="task.id"
                        :task="task"
                        @click="openTaskDetails(task)"
                    >
                        <template #header-right>
                            <span class="text-[9px] font-bold text-(--text2) uppercase truncate max-w-20 shrink-0">
                                {{ task.space?.name ? $p(task.space.name) : 'Perso' }}
                            </span>
                        </template>
                        <template #footer>
                            <div class="flex items-center gap-1.5 mt-3 pt-3 border-t border-(--border-color)" @click.stop>
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
                        </template>
                    </TaskCard>

                    <p v-if="filteredTasks(mobileActiveColumn).length === 0" class="text-xs text-(--text2) italic text-center py-8">
                        Aucune tâche ici.
                    </p>
                </div>

                <!-- Desktop : un seul tableau Kanban regroupant tous les espaces + le personnel -->
                <div class="hidden md:grid flex-1 min-h-0 md:grid-cols-3 gap-4 lg:gap-6 pb-2">

                    <div v-for="col in columns" :key="col.id"
                         class="bg-black/20 border rounded-2xl p-4 min-h-[400px] h-full flex flex-col transition-all"
                         :class="draggedOverCol === col.id ? 'border-(--primary) bg-(--text)/5 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]' : 'border-(--border-color)'"
                         @dragover.prevent
                         @dragenter.prevent="draggedOverCol = col.id"
                         @dragleave.prevent="draggedOverCol = null"
                         @drop="onDrop($event, col.id); draggedOverCol = null"
                    >
                        <div class="flex items-center justify-between mb-4">
                            <h4 class="font-bold text-sm tracking-wider uppercase flex items-center gap-2" :class="col.color">
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
                                <span class="bg-(--text)/5 text-(--text2) text-xs px-2 py-0.5 rounded-full font-bold">
                                    {{ filteredTasks(col.id).length }}
                                </span>
                            </div>
                        </div>

                        <div class="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1 custom-scrollbar">
                            <DropDown
                                v-for="task in filteredTasks(col.id)" :key="task.id"
                                align="mouse" click="right" class="w-full"
                            >
                            <template #trigger>
                            <TaskCard
                                :task="task"
                                :id="'task-' + task.id"
                                draggable="true"
                                @dragstart="onDragStart($event, task)"
                                @dragend="onDragEnd"
                                @dragover.prevent="onCardDragOver($event, task)"
                                @drop.stop="onCardDrop($event, task, col.id)"
                                @click="openTaskDetails(task)"
                                :class="[
                                    'active:cursor-grabbing',
                                    dragOverTaskId === task.id && dragOverPosition === 'before' ? 'border-t-2 border-t-(--primary)' : '',
                                    dragOverTaskId === task.id && dragOverPosition === 'after' ? 'border-b-2 border-b-(--primary)' : ''
                                ]"
                            >
                                <template #header-right>
                                    <span class="text-[9px] font-bold text-(--text2) uppercase truncate max-w-20 shrink-0">
                                        {{ task.space?.name ? $p(task.space.name) : 'Perso' }}
                                    </span>
                                </template>
                            </TaskCard>
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

            </template>
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
                        isHoveringTrash && !isDeleting ? 'border-red-300 scale-125 shadow-[0_0_40px_rgba(239,68,68,0.8)]' : 'border-transparent'
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

        <ArchivedTasksPanel
            :isOpen="showArchivedPanel"
            :orgId="route.params.orgId as string"
            @close="showArchivedPanel = false"
            @restored="onTaskRestored"
            @count="archivedCount = $event"
        />

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
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import type { Task, TodoList } from '@/types/types';
import { useToast } from '@/composables/useToast';
import TaskProgressGauge from '../components/SpaceTasks/TaskProgressGauge.vue';
import TaskCard from '../components/SpaceTasks/TaskCard.vue';
import CreateTaskModal from '../components/popup/CreateTaskModal.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import TaskDetailsModal from '../components/popup/TaskDetailsModal.vue';
import DropDown from '@/components/DropDown.vue';
import TaskTagPicker from '../components/popup/TaskTagPicker.vue';
import ArchivedTasksPanel from '../components/popup/ArchivedTasksPanel.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { user, openedOrg } from '@/assets/var';
import confetti from 'canvas-confetti';
import useWSocket from '@/composables/useWSocket';
import { useNotification } from '@/composables/useNotification';
import { useTaskOrder } from '@/composables/useTaskOrder';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { markTasksAsRead } = useNotification();
const { fetchOrder, sortByOrder, persistOrder } = useTaskOrder(route.params.orgId as string);

const rawTasks = ref<Task[]>([]);
const loading = ref(true);
const draggedOverCol = ref<string | null>(null);
const filterTagIds = ref<string[]>([]);
const filterSpaceId = ref<string | null>(null); // null = tous, 'personal' = hors espace, sinon spaceId

const selectedTask = ref<Task | null>(null);
const openTaskInEditMode = ref(false);

const isDraggingTask = ref(false);
const isHoveringTrash = ref(false);
const isDeleting = ref(false);
const archivingAll = ref(false);
const showArchiveAllConfirm = ref(false);
const showArchivedPanel = ref(false);
const archivedCount = ref(0);
const dragOverArchiveBtn = ref(false);

const dragOverTaskId = ref<string | null>(null);
const dragOverPosition = ref<'before' | 'after' | null>(null);

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

// Indicateur qui glisse d'un onglet à l'autre au lieu de sauter instantanément.
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

// Unique source de vérité pour "mes tâches" : même règle que listMyTasks()
// côté backend (tasksService.ts). Nécessaire même si l'API ne renvoie déjà
// que des listes/tâches où j'apparais — une TodoList qui m'est assignée peut
// contenir des tâches assignées à d'autres membres (liste partagée), donc
// sans ce filtre des tâches qui ne sont pas les miennes remontaient jusque
// dans la jauge de progression et le tableau.
const myTasks = computed(() => {
    return rawTasks.value.filter(task => {
        const isAssignedToMe = task.assignees?.some(a => a.id === user.value?.id);
        const isCreatedByMe = task.creatorId === user.value?.id;
        return isAssignedToMe || isCreatedByMe;
    });
});

const spaceOptions = computed(() => {
    const map = new Map<string, string>();
    myTasks.value.forEach(t => {
        if (t.spaceId && !map.has(t.spaceId)) {
            map.set(t.spaceId, t.space?.name || 'Projet');
        }
    });
    // task.space (GET /lists/me) n'expose que {id, name} — le logo vient de
    // openedOrg.spaces, déjà chargé en mémoire (assets/init.ts).
    return Array.from(map, ([id, name]) => ({
        id,
        name,
        logo: openedOrg.value?.spaces?.find(s => s.id === id)?.logo || null
    })).sort((a, b) => a.name.localeCompare(b.name));
});

const filterSpaceLabel = computed(() => {
    if (!filterSpaceId.value) return 'Tous mes espaces';
    if (filterSpaceId.value === 'personal') return 'Personnel';
    return spaceOptions.value.find(s => s.id === filterSpaceId.value)?.name || 'Espace';
});

const filteredTasks = (status: string) => {
    return sortByOrder(myTasks.value.filter(t => {
        if (t.archived || t.status !== status) return false;
        if (filterTagIds.value.length && !t.tags?.some(tag => filterTagIds.value.includes(tag.id))) return false;
        if (filterSpaceId.value === 'personal' && t.spaceId) return false;
        if (filterSpaceId.value && filterSpaceId.value !== 'personal' && t.spaceId !== filterSpaceId.value) return false;
        return true;
    }));
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

            // Clear unread notifications
            markTasksAsRead();

            // Deep-link depuis Home/recherche : ouvre la tâche et la met en
            // surbrillance dans le Kanban (même mécanisme que TasksSpace.vue).
            if (route.query.select) {
                const searchId = route.query.select as string;
                const foundTask = allTasks.find(t => t.id === searchId);

                if (foundTask) {
                    selectedTask.value = foundTask;

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
    if (!isDeleting.value) {
        isDraggingTask.value = false;
        isHoveringTrash.value = false;
    }
};

const archiveTaskById = async (taskId: string) => {
    const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ archived: true })
    });
    if (!res.ok) throw new Error("API Error");
    onTaskDeleted(taskId);
    archivedCount.value++;
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

const onTaskRestored = (task: Task) => {
    if (!rawTasks.value.some(t => t.id === task.id)) {
        rawTasks.value.push(task);
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

const onDrop = async (e: DragEvent, newStatus: string) => {
    const taskId = e.dataTransfer?.getData('taskId');
    if (!taskId) return;

    const taskToMove = rawTasks.value.find(t => t.id === taskId);
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

    const taskToMove = rawTasks.value.find(t => t.id === taskId);
    if (!taskToMove) return;

    const columnTasks = filteredTasks(newStatus).filter(t => t.id !== taskId);
    const targetIndex = columnTasks.findIndex(t => t.id === targetTask.id);
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    columnTasks.splice(insertIndex, 0, taskToMove);

    await persistOrder(columnTasks.map(t => t.id));
    await changeTaskStatus(taskToMove, newStatus);
};

const openTaskDetails = (task: Task) => {
    openTaskInEditMode.value = false;
    selectedTask.value = task;
};

const startRenameTask = (task: Task) => {
    openTaskInEditMode.value = true;
    selectedTask.value = task;
};

const handleContextDeleteTask = async (task: Task) => {
    try {
        const res = await sfetch(`/api/tasks/${route.params.orgId}/tasks/${task.id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error();
        onTaskDeleted(task.id);
        toast.show('Tâche supprimée', 'success');
    } catch (e) {
        toast.show('Erreur lors de la suppression', 'error');
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
    if (!rawTasks.value.some(t => t.id === task.id)) {
        rawTasks.value.push(task);
    }
};

const onTaskUpdated = (updatedTask: Task) => {
    const idx = rawTasks.value.findIndex(t => t.id === updatedTask.id);
    if (idx !== -1) {
        rawTasks.value[idx] = updatedTask;
    }
    // selectedTask est une référence séparée passée à TaskDetailsModal : sans
    // ça, la modale ouverte continue d'afficher l'ancien titre/description/
    // assignés tant qu'on ne la referme pas (elle ne suit pas le remplacement
    // ci-dessus dans rawTasks).
    if (selectedTask.value?.id === updatedTask.id) {
        selectedTask.value = updatedTask;
    }
};

const onTaskDeleted = (taskId: string) => {
    rawTasks.value = rawTasks.value.filter(t => t.id !== taskId);
};

onMounted(async () => {
    fetchOrder();
    loadLists();

    const socket = await useWSocket();
    socket.value?.on('todo-added', ({ task }: { task: Task }) => {
        if (!rawTasks.value.some(t => t.id === task.id)) {
            rawTasks.value.unshift(task);
        }
        if (task.parentTaskId) {
            const parent = rawTasks.value.find(t => t.id === task.parentTaskId);
            if (parent) {
                if (!parent.subtasks) parent.subtasks = [];
                if (!parent.subtasks.some(st => st.id === task.id)) {
                    parent.subtasks.push(task);
                }
            }
        }
    });
    socket.value?.on('todo-updated', ({ task }: { task: Task }) => {
        if (task.archived) {
            onTaskDeleted(task.id);
            archivedCount.value++;
        } else {
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
