<template>
    <div class="flex flex-col h-full relative overflow-hidden w-full" :class="{ 'archive-reveal': revealing, 'archive-reveal-all': revealing && revealAll }">

        <header class="min-h-14 pl-5 px-3 flex items-center gap-3 border-b border-(--border-color) bg-(--bg2) z-20 shrink-0">
            <MobileBackBtn :to="backTarget" always-visible />
            <i class="bi bi-archive-fill text-amber-500"></i>
            <div class="min-w-0 flex items-baseline gap-2">
                <h3 class="font-semibold text-(--text) truncate">{{ scopeTitle }}</h3>
                <span v-if="!loading && archivedTasks.length" class="text-xs text-(--text2) tabular-nums whitespace-nowrap hidden sm:inline">
                    {{ archivedTasks.length }} {{ archivedTasks.length > 1 ? 'tâches' : 'tâche' }}
                </span>
            </div>
        </header>

        <div class="flex-1 min-h-0 flex">

            <!-- Personnes : le classement principal de l'écran -->
            <aside
                v-if="!loading && archivedTasks.length"
                class="rv-region hidden lg:flex flex-col w-72 shrink-0 border-r border-(--border-color) p-4 gap-3 min-h-0"
            >
                <h4 class="text-sm font-bold text-(--text) px-1">Par personne</h4>
                <ArchivePeopleList v-model="activePersonId" :people="peopleRows" :total-count="filteredTaskCount" />
            </aside>

            <main ref="scrollEl" class="flex-1 min-w-0 overflow-y-auto">
                <!-- Barre d'outils : reste visible pendant le défilement -->
                <div v-if="loading || archivedTasks.length" class="rv-first sticky top-0 z-10 bg-(--bg3) px-4 md:px-6 pt-4 pb-3 flex flex-wrap items-start gap-x-3 gap-y-2">
                    <div class="flex-1 min-w-[min(100%,18rem)]">
                        <TaskSearchBar v-model:query="searchQuery" v-model:regex="searchRegex" :invalid="searchInvalid" />
                    </div>

                    <div class="flex items-center gap-2 flex-wrap min-w-0 min-h-[2.75rem]">
                        <!-- Personnes, version compacte sous lg -->
                        <DropDown v-if="archivedTasks.length" align="left" content-iner-t-w="min-w-[280px]" class="lg:hidden">
                            <template #trigger>
                                <button
                                    type="button"
                                    class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap max-w-[200px]"
                                    :class="activePerson ? 'bg-(--primary)/15 text-(--primary)' : 'bg-(--text)/5 text-(--text)/70 hover:bg-(--text)/10'"
                                >
                                    <ArchivePersonAvatar v-if="activePerson" :person="activePerson" size="w-5 h-5" />
                                    <i v-else class="bi bi-people-fill"></i>
                                    <span class="truncate">{{ activePerson ? personLabel(activePerson, $p) : 'Tout le monde' }}</span>
                                    <i class="bi bi-chevron-down text-[10px] opacity-60"></i>
                                </button>
                            </template>
                            <template #content>
                                <div class="max-h-[60vh] flex flex-col">
                                    <ArchivePeopleList v-model="activePersonId" :people="peopleRows" :total-count="filteredTaskCount" />
                                </div>
                            </template>
                        </DropDown>

                        <!-- Tags présents dans les archives, avec leur nombre -->
                        <DropDown v-if="availableTags.length" align="left" content-iner-t-w="min-w-[260px]">
                            <template #trigger>
                                <button
                                    type="button"
                                    class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap"
                                    :class="filterTagIds.length ? 'bg-(--primary)/15 text-(--primary)' : 'bg-(--text)/5 text-(--text)/70 hover:bg-(--text)/10'"
                                >
                                    <i class="bi bi-tags"></i>
                                    {{ filterTagIds.length ? `${filterTagIds.length} tag${filterTagIds.length > 1 ? 's' : ''}` : 'Tags' }}
                                    <i class="bi bi-chevron-down text-[10px] opacity-60"></i>
                                </button>
                            </template>
                            <template #content>
                                <div @click.stop class="flex flex-col gap-1.5">
                                    <div v-if="availableTags.length > 6" class="relative">
                                        <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs"></i>
                                        <input
                                            v-model="tagSearch"
                                            type="text"
                                            placeholder="Rechercher un tag…"
                                            aria-label="Rechercher un tag"
                                            class="w-full bg-(--bg3) border border-(--border-color) rounded-lg pl-8 pr-3 py-1.5 text-xs text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
                                        />
                                    </div>
                                    <div class="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                                        <button
                                            v-for="entry in filteredAvailableTags" :key="entry.tag.id"
                                            type="button"
                                            @click="toggleTag(entry.tag.id)"
                                            class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-left transition-colors"
                                            :class="filterTagIds.includes(entry.tag.id) ? 'bg-(--primary)/15 text-(--text)' : 'text-(--text) hover:bg-(--text)/5'"
                                            :aria-pressed="filterTagIds.includes(entry.tag.id)"
                                        >
                                            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: entry.tag.color }"></span>
                                            <span class="flex-1 truncate">{{ entry.tag.name }}</span>
                                            <span class="tabular-nums text-(--text2) font-medium">{{ entry.count }}</span>
                                            <i class="bi bi-check-lg text-(--primary) w-3" :class="filterTagIds.includes(entry.tag.id) ? '' : 'invisible'"></i>
                                        </button>
                                        <p v-if="filteredAvailableTags.length === 0" class="text-xs text-center text-(--text2) py-3">Aucun tag de ce nom.</p>
                                    </div>
                                </div>
                            </template>
                        </DropDown>

                        <!-- Tags actifs : visibles et retirables sans rouvrir le menu -->
                        <button
                            v-for="tag in activeTags" :key="tag.id"
                            type="button"
                            @click="toggleTag(tag.id)"
                            class="flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[11px] font-bold border transition-opacity hover:opacity-70"
                            :style="{ borderColor: tag.color, color: tag.color }"
                            :title="`Retirer le filtre « ${tag.name} »`"
                        >
                            {{ tag.name }}
                            <i class="bi bi-x-lg text-[9px]"></i>
                        </button>

                        <button
                            v-if="hasFilters"
                            type="button"
                            @click="resetFilters"
                            class="text-[11px] font-bold text-(--text2) hover:text-(--text) flex items-center gap-1 ml-1"
                        >
                            <i class="bi bi-x-circle"></i>
                            Réinitialiser
                        </button>

                        <span v-if="hasFilters && !loading" class="ml-auto text-xs text-(--text2) tabular-nums whitespace-nowrap">
                            {{ visibleTaskCount }} sur {{ archivedTasks.length }}
                        </span>
                    </div>
                </div>

                <div class="px-4 md:px-6 pb-32">
                    <!-- Chargement -->
                    <div v-if="loading" class="flex flex-col gap-4 animate-pulse pt-2">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-(--text)/10"></div>
                            <div class="w-40 h-4 rounded-full bg-(--text)/10"></div>
                        </div>
                        <div class="archive-grid">
                            <div v-for="i in 8" :key="i" class="h-36 rounded-xl bg-(--text)/5 border border-(--border-color)"></div>
                        </div>
                    </div>

                    <!-- Rien d'archivé -->
                    <div v-else-if="archivedTasks.length === 0" class="rv-item py-20 max-w-sm mx-auto flex flex-col items-center text-center gap-3">
                        <div class="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                            <i class="bi bi-archive text-3xl text-amber-500"></i>
                        </div>
                        <h4 class="text-lg font-bold text-(--text)">Rien d'archivé pour l'instant</h4>
                        <p class="text-sm text-(--text2)">
                            Les tâches archivées depuis le tableau arrivent ici, rangées par personne. Elles restent consultables et se restaurent en un clic.
                        </p>
                        <button type="button" class="primary-glow !text-sm mt-2" @click="router.push(backTarget)">
                            <i class="bi bi-kanban"></i> Retour au tableau
                        </button>
                    </div>

                    <!-- Aucun résultat -->
                    <div v-else-if="visibleGroups.length === 0" class="rv-item py-20 max-w-sm mx-auto flex flex-col items-center text-center gap-3">
                        <i class="bi bi-search text-4xl text-(--text2)/60"></i>
                        <h4 class="text-lg font-bold text-(--text)">Aucune tâche archivée ne correspond</h4>
                        <p class="text-sm text-(--text2)">
                            <template v-if="activePerson">Pour {{ personLabel(activePerson, $p) }}<template v-if="searchQuery || filterTagIds.length">, avec ces filtres</template>.</template>
                            <template v-else>Essayez d'autres mots ou retirez un tag.</template>
                        </p>
                        <button type="button" class="text-sm font-bold text-(--primary) hover:underline" @click="resetFilters(); activePersonId = null">
                            Tout afficher
                        </button>
                    </div>

                    <!-- Groupes par personne -->
                    <!-- key : changer de personne remonte la liste et rejoue l'arrivée -->
                    <div v-else :key="activePersonId ?? '__all__'">
                    <section
                        v-for="(group, gi) in visibleGroups" :key="group.person.id"
                        class="pt-2 pb-8"
                        :style="{ '--s': Math.min(gi, 3) }"
                        :aria-label="personLabel(group.person, $p)"
                    >
                        <div class="rv-item flex items-center gap-3 mb-4 flex-wrap">
                            <ArchivePersonAvatar :person="group.person" size="w-10 h-10" />
                            <div class="min-w-0 flex-1">
                                <h4 class="text-base font-bold text-(--text) truncate">
                                    {{ personLabel(group.person, $p) }}
                                </h4>
                                <p class="text-xs text-(--text2) tabular-nums">
                                    {{ group.tasks.length }} {{ group.tasks.length > 1 ? 'tâches' : 'tâche' }}
                                    · {{ group.doneCount }} terminée{{ group.doneCount > 1 ? 's' : '' }}
                                </p>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    @click="toggleGroupSelection(group)"
                                    class="h-8 px-3 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                                    :class="isGroupSelected(group) ? 'bg-(--primary)/15 text-(--primary)' : 'text-(--text2) hover:bg-(--text)/5 hover:text-(--text)'"
                                >
                                    <i class="bi" :class="isGroupSelected(group) ? 'bi-check-square-fill' : 'bi-square'"></i>
                                    <span class="hidden sm:inline">{{ isGroupSelected(group) ? 'Sélectionnées' : 'Sélectionner' }}</span>
                                </button>
                                <button
                                    type="button"
                                    @click="restoreTasks(group.tasks)"
                                    :disabled="busy"
                                    class="h-8 px-3 rounded-lg text-xs font-bold bg-(--primary)/10 text-(--primary) hover:bg-(--primary)/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <i class="bi bi-arrow-counterclockwise"></i>
                                    {{ group.tasks.length > 1 ? `Tout restaurer` : 'Restaurer' }}
                                </button>
                            </div>
                        </div>

                        <TransitionGroup tag="div" name="archive-card" class="archive-grid relative">
                            <DropDown
                                v-for="(task, ti) in shownTasks(group)" :key="task.id"
                                align="mouse" click="right" class="rv-card w-full h-full"
                                :style="{ '--i': ti }"
                            >
                                <template #trigger>
                                    <TaskCard
                                        :task="task"
                                        archived
                                        class="h-full"
                                        @click="onCardClick(task)"
                                        :class="selectedIds.has(task.id) ? 'ring-2 ring-(--primary) border-(--primary)!' : ''"
                                    >
                                        <template #header-right>
                                            <div class="flex items-center gap-1 -mr-1 -mt-1 shrink-0" @click.stop>
                                                <button
                                                    type="button"
                                                    @click="restoreTasks([task])"
                                                    :disabled="busy"
                                                    class="card-action"
                                                    :class="selectionActive ? 'hidden' : ''"
                                                    title="Restaurer dans le tableau"
                                                    aria-label="Restaurer dans le tableau"
                                                >
                                                    <i class="bi bi-arrow-counterclockwise"></i>
                                                </button>
                                                <button
                                                    type="button"
                                                    @click="toggleSelection(task.id)"
                                                    class="card-action"
                                                    :class="selectedIds.has(task.id) ? 'is-on' : (selectionActive ? 'is-visible' : '')"
                                                    :aria-pressed="selectedIds.has(task.id)"
                                                    :aria-label="selectedIds.has(task.id) ? 'Désélectionner' : 'Sélectionner'"
                                                >
                                                    <i class="bi" :class="selectedIds.has(task.id) ? 'bi-check-circle-fill' : 'bi-circle'"></i>
                                                </button>
                                            </div>
                                        </template>
                                    </TaskCard>
                                </template>
                                <template #content>
                                    <button @click="openTask(task)" class="dropdown-item-annimate dropdown-item-style gap-2">
                                        <i class="bi bi-box-arrow-up-right" /> Ouvrir
                                    </button>
                                    <button @click="restoreTasks([task])" class="dropdown-item-annimate dropdown-item-style gap-2">
                                        <i class="bi bi-arrow-counterclockwise" /> Restaurer dans le tableau
                                    </button>
                                    <button @click="toggleSelection(task.id)" class="dropdown-item-annimate dropdown-item-style gap-2">
                                        <i class="bi" :class="selectedIds.has(task.id) ? 'bi-dash-square' : 'bi-check2-square'" />
                                        {{ selectedIds.has(task.id) ? 'Désélectionner' : 'Sélectionner' }}
                                    </button>
                                    <button
                                        @click="askDelete([task])"
                                        class="dropdown-item-annimate dropdown-item-style gap-2 text-red-500! hover:bg-red-500/5!"
                                    >
                                        <i class="bi bi-trash" /> Supprimer définitivement
                                    </button>
                                </template>
                            </DropDown>
                        </TransitionGroup>

                        <button
                            v-if="group.tasks.length > shownTasks(group).length"
                            type="button"
                            @click="expand(group.person.id)"
                            class="rv-card mt-4 w-full h-10 rounded-xl bg-(--text)/[0.03] hover:bg-(--text)/[0.06] text-xs font-bold text-(--text2) hover:text-(--text) transition-colors flex items-center justify-center gap-2"
                        >
                            <i class="bi bi-chevron-down"></i>
                            {{ group.tasks.length - shownTasks(group).length }} {{ group.tasks.length - shownTasks(group).length > 1 ? 'tâches' : 'tâche' }} de plus
                        </button>
                    </section>
                    </div>
                </div>
            </main>
        </div>

        <!-- Barre du bas : sélection, ou annulation de la dernière restauration -->
        <Transition name="archive-bar" mode="out-in">
            <div
                v-if="selectedIds.size > 0"
                key="selection"
                class="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 bg-(--bg2) border border-(--border-color) rounded-2xl shadow-2xl pl-4 pr-2 py-2 flex items-center gap-2 max-w-[calc(100%-2rem)]"
            >
                <span class="text-sm font-bold text-(--text) whitespace-nowrap tabular-nums">
                    {{ selectedIds.size }} sélectionnée{{ selectedIds.size > 1 ? 's' : '' }}
                </span>
                <button
                    v-if="!allVisibleSelected"
                    type="button"
                    @click="selectAllVisible"
                    class="text-xs font-bold text-(--text2) hover:text-(--text) px-2 whitespace-nowrap hidden sm:block"
                >
                    Tout sélectionner ({{ visibleTaskCount }})
                </button>
                <div class="h-6 w-px bg-(--border-color) mx-1"></div>
                <button
                    type="button"
                    @click="restoreTasks(selectedTasks)"
                    :disabled="busy"
                    class="h-9 px-3 rounded-xl bg-(--primary) text-white text-sm font-bold flex items-center gap-2 hover:brightness-110 transition disabled:opacity-50"
                >
                    <i class="bi bi-arrow-counterclockwise"></i>
                    Restaurer
                </button>
                <button
                    type="button"
                    @click="askDelete(selectedTasks)"
                    :disabled="busy"
                    class="h-9 px-3 rounded-xl text-sm font-bold text-(--text) hover:bg-red-500/10 hover:text-red-500 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    <i class="bi bi-trash"></i>
                    <span class="hidden sm:inline">Supprimer</span>
                </button>
                <button
                    type="button"
                    @click="selectedIds = new Set()"
                    class="w-9 h-9 rounded-xl text-(--text2) hover:bg-(--text)/5 hover:text-(--text) transition-colors"
                    aria-label="Annuler la sélection"
                >
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>

            <div
                v-else-if="undo"
                key="undo"
                class="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 bg-(--bg2) border border-(--border-color) rounded-2xl shadow-2xl pl-4 pr-2 py-2 flex items-center gap-3 max-w-[calc(100%-2rem)]"
                role="status"
            >
                <i class="bi bi-check-circle-fill text-green-500"></i>
                <span class="text-sm font-bold text-(--text) truncate">
                    {{ undo.tasks.length > 1 ? `${undo.tasks.length} tâches restaurées` : `« ${undo.tasks[0]?.title} » restaurée` }}
                </span>
                <button
                    type="button"
                    @click="undoRestore"
                    :disabled="busy"
                    class="h-9 px-3 rounded-xl text-sm font-bold text-(--primary) hover:bg-(--primary)/10 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                    Annuler
                </button>
                <button
                    type="button"
                    @click="dismissUndo"
                    class="w-9 h-9 rounded-xl text-(--text2) hover:bg-(--text)/5 hover:text-(--text) transition-colors"
                    aria-label="Fermer"
                >
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </Transition>

        <ConfirmDelete
            :show="toDelete.length > 0"
            item-type="la tâche"
            :item-name="toDelete.length > 1 ? `${toDelete.length} tâches` : (toDelete[0]?.title || '')"
            button-text="Supprimer définitivement"
            :loading="busy"
            @cancel="toDelete = []"
            @confirm="confirmDelete"
        />

    <!-- Racine unique (ConfirmDelete est téléporté dans body) : les <Transition> de changement de vue n'animent qu'un élément. -->
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import { user } from '@/assets/var';
import type { Task, Tag } from '@/types/types';
import { useToast } from '@/composables/useToast';
import { useTaskPanels } from '@/composables/useTaskPanels';
import { buildTaskMatcher } from '@/assets/utils/taskSearch';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import DropDown from '@/components/DropDown.vue';
import TaskCard from '../components/SpaceTasks/TaskCard.vue';
import TaskSearchBar from '../components/SpaceTasks/TaskSearchBar.vue';
import ArchivePeopleList, { type ArchivePersonRow } from '../components/SpaceTasks/ArchivePeopleList.vue';
import ArchivePersonAvatar from '../components/SpaceTasks/ArchivePersonAvatar.vue';
import { taskPeople, comparePeople, type ArchivePerson } from '../components/SpaceTasks/archivePeople';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { openTask, onTaskPanelChange } = useTaskPanels();

