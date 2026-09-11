<template>

    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">

        <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
            <div class="flex items-center gap-3">
                <MobileBackBtn />
                <i class="bi bi-diagram-3 text-(--text)"></i>
                <h3 class="font-semibold text-(--text)">Repos</h3>
            </div>

            <div class="flex items-center gap-2" v-if="canManage">
                <button @click="showCreateProject = true" class="default !text-sm flex items-center gap-2">
                    <i class="bi bi-folder-plus"></i> Projet
                </button>
                <button @click="showCreateConnection = true" class="primary-glow !text-sm flex items-center gap-2">
                    <i class="bi bi-plus-lg"></i> Connecter un dépôt
                </button>
            </div>
        </div>

        <main class="flex-1 overflow-y-auto flex flex-col p-6 w-full h-full gap-8">

            <!-- Vue tableau -->
            <template v-if="!selectedRepo">

                <!-- Connexions -->
                <section class="space-y-3">
                    <div class="flex items-center justify-between">
                        <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2)">Connexions</h4>
                        <span class="text-xs text-(--text2)">{{ connections.length }} connexion(s)</span>
                    </div>

                    <div v-if="loadingConnections" class="flex items-center gap-3 text-(--text2) text-sm py-4">
                        <SpinLoader class="!h-4 !w-4" /> Chargement des connexions...
                    </div>

                    <div v-else-if="connections.length === 0" class="bg-(--white)/5 border border-(--white)/10 rounded-2xl p-6 text-center text-(--text2) text-sm">
                        Aucun dépôt connecté. Créez une connexion pour commencer à suivre un dépôt.
                    </div>

                    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        <div
                            v-for="connection in connections"
                            :key="connection.id"
                            class="bg-(--white)/5 border border-(--white)/10 rounded-2xl p-4 flex flex-col gap-3"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <p class="font-bold text-sm text-(--text) truncate">{{ connection.name }}</p>
                                    <p class="text-xs text-(--text2) truncate">{{ connection.defaultBranchName || '—' }}</p>
                                </div>
                                <span
                                    class="text-xs px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-1"
                                    :class="[syncStatusMeta(connection.syncStatus).bg, syncStatusMeta(connection.syncStatus).text]"
                                >
                                    <i :class="syncStatusMeta(connection.syncStatus).icon" />
                                    {{ syncStatusMeta(connection.syncStatus).label }}
                                </span>
                            </div>

                            <p v-if="connection.syncStatus === 'error' && connection.lastSyncError" class="text-xs text-red-400 line-clamp-2">
                                {{ connection.lastSyncError }}
                            </p>
                            <p v-else-if="connection.syncStatus === 'unsupported'" class="text-xs text-amber-400 line-clamp-2">
                                Serveur Git incompatible avec la synchronisation sécurisée (protocole v2 requis).
                            </p>

                            <p class="text-xs text-(--text2)">
                                Dernière synchro : {{ formatLastSynced(connection.lastSyncedAt) }}
                            </p>

                            <div class="flex items-center gap-2 mt-auto pt-2 border-t border-(--white)/10" v-if="canManage">
                                <button
                                    @click="handleTriggerSync(connection)"
                                    :disabled="connection.syncStatus === 'syncing'"
                                    class="text-(--text2) hover:text-(--primary) transition-all p-2 rounded-lg hover:bg-(--white)/10 disabled:opacity-40"
                                    title="Synchroniser maintenant"
                                >
                                    <i class="bi bi-arrow-repeat" :class="connection.syncStatus === 'syncing' ? 'animate-spin' : ''" />
                                </button>
                                <button
                                    @click="copyPublicKey(connection)"
                                    class="text-(--text2) hover:text-(--primary) transition-all p-2 rounded-lg hover:bg-(--white)/10"
                                    title="Copier la clé publique"
                                >
                                    <i class="bi bi-key" />
                                </button>
                                <button
                                    @click="askDeleteConnection(connection)"
                                    class="text-(--text2) hover:text-red-500 transition-all p-2 rounded-lg hover:bg-red-500/10 ml-auto"
                                    title="Supprimer la connexion"
                                >
                                    <i class="bi bi-trash" />
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Tableau des repos -->
                <section class="space-y-3 flex-1 min-h-0">
                    <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2)">Dépôts</h4>

                    <div v-if="loadingRepositories" class="flex items-center gap-3 text-(--text2) text-sm py-4">
                        <SpinLoader class="!h-4 !w-4" /> Chargement des repos...
                    </div>

                    <FilterableTable
                        v-else
                        :items="repositories"
                        :columns="columns"
                        :filters="tableFilters"
                        :search-fn="searchRepo"
                        search-placeholder="Rechercher un repo ou un tag..."
                    >
                        <template #empty>
                            <i class="bi bi-inboxes text-2xl block mb-2 opacity-50" />
                            Aucun dépôt ne correspond à vos filtres.
                        </template>

                        <template #cell-name="{ item }">
                            <span class="font-semibold text-(--text)">{{ item.name }}</span>
                        </template>

                        <template #cell-project="{ item }">
                            <span class="text-(--text2)">{{ item.project?.name || '—' }}</span>
                        </template>

                        <template #cell-status="{ item }">
                            <RepoStatusPill
                                :model-value="item.status"
                                :editable="canManage"
                                @update:model-value="(status: RepoStatus) => handleStatusChange(item, status)"
                            />
                        </template>

                        <template #cell-tags="{ item }">
                            <div class="flex flex-wrap gap-1">
                                <span v-if="!item.tags?.length" class="text-(--text2) text-xs">—</span>
                                <span
                                    v-for="tag in item.tags"
                                    :key="tag"
                                    class="text-[10px] bg-(--white)/10 text-(--text2) px-1.5 py-0.5 rounded-full"
                                >
                                    {{ tag }}
                                </span>
                            </div>
                        </template>

                        <template #cell-connection="{ item }">
                            <span
                                class="text-xs px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                                :class="[syncStatusMeta(item.connection?.syncStatus).bg, syncStatusMeta(item.connection?.syncStatus).text]"
                            >
                                <i :class="syncStatusMeta(item.connection?.syncStatus).icon" />
                                {{ syncStatusMeta(item.connection?.syncStatus).label }}
                            </span>
                        </template>

                        <template #cell-lastSynced="{ item }">
                            <span class="text-(--text2)">{{ formatLastSynced(item.connection?.lastSyncedAt) }}</span>
                        </template>

                        <template #cell-actions="{ item }">
                            <button
                                @click="openBranchTree(item)"
                                class="text-xs px-2.5 py-1.5 rounded-lg bg-(--white)/5 hover:bg-(--white)/10 text-(--text2) hover:text-(--text) transition-all flex items-center gap-1.5"
                            >
                                <i class="bi bi-diagram-2" /> Arbre des branches
                            </button>
                        </template>
                    </FilterableTable>
                </section>

            </template>

            <!-- Vue arborescence des branches d'un repo -->
            <template v-else>
                <section class="space-y-4 flex-1 min-h-0 flex flex-col">
                    <div class="flex items-center justify-between shrink-0">
                        <div class="flex items-center gap-3">
                            <button @click="closeBranchTree" class="text-(--text2) hover:text-(--text) transition-all p-2 rounded-lg hover:bg-(--white)/10">
                                <i class="bi bi-arrow-left" />
                            </button>
                            <div>
                                <h4 class="font-bold text-(--text)">{{ selectedRepo.name }}</h4>
                                <p class="text-xs text-(--text2)">Arborescence des branches — métadonnées uniquement, aucun contenu de fichier n'est affiché.</p>
                            </div>
                        </div>
                        <RepoStatusPill
                            :model-value="selectedRepo.status"
                            :editable="canManage"
                            @update:model-value="(status: RepoStatus) => handleStatusChange(selectedRepo!, status)"
                        />
                    </div>

                    <div v-if="loadingBranches" class="flex items-center gap-3 text-(--text2) text-sm py-4">
                        <SpinLoader class="!h-4 !w-4" /> Chargement des branches...
                    </div>

                    <BranchTree v-else :branches="branches" class="flex-1" />
                </section>
            </template>

        </main>

        <!-- Modals -->
        <RepoConnectionSetup
            v-if="showCreateConnection"
            :org-id="orgId"
            :space-id="spaceId"
            :projects="projects"
            @close="showCreateConnection = false"
            @created="onConnectionCreated"
        />

        <Popup :is-open="showCreateProject" @close="showCreateProject = false">
            <template #title>Nouveau projet</template>
            <form @submit.prevent="handleCreateProject" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-(--text) mb-2">Nom du projet</label>
                    <input
                        v-model="newProjectName"
                        type="text"
                        placeholder="Ex: Plateforme mobile"
                        class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all"
                        required
                        :maxlength="100"
                    />
                </div>
            </form>
            <template #footer>
                <button @click="showCreateProject = false" class="default px-6 py-2.5 rounded-xl text-sm font-medium">Annuler</button>
                <button @click="handleCreateProject" :disabled="!newProjectName.trim()" class="primary px-6 py-2.5 rounded-xl text-sm font-medium">Créer</button>
            </template>
        </Popup>

        <ConfirmDelete
            :show="!!deletingConnection"
            item-type="la connexion"
            :item-name="deletingConnection?.name || ''"
            :extra-warning="deleteConnectionWarning"
            checkbox
            @cancel="deletingConnection = null"
            @confirm="confirmDeleteConnection"
        />

    </div>

