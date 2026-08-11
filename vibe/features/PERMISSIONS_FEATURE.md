# 🔐 Système de Permissions Synco — Spécification Fonctionnelle

> **Statut** : Approuvé — Prêt pour implémentation  
> **Périmètre** : Workspaces (Espaces), Dossiers, Fichiers  
> **Inspiration** : Modèle Discord (rôles + overrides par canal), adapté au contexte professionnel

---

## 🎯 Objectif

Permettre à un admin d'organisation de contrôler finement **qui peut faire quoi** sur les ressources de l'application (espaces, threads, dossiers, fichiers), via un système de **rôles** et d'**overrides granulaires**, sans complexité apparente pour l'utilisateur final.

---

## 📐 Architecture Conceptuelle

### Le modèle Discord adapté au pro

Discord fonctionne avec :
1. Des **rôles** porteurs de permissions par défaut
2. Des **overrides par canal** (✅ Allow / ❌ Deny / ⬜ Inherit)
3. Une **hiérarchie de résolution** : Deny > Allow > Inherit

On garde cette logique, avec des ajustements pour un public professionnel :
- On parle de **Rôles** et non de "Grades"
- On distingue clairement **accès lecture** vs **accès écriture** vs **accès administration**
- L'override à la granularité fichier/dossier reste **opt-in** (pas obligatoire)

---

---

## 🧬 Architecture : Single Source of Truth

> **Principe clé** : Ajouter ou supprimer une permission = **modifier une seule ligne** dans un fichier de config. Tout le reste (types TypeScript, validation Zod, UI, middleware) se met à jour automatiquement.

### Le Registre Central (`permissions.config.ts`)

```typescript
// shared/permissions.config.ts  ← UNIQUE SOURCE DE VÉRITÉ

export const PERMISSION_REGISTRY = {
  VIEW:   { label: 'Voir',          icon: 'bi-eye',           description: 'Savoir que la ressource existe' },
  READ:   { label: 'Lire',          icon: 'bi-book-open',     description: 'Ouvrir, prévisualiser, télécharger' },
  WRITE:  { label: 'Modifier',      icon: 'bi-pencil',        description: 'Modifier le contenu' },
  UPLOAD: { label: 'Déposer',       icon: 'bi-upload',        description: 'Uploader des fichiers' },
  DELETE: { label: 'Supprimer',     icon: 'bi-trash',         description: 'Supprimer des ressources' },
  SHARE:  { label: 'Partager',      icon: 'bi-share',         description: 'Partager en interne' },
  MANAGE: { label: 'Gérer',         icon: 'bi-gear',          description: 'Renommer, déplacer, configurer' },
  ADMIN:  { label: 'Administrer',   icon: 'bi-shield-lock',   description: 'Gérer membres et rôles' },
  // ✅ Pour ajouter une permission : ajouter UNE ligne ici.
  // Exemple : EXPORT: { label: 'Exporter', icon: 'bi-box-arrow-up', description: 'Exporter en PDF/CSV' },
} as const;

// Types dérivés automatiquement — ne jamais écrire à la main
export type Permission     = keyof typeof PERMISSION_REGISTRY;         // 'VIEW' | 'READ' | ...
export type PermissionValue = 'ALLOW' | 'DENY' | 'INHERIT';
export const PERMISSION_KEYS = Object.keys(PERMISSION_REGISTRY) as Permission[];
```

### Pourquoi `string` et pas un `enum` Prisma ?

| Approche | Migration DB à chaque ajout | Refactoring code | Lisibilité |
|----------|-----------------------------|-----------------|------------|
| `enum` Prisma | ✅ **Oui** (bloquant) | Partout | Bonne |
| `String` + registre | ❌ **Non** | Nulle part | Excellente |

Les permissions sont stockées en `String` dans la DB. Le registre est la seule source d'autorité sur les valeurs valides.

### Propagation automatique dans tout le système