const orgId = computed(() => route.params.orgId as string);
const spaceId = computed(() => (route.params.spaceId as string) || null);
const scopeTitle = computed(() => spaceId.value ? 'Tâches archivées' : 'Mes tâches archivées');
const backTarget = computed(() => spaceId.value
    ? { name: 'TasksSpace', params: { orgId: orgId.value, spaceId: spaceId.value } }
    : { name: 'TasksGlobal', params: { orgId: orgId.value } }
);

const meId = computed(() => user.value?.id ?? null);
// fmt = $p du template : masque les noms en mode confidentialité.
const personLabel = (p: ArchivePerson, fmt: (name: string) => string) =>
    p.isNone ? 'Sans assigné' : (p.isMe ? 'Vous' : fmt(p.name));

const loading = ref(true);
const busy = ref(false);
const archivedTasks = ref<Task[]>([]);
const scrollEl = ref<HTMLElement | null>(null);

// ── Filtres ──────────────────────────────────────────────────────────────
const searchQuery = ref('');
const searchRegex = ref(false);
const searchState = computed(() => buildTaskMatcher(searchQuery.value, searchRegex.value));
const searchInvalid = computed(() => searchState.value.invalid);

const filterTagIds = ref<string[]>([]);
const tagSearch = ref('');
const activePersonId = ref<string | null>(null);

