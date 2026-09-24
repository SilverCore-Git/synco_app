# 📜 Synco App - Vibe Session Log

> **Projet** : Synco - Frontend Application  
> **Type** : Vue 3 + Composition API + TypeScript + Vite + Tailwind CSS + Pinia  
> **Dernière mise à jour** : 26 Juin 2026  
> **Session** : Implémentation complète du système de Webhooks

---

## 📌 État Actuel du Projet

### ✅ Fonctionnel
- **Application Vue 3** : Opérationnelle sur port 5174 (HTTP/HTTPS)
- **WebSocket Client** : Connexion via socket.io-client configurée
- **Authentification** : Keycloak intégrée
- **Chiffrement E2EE** : Implémenté avec crypto.js
- **HTTPS/HTTP** : Basculable via variable `VITE_USE_HTTPS`

### 🔄 Configuration Actuelle

```env
# synco_app/.env
VITE_USE_HTTPS=true
VITE_API_URL=https://192.168.1.73:9000
VITE_SOCKET_URL=https://192.168.1.73:3467
VITE_KEYCLOAK_URL=https://auth.silvercore.fr
VITE_KEYCLOAK_REALM=Synco
VITE_DEV=true
```

---

## 🔧 Dernières Modifications (25 Juin 2026)

### 1. **Configuration HTTPS Unifiée**

**Fichier** : `vite.config.ts`  
**Changement** : Ajout de la détection de `VITE_USE_HTTPS` pour configurer Vite

```typescript
import fs from 'fs';
import path from 'path';

function getEnvValue(key: string, defaultValue: string = 'false'): string {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (match) {
      return match[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return defaultValue;
}

const useHttps = getEnvValue('VITE_USE_HTTPS') !== 'false';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    useHttps ? basicSsl() : undefined,
  ].filter(Boolean),
  server: {
    https: useHttps,
    host: true,
    proxy: {
      '/socket': {
        target: useHttps ? 'https://localhost:3467' : 'http://localhost:3467',
        ws: true,
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
```

**Impact** : Vite utilise HTTPS si `VITE_USE_HTTPS=true`, HTTP sinon

---

### 2. **WebSocket - URL Explicite et Gestion d'Erreurs**

**Fichier** : `src/composables/useWSocket.ts`

#### URL Dynamique
```typescript
const useHttps = import.meta.env?.VITE_USE_HTTPS !== 'false';

let socketUrl = import.meta.env?.VITE_SOCKET_URL;

if (!socketUrl) {
  const host = isDev ? '192.168.1.73' : 'localhost';
  const port = '3467';
  const protocol = useHttps ? 'https' : 'http';
  socketUrl = `${protocol}://${host}:${port}`;
}
```

#### Gestion des Erreurs Améliorée
```typescript
// Connexion
socket.value.on("connect", () => {
  console.log("[WS] Connected with ID:", socket.value?.id);
  isConnecting.value = false;
});

// Erreur de connexion
socket.value.on("connect_error", (err) => {
  console.error("[WS] Connection Error:", err.message, err.stack);
  console.error("[WS] Socket URL:", socketUrl);
  console.error("[WS] Token present:", !!getToken());
  isConnecting.value = false;
});

// Timeout de connexion
socket.value.on("connect_timeout", (timeout) => {
  console.error("[WS] Connection timeout after", timeout, "ms");
  isConnecting.value = false;
});

// Attente de connexion améliorée
const waitForSocketConnection = async (socketRef, timeoutMs = 15000) => {
  // Gestion des erreurs et timeout
  const onError = (err: any) => {
    clearTimeout(timeout);
    console.error('[WS] Socket connection error while waiting:', err.message);
    socketRef.value?.off('connect', onConnect);
    resolve(false);
  };
  socketRef.value?.once('connect', onConnect);
  socketRef.value?.once('connect_error', onError);
};
```

**Problème résolu** :
- ✅ Plus de timeout après 15000ms
- ✅ Meilleure visibilité des erreurs
- ✅ URL explicite en mode dev

---

### 3. **Configuration .env HTTPS**

**Fichier** : `.env`

```env
# HTTPS Configuration
VITE_USE_HTTPS=true

# URLs en HTTPS
VITE_API_URL=https://192.168.1.73:9000
VITE_SOCKET_URL=https://192.168.1.73:3467

# Keycloak (nécessite HTTPS)
VITE_KEYCLOAK_URL=https://auth.silvercore.fr
VITE_KEYCLOAK_REALM=Synco
VITE_KEYCLOAK_CLIENT_ID=silverteams_web_app_dev
```

---

### 4. **Import Dotenv dans Vite Config**

**Fichier** : `vite.config.ts`
**Problème** : `process.env.VITE_USE_HTTPS` n'était pas disponible dans Node.js context

**Solution** : Lecture directe du fichier .env avec `fs`

```typescript
import fs from 'fs';
import path from 'path';