```
PERMISSION_REGISTRY
    ├── Types TypeScript        → Permission = keyof typeof REGISTRY
    ├── Validation Zod (API)    → z.enum(PERMISSION_KEYS)
    ├── UI (PermissionMatrix)   → PERMISSION_KEYS.map(k => REGISTRY[k].label)
    ├── Middleware (checkPerm)  → accepte n'importe quelle Permission valide
    └── Rôles par défaut        → Record<Permission, PermissionValue>
```

### Résultat concret : ajouter `EXPORT` en permission

```diff
// permissions.config.ts
  ADMIN:  { label: 'Administrer', ... },
+ EXPORT: { label: 'Exporter',    icon: 'bi-box-arrow-up', description: 'Exporter en PDF/CSV' },
```

**C'est tout.** La UI affiche automatiquement la nouvelle colonne dans `PermissionMatrix`, le middleware l'accepte, les rôles l'héritent avec `INHERIT` par défaut.

---

## 🏗️ Modèle de Données (Prisma)

### Entités principales

```
Organization
└── Roles[]                  ← Rôles de l'organisation (ex: Admin, Editeur, Lecteur)
    └── RolePermissions[]    ← Permissions par défaut du rôle

WorkSpace
└── SpacePermissions[]       ← Overrides par rôle pour cet espace
    └── PermissionEntry      ← { roleId, permission, value: ALLOW | DENY | INHERIT }

Folder
└── FolderPermissions[]      ← Overrides par rôle pour ce dossier (optionnel)

StoredFile
└── FilePermissions[]        ← Overrides par rôle pour ce fichier (optionnel)
```

### Les 8 permissions fondamentales

| Clé | Label | Description |
|-----|-------|-------------|
| `VIEW` | Voir | Savoir que la ressource existe |
| `READ` | Lire / Ouvrir | Ouvrir, prévisualiser, télécharger |
| `WRITE` | Modifier | Modifier le contenu (threads) |
| `UPLOAD` | Déposer | Uploader des fichiers dans un espace/dossier |
| `DELETE` | Supprimer | Supprimer fichiers/dossiers |
| `SHARE` | Partager | Générer un lien de partage |
| `MANAGE` | Gérer | Renommer, déplacer, changer les permissions |
| `ADMIN` | Administrer | Gérer les membres et rôles de l'espace |

### Valeur d'une permission

```typescript
type PermissionValue = 'ALLOW' | 'DENY' | 'INHERIT';
```

---

## ⚖️ Hiérarchie de Résolution

C'est la mécanique centrale, identique à Discord :

```
DENY > ALLOW > INHERIT

Résolution (du plus spécifique au plus général) :
┌─────────────────────────────────┐
│ 1. Override fichier (si existe) │  ← le plus spécifique
│ 2. Override dossier parent      │
│ 3. Override espace              │
│ 4. Rôle(s) de l'utilisateur    │
│ 5. Permissions par défaut org   │  ← le plus général
└─────────────────────────────────┘

Si un DENY est trouvé à n'importe quel niveau → accès refusé
Si aucun DENY et un ALLOW trouvé → accès accordé
Si tout est INHERIT → valeur par défaut du rôle (ou refus par sécurité)
```

### Cas multi-rôles

Un utilisateur peut avoir **plusieurs rôles** (ex: "Développeur" + "Lecteur"). La règle :
- Si l'un des rôles a DENY → DENY final
- Si aucun DENY et au moins un ALLOW → ALLOW final

---

## 👑 Rôles Système (pré-définis par organisation)

| Rôle | Symbole | Description |
|------|---------|-------------|
| **Owner** | 👑 | Toutes permissions, non modifiable |
| **Admin** | 🛡️ | MANAGE + ADMIN sur tout, peut gérer les rôles |
| **Membre** | 👤 | READ + WRITE sur les espaces dont il est membre |
| **Invité** | 👁️ | VIEW + READ uniquement, aucun accès par défaut |

Les admins peuvent créer des **rôles custom** (ex: "Directeur financier", "Stagiaire", "Partenaire externe").

---

## 🗂️ Application au File Manager