</template>

<script lang="ts" setup>

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import SpinLoader from '@/components/SpinLoader.vue';
import Popup from '@/components/Popup.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import FilterableTable, { type FilterableTableColumn, type FilterableTableFilter } from '@/components/common/FilterableTable.vue';
import RepoStatusPill, { REPO_STATUS_META, ALL_REPO_STATUSES } from './components/RepoStatusPill.vue';
import RepoConnectionSetup from './components/RepoConnectionSetup.vue';
import BranchTree from './components/BranchTree.vue';
import { useRepos } from '@/composables/useRepos';
import { useRepoBranches } from '@/composables/useRepoBranches';
import { usePermissions } from '@/composables/usePermissions';
import useWSocket from '@/composables/useWSocket';
import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';
import type { Repository, RepoConnection, RepoStatus, RepoConnectionSyncedPayload, RepoBranchUpdatedPayload, RepoBranchDeletedPayload } from '@/types/repos';

const route = useRoute();
const toast = useToast();

const orgId = computed(() => route.params.orgId as string);
const spaceId = computed(() => route.params.spaceId as string);

const { canAny } = usePermissions(computed(() => openedOrg.value?.id));
const canManage = computed(() => canAny(['ORG_REPOS_MANAGE']));

const {
    repositories,
    connections,
    projects,
    loading: loadingRepositories,
    listRepositories,
    listConnections,
    listProjects,
    createProject,
    updateRepository,
    deleteConnection,
    triggerSync,
    copyPublicKey,
    applyConnectionUpdate,
    applyRepositoryUpdate
} = useRepos();

