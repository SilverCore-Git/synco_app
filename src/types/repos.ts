// ============================================
// Types pour le module Repos
// ============================================
// Couche d'organisation au-dessus de dépôts Git externes — jamais un
// visualiseur de code. Seules des métadonnées transitent (noms de branches,
// sha/auteur/date/message de commit, ahead/behind) — jamais de contenu de
// fichiers, jamais la clé privée, jamais l'URL du remote une fois la
// connexion créée.

// ============================================
// Statut organisationnel (repo & branche)
// ============================================
export type RepoStatus = 'idea' | 'in_progress' | 'in_review' | 'stale';

export const ALL_REPO_STATUSES: RepoStatus[] = [
  'idea',
  'in_progress',
  'in_review',
  'stale'
];

// ============================================
// Statut de synchronisation d'une connexion
// ============================================
export type RepoSyncStatus = 'pending' | 'syncing' | 'ok' | 'error' | 'unsupported';

// ============================================
// RepoProject — regroupement interne au module
// ============================================
export interface RepoProject {
  id: string;
  name: string;
  spaceId: string;
  organizationId: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;

  // Relations (optionnelles, pour le frontend)
  repositories?: Repository[];
}

// ============================================
// RepoConnection — un remote Git + sa clé générée
// ============================================
// IMPORTANT : ce type ne doit JAMAIS contenir `remoteUrl` ni `privateKey` —
// ce sont des champs write-only côté API (remoteUrl n'est acceptée qu'à la
// création, privateKey n'est jamais renvoyée). Ne pas ajouter ces champs ici
// même optionnellement : ce type modélise les réponses de l'API.
export interface RepoConnection {
  id: string;
  spaceId: string;
  organizationId: string;
  name: string;
  publicKey: string;
  keyFingerprint: string;
  defaultBranchName?: string | null;
  syncStatus: RepoSyncStatus;
  lastSyncedAt?: string | Date | null;
  lastSyncError?: string | null;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;

  // Relation optionnelle (le repo suivi par cette connexion)
  repository?: Repository | null;
}

// ============================================
// Repository — entité affichée dans le tableau
// ============================================
export interface Repository {
  id: string;
  name: string;
  tags: string[];
  status: RepoStatus;
  connectionId: string;
  projectId?: string | null;
  spaceId: string;
  organizationId: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;

  // Relations (optionnelles, pour le frontend)
  connection?: RepoConnection | null;
  project?: RepoProject | null;
  branches?: Branch[];
}

// ============================================
// Branch — métadonnées de branche (lecture seule côté sync)
// ============================================
export interface Branch {
  id: string;
  repositoryId: string;
  name: string;
  isDefault: boolean;
  tags: string[];
  status: RepoStatus;
  lastCommitSha?: string | null;
  lastCommitAuthor?: string | null;
  lastCommitDate?: string | Date | null;
  lastCommitMessage?: string | null;
  aheadCount?: number | null;
  behindCount?: number | null;
  forkPointSha?: string | null;
  forkPointDate?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// ============================================
// DTOs — RepoProject
// ============================================
export interface CreateRepoProjectDTO {
  name: string;
}

export interface UpdateRepoProjectDTO {
  name?: string;
}

// ============================================
// DTOs — RepoConnection
// ============================================
// `remoteUrl`/`privateKey` (générée côté serveur) ne quittent jamais le
// serveur après création : le formulaire les envoie une seule fois via ce
// DTO, la réponse ne contient jamais ces champs.
export interface CreateRepoConnectionDTO {
  name: string;
  remoteUrl: string;
  projectId?: string;
}

// PATCH = rename/pause uniquement — jamais de ré-édition du remote en place
// (il faut supprimer/recréer pour éviter de repointer silencieusement une
// clé stockée vers un autre remote).
export interface UpdateRepoConnectionDTO {
  name?: string;
  isActive?: boolean;
}

// ============================================
// DTOs — Repository
// ============================================
export interface UpdateRepositoryDTO {
  tags?: string[];
  status?: RepoStatus;
  projectId?: string | null;
}

// ============================================
// DTOs — Branch
// ============================================
// Tout le reste est dérivé du sync — lecture seule côté API.
export interface UpdateBranchDTO {
  status?: RepoStatus;
  tags?: string[];
}

// ============================================
// Réponses API — RepoProject
// ============================================
export interface ListRepoProjectsResponse {
  success: boolean;
  projects: RepoProject[];
  error?: string;
}

export interface GetRepoProjectResponse {
  success: boolean;
  project: RepoProject;
  error?: string;
}

// ============================================
// Réponses API — RepoConnection
// ============================================
export interface ListRepoConnectionsResponse {
  success: boolean;
  connections: RepoConnection[];
  error?: string;
}

export interface GetRepoConnectionResponse {
  success: boolean;
  connection: RepoConnection;
  error?: string;
}

export interface CreateRepoConnectionResponse {
  success: boolean;
  connection: RepoConnection;
  error?: string;
}

export interface GetRepoConnectionPublicKeyResponse {
  success: boolean;
  publicKey: string;
  keyFingerprint?: string;
  error?: string;
}

export interface SyncRepoConnectionResponse {
  success: boolean;
  connection?: RepoConnection;
  message?: string;
  error?: string;
}

// ============================================
// Réponses API — Repository
// ============================================
export interface ListRepositoriesResponse {
  success: boolean;
  repositories: Repository[];
  total?: number;
  error?: string;
}

export interface GetRepositoryResponse {
  success: boolean;
  repository: Repository;
  error?: string;
}

// ============================================
// Réponses API — Branch
// ============================================
export interface ListBranchesResponse {
  success: boolean;
  branches: Branch[];
  error?: string;
}

export interface GetBranchResponse {
  success: boolean;
  branch: Branch;
  error?: string;
}

// ============================================
// Événements WebSocket temps réel (room org:${orgId})
// ============================================
export interface RepoConnectionSyncedPayload {
  connection: RepoConnection;
}

export interface RepoBranchUpdatedPayload {
  branch: Branch;
}

export interface RepoBranchDeletedPayload {
  branchId: string;
  repositoryId: string;
}
