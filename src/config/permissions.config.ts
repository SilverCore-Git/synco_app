/**
 * ============================================================
 * REGISTRE CENTRAL DES PERMISSIONS — COPIE FRONTEND
 * ============================================================
 *
 * IMPORTANT : ce fichier DOIT rester synchronisé avec
 * synco_api/src/config/permissions.config.ts (registre et groupes).
 *
 * Deux niveaux :
 *   - `org`   : réglé uniquement sur le rôle (Paramètres > Rôles) ;
 *   - `space` : valeur par défaut sur le rôle, redéfinissable par space.
 *
 * Les anciennes clés (FOLDER_*, CONTENT_DELETE) n'existent plus côté client :
 * l'API les convertit avant de répondre.
 */

export type PermissionScope = 'org' | 'space';

export const PERMISSION_GROUPS = {
  org:     { label: 'Organisation',        scope: 'org' },
  space:   { label: 'Space',               scope: 'space' },
  threads: { label: 'Threads',             scope: 'space' },
  content: { label: 'Messages',            scope: 'space' },
  files:   { label: 'Fichiers',            scope: 'space' },
  tasks:   { label: 'Tâches',              scope: 'space' },
  voice:   { label: 'Salons vocaux',       scope: 'space' },
} as const satisfies Record<string, { label: string; scope: PermissionScope }>;

export type PermissionGroup = keyof typeof PERMISSION_GROUPS;

