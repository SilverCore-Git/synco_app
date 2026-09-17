# 📋 FEATURE: Tags, Pièces jointes & Fichiers liés (Module Todo)

Extension du module Todo (voir `TODO_MODULE_FEATURE.md`) avec trois ajouts, pensés pour rester dans l'esprit "simplicité extrême" du module : pas de nouvel écran, tout se glisse dans les Kanban existants et dans `CreateTaskModal.vue` / `TaskDetailsModal.vue`.

## 1. Tags

- **Portée** : tags à l'échelle de l'organisation (pas par espace), pour que les tâches personnelles et les tâches d'espace partagent le même vocabulaire.
- **Modèle** : `Tag { id, name, color, organizationId, creatorId }`, relation many-to-many `Task.tags`.
- **Permissions** : création libre pour tout membre (comme la création de listes/tâches) ; renommage/suppression réservés au créateur du tag ou à un admin (`isOwner` / `TASK_UPDATE_ALL`) pour éviter qu'un tag partagé ne soit supprimé accidentellement par n'importe qui.
- **UX** : sélecteur de tags (chips à cocher + mini-formulaire "+ Nouveau tag" avec palette de ~8 couleurs) dans les deux modales de tâche ; pastilles colorées sur les cartes Kanban ; barre de filtre par tag (multi-sélection, logique OU) à côté du filtre par membre existant.

## 2. Pièces jointes (images collées/attachées)

- **Modèle** : réutilise `StoredFile` avec un nouveau `taskId` nullable (comme `messageId`) — le fichier appartient à la tâche, supprimé en cascade avec elle.
- **Upload** : réutilise le pipeline existant `/api/cdn/upload` (chiffrement, quota, validation MIME par signature binaire) — donc toujours soumis au module Fichiers de l'organisation (`features.includes('files')`), comme n'importe quelle pièce jointe de message.
- **UX** : coller une image dans le textarea de description (événement `paste`) ou bouton trombone pour sélection manuelle ; grille de vignettes sous la description, ouverture en grand via le composant existant `FileViewer.vue` ; en création de tâche, les images sont mises en attente côté client puis uploadées juste après la création (la tâche n'existe pas encore).

## 3. Fichiers liés (référence vers le gestionnaire de fichiers)

- **Modèle** : nouvelle table de jonction `TaskFileLink { taskId, fileId, addedById }` — ne possède pas le fichier, le supprimer ne supprime jamais le fichier réel.
- **Disponible uniquement sur les tâches d'espace** (`task.spaceId` défini) : le gestionnaire de fichiers est propre à un espace, une tâche personnelle n'a pas de contexte fichiers à parcourir.
- **UX** : nouveau composant `FilePickerModal.vue`, liste plate cherchable (réutilise `GET /api/spaces/:spaceId/files`, déjà utilisé par `SpaceFiles.vue`) plutôt qu'une navigation par dossiers — plus rapide pour un cas d'usage "je cherche vite un fichier à lier".

## Sécurité

Chaque nouvelle route passe par `checkTodoEnabled` + une vérification d'appartenance explicite via `getPermission` (le module Tasks a déjà eu des routes sans authorization-check par le passé — voir l'historique du projet — donc aucune route n'accède à Prisma avec un `orgId`/`taskId` fourni par le client sans vérifier l'appartenance de l'appelant).

---
*Complète `TODO_MODULE_FEATURE.md`. Implémenté en 3 commits distincts (un par fonctionnalité) dans `synco_api` et `synco_app`.*
