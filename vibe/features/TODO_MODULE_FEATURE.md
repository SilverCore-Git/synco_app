# 📋 FEATURE: Module Todo List & Gestion de Projet

## 🎯 1. Objectif de la Fonctionnalité

Ajouter un module de **gestion des tâches et suivi de projet** sur Synco. 
Cette fonctionnalité s'adresse aux professionnels souhaitant suivre l'avancement de leurs projets directement depuis l'application de communication.

**Simplicité avant tout (Design UX) :** Le module doit être extrêmement simple à utiliser côté utilisateur. On ne doit pas imposer un outil complexe à l'utilisateur s'il n'en a pas besoin. Le flux de base doit être : on assigne une Todo list à quelqu'un, la personne la remplit/effectue les tâches, et valide (coche) quand c'est fini.

**Contrainte majeure :** Ce système doit être **modulaire**. Une organisation doit pouvoir l'activer ou le désactiver (ON/OFF) très facilement via ses paramètres, sans que cela n'alourdisse ou ne casse l'application si la fonctionnalité n'est pas utilisée.

---

## 🎨 2. Ergonomie et Architecture UI

Pour répondre aux standards professionnels, l'ergonomie repose sur une **approche hybride** offrant deux niveaux de lecture : Macro (Global) et Micro (Contextuel).

### A. Vue Globale : "Mes Tâches"
- **Emplacement :** Dans la Sidebar principale de navigation (près de "Home" et "DMs").
- **Objectif :** C'est le tableau de bord individuel de l'utilisateur.
- **Affichage :**
  - **Toutes les tâches assignées à l'utilisateur**, peu importe le projet/espace d'où elles proviennent.
  - Les tâches "personnelles" que l'utilisateur a créées pour lui-même (non rattachées à un espace).
  - Tri et filtres de base : par date d'échéance (Aujourd'hui, Prochainement, En retard), par priorité, ou par Espace.

### B. Vue Contextuelle : "Tâches du Projet" (Par Espace)
- **Emplacement :** Dans l'en-tête d'un **Space**, sous forme d'un nouvel onglet (ex: Chat | Tâches | Fichiers).
- **Objectif :** Suivi collaboratif pour les membres d'un même projet/espace.
- **Affichage :**
  - Vue **Liste** (pour commencer en V1) puis vue **Kanban** (colonnes À Faire, En cours, Terminé) en évolution.
  - Affiche toutes les tâches associées spécifiquement à cet espace.
  - Permet de voir facilement "qui fait quoi" au sein du projet.

---

## ⚙️ 3. Fonctionnement Modulaire (Toggle ON/OFF)

Le module doit agir comme un "Plugin" dans l'architecture Synco.

### Côté Frontend (`synco_app`)
- **State Pinia :** L'activation du module doit être vérifiée via l'objet de l'organisation courante (ex: `org.modules.todoEnabled`).
- **Rendu Conditionnel :**
  - Le lien "Mes Tâches" dans la Navbar principale doit être enveloppé d'un `v-if="todoEnabled"`.
  - L'onglet "Tâches" dans les Espaces doit utiliser `v-if="todoEnabled"`.
- **Code Splitting :** Les vues complexes du module (Listes de tâches, interfaces de gestion) doivent utiliser le chargement dynamique de Vue (`defineAsyncComponent`) pour ne pas être chargées dans le bundle initial si l'organisation n'utilise pas le module.

### Côté Backend (`synco_api`)
- **Base de données :** Le modèle `Organization` doit inclure une notion de modules actifs (champ JSON `activeModules` ou similaire).
- **Middlewares :** Créer un middleware API spécifique qui vérifie si le module "todo" est activé pour l'organisation avant d'autoriser l'accès aux routes `/api/tasks/*`. Si désactivé -> erreur 403.

---

## 👥 4. Permissions, Assignation et Workflow Simple

L'outil doit permettre la délégation de travail de manière très fluide :
- **Workflow Simple :** Si un manager veut simplement assigner une tâche ou une Todo list à un collaborateur, il lui assigne. Le collaborateur la voit dans sa liste, effectue les tâches et les coche pour les valider. On ne force pas l'utilisation de fonctionnalités complexes de gestion de projet.
- **Tâches personnelles :** Tout utilisateur peut se créer ses propres tâches (sans assignation d'espace).
- **Assignation tierce :** Dans un Espace, un utilisateur ayant le rôle de **Manager** ou d'**Admin** peut créer une tâche et l'assigner à n'importe quel autre membre du même Espace.
- **Notifications :** Lorsqu'une tâche est assignée à un utilisateur par un tiers, une notification in-app doit être générée (et idéalement un petit message "Bot" ou notification sonore).

---

## 🔒 5. Sécurité et Modèle de Données (Guidelines)

### Schéma de base attendu (Prisma)
- **Modèle `Task`** :
  - `id` (UUID)
  - `title` (String, chiffré)
  - `description` (String, chiffré, nullable)
  - `status` (Enum: TODO, IN_PROGRESS, DONE)
  - `dueDate` (DateTime, nullable)
  - `assigneeId` (Relation User, nullable)
  - `creatorId` (Relation User)
  - `spaceId` (Relation Space, nullable)
  - `organizationId` (Relation Organization)

### Sécurité (E2EE / Chiffrement)
Conformément au "Vibe" de Synco :
- **Chiffrement DB :** Au minimum, les champs `title` et `description` doivent utiliser `prisma-field-encryption` pour garantir la confidentialité des données au repos.
- **Validation Zod :** Validation stricte de tous les champs lors de la création/modification d'une tâche pour éviter toute faille (XSS via la description, etc.).

---

## 🗄️ 6. Archivage des Tâches (Extension V1.1)

**Objectif :** Permettre de sortir une tâche du Kanban (typiquement une tâche `DONE`) sans la supprimer, pour garder l'historique tout en gardant les colonnes lisibles.

- **Modèle de données :** `archived` (Boolean, défaut `false`) + `archivedAt` (DateTime, nullable) sur `Task`, indépendant de `status`. Les endpoints de listing (`/lists/me`, `/spaces/:spaceId/lists`) excluent `archived: true` par défaut.
- **Consultation :** Deux endpoints dédiés (`GET /:orgId/archived/me`, `GET /:orgId/spaces/:spaceId/archived`) alimentent un panneau `ArchivedTasksPanel.vue`, ouvert via une icône dans la topbar (visible uniquement s'il existe des tâches archivées). Chaque entrée propose **Restaurer** (`archived: false`) ou **Supprimer définitivement** (via `ConfirmDelete.vue`, jamais de `confirm()` natif).
- **Déclencheurs d'archivage :** drop d'une carte sur un bouton dédié (à côté de la corbeille en drag & drop), entrée "Archiver" dans le menu contextuel de la carte et dans `TaskDetailsModal.vue`, et action groupée "Archiver tout" sur la colonne `DONE` (sans confirmation, action réversible).
- **Permissions :** l'archivage/désarchivage réutilise `TASK_STATUS_ALL` / `TASK_STATUS_LOWER` (même logique que le changement de statut) plutôt qu'une nouvelle permission dédiée.

---
*Fin du document de spécification technique pour la session de développement.*
