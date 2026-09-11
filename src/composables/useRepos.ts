// ============================================
// Composable pour la gestion du module Repos
// ============================================
// Couche d'organisation au-dessus de dépôts Git externes (connexions,
// projets internes, repos). Le suivi des branches d'un repo se fait via
// `useRepoBranches.ts` (composable séparé, calqué sur la même convention).
//
// Contrat vérifié contre `synco_api/src/routes/repos.ts` : les opérations de
// liste/création sont imbriquées sous `/spaces/:spaceId/repos`, mais les
// opérations sur une ressource déjà identifiée par son id (get/update/delete
// d'un repo, d'une connexion ou d'un projet, public-key, sync, branches) ne
// portent PAS `spaceId` dans leur chemin côté backend (l'id + l'org
// suffisent à les identifier). D'où les deux helpers ci-dessous.

import { ref, computed } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from './useToast';
import type {
  RepoProject,
  RepoConnection,
  Repository,
  RepoStatus,
  CreateRepoProjectDTO,
  UpdateRepoProjectDTO,
  CreateRepoConnectionDTO,
  UpdateRepoConnectionDTO,
  UpdateRepositoryDTO,
  ListRepoProjectsResponse,
  GetRepoProjectResponse,
  ListRepoConnectionsResponse,
  CreateRepoConnectionResponse,
  GetRepoConnectionPublicKeyResponse,
  SyncRepoConnectionResponse,
  ListRepositoriesResponse,
  GetRepositoryResponse
} from '@/types/repos';

// ============================================
// State principal
// ============================================

const repositories = ref<Repository[]>([]);
const connections = ref<RepoConnection[]>([]);
const projects = ref<RepoProject[]>([]);
const loading = ref<boolean>(false);
const error = ref<string | null>(null);
const currentRepository = ref<Repository | null>(null);

// ============================================
// Getters
// ============================================

const repositoriesByStatus = computed(() => {
  const groups: Record<RepoStatus, Repository[]> = {
    idea: [],
    in_progress: [],
    in_review: [],
    stale: []
  };
  for (const repo of repositories.value) {
    (groups[repo.status] ||= []).push(repo);
  }
  return groups;
});

const activeConnections = computed(() => connections.value.filter(c => c.isActive));
const inactiveConnections = computed(() => connections.value.filter(c => !c.isActive));
const connectionsInError = computed(() => connections.value.filter(c => c.syncStatus === 'error' || c.syncStatus === 'unsupported'));
const totalRepositories = computed(() => repositories.value.length);

// ============================================
// Fonctions utilitaires internes
// ============================================

// Liste/création — imbriqué sous le space (GET .../repos, .../connections, .../projects).
function basePath(orgId: string, spaceId: string): string {
  return `/api/orgs/${orgId}/spaces/${spaceId}/repos`;
}

// Opérations sur une ressource déjà identifiée par son id — pas de spaceId
// dans le chemin côté backend (repos.ts : `/:orgId/repos/...`).
function orgPath(orgId: string): string {
  return `/api/orgs/${orgId}/repos`;
}

// ============================================
// Fonctions API — Repositories
// ============================================

/**
 * Liste les repositories d'un space (filtrage côté client une fois chargés —
 * le nom étant chiffré côté serveur, une recherche substring serveur n'est
 * pas triviale, cf. WebhookList.vue).
 */
async function listRepositories(orgId: string, spaceId: string): Promise<ListRepositoriesResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(basePath(orgId, spaceId));

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la récupération des repos');
    }

    const data: ListRepositoriesResponse = await response.json();

    if (data.success) {
      repositories.value = data.repositories;
    }

    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement des repos: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

