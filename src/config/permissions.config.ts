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

  // Organisation (Paramètres)
  ORG_GENERAL:  { label: 'Paramètres généraux',  icon: 'bi-gear',           description: 'Gérer les paramètres généraux (nom, logo, etc.)' },
  ORG_MEMBERS:  { label: 'Gestion des membres',  icon: 'bi-people',         description: 'Gérer les membres (inviter, expulser)' },
  ORG_ROLES:    { label: 'Rôles & Permissions',  icon: 'bi-shield-lock',    description: 'Gérer les rôles et permissions' },
  ORG_WEBHOOKS: { label: 'Webhooks',             icon: 'bi-hdd-network',    description: 'Configurer les webhooks' },
  ORG_STORAGE:  { label: 'Stockage & Quotas',    icon: 'bi-server',         description: 'Gérer l\'espace de stockage de l\'organisation' },
  ORG_AI:       { label: 'Syncoraï (IA)',        icon: 'bi-robot',          description: 'Configurer l\'assistant Syncoraï' },

  // Espaces de travail
  SPACE_CREATE: { label: 'Créer un espace',      icon: 'bi-grid-plus',      description: 'Créer de nouveaux espaces de travail' },
  SPACE_MANAGE: { label: 'Gérer un espace',      icon: 'bi-grid',           description: 'Modifier les paramètres d\'un espace' },
  SPACE_DELETE: { label: 'Supprimer un espace',  icon: 'bi-trash',          description: 'Supprimer un espace de travail' },

  // Salons & Dossiers
  FOLDER_CREATE:{ label: 'Créer un salon',       icon: 'bi-folder-plus',    description: 'Créer de nouveaux salons ou dossiers' },
  FOLDER_MANAGE:{ label: 'Gérer un salon',       icon: 'bi-folder',         description: 'Renommer et configurer un salon' },
  FOLDER_DELETE:{ label: 'Supprimer un salon',   icon: 'bi-trash',          description: 'Supprimer un salon ou dossier' },
  
  // Contenu & Fichiers
  VIEW:         { label: 'Voir',                 icon: 'bi-eye',            description: 'Voir l\'existence de la ressource' },
  READ:         { label: 'Lire',                 icon: 'bi-book-open',      description: 'Lire les messages, télécharger des fichiers' },
  WRITE:        { label: 'Écrire',               icon: 'bi-pencil',         description: 'Poster des messages dans les threads' },
  UPLOAD:       { label: 'Déposer',              icon: 'bi-upload',         description: 'Uploader des fichiers' },
  CONTENT_DELETE:{label: 'Supprimer le contenu', icon: 'bi-eraser',         description: 'Supprimer des messages ou des fichiers' },
  SHARE:        { label: 'Partager',             icon: 'bi-share',          description: 'Partager une ressource' },

  // Tâches (Gestion Globale)
  TASK_UPDATE_ALL: { label: 'Modifier toutes les tâches', icon: 'bi-card-checklist', description: 'Modifier les détails de n\'importe quelle tâche (titre, assignés...)' },
  TASK_DELETE_ALL: { label: 'Supprimer toutes les tâches', icon: 'bi-trash-fill', description: 'Supprimer n\'importe quelle tâche' },
  TASK_STATUS_ALL: { label: 'Statut de toutes les tâches', icon: 'bi-check-all', description: 'Modifier le statut de n\'importe quelle tâche' },
  TASK_SUBTASK_ALL: { label: 'Sous-tâches (Globale)', icon: 'bi-list-nested', description: 'Créer des sous-tâches sur n\'importe quelle tâche' },

  // Tâches (Hiérarchique - Rôles Inférieurs)
  TASK_UPDATE_LOWER: { label: 'Modifier (Rôles Inférieurs)', icon: 'bi-card-text', description: 'Modifier les tâches créées par des rôles inférieurs' },
  TASK_DELETE_LOWER: { label: 'Supprimer (Rôles Inférieurs)', icon: 'bi-trash', description: 'Supprimer les tâches créées par des rôles inférieurs' },
  TASK_STATUS_LOWER: { label: 'Statut (Rôles Inférieurs)', icon: 'bi-check', description: 'Modifier le statut des tâches créées par des rôles inférieurs' },
  TASK_SUBTASK_LOWER: { label: 'Sous-tâches (Rôles Inférieurs)', icon: 'bi-diagram-3', description: 'Créer des sous-tâches sur les tâches de rôles inférieurs' },

  // Salons vocaux
  VOICE_MUTE_OTHERS: { label: 'Couper le micro des autres', icon: 'bi-mic-mute', description: "Forcer la coupure du micro d'un participant en salon vocal" },
  VOICE_DISCONNECT: { label: "Expulser d'un salon vocal", icon: 'bi-telephone-x', description: "Déconnecter un participant d'un salon vocal" },

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
  position: number;
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
