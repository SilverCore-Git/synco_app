/**
 * ============================================================
 * REGISTRE CENTRAL DES PERMISSIONS — COPIE FRONTEND
 * ============================================================
 *
 * IMPORTANT : Ce fichier DOIT rester synchronisé avec
 * synco_api/src/config/permissions.config.ts
 *
 * Pour ajouter une permission : modifier les DEUX fichiers.
 * (Futur : monorepo avec import partagé)
 */

export const PERMISSION_REGISTRY = {

  // Visibilité / Lecture
  VIEW:   { label: 'Voir',          icon: 'bi-eye',           description: 'Savoir que la ressource existe (espace, dossier, fichier)' },
  READ:   { label: 'Lire',          icon: 'bi-book-open',     description: 'Ouvrir, prévisualiser, télécharger un fichier' },
  
  // Création / Édition
  WRITE:  { label: 'Écrire',        icon: 'bi-pencil',        description: 'Poster des messages dans les threads' },
  UPLOAD: { label: 'Déposer',       icon: 'bi-upload',        description: 'Uploader des fichiers dans un espace ou dossier' },
  CREATE_SPACE: { label: 'Créer un espace', icon: 'bi-grid-plus', description: 'Créer de nouveaux espaces de travail' },
  CREATE_FOLDER: { label: 'Créer un salon', icon: 'bi-folder-plus', description: 'Créer de nouveaux dossiers ou salons' },
  DELETE: { label: 'Supprimer',     icon: 'bi-trash',         description: 'Supprimer des fichiers, dossiers ou messages' },
  
  // Gestion & Administration
  SHARE:  { label: 'Partager',      icon: 'bi-share',         description: 'Partager une ressource en interne' },
  INVITE_USERS: { label: 'Inviter', icon: 'bi-person-plus',   description: 'Inviter de nouveaux membres dans l\'organisation' },
  MANAGE: { label: 'Gérer',         icon: 'bi-gear',          description: 'Renommer, déplacer, modifier les paramètres' },
  ADMIN:  { label: 'Administrer',   icon: 'bi-shield-lock',   description: 'Gérer les membres et les rôles de la ressource' },

} as const;

export type Permission = keyof typeof PERMISSION_REGISTRY;
export type PermissionValue = 'ALLOW' | 'DENY' | 'INHERIT';
export const PERMISSION_KEYS = Object.keys(PERMISSION_REGISTRY) as Permission[];
export type PermissionMeta = (typeof PERMISSION_REGISTRY)[Permission];

export interface RoleData {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  isSystem: boolean;
  orgId: string;
  memberCount: number;
  permissions: Array<{
    id: string;
    permission: string;
    value: PermissionValue;
  }>;
}

export interface PermissionOverride {
  id?: string;
  roleId?: string | null;
  userId?: string | null;
  permission: Permission;
  value: PermissionValue;
  role?: { id: string; name: string; color: string | null };
}