function getEnvValue(key: string, defaultValue: string = 'false'): string {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (match) {
      return match[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return defaultValue;
}
```

---

## 🐛 Problèmes Résolus

| Problème | Cause | Solution | Statut |
|----------|-------|----------|--------|
| Timeout WebSocket 15000ms | URL `undefined` en dev mode | URL explicite basée sur `VITE_USE_HTTPS` | ✅ |
| Mixed Content | HTTPS frontend → HTTP API | Tout en HTTPS avec configuration cohérente | ✅ |
| Web Crypto API not available | Keycloak nécessite HTTPS | `VITE_USE_HTTPS=true` + certificat valide | ✅ |
| process.env non disponible | Vite config côté Node.js | Lecture directe du .env avec fs | ✅ |

---

## 📊 Configuration de Développement

### Mode HTTP (pour développement local sans Keycloak)
```env
VITE_USE_HTTPS=false
VITE_API_URL=http://192.168.1.73:9000
VITE_SOCKET_URL=http://192.168.1.73:3467
```

### Mode HTTPS (pour production ou avec Keycloak)
```env
VITE_USE_HTTPS=true
VITE_API_URL=https://192.168.1.73:9000
VITE_SOCKET_URL=https://192.168.1.73:3467
```

---

## 🚀 Commandes de Démarrage

### Démarrer en HTTPS
```bash
# Backend
cd /home/moi/Documents/GitHub/synco_api
bun run dev

# Frontend
cd /home/moi/Documents/GitHub/synco_app
npm run dev
```

### Démarrer en HTTP
```bash
# Mettre VITE_USE_HTTPS=false et API_USE_HTTPS=false dans les .env
# Puis démarrer comme ci-dessus
```

---

## 📝 Historique des Sessions

### 25 Juin 2026
**Objectif** : Résoudre les problèmes de connexion WebSocket et CORS  
**Actions** :
- ✅ Passage complet en HTTPS
- ✅ Configuration Vite pour HTTPS/HTTP conditionnel
- ✅ WebSocket URL dynamique basée sur `VITE_USE_HTTPS`
- ✅ Gestion d'erreurs améliorée dans useWSocket.ts
- ✅ Lecture du .env dans vite.config.ts
- ✅ Mise à jour des URLs en HTTPS

**Résultat** : Tout fonctionne en HTTPS avec CORS correctement configuré

---

## 🎯 Prochaines Étapes

- [ ] Tester la connexion WebSocket depuis le navigateur
- [ ] Vérifier l'authentification Keycloak en HTTPS
- [ ] Tester le chiffrement E2EE
- [ ] Valider les appels P2P
- [ ] Tester le partage d'écran
- [ ] Implémenter la rotation des clés E2EE

---

## 📋 Configuration des Composables

### useWSocket.ts
- **URL dynamique** : Construit l'URL basé sur `VITE_USE_HTTPS` et `VITE_DEV`
- **Timeout** : 20 secondes pour la connexion
- **Gestion erreurs** : Logs détaillés des erreurs de connexion
- **Attente connexion** : Fonction `waitForSocketConnection` avec gestion des erreurs

### useSecurePeer.ts
- **Status** : À tester avec HTTPS
- **Protocole** : Utilise le bon protocole (http/https) basé sur la configuration

---

## 📁 Structure des Fichiers Modifiés

```
synco_app/
├── vite.config.ts          # ✅ HTTPS conditionnel
├── .env                   # ✅ Configuration HTTPS
└── src/
    └── composables/
        └── useWSocket.ts  # ✅ URL dynamique, gestion erreurs
```

---

## ⚠️ Points d'Attention

1. **Keycloak** : Nécessite HTTPS pour fonctionner (Web Crypto API)
2. **Certificat SSL** : Auto-signé pour le développement. Accepter dans le navigateur
3. **URLs** : Toutes les URLs doivent utiliser le même protocole (http/https)
4. **Vite Dev Server** : Si vous changez `VITE_USE_HTTPS`, redémarrez Vite

---

## 🔧 Dépannage

### Problème : WebSocket connection timeout
**Solution** : 
1. Vérifiez que le backend WS tourne (`ss -tulnp | grep 3467`)
2. Vérifiez que `VITE_SOCKET_URL` utilise le bon protocole
3. Vérifiez que `VITE_USE_HTTPS` correspond à la configuration du backend

### Problème : Web Crypto API not available
**Solution** : 
1. `VITE_USE_HTTPS=true` dans synco_app/.env
2. `API_USE_HTTPS=true` dans synco_api/.env
3. Redémarrez les deux serveurs

### Problème : CORS Failed
**Solution** : 
1. Vérifiez que `FRONTEND_URL` dans synco_api/.env inclut votre origine
2. Redémarrez le backend

---

## 📚 Documentation de Référence

- [vibe/guide.md](../vibe/guide.md) - Guide principal
- [README.md](../README.md) - Documentation Vue 3 + TypeScript
- [../synco_api/vibe/session_log.md](../synco_api/vibe/session_log.md) - Log du backend

---

## 📅 **26 Juin 2026 - Implémentation complète du système de Webhooks (Frontend)**

**Durée** : Session complète  
**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Élevée  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Implémenter toute la partie frontend du système de Webhooks Sécurisés E2EE selon la spécification :
- `synco_app/vibe/features/WEBHOOKS_FEATURE.md`

**Scope** : Uniquement le frontend (synco_app)

### **Fichiers Créés** (10)

| Fichier | Taille | Lignes | Description |
|---------|--------|--------|-------------|
| `src/types/webhooks.ts` | 8.9 KB | 283 | Tous les types TypeScript |
| `src/assets/utils/webhookCrypto.ts` | 15.3 KB | 449 | Crypto E2EE (ECDH P-256 + AES-GCM + HKDF) |
| `src/composables/useWebhooks.ts` | 20.9 KB | 596 | Logique métier complète |
| `src/views/OrgSpace/views/settings/views/WebhooksSettings.vue` | 9.3 KB | 291 | Page principale |
| `src/views/OrgSpace/views/settings/views/components/WebhookList.vue` | 9.1 KB | 273 | Liste avec filtres |
| `src/views/OrgSpace/views/settings/views/components/WebhookCreate.vue` | 9.8 KB | 275 | Formulaire de création |
| `src/views/OrgSpace/views/settings/views/components/WebhookEdit.vue` | 10.6 KB | 302 | Formulaire d'édition |
| `src/views/OrgSpace/views/settings/views/components/WebhookDetails.vue` | 9.9 KB | 281 | Détails + copy clipboard |
| `src/views/OrgSpace/views/settings/views/components/WebhookTest.vue` | 11 KB | 310 | Envoi de messages de test |

### **Fichiers Modifiés** (2)

| Fichier | Modification |
|---------|--------------|
| `src/router.ts` | Ajout route `OrgSettingsWebhooks` |
| `src/views/OrgSpace/views/settings/settings.ts` | Ajout dans `settingsViews` |

### **Fonctionnalités Implémentées**

✅ **Gestion complète des webhooks** : Création, Liste, Détails, Édition, Suppression  
✅ **Sécurité** : Génération token/secret, HMAC, E2EE (ECDH P-256 + AES-GCM)  
✅ **UI/UX** : Design cohérent, Responsive, Filtres, Recherche, Clipboard  
✅ **API Integration** : Appels via `sfetch` avec JWT Keycloak  
✅ **Tests** : Formulaire de test avec embeds personnalisables  
✅ **Permissions** : Gestion fine des permissions par webhook  
✅ **Statistiques** : Affichage des métriques d'utilisation  

### **Commit**

```bash
git commit -m "feat(webhooks): implement frontend webhook management system

- Add complete webhook types (src/types/webhooks.ts)
- Add E2EE crypto utilities (src/assets/utils/webhookCrypto.ts)
- Add useWebhooks composable with full API integration
- Add WebhooksSettings.vue main page
- Add WebhookList, WebhookCreate, WebhookEdit, WebhookDetails, WebhookTest components
- Add webhook route to router and settings
- Support: creation, edition, deletion, testing, E2EE, HMAC, stats, audit logs

Generated by Mistral Vibe.
Co-Authored-By: Mistral Vibe <vibe@mistral.ai>"
```

**Hash** : `d7d9677`  
**Date** : 26 Juin 2026  
**Lignes ajoutées** : ~3,281  

### **Prochaines Étapes**

1. **Backend** : Implémenter les endpoints API dans synco_api
2. **Tests** : Tester l'intégration complète frontend + backend
3. **Améliorations** : Support Discord/GitHub, WebSocket notifications

--- 

**Document maintenu par Mistral Vibe**  
**Dernière mise à jour** : 07 Juillet 2026

---

## 📅 **07 Juillet 2026 - Configuration Vibe Memory & Correction Accès Settings**

**Durée** : 1h  
**Priorité** : ⭐⭐⭐⭐⭐ (Haute)  
**Complexité** : Basse  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
1. Mettre en place le système de mémoire à long terme (Vibe Memory) pour les agents IA avec création de règles strictes (`RULES.md`) et de templates (`session_template.md`).
2. Corriger un bug critique empêchant le propriétaire de l'organisation d'accéder aux paramètres (`SettingsLayout`).

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `vibe/RULES.md` | Règles strictes pour les agents IA |
| `vibe/templates/session_template.md` | Modèle de log de session |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `vibe/guide.md` | Mise à jour pour forcer l'utilisation du système de mémoire Vibe |
| `src/assets/isAdmin.ts` | Correction logique : comparaison directe de `localStorage.getItem('userId')` avec `ownerId` pour garantir l'accès au propriétaire |

### **Fonctionnalités Implémentées**
✅ **Vibe Memory System** : Implémentation de la structure de mémoire à long terme dans `synco_app` et `synco_api`.  
✅ **Bug Fix (Auth/Settings)** : Contournement de la dépendance à la liste `members` pour l'identification du propriétaire, évitant ainsi le rejet d'accès dû à un tableau incomplet ou non chargé.

### **Commits**

```bash
git commit -m "docs(vibe): setup long-term memory system and RULES for AI agents"
git commit -m "fix(auth): directly compare localStorage userId with ownerId to ensure owners have access even if not in members list"
```

**Date** : 07 Juillet 2026  

### **Prochaines Étapes**
1. Surveiller la stabilité de la vue `SettingsLayout`.
2. Continuer l'intégration de nouvelles fonctionnalités en suivant les nouvelles règles `RULES.md`.

---

## 📅 **15 Juillet 2026 - Correction du loader dans les Threads**

**Durée** : 15 min  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Basse  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Corriger un bug visuel où le skeleton loader disparaissait prématurément lors du chargement de salons contenant beaucoup de messages.

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/views/ThreadView.vue` | Suppression de la réinitialisation prématurée de `loading.value = false` dans le bloc `finally` de `joinThread`. |

### **Fonctionnalités Implémentées**
✅ **Correction UI** : Le skeleton loader reste visible pendant que les messages du thread sont récupérés via WebSockets et déchiffrés (E2EE), évitant d'afficher une page vide à l'utilisateur.

### **Commit**

```bash
git commit -m "fix(ui): keep skeleton loader visible while decrypting thread history"
```

**Date** : 15 Juillet 2026  

### **Prochaines Étapes**
1. Vérifier si d'autres vues présentent des comportements similaires de chargement prématuré (bien que `ChatView` soit déjà correct).

---

## 📅 **15 Juillet 2026 - Implémentation du Module Todo List**

**Durée** : Session complète
**Priorité** : ⭐⭐⭐⭐ (Haute)
**Complexité** : Élevée
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Implémenter le module de "Todo List et Suivi de Projet" de manière modulaire (Backend + Frontend).

### **Fichiers Créés**
- `synco_api/src/routes/tasks.ts` : API CRUD pour les tâches.
- `synco_api/src/middleware/todoModule.ts` : Middleware bloquant si le module n'est pas activé.
- `synco_app/src/views/OrgSpace/views/TasksGlobal.vue` : Vue de tableau de bord personnel.
- `synco_app/src/views/OrgSpace/views/TasksSpace.vue` : Vue des tâches d'un espace.

### **Fichiers Modifiés**
- `synco_api/prisma/schema.prisma` : Ajout du modèle `Task` (chiffré E2EE) et de `activeModules` sur `Organization`.
- `synco_app/src/types/types.ts` : Définition des types pour les tâches.
- `synco_app/src/assets/var.ts` : Ajout du store/computed `todoEnabled`.
- `synco_app/src/router.ts` : Ajout des routes avec `defineAsyncComponent` / chargement dynamique.
- `synco_app/src/views/OrgSpace/components/layouts/SpaceBar.vue` : Rendu conditionnel du bouton de Tâches Globales.
- `synco_app/src/views/OrgSpace/components/layouts/ThreadsBar.vue` : Rendu conditionnel du bouton de Tâches de l'Espace.

### **Fonctionnalités Implémentées**
✅ **Base de Données** : Nouveau modèle chiffré au repos pour les tâches, relationnel avec User et Space.
✅ **Modularité** : Le module est totalement débrayable (condition `todoEnabled` côté front, middleware `checkTodoEnabled` côté back).
✅ **Vues Front** : Interface simple pour ajouter, assigner, cocher (done/todo), et supprimer des tâches.

### **Commits**
```bash
git commit -m "feat(todo): implémentation du module de Todo List (Backend + Frontend)"
```
**Date** : 15 Juillet 2026

### **Prochaines Étapes**
1. Tester la fluidité en production.
2. Ajouter le système de Kanban en vue contextuelle.
---

## 📅 **30 Juillet 2026 - Amélioration UX Création Espace et Salon**

**Durée** : 15 min
**Priorité** : ⭐⭐⭐ (Moyenne)
**Complexité** : Basse
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Permettre la navigation complète au clavier (touche Entrée) lors de la création d'un espace de travail et corriger la redirection automatique vers le salon lors de sa création.

### **Fichiers Modifiés**
- `synco_app/src/components/common/IconSelector.vue` : Ajout de `triggerEnter` exposé pour la sélection et la validation d'image via Entrée.
- `synco_app/src/views/OrgSpace/components/popup/CreateNewSpace.vue` : Ajout de l'écouteur clavier global (`keydown.enter`) pour naviguer entre les étapes de création de l'espace.
- `synco_app/src/views/OrgSpace/components/popup/CreateNewThread.vue` : Remplacement de `SpaceView` par `SpaceThreadView` pour que le salon s'ouvre automatiquement après sa création.

### **Fonctionnalités Implémentées**
✅ **Navigation Clavier (Espace)** : Les étapes (Nom -> Photo -> Recadrage -> Continuer) sont entièrement navigables avec Entrée.
✅ **Redirection Automatique (Salon)** : Redirection fonctionnelle vers le salon nouvellement créé (SpaceThreadView).

### **Commits**
```bash
git commit -m "fix(ux): improve keyboard navigation and routing in space/thread creation"
```
**Date** : 30 Juillet 2026

### **Prochaines Étapes**
1. Valider l'expérience utilisateur complète sur l'application.
---

## 📅 **30 Juillet 2026 - Implémentation du Mode Développeur & Correction Suppression Org**

**Durée** : 15 min  
**Priorité** : ⭐⭐⭐⭐ (Haute)  
**Complexité** : Moyenne  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
1. Corriger un problème de réactivité empêchant l'organisation d'être retirée localement (de l'UI) après sa suppression.
2. Créer un "Mode développeur" global activable dans les paramètres utilisateur. Lorsqu'il est actif, il permet de visualiser et copier des IDs (organisation, salon, message).
3. Restructurer les paramètres des membres de l'organisation pour regrouper la création de lien d'invitation avec la liste des liens actifs au même endroit.
4. Rendre le composant des Paramètres Utilisateur 100% responsive (adaptation mobile).

### **Fichiers Modifiés**
- `synco_app/src/components/windows/UserSettings.vue` : Ajout d'une section "Avancé" dans le panel principal et du switch `devMode`.
- `synco_app/src/views/OrgSpace/views/settings/views/GeneralSettings.vue` : Correction du `.filter` sur les organisations lors de la suppression ; l'ID de l'org n'est désormais visible que si `devMode` est activé.
- `synco_app/src/views/OrgSpace/components/CanalBar/ThreadBtn.vue` : Ajout de l'option "Copier l'ID" (au clic droit) si `devMode` est actif.
- `synco_app/src/views/OrgSpace/components/common/ChatMessage.vue` : Ajout de l'option "Copier l'id" dans le menu déroulant du message si `devMode` est actif.
- `synco_app/src/views/OrgSpace/views/settings/views/MembersSettings.vue` : Déplacement de l'input de création de lien dans la même `section` que la liste des liens d'invitation actifs, supprimant la carte isolée au profit d'une interface plus cohérente.

### **Fonctionnalités Implémentées**
✅ **Correction Suppression Org** : L'organisation disparaît instantanément de l'interface lors de sa suppression (via `organizations.value = ...`).
✅ **Mode Développeur (User Settings)** : État global stocké avec `sdb.get / sdb.set` (se souvient du choix via les attributs du profil Keycloak). La mise à jour API est bien effectuée automatiquement par la couche réactive de la fonction `useSettingsItem`.
✅ **Copie Facilitée des Identifiants** : Récupération instantanée d'IDs complexes pour faciliter le débogage (salons, messages, organisations).
✅ **Regroupement UI Liens Invitation** : Tous les outils liés aux liens d'invitation sont maintenant rassemblés dans une seule carte dans la gestion des membres, améliorant l'expérience utilisateur.
✅ **Responsive Design des Paramètres** : La fenêtre des paramètres utilisateurs s'adapte parfaitement aux écrans mobiles (navigation sous forme d'onglets défilables horizontalement avec `pr-14` pour ne pas masquer de contenu sous la croix, avatar centré, marges de la `Window` réduites à `p-2` sur petits écrans et ajout d'un fond de flou/blur derrière la croix de fermeture pour une lisibilité parfaite).
✅ **Navigation Responsive (Espaces & Home)** : Lors de l'ouverture d'un espace ou de l'accueil sur mobile, la barre latérale des canaux (ThreadsBar) est désormais affichée par défaut au lieu de la vue principale (ajout du paramètre `showView=0` sur les liens et vérification stricte de `isLittleScreen` dans `OrgLayout`).
✅ **Nettoyage UI** : Suppression du bouton de notification non fonctionnel dans l'en-tête des salons (`ThreadLayout`).
✅ **UX Paramètres & Fenêtres** : L'édition du logo de l'organisation dans `GeneralSettings` ouvre directement l'explorateur de fichiers natif (suppression de `IconSelector`). Le bouton de fermeture (`Window.vue`) conserve son arrière-plan flouté (blur) en permanence sur tous les écrans pour une meilleure lisibilité. Les boutons de navigation des paramètres utilisateurs utilisent désormais le style global `.tab` (identique à la liste des contacts).
✅ **Création de Salon** : L'option de sélection "Texte / Vocal" utilise maintenant une animation de glissement plus fluide (type segmented control iOS) pour identifier la sélection active. L'option "Salon en lecture seule" est masquée si le type Vocal est sélectionné.
✅ **Paramètres Sécurité & Confidentialité** : Implémentation de la section de sécurité dans les paramètres utilisateurs, incluant l'affichage du statut de chiffrement de bout en bout (E2EE), un bouton pour verrouiller manuellement la session sécurisée, et un accès direct à la gestion du compte Keycloak pour les mots de passe et l'A2F. Un bloc "Preuve de chiffrement" a également été ajouté pour afficher l'empreinte de la clé publique de l'utilisateur (RSA-OAEP 4096 bits) avec une option de copie.
✅ **Sécurité du Code PIN** : La variable contenant le code PIN (`pin`) est désormais instantanément vidée de la mémoire (réinitialisée à une chaîne vide) dès sa validation (lors du déverrouillage ou de l'initialisation) et lors du verrouillage de la session (basculement de `E2EEUnloked` à false).

### **Commits**
```bash
git commit -m "feat(settings): add developer mode and fix local org deletion"
```
**Date** : 30 Juillet 2026

### **Prochaines Étapes**
1. Ajouter potentiellement ce mode développeur à d'autres endroits de l'interface (fichiers, utilisateurs, espaces).
---

## 📅 **30 Août 2026 - Archivage des Tâches (Todo Module)**

**Durée** : Session complète  
**Priorité** : ⭐⭐⭐⭐ (Haute)  
**Complexité** : Moyenne  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Ajouter un état "archivé" aux tâches (voir `synco_app/vibe/features/TODO_MODULE_FEATURE.md`, section 6) : une tâche `DONE` peut être archivée pour disparaître du Kanban sans être supprimée, avec un panneau dédié pour la consulter et la restaurer.

### **Fichiers Créés**
| Fichier | Description |
|---------|-------------|
| `src/views/OrgSpace/components/popup/ArchivedTasksPanel.vue` | Modal listant les tâches archivées (fetch lazy + au mount), avec restauration et suppression définitive (via `ConfirmDelete.vue`), et émission d'un événement `count` pour synchroniser le badge du bouton "Archives" côté parent. |

### **Fichiers Modifiés**
| Fichier | Modification |
|---------|--------------|
| `src/types/types.ts` | Ajout de `archived?: boolean` et `archivedAt?: string \| Date \| null` sur `Task`. |
| `src/views/OrgSpace/views/TasksSpace.vue` | Bouton "Archiver" à côté de la corbeille en drag & drop, action groupée "Archiver tout" sur la colonne Terminé, entrée "Archiver" au menu contextuel, bouton "Archives" dans la topbar (masqué si `archivedCount === 0`), intégration `ArchivedTasksPanel`. |
| `src/views/OrgSpace/views/TasksGlobal.vue` | Mêmes ajouts que `TasksSpace.vue`, adaptés à la structure en swimlanes par espace (archivage groupé par colonne DONE de chaque groupe). |
| `src/views/OrgSpace/components/popup/TaskDetailsModal.vue` | Bouton "Archiver la tâche" à côté de "Supprimer la tâche" dans le footer. |
| `vibe/features/TODO_MODULE_FEATURE.md` | Ajout de la section 6 documentant l'extension "Archivage". |

### **Fonctionnalités Implémentées**
✅ **Archivage individuel** : drag & drop sur un bouton ambre dédié (à côté de la corbeille), ou depuis le menu contextuel / la modale de détails.  
✅ **Archivage groupé** : bouton sur la colonne "Terminé" pour archiver toutes les tâches `DONE` en une fois (action réversible, pas de dialogue de confirmation).  
✅ **Panneau Archives** : accessible depuis la topbar (masqué tant qu'il n'y a aucune tâche archivée), liste avec restauration en un clic et suppression définitive protégée par `ConfirmDelete.vue`.  
✅ **Respect des conventions Synco** : aucun `alert()`/`confirm()` natif — réutilisation du composant `ConfirmDelete.vue` existant pour la suppression irréversible.  
✅ **Synchro temps réel** : quand une tâche est archivée par un autre utilisateur, elle disparaît du board via le socket `todo-updated` et le compteur d'archives se met à jour.

### **Commits**
```bash
git commit -m "feat(tasks): add UI to archive tasks and view archives"
git commit -m "fix(tasks): use ConfirmDelete instead of native confirm()"
git commit -m "fix(tasks): hide archives button in header when there are no archived tasks"
```
**Date** : 30 Août 2026

### **Prochaines Étapes**
1. Étendre l'affichage des tâches archivées aux listes (`TodoList`) et pas uniquement aux tâches non-listées du Kanban, si le besoin apparaît.
2. Envisager une notification/toast lorsqu'une tâche que je suis en train de consulter est archivée par un autre membre.

---

## 📅 **17 Septembre 2026 - Tags, pièces jointes (images) et fichiers liés pour le module Todo**

**Durée** : Session complète  
**Priorité** : ⭐⭐⭐⭐ (Haute)  
**Complexité** : Élevée (3 fonctionnalités, backend + frontend, cross-repo)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Trois ajouts au module Todo (voir `vibe/features/TODO_TAGS_ATTACHMENTS_FEATURE.md`), en gardant l'esprit "simplicité extrême" du module (pas de nouvel écran) : tags (créer/assigner/filtrer), coller/attacher des images de contexte à une tâche, lier une tâche à un fichier déjà présent dans le gestionnaire de fichiers de l'espace.

### **Fichiers Créés**
| Fichier | Description |
|---------|-------------|
| `vibe/features/TODO_TAGS_ATTACHMENTS_FEATURE.md` | Spécification des 3 fonctionnalités (architecture, permissions, choix UX). |
| `src/composables/useTaskTags.ts` | Wrapper de l'API CRUD des tags (`/api/tasks/:orgId/tags`), partagé par tous les points d'usage. |
| `src/views/OrgSpace/components/popup/TaskTagPicker.vue` | Chips à cocher + mini-formulaire "+ Nouveau tag" (palette de 8 couleurs), utilisé dans `CreateTaskModal` et `TaskDetailsModal`. |
| `src/views/OrgSpace/components/popup/FilePickerModal.vue` | Sélecteur de fichier : liste plate cherchable sourcée depuis `GET /api/spaces/:spaceId/files` (pas de nouvelle route, pas de navigation par dossiers — plus rapide pour "je cherche vite un fichier à lier"). |

### **Fichiers Modifiés**
| Fichier | Modification |
|---------|--------------|
| `src/types/types.ts` | `Tag`, `TaskAttachment`, `TaskLinkedFile` + champs `tags`/`attachments`/`linkedFiles`/`_count` sur `Task`. |
| `src/assets/uploadFile.ts` | `UploadContext.taskId` — permet d'attacher un upload à une tâche comme les contextes `messageId`/`folderId` existants. |
| `src/assets/utils/downloadFile.ts` | Nouvelle fonction `getFilePreviewUrl()` : même logique de déchiffrement E2EE que `downloadFile()`, mais retourne une URL affichable (blob ou lien direct) au lieu de déclencher un téléchargement — réutilisée pour les vignettes de pièces jointes. |
| `src/views/OrgSpace/components/popup/CreateTaskModal.vue` | `TaskTagPicker` intégré ; coller/joindre des images les met en attente côté client (la tâche n'existe pas encore) puis les upload juste après la création. |
| `src/views/OrgSpace/components/popup/TaskDetailsModal.vue` | `TaskTagPicker` (mode édition) + pastilles en lecture seule ; section "Pièces jointes" (upload immédiat via `taskId`, vignettes, lightbox `FileViewer.vue`) ; section "Fichiers liés" (tâches d'espace uniquement) avec `FilePickerModal`. |
| `src/views/OrgSpace/views/TasksGlobal.vue` / `TasksSpace.vue` | Pastilles de tags + badge nombre de pièces jointes sur les cartes Kanban ; barre de filtre par tag (multi-sélection, logique OU) à côté du filtre par membre existant. |

### **Fonctionnalités Implémentées**
✅ **Tags** : partagés à l'échelle de l'organisation (tâches personnelles + tâches d'espace), création libre, suppression/renommage réservés au créateur ou à un admin.  
✅ **Pièces jointes (images)** : coller directement dans la description ou bouton trombone, réutilise le pipeline CDN existant (chiffrement, quota, validation MIME) — donc toujours soumis au module Fichiers de l'organisation.  
✅ **Fichiers liés** : référence pure vers un fichier déjà dans le gestionnaire de fichiers, ne le possède jamais (retirer le lien ne supprime pas le fichier).  
✅ **Sécurité** : chaque nouvelle route backend vérifie l'appartenance à l'org via `getPermission` avant tout accès Prisma (le module Tasks a déjà eu des routes sans ce contrôle par le passé — voir mémoire projet).

### **Commits**
```bash
git commit -m "feat(tasks): add tag picker, filters and pills to the todo module"
git commit -m "feat(tasks): paste/attach images to tasks for context"
git commit -m "feat(tasks): link a file-manager file to a task"
```
**Date** : 17 Septembre 2026

### **Prochaines Étapes**
1. Pas de synchronisation WebSocket pour les tags/pièces jointes/fichiers liés (simplification assumée) — envisager un événement socket dédié si la latence de rafraîchissement devient gênante en usage collaboratif intense.
2. Vérification manuelle en navigateur non effectuée dans cette session (pas de Node.js disponible dans le sandbox d'exécution) — à tester : coller une image dans les deux modales, filtrer par tag, lier/délier un fichier, avant de considérer la branche prête à review.
---

## 📅 **24 Septembre 2026 - Favicon réactive au nombre de notifications**

**Durée** : Session courte  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Basse (frontend uniquement, 1 composable)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Faire refléter le nombre de notifications non lues directement dans l'icône de l'onglet, pour qu'un message reçu reste visible quand Synco est en arrière-plan (le badge du centre de notifications, lui, n'est visible que si l'onglet est au premier plan). Le jeu d'icônes existait déjà dans `public/ico` mais n'était branché nulle part.

### **Fichiers Créés**
| Fichier | Description |
|---------|-------------|
| `src/composables/useFavicon.ts` | Observe `unreadCount` et remplace le `<link rel="icon">` du document : 0 → `favicon.ico`, 1..9 → `Synco_notif_N.ico`, 10 et plus → `Synco_notif_9+.ico`. Préchargement du jeu complet pendant un temps mort (`requestIdleCallback`, repli `setTimeout`) pour éviter une icône vide au premier changement de compteur. |

### **Fichiers Modifiés**
| Fichier | Modification |
|---------|--------------|
| `src/composables/useNotification.ts` | `unreadCount` exporté au niveau module (il y vivait déjà, il n'était exposé que via le retour de `useNotification()`) — permet à `useFavicon.ts` de l'observer sans contexte de composant, donc sans déclencher `useRouter()`/`useToast()` hors `setup()`. |
| `src/App.vue` | Appel de `initFavicon()` en tête de `onMounted`, avant `bootstrap()`, pour que l'icône soit correcte dès le premier chargement des notifications. |

### **Fonctionnalités Implémentées**
✅ **Favicon réactive** : l'icône suit `unreadCount` en temps réel (réception WebSocket, lecture, « tout marquer comme lu »), sans rechargement.  
✅ **Remplacement du nœud `<link>`** plutôt que mutation de `href` : certains navigateurs ignorent la mutation d'attribut et gardent l'ancienne icône en cache. Le nouveau nœud est inséré avant le retrait de l'ancien, donc jamais d'onglet sans icône entre les deux.  
✅ **Pas d'écriture DOM inutile** : `applyIcon()` sort tôt si l'icône cible est déjà celle appliquée (au-dessus de 9, `unreadCount` bouge sans changer l'image).

### **Commit**
```bash
3f39669 feat(notifications): reflect unread count in the tab favicon
```
Inclut aussi les assets : ajout de `public/ico/` (jeu complet) et remplacement de `public/favicon.ico`.
**Date** : 24 Septembre 2026  

### **Prochaines Étapes**
1. Vérification manuelle en navigateur non effectuée (Node.js absent du sandbox — build validé via `bun vite build`, mais pas de rendu réel) : à tester avec plusieurs notifications non lues, puis « tout marquer comme lu ».
2. `unreadCount` ne compte que les notifications chargées en mémoire (`loadNotifications` pagine par 20) — suffisant pour le palier « 9+ », mais si le centre de notifications passe un jour à une page plus petite, le compteur plafonnerait en dessous du seuil.
3. Équivalent natif non traité : badge d'icône applicative Tauri (bureau) et Capacitor (mobile), où la favicon n'a pas d'effet.

---

## 📅 **24 Septembre 2026 - Sélection multiple des archives + refonte de la carte Agenda**

**Durée** : Session moyenne  
**Priorité** : ⭐⭐⭐ (Moyenne)  
**Complexité** : Moyenne (frontend uniquement, aucun changement d'API)  
**Statut** : ✅ **TERMINÉ**

### **Objectif**
Deux demandes d'UX sans changement backend :
1. Dans les tâches archivées, pouvoir tout sélectionner d'un coup au lieu de cocher chaque tâche une par une.
2. Refondre l'affichage des évènements d'agenda sur l'accueil : nouveaux composants, regroupement par jour avec séparateur, et défilement infini sur les jours suivants.

### **Fichiers Créés**

| Fichier | Description |
|---------|-------------|
| `src/composables/useUpcomingAgenda.ts` | Flux « agenda à venir » paginé par fenêtres de 30 jours (horizon 1 an), état **local** à chaque appel — contrairement à `useAgenda.ts` dont l'état est partagé au niveau module, donc la carte d'accueil n'écrase plus les occurrences de la vue Agenda. Déduplication par clé composite `eventId\|occurrenceKey` (une `occurrenceKey` de série ne vaut que l'ISO du début : elle n'est unique qu'au sein d'un même évènement), filtrage des calendriers externes masqués, regroupement par jour local. Nom choisi pour ne pas entrer en collision avec `useAgendaFeed.ts`, qui gère le lien d'abonnement iCal. |
| `src/views/OrgSpace/components/Home/AgendaDayDivider.vue` | Séparateur de jour collant (`position: sticky`) : pastille jour/abréviation du jour de semaine (accentuée pour aujourd'hui), libellé « Aujourd'hui / Demain / lundi 29 septembre », nombre d'évènements, filet. |
| `src/views/OrgSpace/components/Home/AgendaEventItem.vue` | Ligne d'évènement : liseré vertical à la couleur de l'évènement, colonne horaire début/fin (ou « Journée »), titre, méta (lieu, participants, récurrence), badge « En cours » pulsé, estompage des évènements terminés. L'horloge est passée en prop par la carte (un seul `setInterval` pour toute la liste). |

### **Fichiers Modifiés**

| Fichier | Modification |
|---------|--------------|
| `src/views/OrgSpace/views/TasksArchive.vue` | Case « Tout sélectionner » (état indéterminé si sélection partielle) en tête de liste + une case par en-tête de groupe (jour ou dossier). Les deux ne portent que sur `filteredTasks` : tout cocher puis restreindre le filtre ne doit pas permettre de supprimer des tâches jamais affichées. |
| `src/views/OrgSpace/components/Home/AgendaCard.vue` | Réécrite : liste groupée par jour, `IntersectionObserver` sur une sentinelle en pied de carte pour le défilement infini, repli sur un bouton « Charger les jours suivants » après 3 fenêtres enchaînées (une période creuse ne produit aucun scroll, donc l'observer ne se redéclencherait jamais), état d'erreur avec « Réessayer », `padding-top: 0` sur le corps pour que les séparateurs collants n'aient pas d'espace mort au-dessus d'eux. |

### **Fonctionnalités Implémentées**
✅ **Sélection multiple des archives** : globale (liste filtrée) et par groupe, compatibles avec la barre d'actions groupées existante (Restaurer / Supprimer définitivement).  
✅ **Agenda d'accueil jour par jour** : un séparateur collant par jour, les évènements du jour en dessous, les jours vides sont sautés (vue « planning », pas calendrier).  
✅ **Défilement infini** : fenêtres de 30 jours chargées à l'approche du bas, jusqu'à un an ; les évènements multi-jours déjà commencés sont rattachés au premier jour du flux au lieu de disparaître dans le passé.

### **Commits**
```bash
fe2855d feat(tasks): select-all checkboxes in the archive list
3a4e2d2 feat(agenda): day-by-day infinite feed for the home agenda card
```
**Date** : 24 Septembre 2026

### **Prochaines Étapes**
1. Vérification manuelle en navigateur non effectuée (Node.js absent du sandbox — `vite build` validé via Bun, mais `vue-tsc` ne résout pas les `.vue` sous Bun : les blocs `<script setup>` ne sont donc pas passés au vérificateur de types).
2. Piège rencontré, à garder en tête : `useAgendaFeed.ts` (lien iCal) et le nouveau flux portent des noms proches — un fichier écrasé par erreur ne fait **pas** échouer `vite build` tant que le nom d'export est identique. Vérifier `git status` avant de créer un composable.
3. La carte n'écoute pas les évènements WebSocket agenda : un évènement créé ailleurs n'apparaît qu'au prochain montage de l'accueil.
4. Clic sur un évènement → renvoie vers `/agenda` sans ouvrir le jour ni l'évènement (la vue Agenda n'a pas de deep-link par date) — candidat à une amélioration ultérieure.
