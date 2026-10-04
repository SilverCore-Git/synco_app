<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full">

        <header class="min-h-14 pl-5 px-3 flex items-center border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <MobileBackBtn :to="backTarget" always-visible />
                <div class="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                    <i class="bi bi-archive-fill text-amber-500" />
                </div>
                <div class="min-w-0">
                    <h3 class="font-semibold text-(--text) truncate">{{ scopeTitle }}</h3>
                    <p class="text-xs text-(--text2)">{{ archivedTasks.length }} tâche(s) archivée(s)</p>
                </div>
            </div>
        </header>

        <main class="flex-1 overflow-hidden flex flex-col p-4 md:p-6 gap-4 w-full h-full relative">

            <!-- Recherche + tri -->
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                <div class="relative group flex-1 min-w-0">
                    <i class="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-(--text2) group-focus-within:text-(--primary) transition-all duration-300" />
                    <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Rechercher une tâche archivée..."
                        class="w-full bg-(--text)/[0.03] border border-(--text)/10 rounded-xl py-2.5 pl-11 pr-10 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/60 focus:ring-4 focus:ring-(--primary)/10 transition-all duration-300"
                    >
                    <button
                        v-if="searchQuery"
                        @click="searchQuery = ''"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-(--text2) hover:text-red-400 active:scale-90 transition-all"
                    >
                        <i class="bi bi-x-circle-fill" />
                    </button>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                    <button
                        @click="sortMode = 'date'"
                        class="text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                        :class="sortMode === 'date' ? 'bg-(--primary) text-white' : 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10'"
                    >
                        <i class="bi bi-calendar3" /> Date
                    </button>
                    <button
                        @click="sortMode = 'folder'"
                        class="text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                        :class="sortMode === 'folder' ? 'bg-(--primary) text-white' : 'bg-(--text)/5 text-(--text2) hover:bg-(--text)/10'"
                    >
                        <i class="bi bi-folder2" /> Dossier
                    </button>
                </div>
            </div>

            <!-- Dossiers : rangée de chips sur mobile -->
            <div class="flex md:hidden items-center gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-hide">
                <button
                    v-for="opt in folderFilterOptions" :key="opt.key ?? '__all__'"
                    type="button"
                    @click="activeFolderFilter = opt.key"
                    class="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    :class="activeFolderFilter === opt.key ? 'bg-(--primary) text-white' : 'bg-(--text)/5 text-(--text2)'"
                >
                    <i class="bi" :class="opt.icon" /> {{ opt.label }}
                </button>
            </div>

            <div class="flex-1 min-h-0 flex flex-col md:flex-row gap-4">

                <!-- Dossiers : sidebar sur desktop, à la fois filtre (clic) et cible de glisser-déposer -->
                <aside class="hidden md:flex md:flex-col md:w-56 shrink-0 border-r border-(--border-color) pr-4 overflow-y-auto gap-1">
                    <span class="text-[11px] font-black text-(--text2) uppercase tracking-widest mb-1">Dossiers</span>

                    <button
                        v-for="opt in folderFilterOptions" :key="opt.key ?? '__all__'"
                        type="button"
                        @click="activeFolderFilter = opt.key"
                        class="text-left text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 transition-colors truncate"
                        :class="[
                            activeFolderFilter === opt.key ? 'bg-(--primary)/15 text-(--primary)' : 'text-(--text2) hover:bg-(--text)/5',
                            opt.key && dragOverFolderId === opt.key ? 'ring-2 ring-amber-400 bg-amber-500/10 text-amber-500' : ''
                        ]"
                        @dragover.prevent="opt.key && draggedTaskId && (dragOverFolderId = opt.key)"
                        @dragleave.prevent="dragOverFolderId = null"
                        @drop.prevent="opt.key && onDropOnFolder($event, opt.key === '__none__' ? null : opt.key)"
                    >
                        <i class="bi shrink-0" :class="opt.icon" /> <span class="truncate">{{ opt.label }}</span>
                    </button>

                    <button
                        v-if="!showNewFolder"
                        @click="showNewFolder = true"
                        class="text-left text-xs font-bold px-3 py-2 rounded-lg text-(--text2) hover:bg-(--text)/5 transition-colors flex items-center gap-2 mt-1"
                    >
                        <i class="bi bi-plus-lg" /> Nouveau dossier
                    </button>
                    <form v-else @submit.prevent="createFolder" class="flex flex-col gap-1.5 mt-1">
                        <input
                            v-model="newFolderTitle"
                            type="text"
                            autofocus
                            placeholder="Nom du dossier..."
                            class="text-xs bg-(--surface-sunken) border border-(--text)/10 rounded-lg px-3 py-1.5 text-(--text) focus:border-(--primary)/50 outline-none transition-all"
                            @keydown.esc="showNewFolder = false; newFolderTitle = ''"
                        />
                        <div class="flex items-center gap-1.5">
                            <button
                                type="submit"
                                :disabled="!newFolderTitle.trim() || creatingFolder"
                                class="text-xs font-bold px-3 py-1.5 rounded-lg bg-(--primary)/10 text-(--primary) hover:bg-(--primary)/20 transition-colors disabled:opacity-50"
                            >
                                Créer
                            </button>
                            <button
                                type="button"
                                @click="showNewFolder = false; newFolderTitle = ''"
                                class="text-xs font-bold p-1.5 rounded-lg text-(--text2) hover:bg-(--text)/5 transition-colors"
                            >
                                <i class="bi bi-x-lg" />
                            </button>
                        </div>
                    </form>
                </aside>

                <!-- Liste des tâches -->
                <section class="flex-1 min-h-0 overflow-y-auto pr-1">
                    <div v-if="loading" class="flex justify-center py-16">
                        <div class="w-8 h-8 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
                    </div>

                    <div v-else-if="archivedTasks.length === 0" class="py-16 flex flex-col items-center justify-center text-(--text2)">
                        <i class="bi bi-archive text-5xl mb-4 opacity-50" />
                        <p class="text-sm font-medium">Aucune tâche archivée pour le moment.</p>
                    </div>

                    <div v-else-if="groupedTasks.length === 0" class="py-16 flex flex-col items-center justify-center text-(--text2)">
                        <i class="bi bi-search text-5xl mb-4 opacity-50" />
                        <p class="text-sm font-medium">Aucune tâche ne correspond à ce filtre.</p>
                    </div>

                    <div v-else class="space-y-6 pb-24">
                        <label class="flex items-center gap-2 pb-2 mb-1 border-b border-(--text)/10 cursor-pointer select-none w-fit">
                            <input
                                type="checkbox"
                                :checked="allVisibleSelected"
                                :indeterminate="someVisibleSelected"
                                @change="toggleSelectAllVisible"
                                class="accent-(--primary) w-4 h-4 shrink-0"
                            />
                            <span class="text-xs font-bold text-(--text2)">
                                {{ allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner' }}
                            </span>
                            <span class="text-[11px] text-(--text2)/60">({{ filteredTasks.length }})</span>
                        </label>

                        <div v-for="group in groupedTasks" :key="group.key">
                            <div class="flex items-center gap-2 mb-3">
                                <input
                                    type="checkbox"
                                    :checked="isGroupSelected(group)"
                                    :indeterminate="isGroupPartiallySelected(group)"
                                    @change="toggleGroupSelection(group)"
                                    :title="isGroupSelected(group) ? 'Désélectionner ce groupe' : 'Sélectionner ce groupe'"
                                    class="accent-(--primary) w-4 h-4 shrink-0 cursor-pointer"
                                />
                                <span class="text-[11px] font-black uppercase tracking-widest text-(--text2)">{{ group.label }}</span>
                                <span class="text-[10px] text-(--text2)/60">({{ group.tasks.length }})</span>
                                <div class="flex-1 h-px bg-(--text)/10"></div>
                            </div>

                            <div class="space-y-3">
                                <div
                                    v-for="task in group.tasks" :key="task.id"
                                    draggable="true"
                                    @dragstart="onTaskDragStart($event, task)"
                                    @dragend="onTaskDragEnd"
                                    class="flex items-center gap-3 p-4 bg-(--bg2)/40 border border-(--border-color) rounded-xl cursor-grab active:cursor-grabbing transition-opacity"
                                    :class="[
                                        draggedTaskId === task.id ? 'opacity-40' : '',
                                        selectedTaskIds.has(task.id) ? 'border-(--primary)/60 bg-(--primary)/5' : ''
                                    ]"
                                >
                                    <input
                                        type="checkbox"
                                        :checked="selectedTaskIds.has(task.id)"
                                        @change="toggleTaskSelection(task.id)"
                                        @click.stop
                                        class="accent-(--primary) w-4 h-4 shrink-0"
                                    />

                                    <div class="min-w-0 flex-1">
                                        <p class="text-sm font-bold text-(--text) truncate">{{ task.title }}</p>
                                        <p class="text-[11px] text-(--text2) mt-0.5 flex items-center gap-1.5 flex-wrap">
                                            <span>Archivée le {{ formatDate(task.archivedAt) }}</span>
                                            <span v-if="task.todoList" class="inline-flex items-center gap-1 text-(--primary)">
                                                <i class="bi bi-folder2" />{{ task.todoList.title }}
                                            </span>
                                            <span v-if="spaceId && task.assignees?.length" class="inline-flex items-center gap-1">
                                                <i class="bi bi-person" />{{ task.assignees.map(a => a.name).join(', ') }}
                                            </span>
                                        </p>
                                    </div>

                                    <div class="flex items-center gap-1.5 shrink-0" @click.stop>
                                        <DropDown align="right" content-iner-t-w="min-w-[200px]">
                                            <template #trigger>
                                                <button
                                                    class="text-(--text2) hover:text-(--text) p-1.5 rounded-lg hover:bg-(--text)/5 transition-colors"
                                                    title="Déplacer vers…"
                                                >
                                                    <i class="bi bi-folder-symlink" />
                                                </button>
                                            </template>
                                            <template #content>
                                                <button
                                                    @click="assignToFolder(task, null)"
                                                    class="dropdown-item-annimate dropdown-item-style gap-2"
                                                >
                                                    <i class="bi bi-dash-circle" /> Sans dossier
                                                </button>
                                                <button
                                                    v-for="folder in folders" :key="folder.id"
                                                    @click="assignToFolder(task, folder.id)"
                                                    class="dropdown-item-annimate dropdown-item-style gap-2"
                                                >
                                                    <i class="bi bi-folder2" /> {{ folder.title }}
                                                </button>
                                            </template>
                                        </DropDown>

                                        <button
                                            @click="restore(task)"
                                            :disabled="pendingId === task.id || bulkActionLoading || deleting"
                                            class="text-xs font-bold px-3 py-1.5 rounded-lg bg-(--primary)/10 text-(--primary) hover:bg-(--primary)/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <i class="bi bi-arrow-counterclockwise" /> <span class="hidden lg:inline">Restaurer</span>
                                        </button>
                                        <button
                                            @click="askRemove(task)"
                                            :disabled="pendingId === task.id || bulkActionLoading || deleting"
                                            class="text-xs font-bold p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                            title="Supprimer définitivement"
                                        >
                                            <i class="bi bi-trash" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <!-- Barre d'actions groupées -->
            <transition
                enter-active-class="transition duration-300 ease-out"
                enter-from-class="transform translate-y-full opacity-0"
                enter-to-class="transform translate-y-0 opacity-100"
                leave-active-class="transition duration-200 ease-in"
                leave-from-class="transform translate-y-0 opacity-100"
                leave-to-class="transform translate-y-full opacity-0"
            >
                <div v-if="selectedTaskIds.size > 0" class="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 bg-(--bg2) border border-(--border-color) rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
                    <span class="text-sm font-bold text-(--text) whitespace-nowrap">{{ selectedTaskIds.size }} sélectionnée(s)</span>

                    <div class="h-6 w-px bg-(--border-color)"></div>

                    <button
                        @click="bulkRestore"
                        :disabled="bulkActionLoading"
                        class="p-2 rounded-lg hover:bg-(--primary)/10 text-(--text) hover:text-(--primary) transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50"
                    >
                        <i class="bi bi-arrow-counterclockwise"></i>
                        <span>Restaurer</span>
                    </button>

                    <button
                        @click="requestBulkDelete"
                        :disabled="bulkActionLoading"
                        class="p-2 rounded-lg hover:bg-red-500/10 text-(--text) hover:text-red-500 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50"
                    >
                        <i class="bi bi-trash"></i>
                        <span>Supprimer</span>
                    </button>

                    <div class="h-6 w-px bg-(--border-color)"></div>

                    <button
                        @click="selectedTaskIds = new Set()"
                        class="p-2 rounded-lg hover:bg-(--text)/5 text-(--text2) hover:text-(--text) transition-colors"
                    >
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            </transition>

        </main>
    </div>

    <ConfirmDelete
        :show="!!taskToRemove || pendingBulkDelete"
        item-type="la tâche"
        :item-name="pendingBulkDelete ? `${selectedTaskIds.size} tâche(s)` : (taskToRemove?.title || '')"
        button-text="Supprimer définitivement"
        :loading="deleting"
        @cancel="taskToRemove = null; pendingBulkDelete = false"
        @confirm="confirmDelete"
    />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import type { Task, TodoList } from '@/types/types';
import { useToast } from '@/composables/useToast';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import DropDown from '@/components/DropDown.vue';

const route = useRoute();
const toast = useToast();

const orgId = computed(() => route.params.orgId as string);
const spaceId = computed(() => (route.params.spaceId as string) || null);
const scopeTitle = computed(() => spaceId.value ? 'Tâches archivées' : 'Mes tâches archivées');

const loading = ref(false);
const pendingId = ref<string | null>(null);
const deleting = ref(false);
const bulkActionLoading = ref(false);
const archivedTasks = ref<Task[]>([]);
const taskToRemove = ref<Task | null>(null);
const pendingBulkDelete = ref(false);
const sortMode = ref<'date' | 'folder'>('date');
const folders = ref<{ id: string; title: string }[]>([]);
const searchQuery = ref('');
const activeFolderFilter = ref<string | null>(null); // null = tout, '__none__' = sans dossier, sinon folderId
const selectedTaskIds = ref<Set<string>>(new Set());

const folderFilterOptions = computed(() => [
    { key: null as string | null, label: 'Tout', icon: 'bi-collection' },
    { key: '__none__' as string | null, label: 'Sans dossier', icon: 'bi-dash-circle' },
    ...folders.value.map(f => ({ key: f.id as string | null, label: f.title, icon: 'bi-folder2' }))
]);

const backTarget = computed(() => spaceId.value
    ? { name: 'TasksSpace', params: { orgId: orgId.value, spaceId: spaceId.value } }
    : { name: 'TasksGlobal', params: { orgId: orgId.value } }
);

const formatDate = (date?: string | Date | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const dayLabel = (date: Date) => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const filteredTasks = computed(() => {
    let list = archivedTasks.value;

    const query = searchQuery.value.trim().toLowerCase();
    if (query) {
        list = list.filter(t => t.title?.toLowerCase().includes(query));
    }

    if (activeFolderFilter.value === '__none__') {
        list = list.filter(t => !t.todoListId);
    } else if (activeFolderFilter.value) {
        list = list.filter(t => t.todoListId === activeFolderFilter.value);
    }

    return list;
});

type TaskGroup = { key: string; label: string; tasks: Task[] };

const groupedTasks = computed<TaskGroup[]>(() => {
    const sorted = [...filteredTasks.value].sort(
        (a, b) => new Date(b.archivedAt || 0).getTime() - new Date(a.archivedAt || 0).getTime()
    );

    const groups = new Map<string, TaskGroup>();

    if (sortMode.value === 'folder') {
        for (const task of sorted) {
            const key = task.todoList?.id || '__none__';
            const label = task.todoList?.title || 'Sans dossier';
            if (!groups.has(key)) groups.set(key, { key, label, tasks: [] });
            groups.get(key)!.tasks.push(task);
        }
        return [...groups.values()].sort((a, b) => {
            if (a.key === '__none__') return 1;
            if (b.key === '__none__') return -1;
            return a.label.localeCompare(b.label, 'fr');
        });
    }

    for (const task of sorted) {
        const date = task.archivedAt ? new Date(task.archivedAt) : null;
        const key = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '__unknown__';
        const label = date ? dayLabel(date) : 'Date inconnue';
        if (!groups.has(key)) groups.set(key, { key, label, tasks: [] });
        groups.get(key)!.tasks.push(task);
    }
    return [...groups.values()];
});

// TasksArchive.vue sert les deux routes (globale/espace) : Vue Router réutilise
// la même instance en changeant juste orgId/spaceId, donc load()/loadFolders()
// sont redéclenchés par le watcher ci-dessous. Sans jeton de requête, une
// réponse d'un ancien scope qui arrive après celle du nouveau scope écraserait
// l'affichage avec les mauvaises données (ex: aller-retour rapide entre deux
// espaces avant que la première requête n'ait eu le temps de répondre).
let requestToken = 0;

const load = async (token: number) => {
    loading.value = true;
    try {
        const url = spaceId.value
            ? `/api/tasks/${orgId.value}/spaces/${spaceId.value}/archived`
            : `/api/tasks/${orgId.value}/archived/me`;
        const res = await sfetch(url);
        if (res.ok) {
            const data = await res.json();
            if (token === requestToken) archivedTasks.value = data.archivedTasks;
        }
    } catch (e) {
        if (token === requestToken) toast.show("Erreur chargement des archives", "error");
    } finally {
        if (token === requestToken) loading.value = false;
    }
};

const loadFolders = async (token: number) => {
    try {
        const url = spaceId.value
            ? `/api/tasks/${orgId.value}/spaces/${spaceId.value}/lists`
            : `/api/tasks/${orgId.value}/lists/me`;
        const res = await sfetch(url);
        if (res.ok) {
            const data = await res.json();
            if (token === requestToken) {
                folders.value = (data.lists || []).map((l: TodoList) => ({ id: l.id, title: l.title }));
            }
        }
    } catch (e) {
        // Les dossiers sont secondaires : on n'affiche pas d'erreur bloquante ici.
    }
};

const refresh = () => {
    requestToken++;
    const token = requestToken;
    load(token);
    loadFolders(token);
};

const showNewFolder = ref(false);
const newFolderTitle = ref('');
const creatingFolder = ref(false);
const draggedTaskId = ref<string | null>(null);
const dragOverFolderId = ref<string | null>(null);

const onTaskDragStart = (e: DragEvent, task: Task) => {
    draggedTaskId.value = task.id;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
    }
};

const onTaskDragEnd = () => {
    draggedTaskId.value = null;
    dragOverFolderId.value = null;
};

const assignToFolder = async (task: Task, folderId: string | null) => {
    if ((task.todoListId || null) === folderId) return;
    try {
        const res = await sfetch(`/api/tasks/${orgId.value}/tasks/${task.id}`, {
            method: 'PUT',
            body: JSON.stringify({ todoListId: folderId })
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        const idx = archivedTasks.value.findIndex(t => t.id === task.id);
        if (idx !== -1) archivedTasks.value[idx] = updated;
        toast.show(folderId ? 'Tâche déplacée dans le dossier' : 'Tâche retirée du dossier', 'success');
    } catch (e) {
        toast.show('Erreur lors du déplacement', 'error');
    }
};

const onDropOnFolder = (e: DragEvent, folderId: string | null) => {
    dragOverFolderId.value = null;
    const taskId = e.dataTransfer?.getData('text/plain') || draggedTaskId.value;
    const task = archivedTasks.value.find(t => t.id === taskId);
    if (task) assignToFolder(task, folderId);
};

const createFolder = async () => {
    const title = newFolderTitle.value.trim();
    if (!title || creatingFolder.value) return;

    creatingFolder.value = true;
    try {
        const res = await sfetch(`/api/tasks/${orgId.value}/lists`, {
            method: 'POST',
            body: JSON.stringify({ title, spaceId: spaceId.value || null })
        });
        if (!res.ok) throw new Error();
        const list = await res.json();
        folders.value.push({ id: list.id, title: list.title });
        newFolderTitle.value = '';
        showNewFolder.value = false;
        toast.show('Dossier créé', 'success');
    } catch (e) {
        toast.show('Erreur lors de la création du dossier', 'error');
    } finally {
        creatingFolder.value = false;
    }
};

const toggleTaskSelection = (taskId: string) => {
    const next = new Set(selectedTaskIds.value);
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    selectedTaskIds.value = next;
};

// Les cases "tout sélectionner" ne portent que sur ce qui est affiché
// (recherche + filtre dossier) : cocher tout puis restreindre le filtre ne doit
// pas supprimer en masse des tâches que l'utilisateur n'a jamais vues.
const allVisibleSelected = computed(() =>
    filteredTasks.value.length > 0 && filteredTasks.value.every(t => selectedTaskIds.value.has(t.id))
);

const someVisibleSelected = computed(() =>
    !allVisibleSelected.value && filteredTasks.value.some(t => selectedTaskIds.value.has(t.id))
);

const setSelection = (ids: string[], selected: boolean) => {
    const next = new Set(selectedTaskIds.value);
    for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
    }
    selectedTaskIds.value = next;
};

const toggleSelectAllVisible = () => {
    setSelection(filteredTasks.value.map(t => t.id), !allVisibleSelected.value);
};

const isGroupSelected = (group: TaskGroup) =>
    group.tasks.length > 0 && group.tasks.every(t => selectedTaskIds.value.has(t.id));

const isGroupPartiallySelected = (group: TaskGroup) =>
    !isGroupSelected(group) && group.tasks.some(t => selectedTaskIds.value.has(t.id));

const toggleGroupSelection = (group: TaskGroup) => {
    setSelection(group.tasks.map(t => t.id), !isGroupSelected(group));
};

// Sort de la sélection dès qu'une tâche quitte la liste, quel que soit le
// chemin (restauration/suppression individuelle ou en masse) — sinon une
// tâche déjà traitée reste "sélectionnée", ce qui fausse le compteur de la
// barre d'actions groupées et fait retenter une action sur un id disparu.
const dropFromSelection = (taskId: string) => {
    if (!selectedTaskIds.value.has(taskId)) return;
    const next = new Set(selectedTaskIds.value);
    next.delete(taskId);
    selectedTaskIds.value = next;
};

const restoreById = async (taskId: string) => {
    const res = await sfetch(`/api/tasks/${orgId.value}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ archived: false })
    });
    if (!res.ok) throw new Error("API Error");
    archivedTasks.value = archivedTasks.value.filter(t => t.id !== taskId);
    dropFromSelection(taskId);
};

const deleteById = async (taskId: string) => {
    const res = await sfetch(`/api/tasks/${orgId.value}/tasks/${taskId}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error("API Error");
    archivedTasks.value = archivedTasks.value.filter(t => t.id !== taskId);
    dropFromSelection(taskId);
};

const restore = async (task: Task) => {
    pendingId.value = task.id;
    try {
        await restoreById(task.id);
        toast.show('Tâche restaurée', 'success');
    } catch (e) {
        toast.show('Erreur lors de la restauration', 'error');
    } finally {
        pendingId.value = null;
    }
};

const askRemove = (task: Task) => {
    taskToRemove.value = task;
};

const requestBulkDelete = () => {
    pendingBulkDelete.value = true;
};

// Promise.allSettled plutôt que Promise.all : sur une action groupée, un seul
// échec (ex: permission refusée sur une tâche précise) ne doit pas faire
// disparaître le résultat des autres tâches déjà traitées avec succès — et
// dropFromSelection() ayant déjà retiré chaque succès de la sélection au fur
// et à mesure, les tâches en échec restent sélectionnées pour une nouvelle
// tentative.
const reportBulkResult = (results: PromiseSettledResult<void>[], successLabel: string, failLabel: string) => {
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed === 0) {
        toast.show(successLabel, 'success');
    } else if (failed === results.length) {
        toast.show(failLabel, 'error');
    } else {
        toast.show(`${results.length - failed} ${successLabel.toLowerCase()}, ${failed} échec(s)`, 'warning');
    }
};

const confirmDelete = async () => {
    deleting.value = true;
    try {
        if (pendingBulkDelete.value) {
            const ids = [...selectedTaskIds.value];
            const results = await Promise.allSettled(ids.map(id => deleteById(id)));
            reportBulkResult(results, 'Tâches supprimées définitivement', 'Erreur lors de la suppression');
        } else if (taskToRemove.value) {
            await deleteById(taskToRemove.value.id);
            toast.show('Tâche supprimée définitivement', 'success');
        }
    } catch (e) {
        toast.show('Erreur lors de la suppression', 'error');
    } finally {
        deleting.value = false;
        taskToRemove.value = null;
        pendingBulkDelete.value = false;
    }
};

const bulkRestore = async () => {
    bulkActionLoading.value = true;
    try {
        const ids = [...selectedTaskIds.value];
        const results = await Promise.allSettled(ids.map(id => restoreById(id)));
        reportBulkResult(results, 'Tâches restaurées', 'Erreur lors de la restauration groupée');
    } finally {
        bulkActionLoading.value = false;
    }
};

// Naviguer entre le scope espace et le scope global (changement de route) doit
// recharger — sinon on garderait les archives de l'ancien scope à l'écran.
// `immediate: true` couvre aussi le chargement initial, pas besoin d'un
// onMounted séparé qui dupliquerait le même déclenchement.
watch([orgId, spaceId], () => {
    selectedTaskIds.value = new Set();
    activeFolderFilter.value = null;
    refresh();
}, { immediate: true });
</script>