const loadingConnections = ref(false);

const {
    branches,
    loading: loadingBranches,
    listBranches,
    applyBranchUpdate,
    applyBranchDeletion
} = useRepoBranches();

// ============================================
// State local
// ============================================

const selectedRepo = ref<Repository | null>(null);
const showCreateConnection = ref(false);
const showCreateProject = ref(false);
const newProjectName = ref('');
const deletingConnection = ref<RepoConnection | null>(null);

const deleteConnectionWarning =
    "La clé de déploiement restera listée sur votre hébergeur Git (GitHub, GitLab, Gitea...) — " +
    "Synco n'a aucun accès en écriture pour la retirer. Pensez à la supprimer manuellement côté hébergeur.";

// ============================================
// Table (colonnes / filtres)
// ============================================

const columns: FilterableTableColumn<Repository>[] = [
    { key: 'name', label: 'Nom', sortable: true },
    { key: 'project', label: 'Projet', sortable: true, accessor: (r) => r.project?.name || '' },
    { key: 'status', label: 'Statut', sortable: true },
    { key: 'tags', label: 'Tags' },
    { key: 'connection', label: 'Synchro', sortable: true, accessor: (r) => r.connection?.syncStatus || '' },
    {
        key: 'lastSynced',
        label: 'Dernière synchro',
        sortable: true,
        accessor: (r) => r.connection?.lastSyncedAt ? new Date(r.connection.lastSyncedAt).getTime() : 0
    },
    { key: 'actions', label: '' }
];

const tableFilters = computed<FilterableTableFilter<Repository>[]>(() => [
    {
        key: 'status',
        label: 'Statut',
        options: ALL_REPO_STATUSES.map(s => ({ value: s, label: REPO_STATUS_META[s].label })),
        matchFn: (item, value) => item.status === value
    },
    {
        key: 'project',
        label: 'Projet',
        options: projects.value.map(p => ({ value: p.id, label: p.name })),
        matchFn: (item, value) => item.projectId === value
    },
    {
        key: 'tag',
        label: 'Tag',
        options: uniqueTags.value.map(t => ({ value: t, label: t })),
        matchFn: (item, value) => !!item.tags?.includes(value)
    }
]);