const hasFilters = computed(() => !!searchQuery.value.trim() || filterTagIds.value.length > 0);

const toggleTag = (id: string) => {
    filterTagIds.value = filterTagIds.value.includes(id)
        ? filterTagIds.value.filter(t => t !== id)
        : [...filterTagIds.value, id];
};

const resetFilters = () => {
    searchQuery.value = '';
    filterTagIds.value = [];
};

// Seuls les tags réellement portés par une tâche archivée : pas de filtre qui
// mène à un écran vide.
const availableTags = computed(() => {
    const map = new Map<string, { tag: Tag; count: number }>();
    for (const task of archivedTasks.value) {
        for (const tag of task.tags ?? []) {
            const entry = map.get(tag.id);
            if (entry) entry.count++;
            else map.set(tag.id, { tag, count: 1 });
        }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name, 'fr'));
});

const filteredAvailableTags = computed(() => {
    const q = tagSearch.value.trim().toLowerCase();
    return q ? availableTags.value.filter(e => e.tag.name.toLowerCase().includes(q)) : availableTags.value;
});

const activeTags = computed(() =>
    filterTagIds.value
        .map(id => availableTags.value.find(e => e.tag.id === id)?.tag)
        .filter((t): t is Tag => !!t)
);

/** Recherche + tags, avant le choix de la personne. */
const filteredTasks = computed(() => archivedTasks.value.filter(t => {
    if (filterTagIds.value.length && !t.tags?.some(tag => filterTagIds.value.includes(tag.id))) return false;
    if (searchState.value.matcher && !searchState.value.matcher(t)) return false;
    return true;
}));
const filteredTaskCount = computed(() => filteredTasks.value.length);

