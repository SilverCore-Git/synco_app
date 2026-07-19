# 🔍 Fonctionnalité : Indexation Vectorielle & Recherche Sémantique

> **Statut** : En conception (Phase 1 : Indexation)
> **Objectif** : Convertir l'ensemble du contenu de l'application (messages, fichiers, todos) en vecteurs mathématiques pour permettre une recherche sémantique intelligente ("Ultra Recherche") par espace de travail et en global.

---

## 1. 🏗️ Architecture Globale & Contrainte E2EE

Dans Synco, toutes les données sont chiffrées de bout en bout (E2EE). Le serveur de base de données backend (PostgreSQL) ne contient que des données chiffrées et est "aveugle". 

**La règle d'or pour préserver l'E2EE :**
Un vecteur sémantique représente le "sens" d'une phrase. Si le serveur stocke les vecteurs en clair, il peut déduire de quoi parlent les utilisateurs. Par conséquent, **l'indexation et le stockage des vecteurs doivent se faire localement, côté client.**

### La Stack Technique (Frontend)
- **Modèle IA** : `Transformers.js` (exécute un modèle d'embedding léger comme `Xenova/paraphrase-multilingual-MiniLM-L12-v2` directement dans le navigateur via WebAssembly).
- **Extraction PDF** : `pdf.js` (pour extraire le texte des fichiers PDF en mémoire).
- **Base Vectorielle (DB Locale)** : `IndexedDB` (via une surcouche comme `Orama` ou `Voy` qui supportent la similarité cosinus côté client).

---

## 2. 🔄 Le Flux d'Indexation (Comment tout devient vecteur)

L'objectif est que tout soit transformé en vecteur **au moment du téléversement/envoi** (pour l'auteur) ou **au moment de la réception/déchiffrement** (pour les autres).

### A. Les Messages
1. **À l'envoi** : Le composant `ChatView.vue` intercepte le message en clair. Avant de le chiffrer avec la clé E2EE, il passe le texte à `Transformers.js` pour générer un vecteur `[0.02, -0.4, ...]`. Il stocke ce vecteur dans la base locale avec l'ID du message et l'ID du Workspace.
2. **À la réception** : Quand le client reçoit un message chiffré via WebSocket, il le déchiffre. Une fois en clair, un *Web Worker* génère le vecteur et l'ajoute à la DB locale.

### B. Les Fichiers (ex: PDF, TXT)
1. **À l'upload (File Manager)** : Avant de chiffrer et d'envoyer le fichier sur S3/MinIO, le navigateur utilise `pdf.js` pour extraire le texte brut du document.
2. **Création du Vecteur** : Si le texte est long, il est découpé en "chunks" (paragraphes). Chaque paragraphe est converti en vecteur via `Transformers.js` et stocké localement avec le `fileId`.
3. **À la consultation** : Si un autre utilisateur télécharge le fichier, son client le déchiffre, extrait le texte en mémoire, et génère ses propres vecteurs locaux.

### C. Les To-Do Lists
1. **Création/Modification** : Le titre et la description de chaque tâche ("To-do") sont vectorisés en temps réel et mis à jour dans l'index local.

## 3. 🗄️ Stockage et Synchronisation E2EE (Le Secret du Multi-Appareil)

Pour que l'utilisateur retrouve sa recherche sur son téléphone ou un nouvel ordinateur **sans casser le chiffrement de bout en bout (E2EE)**, nous utilisons un mécanisme de synchronisation sécurisée avec le serveur.

### Le Processus de Sauvegarde (Upload)
1. **Génération locale** : Le navigateur génère le vecteur et extrait le texte en clair.
2. **Chiffrement E2EE** : Le navigateur chiffre le vecteur (tableau de nombres) et le texte extrait avec la clé de chiffrement symétrique (AES-GCM) partagée de l'espace de travail ou de l'utilisateur.
3. **Envoi au serveur** : Le client envoie ce "blob" chiffré au backend (PostgreSQL). Pour le serveur, ce ne sont que des données illisibles.

### Le Processus de Restauration (Download)
1. **Téléchargement** : Lorsqu'un utilisateur se connecte sur un nouvel appareil, son client télécharge son index de recherche chiffré depuis le serveur.
2. **Déchiffrement local** : Le client utilise sa clé E2EE pour déchiffrer les vecteurs et les textes en mémoire.
3. **Indexation IndexedDB** : Les données déchiffrées sont chargées dans la base vectorielle locale du navigateur (ex: `Orama` ou `Voy`) pour permettre une recherche ultra-rapide.

### Structure de Données (Locale vs Serveur)

**A. Ce qui vit dans la mémoire du Navigateur (Local - IndexedDB) - *Déchiffré* :**
```typescript
interface LocalVectorDocument {
  id: string;              // UUID unique
  workspaceId: string;
  type: "MESSAGE" | "FILE" | "TODO";
  textContent: string;     // Texte extrait du PDF ou message en clair
  vector: number[];        // Le vecteur mathématique (ex: 384 dimensions)
}
```

**B. Ce qui est envoyé et stocké sur le Serveur (PostgreSQL) - *Chiffré E2EE* :**
```typescript
interface ServerEncryptedIndex {
  id: string;
  workspaceId: string;
  type: "MESSAGE" | "FILE" | "TODO";
  encryptedBlob: string;   // Contient { textContent, vector } chiffré en AES-GCM
  iv: string;              // Vecteur d'initialisation pour le déchiffrement
}
```

---

## 4. 🚀 L'Exploitation (Phase 2 à venir)

Une fois cette indexation continue mise en place, nous pourrons construire les interfaces :

1. **Recherche Contextuelle (Workspace)** : Une barre de recherche au-dessus du File Manager ou du Chat qui interroge *uniquement* les vecteurs ayant le `workspaceId` actuel.
2. **Recherche Globale (Omnibar)** : Un menu (type Cmd+K / Ctrl+K) qui permet de chercher à travers tout l'index local (tous les espaces confondus).
3. **Mécanisme de recherche** : 
   - L'utilisateur tape une recherche.
   - `Transformers.js` convertit la recherche en vecteur.
   - Le moteur local trouve les `VectorDocument` les plus proches mathématiquement.

---

## 5. 🛠️ Prochaines étapes techniques pour démarrer

1. [ ] Ajouter `Transformers.js` (`@xenova/transformers`) au projet frontend.
2. [ ] Créer un Web Worker (pour ne pas bloquer l'UI) dédié à la génération de vecteurs.
3. [ ] Implémenter une base de données locale (ex: Orama) avec support vectoriel.
4. [ ] Ajouter le "hook" de vectorisation dans la fonction d'envoi et de réception des messages.