export const PERMISSION_REGISTRY = {

  // ── Organisation ────────────────────────────────────────────────────────
  ORG_GENERAL:  { scope: 'org', group: 'org', label: 'Paramètres généraux', icon: 'bi-gear', description: 'Modifier le nom, le logo et les réglages de l\'organisation' },
  ORG_MEMBERS:  { scope: 'org', group: 'org', label: 'Gérer les membres', icon: 'bi-people', description: 'Inviter, expulser et attribuer les rôles des membres' },
  ORG_ROLES:    { scope: 'org', group: 'org', label: 'Rôles & permissions', icon: 'bi-shield-lock', description: 'Créer et modifier les rôles, régler les permissions de tous les spaces' },
  ORG_WEBHOOKS: { scope: 'org', group: 'org', label: 'Webhooks', icon: 'bi-hdd-network', description: 'Configurer les webhooks de l\'organisation' },
  ORG_STORAGE:  { scope: 'org', group: 'org', label: 'Stockage & quotas', icon: 'bi-server', description: 'Gérer l\'espace de stockage de l\'organisation' },
  ORG_AI:       { scope: 'org', group: 'org', label: 'Synco IA', icon: 'bi-robot', description: 'Configurer l\'assistant Synco IA' },
  SPACE_CREATE: { scope: 'org', group: 'org', label: 'Créer des spaces', icon: 'bi-grid-plus', description: 'Créer de nouveaux spaces dans l\'organisation' },

  // ── Space ───────────────────────────────────────────────────────────────
  SPACE_MANAGE:      { scope: 'space', group: 'space', label: 'Gérer le space', icon: 'bi-grid', description: 'Renommer le space, changer son logo, gérer ses membres' },
  SPACE_PERMISSIONS: { scope: 'space', group: 'space', label: 'Régler les permissions', icon: 'bi-sliders', description: 'Modifier les permissions de ce space pour les rôles inférieurs au sien' },
  SPACE_DELETE:      { scope: 'space', group: 'space', label: 'Supprimer le space', icon: 'bi-trash', description: 'Supprimer définitivement le space' },
  STATS_MEMBERS:     { scope: 'space', group: 'space', label: 'Statistiques par membre', icon: 'bi-person-lines-fill', description: 'Voir le détail de chaque membre dans les statistiques du space (sans elle, chacun ne voit que ses propres chiffres)' },

  // ── Threads ─────────────────────────────────────────────────────────────
  THREAD_CREATE:         { scope: 'space', group: 'threads', label: 'Créer des threads', icon: 'bi-plus-square', description: 'Créer des threads texte et vocaux' },
  THREAD_CREATE_PRIVATE: { scope: 'space', group: 'threads', label: 'Créer des threads privés', icon: 'bi-lock', description: 'Créer des threads visibles seulement par leurs membres, ou rendre privé un thread' },
  THREAD_MANAGE:         { scope: 'space', group: 'threads', label: 'Gérer tous les threads', icon: 'bi-pencil-square', description: 'Renommer, configurer et écrire dans les threads en lecture seule, même ceux des autres' },
  THREAD_DELETE:         { scope: 'space', group: 'threads', label: 'Supprimer tous les threads', icon: 'bi-trash', description: 'Supprimer n\'importe quel thread, pas seulement les siens' },
  CATEGORY_MANAGE:       { scope: 'space', group: 'threads', label: 'Gérer les catégories', icon: 'bi-collection', description: 'Créer, renommer et supprimer les catégories de threads' },

  // ── Messages ────────────────────────────────────────────────────────────
  VIEW:           { scope: 'space', group: 'content', label: 'Voir', icon: 'bi-eye', description: 'Voir le contenu du space' },
  READ:           { scope: 'space', group: 'content', label: 'Lire', icon: 'bi-book', description: 'Lire les messages et ouvrir les fichiers' },
  WRITE:          { scope: 'space', group: 'content', label: 'Écrire', icon: 'bi-chat-dots', description: 'Envoyer des messages et parler dans les salons vocaux' },
  MESSAGE_DELETE: { scope: 'space', group: 'content', label: 'Supprimer les messages des autres', icon: 'bi-eraser', description: 'Modérer : supprimer n\'importe quel message' },
  SHARE:          { scope: 'space', group: 'content', label: 'Inviter dans un thread', icon: 'bi-person-plus', description: 'Ajouter des membres à un thread et partager des ressources' },

  // ── Fichiers ────────────────────────────────────────────────────────────
  UPLOAD:        { scope: 'space', group: 'files', label: 'Déposer des fichiers', icon: 'bi-upload', description: 'Envoyer des fichiers et créer des dossiers dans le space' },
  FILE_ORGANIZE: { scope: 'space', group: 'files', label: 'Organiser les fichiers', icon: 'bi-folder-symlink', description: 'Renommer et déplacer les dossiers et les fichiers, même ceux des autres' },
  FILE_DELETE:   { scope: 'space', group: 'files', label: 'Supprimer les fichiers des autres', icon: 'bi-folder-x', description: 'Supprimer n\'importe quel fichier ou dossier, pas seulement les siens' },

  // ── Tâches ──────────────────────────────────────────────────────────────
  TASK_CREATE:        { scope: 'space', group: 'tasks', label: 'Créer des tâches', icon: 'bi-plus-circle', description: 'Créer des tâches (chacun peut toujours modifier les siennes)' },
  TASK_UPDATE_ALL:    { scope: 'space', group: 'tasks', label: 'Modifier toutes les tâches', icon: 'bi-card-checklist', description: 'Modifier les détails de n\'importe quelle tâche (titre, assignés…)' },
  TASK_STATUS_ALL:    { scope: 'space', group: 'tasks', label: 'Changer le statut de toutes les tâches', icon: 'bi-check-all', description: 'Changer le statut de n\'importe quelle tâche' },
  TASK_SUBTASK_ALL:   { scope: 'space', group: 'tasks', label: 'Sous-tâches sur toutes les tâches', icon: 'bi-list-nested', description: 'Ajouter des sous-tâches à n\'importe quelle tâche' },
  TASK_DELETE_ALL:    { scope: 'space', group: 'tasks', label: 'Supprimer toutes les tâches', icon: 'bi-trash-fill', description: 'Supprimer n\'importe quelle tâche' },
  TASK_UPDATE_LOWER:  { scope: 'space', group: 'tasks', label: 'Modifier les tâches des rôles inférieurs', icon: 'bi-card-text', description: 'Modifier les tâches créées par un rôle inférieur au sien' },
  TASK_STATUS_LOWER:  { scope: 'space', group: 'tasks', label: 'Statut des tâches des rôles inférieurs', icon: 'bi-check', description: 'Changer le statut des tâches créées par un rôle inférieur' },
  TASK_SUBTASK_LOWER: { scope: 'space', group: 'tasks', label: 'Sous-tâches des rôles inférieurs', icon: 'bi-diagram-3', description: 'Ajouter des sous-tâches aux tâches d\'un rôle inférieur' },
  TASK_DELETE_LOWER:  { scope: 'space', group: 'tasks', label: 'Supprimer les tâches des rôles inférieurs', icon: 'bi-trash', description: 'Supprimer les tâches créées par un rôle inférieur' },

  // ── Salons vocaux ───────────────────────────────────────────────────────
  VOICE_MUTE_OTHERS: { scope: 'space', group: 'voice', label: 'Couper le micro des autres', icon: 'bi-mic-mute', description: 'Forcer la coupure du micro d\'un participant' },
  VOICE_DISCONNECT:  { scope: 'space', group: 'voice', label: 'Expulser d\'un salon vocal', icon: 'bi-telephone-x', description: 'Déconnecter un participant d\'un salon vocal' },

} as const satisfies Record<string, { scope: PermissionScope; group: PermissionGroup; label: string; icon: string; description: string }>;

export type Permission = keyof typeof PERMISSION_REGISTRY;
export type PermissionValue = 'ALLOW' | 'DENY' | 'INHERIT';
export const PERMISSION_KEYS = Object.keys(PERMISSION_REGISTRY) as Permission[];
export type PermissionMeta = (typeof PERMISSION_REGISTRY)[Permission];

/** Permissions réglables uniquement sur le rôle, pour toute l'organisation. */
export const ORG_PERMISSION_KEYS = PERMISSION_KEYS.filter(k => PERMISSION_REGISTRY[k].scope === 'org');

/** Permissions qu'un space peut redéfinir. */
export const SPACE_PERMISSION_KEYS = PERMISSION_KEYS.filter(k => PERMISSION_REGISTRY[k].scope === 'space');

/** Les permissions d'un niveau, rangées par groupe dans l'ordre du registre. */
export function permissionGroupsFor(scope: PermissionScope): Array<{ id: PermissionGroup; name: string; keys: Permission[] }> {
  return (Object.entries(PERMISSION_GROUPS) as [PermissionGroup, { label: string; scope: PermissionScope }][])
    .filter(([, g]) => g.scope === scope)
    .map(([id, g]) => ({ id, name: g.label, keys: PERMISSION_KEYS.filter(k => PERMISSION_REGISTRY[k].group === id) }))
    .filter(g => g.keys.length > 0);
}

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