// ── Regroupement par personne ────────────────────────────────────────────
interface PersonGroup {
    person: ArchivePerson;
    tasks: Task[];
    total: number;
    doneCount: number;
    lastArchivedAt: Date | null;
}

const archivedTime = (t: Task) => new Date(t.archivedAt || 0).getTime();

/** Toutes les personnes ayant au moins une archive, même filtrées à zéro :
 *  la liste de gauche ne bouge pas pendant qu'on tape une recherche. */
const groups = computed<PersonGroup[]>(() => {
    const byId = new Map<string, PersonGroup>();
    const passing = new Set(filteredTasks.value.map(t => t.id));
    const sorted = [...archivedTasks.value].sort((a, b) => archivedTime(b) - archivedTime(a));

    for (const task of sorted) {
        for (const person of taskPeople(task, meId.value)) {
            let g = byId.get(person.id);
            if (!g) {
                g = { person, tasks: [], total: 0, doneCount: 0, lastArchivedAt: task.archivedAt ? new Date(task.archivedAt) : null };
                byId.set(person.id, g);
            }
            g.total++;
            if (passing.has(task.id)) {
                g.tasks.push(task);
                if (task.status === 'DONE') g.doneCount++;
            }
        }
    }
    return [...byId.values()].sort(comparePeople);
});