### Cas d'usage concrets

**Espace "Comptabilité"**
- Rôle "Comptable" → `READ, UPLOAD, DELETE` = ALLOW
- Rôle "Membre" → `VIEW` = ALLOW, `READ` = DENY  
- Rôle "Invité" → tout = DENY

**Dossier "Paies 2025"** (dans l'espace Comptabilité)
- Override : Rôle "RH" → `READ` = ALLOW (même si hors espace, override spécifique)
- Override : Rôle "Comptable Junior" → `DELETE` = DENY (même si le rôle l'a normalement)

**Fichier "Bilan_Q1.pdf"**
- Override : User "Martin Dupont" → `READ` = ALLOW (partage individuel)
- Override : Rôle "Direction" → `SHARE` = ALLOW

> 💡 **Les overrides fichier** sont le vrai outil de partage ponctuel, à la "partager avec..."

---

## 🎨 UX/UI — Intégration dans Synco

### Principe directeur : "Progressive Disclosure"
L'utilisateur normal **ne voit rien** de complexe. L'admin accède à la complexité quand il le souhaite.

---

### 1. Panneau Rôles (Settings Org)

**Localisation** : Settings de l'organisation → onglet "Rôles & Permissions"

**Design** : Inspiré de Discord mais plus épuré, style professionnel
- Liste des rôles à gauche (draggable pour la hiérarchie)
- Panneau de droite : matrice de permissions avec toggle switch par permission
- Color picker pour la couleur du rôle (pastille dans l'UI)
- Badge du nombre de membres portant ce rôle

```
┌─────────────────┬──────────────────────────────────────────┐
│  RÔLES          │  Admin ● 3 membres                       │
│ ─────────────── │ ──────────────────────────────────────── │
│ 👑 Owner        │  PERMISSIONS PAR DÉFAUT                  │
│ 🛡️ Admin    ◄── │  ○ Voir les espaces          [✅]        │
│ 📝 Éditeur      │  ○ Lire les fichiers          [✅]        │
│ 👤 Membre       │  ○ Uploader des fichiers      [✅]        │
│ 👁️ Invité       │  ○ Supprimer des fichiers     [✅]        │
│ ──────────────  │  ○ Gérer les permissions      [✅]        │
│ + Nouveau rôle  │  ○ Administrer l'espace       [✅]        │
└─────────────────┴──────────────────────────────────────────┘
```

---

### 2. Permissions d'un Espace (Settings Espace)

**Localisation** : Header de l'espace → ⚙️ → "Permissions"  
OU : Clic droit sur un espace dans la sidebar → "Gérer les permissions"

**Design** : Modal centré, tableau à la Discord

```
┌─────────────────────────────────────────────────────────────┐
│  🔐 Permissions — Espace "Développement"          [✕]      │
│ ─────────────────────────────────────────────────────────── │
│  RÔLES & MEMBRES                    Voir  Lire  Upload  ... │
│                                                              │
│  👑 Owner                           ✅    ✅    ✅    ...  │
│  🛡️ Admin                           ✅    ✅    ✅    ...  │
│  📝 Éditeur                         ✅    ✅    ✅    ...  │
│  👤 Membre                          ✅    ✅    ❌    ...  │
│  👁️ Invité                          ❌    ❌    ❌    ...  │
│                                                              │
│  ─────────── Overrides individuels ──────────────────────── │
│  🧑 Martin Dupont                   ✅    ✅    ─    ...   │
│                                                              │
│  [+ Ajouter un rôle ou un membre]                           │
└─────────────────────────────────────────────────────────────┘
```

**Chaque cellule** : 3 états visuels
- ✅ Vert = ALLOW
- ❌ Rouge = DENY  
- `—` Gris = INHERIT (hérite du rôle parent)

**Interaction** : Clic → popup contextuel `[✅ Autoriser | ❌ Refuser | — Hériter]`

---

### 3. Permissions d'un Dossier (File Manager)

**Localisation** : Menu contextuel (clic droit) sur un dossier → "Permissions"  
OU : Icône 🔐 dans le `FolderCard` (visible au hover, si l'user a MANAGE)

**Subtilité UX** : On affiche d'abord l'état hérité ("Permissions héritées de l'espace"), avec la possibilité de "Personnaliser ce dossier".

```
┌─────────────────────────────────────────────────────────────┐
│  🗂️ Permissions — Dossier "Paies 2025"           [✕]      │
│ ─────────────────────────────────────────────────────────── │
│  ⚠️ Ce dossier hérite des permissions de l'espace           │
│  "Comptabilité". Personnalisez pour créer des exceptions.   │
│                                                              │
│  [Voir les permissions héritées]  [Personnaliser]           │
│                                                              │
│  ── Après clic "Personnaliser" ──────────────────────────── │
│                                                              │
│  OVERRIDES POUR CE DOSSIER                                  │
│                                                              │
│  Rôle "Comptable Junior"   Lire [✅] Supprimer [❌]        │
│  User "Claire R."          Lire [✅] Upload [✅]            │
│                                                              │
│  [+ Ajouter une exception]                [Supprimer tout]  │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Partage d'un Fichier (le "Share" pro)

**Localisation** : Menu contextuel sur `FileCard` → "Partager"  
OU : Bouton dans la modale "Informations du fichier" (déjà existante dans SpaceFiles.vue)

**C'est l'équivalent du "Share with..." de Google Drive, mais souverain.**

```
┌─────────────────────────────────────────────────────────────┐
│  🔗 Partager — "Bilan_Q1.pdf"                    [✕]      │
│ ─────────────────────────────────────────────────────────── │
│  Accès actuel : Restreint aux membres de "Comptabilité"    │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│  PERSONNES AYANT ACCÈS                                      │
│  🧑 Martin Dupont (vous)         Propriétaire               │
│  🧑 Claire Robert                Peut lire     [✏️ Modifier] │
│  👁️ Invités                      Aucun accès                │
│                                                              │
│  AJOUTER DES PERSONNES                                      │
│  [🔍 Rechercher un membre...                          ]     │
│  Niveau d'accès : [Peut lire ▼]  [Ajouter]                 │
│                                                              │
│  ─────────── Lien de partage ────────────────────────────── │
│  🔒 Lien interne uniquement (pas d'URL publique)            │
│  [Copier le lien vers ce fichier]                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. Indicateurs visuels dans le File Manager

Petites touches visuelles pour que l'utilisateur comprenne l'état des permissions sans ouvrir de modale :

#### Sur les FolderCards
- 🔐 **Cadenas** en top-right si le dossier a des permissions personnalisées (différentes de l'espace parent)
- 🔴 **Pastille rouge** si accès refusé à des rôles normalement autorisés

#### Sur les FileCards  
- 👥 **Pastille "N personnes"** si des partages individuels sont actifs
- 🔐 **Cadenas** si permissions fichier customisées
- 👁️ **Icône œil avec slash** si le fichier est masqué à certains rôles

#### Dans la sidebar (Espaces)
- 🔒 **Icône cadenas** sur un espace si l'utilisateur n'a pas accès complet
- Grisé + texte "Lecture seule" si l'user a READ mais pas WRITE

---

### 6. Expérience utilisateur normal (non-admin)

Un membre standard **ne voit pas** les permissions. Il voit simplement :
- ✅ Les fichiers auxquels il a accès
- 🚫 Un message "Vous n'avez pas accès à ce dossier" avec possibilité de "Demander l'accès"
- Boutons d'action désactivés si pas la permission (Upload désactivé si pas UPLOAD)

**"Demander l'accès"** → Notif envoyée à l'admin/owner de l'espace  
C'est un vrai workflow professionnel, inspiré de Google Drive.

---

## 🔄 Flux de Résolution — Exemple Concret

```
Utilisateur : Alice (rôles: "Membre", "Éditeur")
Action : Télécharger /espace-compta/paies-2025/salaire_mars.pdf

Étape 1 — Override fichier ?
  → Pas de FilePermission pour Alice ou ses rôles → INHERIT

Étape 2 — Override dossier "paies-2025" ?
  → RolePermission(Éditeur, READ) = DENY sur ce dossier → ❌ DENY final
  → Résultat : Accès refusé, même si le rôle "Éditeur" a READ par défaut
```

---

## 🧩 Ce qui n'existe pas encore et doit être créé

### Backend (`synco_api`)
| Élément | Description |
|---------|-------------|
| `Role` model | Rôles customs par organisation |
| `RolePermission` model | Permissions par défaut d'un rôle |
| `SpacePermission` model | Overrides par rôle sur un espace |
| `FolderPermission` model | Overrides par rôle sur un dossier |
| `FilePermission` model | Overrides par rôle/user sur un fichier |
| `OrgMember.roles[]` | Relation many-to-many User ↔ Role |
| `/api/orgs/:id/roles` | CRUD des rôles |
| `/api/spaces/:id/permissions` | CRUD permissions d'un espace |
| `/api/spaces/:id/folders/:id/permissions` | CRUD permissions d'un dossier |
| `/api/cdn/:id/permissions` | CRUD permissions d'un fichier |
| `resolvePermission()` helper | Logique de résolution centralisée |
| Middleware `checkPermission()` | Vérifie les permissions avant chaque endpoint |

### Frontend (`synco_app`)
| Composant | Description |
|-----------|-------------|
| `RolesPanel.vue` | Settings org : gestion des rôles |
| `SpacePermissionsModal.vue` | Modal permissions d'un espace |
| `FolderPermissionsModal.vue` | Modal permissions d'un dossier |
| `FileShareModal.vue` | Modal partage d'un fichier |
| `PermissionMatrix.vue` | Composant réutilisable : tableau de permissions |
| `PermissionCell.vue` | Cellule ALLOW/DENY/INHERIT clickable |
| `usePermissions.ts` | Composable : cache et vérification des permissions courantes |
| Indicateurs visuels | Cadenas, pastilles dans FolderCard, FileCard, sidebar |

---

## ❓ Questions Ouvertes

> [!IMPORTANT]
> Ces points nécessitent validation avant implémentation.

1. **Granularité des overrides individuels** : Veut-on permettre l'override par utilisateur individuel (comme Google Drive) ou seulement par rôle (plus simple, comme Discord) ? Ou les deux ?

2. **Lien de partage externe** : Veut-on des liens publics temporaires (avec expiration + mot de passe) ? Ou tout partage reste interne à l'organisation ?

3. **Demande d'accès** : Workflow "Demander l'accès" (notif vers admin) → à implémenter dès le début ou en v2 ?

4. **Héritage Catégorie → Thread** : Les threads (canaux texte/voix) doivent-ils aussi hériter du système de permissions ? Actuellement `Thread` a déjà `membersId` et `writersId` — à remplacer ou à garder en parallèle ?

5. **Audit log** : Tracer qui a accédé/modifié quoi (nécessaire pour conformité RGPD/professionnel) — v1 ou v2 ?

6. **Performance** : La résolution se fait côté serveur à chaque requête (plus sûr) ou côté client avec un cache de permissions (plus fluide) ? Suggestion : serveur pour les actions critiques, cache client pour l'UI.

---

## 🚦 Proposition de Phasage

### Phase 1 — Fondations (v1)
- Modèle Prisma : Role, RolePermission, SpacePermission
- Middleware `checkPermission()` sur les endpoints existants
- UI : Panneau Rôles dans Settings Org
- UI : Permissions par Espace

### Phase 2 — File Manager (v2)
- FolderPermission, FilePermission
- UI : Modal permissions dossier
- UI : Modal partage fichier
- Indicateurs visuels dans le File Manager

### Phase 3 — Polish (v3)
- Override individuel (par user)
- Lien de partage interne
- Workflow "Demander l'accès"
- Audit log des accès fichiers
