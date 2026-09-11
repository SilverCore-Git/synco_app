// ============================================
// Composable pour la gestion des branches d'un Repository (module Repos)
// ============================================
// Calqué sur useRepos.ts / useWebhooks.ts. Toutes les métadonnées de branche
// (sha/auteur/date/message, ahead/behind, fork-point) sont dérivées du sync
// Git côté serveur — lecture seule ici, à l'exception de `status`/`tags`
// (organisationnel, éditable via PATCH).

import { ref, computed } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from './useToast';
import type {
  Branch,
  RepoStatus,
  UpdateBranchDTO,
  ListBranchesResponse,
  GetBranchResponse
} from '@/types/repos';

// ============================================
// State principal
// ============================================

const branches = ref<Branch[]>([]);
const loading = ref<boolean>(false);
const error = ref<string | null>(null);

// ============================================
// Getters
// ============================================

const defaultBranch = computed(() => branches.value.find(b => b.isDefault) || null);
const nonDefaultBranches = computed(() => branches.value.filter(b => !b.isDefault));

const branchesByStatus = computed(() => {
  const groups: Record<RepoStatus, Branch[]> = {
    idea: [],
    in_progress: [],
    in_review: [],
    stale: []
  };
  for (const branch of branches.value) {
    (groups[branch.status] ||= []).push(branch);
  }
  return groups;
});

// ============================================
// Fonctions utilitaires internes
// ============================================

// Contrat vérifié contre `synco_api/src/routes/repos.ts` : ni la liste des
// branches d'un repo, ni la mise à jour d'une branche par id, ne portent
// `spaceId` dans leur chemin (l'id du repo/branche + l'org suffisent).
function branchesPath(orgId: string, repoId: string): string {
  return `/api/orgs/${orgId}/repos/${repoId}/branches`;
}

function branchByIdPath(orgId: string, branchId: string): string {
  return `/api/orgs/${orgId}/repos/branches/${branchId}`;
}

// ============================================
// Fonctions API
// ============================================

/**
 * Liste les branches d'un repository (avec leurs métadonnées de commit,
 * ahead/behind, fork-point — jamais de contenu de fichiers).
 */
async function listBranches(orgId: string, _spaceId: string, repoId: string): Promise<ListBranchesResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(branchesPath(orgId, repoId));

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la récupération des branches');
    }

    const data: ListBranchesResponse = await response.json();

    if (data.success) {
      branches.value = data.branches;
    }

    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement des branches: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Met à jour le statut/tags organisationnels d'une branche.
 */
async function updateBranch(
  orgId: string,
  _spaceId: string,
  _repoId: string,
  branchId: string,
  dto: UpdateBranchDTO
): Promise<GetBranchResponse | null> {
  loading.value = true;
  error.value = null;

  try {
    const response = await sfetch(branchByIdPath(orgId, branchId), {
      method: 'PATCH',
      body: JSON.stringify(dto)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Erreur lors de la mise à jour de la branche');
    }

    const data: GetBranchResponse = await response.json();

    if (data.success && data.branch) {
      const index = branches.value.findIndex(b => b.id === branchId);
      if (index !== -1) branches.value[index] = data.branch;
      const toast = useToast();
      toast.show('Branche mise à jour avec succès', 'success');
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
 * Applique localement une mise à jour de branche reçue par websocket
 * (`repos:branch-updated`) — n'affecte que la liste si elle correspond au
 * repo actuellement affiché (filtrage laissé à l'appelant via repositoryId).
 */
function applyBranchUpdate(branch: Branch): void {
  const index = branches.value.findIndex(b => b.id === branch.id);
  if (index !== -1) {
    branches.value[index] = branch;
  } else {
    branches.value.push(branch);
  }
}

/**
 * Retire une branche localement suite à un événement websocket
 * (`repos:branch-deleted` — la branche a disparu côté remote).
 */
function applyBranchDeletion(branchId: string): void {
  branches.value = branches.value.filter(b => b.id !== branchId);
}

/**
 * Réinitialise le state.
 */
function resetState(): void {
  branches.value = [];
  error.value = null;
}

// ============================================
// Export du composable
// ============================================

export function useRepoBranches() {
  return {
    // State
    branches,
    loading,
    error,

    // Getters
    defaultBranch,
    nonDefaultBranches,
    branchesByStatus,

    // Fonctions API
    listBranches,
    updateBranch,
    applyBranchUpdate,
    applyBranchDeletion,

    // Utilitaires
    resetState
  };
}

// Export des types pour utilisation externe
export type { Branch };