const peopleRows = computed<ArchivePersonRow[]>(() => groups.value.map(g => ({
    person: g.person,
    count: g.tasks.length,
    lastArchivedAt: g.lastArchivedAt,
})));

const activePerson = computed(() => groups.value.find(g => g.person.id === activePersonId.value)?.person ?? null);

const visibleGroups = computed(() => groups.value.filter(g =>
    g.tasks.length > 0 && (!activePersonId.value || g.person.id === activePersonId.value)
));

/** Une tâche à plusieurs assignés apparaît dans plusieurs groupes : on compte les ids. */
const visibleTaskIds = computed(() => new Set(visibleGroups.value.flatMap(g => g.tasks.map(t => t.id))));
const visibleTaskCount = computed(() => visibleTaskIds.value.size);

// Sur « Tout le monde », chaque personne montre ses dernières archives et se
// déplie à la demande : une personne à 200 archives n'écrase pas les autres.
const PREVIEW = 8;
const expanded = ref<Set<string>>(new Set());
const shownTasks = (g: PersonGroup) =>
    activePersonId.value || expanded.value.has(g.person.id) ? g.tasks : g.tasks.slice(0, PREVIEW);
const expand = (id: string) => { expanded.value = new Set(expanded.value).add(id); };

// ── Arrivée ──────────────────────────────────────────────────────────────
// La classe archive-reveal joue la cascade (voir <style>) au premier affichage
// des données et à chaque changement de personne, puis est retirée : un filtre
// ou une restauration ne rejouent pas tout l'écran.
// revealAll : au chargement seulement, la colonne et la barre d'outils arrivent
// aussi ; un changement de personne ne rejoue que le contenu.
const revealing = ref(false);
const revealAll = ref(false);
let revealTimer: ReturnType<typeof setTimeout> | null = null;
const reveal = (all = false) => {
    if (revealTimer) clearTimeout(revealTimer);
    revealAll.value = all;
    revealing.value = true;
    revealTimer = setTimeout(() => { revealing.value = false; }, 1400);
};