async function getRepository(orgId: string, _spaceId: string, repoId: string): Promise<GetRepositoryResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${orgPath(orgId)}/${repoId}`);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la récupération du repo');
    }

    const data: GetRepositoryResponse = await response.json();

    if (data.success && data.repository) {
      currentRepository.value = data.repository;
    }

    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Met à jour un repo (tags/status/projectId uniquement — le reste est dérivé
 * de la connexion Git).
 */
async function updateRepository(
  orgId: string,
  _spaceId: string,
  repoId: string,
  dto: UpdateRepositoryDTO
): Promise<GetRepositoryResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${orgPath(orgId)}/${repoId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la mise à jour du repo');
    }

    const data: GetRepositoryResponse = await response.json();

    if (data.success && data.repository) {
      const index = repositories.value.findIndex(r => r.id === repoId);
      if (index !== -1) repositories.value[index] = data.repository;
      if (currentRepository.value?.id === repoId) currentRepository.value = data.repository;
    }

    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la mise à jour: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Applique localement une mise à jour de repo reçue par websocket
 * (`repos:connection-synced` peut faire évoluer le repo lié).
 */
function applyRepositoryUpdate(repository: Repository): void {
  const index = repositories.value.findIndex(r => r.id === repository.id);
  if (index !== -1) {
    repositories.value[index] = repository;
  } else {
    repositories.value.unshift(repository);
  }
  if (currentRepository.value?.id === repository.id) {
    currentRepository.value = repository;
  }
}

// ============================================
// Fonctions API — RepoConnection
// ============================================

async function listConnections(orgId: string, spaceId: string): Promise<ListRepoConnectionsResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${basePath(orgId, spaceId)}/connections`);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la récupération des connexions');
    }

    const data: ListRepoConnectionsResponse = await response.json();

    if (data.success) {
      connections.value = data.connections;
    }

    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement des connexions: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Crée une nouvelle connexion Git. La réponse contient la clé publique
 * générée (à révéler une seule fois à l'utilisateur) — jamais la clé privée
 * ni l'URL du remote.
 */
async function createConnection(
  orgId: string,
  spaceId: string,
  dto: CreateRepoConnectionDTO
): Promise<CreateRepoConnectionResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${basePath(orgId, spaceId)}/connections`, {
      method: 'POST',
      body: JSON.stringify(dto)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la création de la connexion');
    }

    const data: CreateRepoConnectionResponse = await response.json();

    if (data.success && data.connection) {
      connections.value.push(data.connection);
      const toast = useToast();
      toast.show('Connexion créée avec succès. Ajoutez la clé publique sur votre hébergeur.', 'success');
    }

    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la création: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Renomme / met en pause une connexion. Jamais d'édition du remote en place.
 */
async function updateConnection(
  orgId: string,
  _spaceId: string,
  connectionId: string,
  dto: UpdateRepoConnectionDTO
): Promise<RepoConnection | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${orgPath(orgId)}/connections/${connectionId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la mise à jour de la connexion');
    }

    const data = await response.json();
    const updated: RepoConnection | undefined = data.connection;

    if (data.success && updated) {
      const index = connections.value.findIndex(c => c.id === connectionId);
      if (index !== -1) connections.value[index] = updated;
      const toast = useToast();
      toast.show('Connexion mise à jour avec succès', 'success');
      return updated;
    }

    return null;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la mise à jour: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Supprime une connexion (uniquement la ligne côté Synco — la deploy-key
 * reste listée côté hébergeur Git tant que l'utilisateur ne l'enlève pas
 * manuellement, Synco n'ayant aucun accès en écriture pour le faire). Ne
 * jamais appeler sans passer par ConfirmDelete.vue côté UI.
 */
async function deleteConnection(orgId: string, _spaceId: string, connectionId: string): Promise<boolean> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${orgPath(orgId)}/connections/${connectionId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la suppression de la connexion');
    }

    const data = await response.json();

    if (data.success !== false) {
      connections.value = connections.value.filter(c => c.id !== connectionId);
      const toast = useToast();
      toast.show('Connexion supprimée avec succès', 'success');
      return true;
    }

    return false;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la suppression: ${error.value}`, 'error');
    return false;
  } finally {
    loading.value = false;
  }
}

/**
 * Récupère la clé publique d'une connexion (endpoint dédié, cf. plan Phase 4).
 */
async function getConnectionPublicKey(
  orgId: string,
  _spaceId: string,
  connectionId: string
): Promise<GetRepoConnectionPublicKeyResponse | null> {
  try {
    const response = await sfetch(`${orgPath(orgId)}/connections/${connectionId}/public-key`);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la récupération de la clé publique');
    }

    return await response.json();
  } catch (err: any) {
    const toast = useToast();
    toast.show(`Échec de la récupération de la clé publique: ${err.message}`, 'error');
    return null;
  }
}

/**
 * Déclenche une synchronisation manuelle (fire-and-forget côté serveur — le
 * résultat arrive via l'événement websocket `repos:connection-synced`).
 */