const uniqueTags = computed(() => {
    const tags = new Set<string>();
    repositories.value.forEach(r => r.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
});

function searchRepo(item: Repository, query: string): boolean {
    return item.name.toLowerCase().includes(query) ||
        item.tags?.some(t => t.toLowerCase().includes(query)) ||
        item.project?.name?.toLowerCase().includes(query) === true;
}

// ============================================
// Statut de synchro (badge)
// ============================================

function syncStatusMeta(status?: string) {
    switch (status) {
        case 'ok':
            return { label: 'Synchronisé', icon: 'bi bi-check-circle', bg: 'bg-green-500/20', text: 'text-green-500' };
        case 'syncing':
            return { label: 'Synchronisation...', icon: 'bi bi-arrow-repeat animate-spin', bg: 'bg-blue-500/20', text: 'text-blue-400' };
        case 'error':
            return { label: 'Erreur', icon: 'bi bi-exclamation-triangle', bg: 'bg-red-500/20', text: 'text-red-500' };
        case 'unsupported':
            return { label: 'Non supporté', icon: 'bi bi-slash-circle', bg: 'bg-amber-500/20', text: 'text-amber-500' };
        case 'pending':
        default:
            return { label: 'En attente', icon: 'bi bi-hourglass-split', bg: 'bg-gray-500/20', text: 'text-gray-400' };
    }
}

function formatLastSynced(date?: string | Date | null): string {
    if (!date) return 'Jamais';
    const d = new Date(date);
    const diffMs = Date.now() - d.getTime();
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
    if (hours > 0) return `Il y a ${hours} heure${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `Il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
    return 'À l\'instant';
}

// ============================================
// Actions — Repos
// ============================================

async function handleStatusChange(repo: Repository, status: RepoStatus) {
    if (!canManage.value) return;
    repo.status = status; // optimiste
    await updateRepository(orgId.value, spaceId.value, repo.id, { status });
}

async function openBranchTree(repo: Repository) {
    selectedRepo.value = repo;
    await listBranches(orgId.value, spaceId.value, repo.id);
}

function closeBranchTree() {
    selectedRepo.value = null;
}

// ============================================
// Actions — Connexions
// ============================================

async function handleTriggerSync(connection: RepoConnection) {
    await triggerSync(orgId.value, spaceId.value, connection.id);
}

function askDeleteConnection(connection: RepoConnection) {
    deletingConnection.value = connection;
}

async function confirmDeleteConnection() {
    if (!deletingConnection.value) return;
    const id = deletingConnection.value.id;
    deletingConnection.value = null;
    await deleteConnection(orgId.value, spaceId.value, id);
    // Un repo dont la connexion est supprimée disparaît du tableau
    repositories.value = repositories.value.filter(r => r.connectionId !== id);
}

function onConnectionCreated(_connection: RepoConnection) {
    showCreateConnection.value = false;
}

// ============================================
// Actions — Projets
// ============================================

async function handleCreateProject() {
    if (!newProjectName.value.trim()) return;
    const result = await createProject(orgId.value, spaceId.value, { name: newProjectName.value.trim() });
    if (result?.success) {
        newProjectName.value = '';
        showCreateProject.value = false;
    }
}

// ============================================
// Chargement initial
// ============================================

async function loadAll() {
    if (!orgId.value || !spaceId.value) return;
    loadingConnections.value = true;
    await Promise.all([
        listRepositories(orgId.value, spaceId.value),
        listConnections(orgId.value, spaceId.value),
        listProjects(orgId.value, spaceId.value)
    ]);
    loadingConnections.value = false;
}

watch(() => spaceId.value, () => {
    selectedRepo.value = null;
    loadAll();
});

// ============================================
// WebSocket — repos:connection-synced / repos:branch-updated / repos:branch-deleted
// ============================================

onMounted(async () => {
    await loadAll();

    const socket = await useWSocket();

    socket.value?.on('repos:connection-synced', ({ connection }: RepoConnectionSyncedPayload) => {
        if (connection.spaceId !== spaceId.value) return;
        applyConnectionUpdate(connection);
        if (connection.repository) {
            applyRepositoryUpdate(connection.repository);
        }
        if (connection.syncStatus === 'ok') {
            toast.show(`Connexion "${connection.name}" synchronisée`, 'success');
        } else if (connection.syncStatus === 'error') {
            toast.show(`Échec de synchronisation pour "${connection.name}"`, 'error');
        } else if (connection.syncStatus === 'unsupported') {
            toast.show(`"${connection.name}" : serveur Git incompatible`, 'warning');
        }
    });

    socket.value?.on('repos:branch-updated', ({ branch }: RepoBranchUpdatedPayload) => {
        if (selectedRepo.value && branch.repositoryId === selectedRepo.value.id) {
            applyBranchUpdate(branch);
        }
    });

    socket.value?.on('repos:branch-deleted', ({ branchId, repositoryId }: RepoBranchDeletedPayload) => {
        if (selectedRepo.value && repositoryId === selectedRepo.value.id) {
            applyBranchDeletion(branchId);
        }
    });
});

onUnmounted(async () => {
    const socket = await useWSocket();
    socket.value?.off('repos:connection-synced');
    socket.value?.off('repos:branch-updated');
    socket.value?.off('repos:branch-deleted');
});

</script>