watch(activePersonId, () => {
    scrollEl.value?.scrollTo({ top: 0 });
    reveal();
});

// ── Sélection ────────────────────────────────────────────────────────────
const selectedIds = ref<Set<string>>(new Set());
const selectionActive = computed(() => selectedIds.value.size > 0);
const selectedTasks = computed(() => archivedTasks.value.filter(t => selectedIds.value.has(t.id)));

const setSelected = (ids: string[], on: boolean) => {
    const next = new Set(selectedIds.value);
    ids.forEach(id => on ? next.add(id) : next.delete(id));
    selectedIds.value = next;
};
const toggleSelection = (id: string) => setSelected([id], !selectedIds.value.has(id));

const isGroupSelected = (g: PersonGroup) => g.tasks.length > 0 && g.tasks.every(t => selectedIds.value.has(t.id));
const toggleGroupSelection = (g: PersonGroup) => setSelected(g.tasks.map(t => t.id), !isGroupSelected(g));

// « Tout sélectionner » ne porte que sur ce qui est affiché : on ne supprime
// jamais en masse des tâches masquées par un filtre.
const allVisibleSelected = computed(() =>
    visibleTaskCount.value > 0 && [...visibleTaskIds.value].every(id => selectedIds.value.has(id))
);
const selectAllVisible = () => setSelected([...visibleTaskIds.value], true);