async function triggerSync(orgId: string, _spaceId: string, connectionId: string): Promise<SyncRepoConnectionResponse | null> {
  try {
    const response = await sfetch(`${orgPath(orgId)}/connections/${connectionId}/sync`, {
      method: 'POST'
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors du déclenchement de la synchronisation');
    }

    const data: SyncRepoConnectionResponse = await response.json();

    const toast = useToast();
    if (data.success) {
      toast.show('Synchronisation lancée', 'success');
      if (data.connection) {
        const index = connections.value.findIndex(c => c.id === connectionId);
        if (index !== -1) connections.value[index] = data.connection;
      }
    } else {
      toast.show(`Échec du déclenchement: ${data.error || data.message}`, 'error');
    }

    return data;
  } catch (err: any) {
    const toast = useToast();
    toast.show(`Échec du déclenchement de la synchronisation: ${err.message}`, 'error');
    return null;
  }
}

/**
 * Applique localement une mise à jour de connexion reçue par websocket
 * (`repos:connection-synced`).
 */
function applyConnectionUpdate(connection: RepoConnection): void {
  const index = connections.value.findIndex(c => c.id === connection.id);
  if (index !== -1) {
    connections.value[index] = connection;
  } else {
    connections.value.unshift(connection);
  }
}

// ============================================
// Fonctions API — RepoProject
// ============================================

async function listProjects(orgId: string, spaceId: string): Promise<ListRepoProjectsResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${basePath(orgId, spaceId)}/projects`);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la récupération des projets');
    }

    const data: ListRepoProjectsResponse = await response.json();

    if (data.success) {
      projects.value = data.projects;
    }

    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement des projets: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

async function createProject(orgId: string, spaceId: string, dto: CreateRepoProjectDTO): Promise<GetRepoProjectResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${basePath(orgId, spaceId)}/projects`, {
      method: 'POST',
      body: JSON.stringify(dto)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la création du projet');
    }

    const data: GetRepoProjectResponse = await response.json();

    if (data.success && data.project) {
      projects.value.push(data.project);
      const toast = useToast();
      toast.show('Projet créé avec succès', 'success');
    }

    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la création: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

async function updateProject(
  orgId: string,
  _spaceId: string,
  projectId: string,
  dto: UpdateRepoProjectDTO
): Promise<GetRepoProjectResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${orgPath(orgId)}/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la mise à jour du projet');
    }

    const data: GetRepoProjectResponse = await response.json();

    if (data.success && data.project) {
      const index = projects.value.findIndex(p => p.id === projectId);
      if (index !== -1) projects.value[index] = data.project;
      const toast = useToast();
      toast.show('Projet mis à jour avec succès', 'success');
    }

    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la mise à jour: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

async function deleteProject(orgId: string, _spaceId: string, projectId: string): Promise<boolean> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(`${orgPath(orgId)}/projects/${projectId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la suppression du projet');
    }

    const data = await response.json();

    if (data.success !== false) {
      projects.value = projects.value.filter(p => p.id !== projectId);
      // Un repo dont le projet est supprimé perd juste son groupement (SetNull côté API)
      repositories.value.forEach(r => {
        if (r.projectId === projectId) r.projectId = null;
      });
      const toast = useToast();
      toast.show('Projet supprimé avec succès', 'success');
      return true;
    }

    return false;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la suppression: ${error.value}`, 'error');
    return false;
  } finally {
    loading.value = false;
  }
}

// ============================================
// Fonctions utilitaires
// ============================================

/**
 * Copie la clé publique d'une connexion dans le clipboard.
 */
async function copyPublicKey(connection: RepoConnection): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(connection.publicKey);
    const toast = useToast();
    toast.show('Clé publique copiée dans le clipboard !', 'success');
    return true;
  } catch (err) {
    console.error('Erreur lors de la copie:', err);
    const toast = useToast();
    toast.show('Échec de la copie dans le clipboard', 'error');
    return false;
  }
}

/**
 * Réinitialise le state.
 */
function resetState(): void {
  repositories.value = [];
  connections.value = [];
  projects.value = [];
  currentRepository.value = null;
  error.value = null;
}

// ============================================
// Export du composable
// ============================================

export function useRepos() {
  return {
    // State
    repositories,
    connections,
    projects,
    loading,
    error,
    currentRepository,

    // Getters
    repositoriesByStatus,
    activeConnections,
    inactiveConnections,
    connectionsInError,
    totalRepositories,

    // Repositories
    listRepositories,
    getRepository,
    updateRepository,
    applyRepositoryUpdate,

    // Connections
    listConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    getConnectionPublicKey,
    triggerSync,
    applyConnectionUpdate,

    // Projects
    listProjects,
    createProject,
    updateProject,
    deleteProject,

    // Utilitaires
    copyPublicKey,
    resetState
  };
}

// Export des types pour utilisation externe
export type {
  RepoProject,
  RepoConnection,
  Repository,
  RepoStatus
};