// En mode sélection, un clic sur la carte coche ; sinon il l'ouvre dans le dock.
const onCardClick = (task: Task) => {
    if (selectionActive.value) toggleSelection(task.id);
    else openTask(task);
};

const removeLocal = (ids: string[]) => {
    const gone = new Set(ids);
    archivedTasks.value = archivedTasks.value.filter(t => !gone.has(t.id));
    setSelected(ids, false);
};

/** Une requête par tâche ; renvoie celles qui ont réussi. */
const runEach = async (tasks: Task[], call: (t: Task) => Promise<void>) => {
    const results = await Promise.allSettled(tasks.map(call));
    const ok = tasks.filter((_, i) => results[i]?.status === 'fulfilled');
    return { ok, failed: tasks.length - ok.length };
};

const setArchived = async (task: Task, archived: boolean): Promise<Task> => {
    const res = await sfetch(`/api/tasks/${orgId.value}/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ archived })
    });
    if (!res.ok) throw new Error('API Error');
    return await res.json() as Task;
};

// ── Restaurer, avec annulation ───────────────────────────────────────────
const undo = ref<{ tasks: Task[] } | null>(null);
let undoTimer: ReturnType<typeof setTimeout> | null = null;

const dismissUndo = () => {
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = null;
    undo.value = null;
};

const restoreTasks = async (tasks: Task[]) => {
    if (!tasks.length || busy.value) return;
    busy.value = true;
    try {
        const { ok, failed } = await runEach(tasks, async t => { await setArchived(t, false); });
        removeLocal(ok.map(t => t.id));
        if (failed) toast.show(`${failed} tâche${failed > 1 ? 's' : ''} n'${failed > 1 ? 'ont' : 'a'} pas pu être restaurée${failed > 1 ? 's' : ''}`, 'error');
        if (ok.length) {
            dismissUndo();
            undo.value = { tasks: ok };
            undoTimer = setTimeout(dismissUndo, 6000);
        }
    } finally {
        busy.value = false;
    }
};

// Ré-archive : la date d'archivage devient celle d'aujourd'hui (le serveur la pose).
const undoRestore = async () => {
    const tasks = undo.value?.tasks ?? [];
    dismissUndo();
    if (!tasks.length) return;
    busy.value = true;
    try {
        const back: Task[] = [];
        const results = await Promise.allSettled(tasks.map(async t => {
            const updated = await setArchived(t, true);
            back.push({ ...t, ...updated });
        }));
        archivedTasks.value = [...back, ...archivedTasks.value];
        if (results.some(r => r.status === 'rejected')) toast.show("Certaines tâches n'ont pas pu être ré-archivées", 'error');
    } finally {
        busy.value = false;
    }
};

// ── Supprimer définitivement ─────────────────────────────────────────────
const toDelete = ref<Task[]>([]);
const askDelete = (tasks: Task[]) => { toDelete.value = [...tasks]; };

const confirmDelete = async () => {
    const tasks = toDelete.value;
    busy.value = true;
    try {
        const { ok, failed } = await runEach(tasks, async t => {
            const res = await sfetch(`/api/tasks/${orgId.value}/tasks/${t.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('API Error');
        });
        removeLocal(ok.map(t => t.id));
        if (failed === 0) toast.show(ok.length > 1 ? `${ok.length} tâches supprimées` : 'Tâche supprimée', 'success');
        else toast.show(`${failed} suppression${failed > 1 ? 's' : ''} en échec`, 'error');
    } finally {
        busy.value = false;
        toDelete.value = [];
    }
};

// ── Chargement ───────────────────────────────────────────────────────────
// Le même composant sert les routes globale et espace : Vue Router le réutilise
// en changeant orgId/spaceId. Le jeton écarte la réponse d'un ancien scope qui
// arriverait après celle du nouveau.
let requestToken = 0;

const load = async () => {
    const token = ++requestToken;
    loading.value = true;
    try {
        const url = spaceId.value
            ? `/api/tasks/${orgId.value}/spaces/${spaceId.value}/archived`
            : `/api/tasks/${orgId.value}/archived/me`;
        const res = await sfetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json() as { archivedTasks: Task[] };
        if (token === requestToken) archivedTasks.value = data.archivedTasks;
    } catch (e) {
        if (token === requestToken) toast.show('Erreur de chargement des archives', 'error');
    } finally {
        if (token === requestToken) {
            loading.value = false;
            reveal(true);
        }
    }
};

watch([orgId, spaceId], () => {
    selectedIds.value = new Set();
    activePersonId.value = null;
    expanded.value = new Set();
    resetFilters();
    dismissUndo();
    load();
}, { immediate: true });

// Restaurée ou supprimée depuis le panneau de la tâche : la liste suit.
onTaskPanelChange({
    update: (task) => {
        if (!task.archived) { removeLocal([task.id]); return; }
        const idx = archivedTasks.value.findIndex(t => t.id === task.id);
        if (idx !== -1) archivedTasks.value[idx] = { ...archivedTasks.value[idx]!, ...task };
    },
    delete: (taskId) => removeLocal([taskId]),
});

onBeforeUnmount(() => {
    dismissUndo();
    if (revealTimer) clearTimeout(revealTimer);
});
</script>

<style scoped>
.archive-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(15.5rem, 1fr));
}

.card-action {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text2);
    transition: opacity 150ms, background-color 150ms, color 150ms;
}
.card-action:hover {
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text);
}
.card-action:focus-visible {
    outline: 2px solid var(--primary);
    opacity: 1;
}
.card-action.is-on {
    color: var(--primary);
}
/* Souris : actions au survol de la carte. Tactile : toujours visibles. */
@media (hover: hover) {
    .card-action:not(.is-on):not(.is-visible) {
        opacity: 0;
    }
    .group:hover .card-action {
        opacity: 1;
    }
}

/* Arrivée : mêmes mouvements et même courbe que l'ouverture de l'organisation
   (style.css, reveal-region-in / reveal-item-in). La colonne des personnes
   glisse depuis la gauche, puis chaque personne (--s) monte avec ses cartes
   en cascade (--i), plafonnée pour ne jamais faire attendre. */
@keyframes archive-slide-in {
    from { opacity: 0; transform: translateX(-12px); }
    to { opacity: 1; transform: none; }
}
@keyframes archive-rise-in {
    from { opacity: 0; transform: translateY(12px) scale(0.985); }
    to { opacity: 1; transform: none; }
}
.archive-reveal-all .rv-region {
    animation: archive-slide-in 0.5s var(--reveal-ease) both;
}
.archive-reveal-all .rv-first {
    animation: archive-rise-in 0.45s var(--reveal-ease) both;
}
.archive-reveal-all :deep(.rv-row) {
    animation: archive-slide-in 0.45s var(--reveal-ease) both;
    animation-delay: calc(80ms + var(--i, 0) * 35ms);
}
.archive-reveal .rv-item {
    animation: archive-rise-in 0.45s var(--reveal-ease) both;
    animation-delay: calc(var(--s, 0) * 110ms);
}
.archive-reveal .rv-card {
    animation: archive-rise-in 0.55s var(--reveal-ease) both;
    animation-delay: min(calc(var(--s, 0) * 110ms + 90ms + var(--i, 0) * 45ms), 650ms);
}

/* Cartes qui reviennent après un filtre ou une annulation. */
.archive-card-enter-active {
    transition: opacity 220ms var(--reveal-ease), transform 220ms var(--reveal-ease);
}
.archive-card-enter-from {
    opacity: 0;
    transform: scale(0.96);
}

.archive-card-leave-active {
    transition: opacity 180ms ease, transform 180ms ease;
}
.archive-card-leave-to {
    opacity: 0;
    transform: scale(0.96);
}

.archive-bar-enter-active,
.archive-bar-leave-active {
    transition: opacity 200ms ease, transform 200ms ease;
}
.archive-bar-enter-from,
.archive-bar-leave-to {
    opacity: 0;
    transform: translateY(1rem);
}

@media (prefers-reduced-motion: reduce) {
    .archive-card-leave-active,
    .archive-card-enter-active,
    .archive-bar-enter-active,
    .archive-bar-leave-active {
        transition: none;
    }
    .archive-reveal-all .rv-region,
    .archive-reveal-all .rv-first,
    .archive-reveal-all :deep(.rv-row),
    .archive-reveal .rv-item,
    .archive-reveal .rv-card {
        animation: archive-fade-in 0.2s ease both;
        animation-delay: 0ms;
    }
}
@keyframes archive-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}
</style>
